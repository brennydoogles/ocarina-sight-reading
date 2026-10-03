<script setup>
import { ref, computed, shallowRef, onUnmounted, watch } from 'vue';
import PhraseDisplay from './PhraseDisplay.vue';
import SessionLayout from './SessionLayout.vue';
import PracticeSidebar from './PracticeSidebar.vue';
import { useMicrophone, MIC } from '../audio/useMicrophone.js';
import { usePitchDetection } from '../audio/usePitchDetection.js';
import { useMetronome } from '../audio/useMetronome.js';
import { SequenceMatcher } from '../audio/sequenceMatcher.js';
import { MATCH } from '../audio/matcher.js';
import { generatePhrase } from '../music/phrases.js';
import { notePool } from '../music/notes.js';
import { useSettingsStore } from '../stores/settings.js';
import { useSessionStore } from '../stores/session.js';
import { useModesStore } from '../stores/modes.js';
import { PRACTICE_MODE } from '../stores/practiceModes.js';
import { noteName } from '../music/pitch.js';

const settings = useSettingsStore();
const session = useSessionStore();
const modes = useModesStore();
const options = modes.optionsFor(PRACTICE_MODE.MULTI);

const mic = useMicrophone({ fftSize: 2048 });
const detection = usePitchDetection(mic, () => settings.detectorConfig);
const metronome = useMetronome({ bpm: options.bpm.value });

const phrase = ref([]);
const currentIndex = ref(0);
const matchState = ref(MATCH.WAITING);
const hintShown = ref(false);
const nameShown = ref(false);
const liveCents = ref(null);
const holdProgress = ref(0);
const advancing = ref(false);

const sequence = shallowRef(null);
let advanceTimer = null;

const running = computed(() => mic.status.value === MIC.READY && detection.running.value);

/** Bounds-safe: `currentIndex` can equal `phrase.length` while the last
 *  note's success is still on screen, between completion and the next
 *  phrase -- see the comment on SequenceMatcher's `#arm`. */
const currentNote = computed(() => phrase.value[Math.min(currentIndex.value, phrase.value.length - 1)] ?? null);

/** Same reasoning as PracticeView.vue's `pool`: settings.pool is always
 *  naturals-only, which under/over-reports "no notes in range" once
 *  accidentals are in play. */
const pool = computed(() => notePool({
  low: settings.practiceLow,
  high: settings.practiceHigh,
  includeAccidentals: options.includeAccidentals.value,
}));

/** A wake lock so the phone does not sleep mid-session. Best-effort. */
let wakeLock = null;
async function acquireWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* unsupported */ }
}
function releaseWakeLock() {
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
}

async function begin() {
  if (!(await mic.start())) return;
  await acquireWakeLock();
  nextPhrase();
  // Runs continuously across phrase boundaries rather than restarting per
  // phrase: every phrase is a whole number of bars (see rhythm.js), so the
  // click stays aligned to the downbeat without ever needing to resync.
  if (options.rhythmEnabled.value) metronome.start(mic.context.value);
  detection.start(onFrame);
}

function stop() {
  detection.stop();
  metronome.stop();
  clearTimeout(advanceTimer);
  advancing.value = false;
  releaseWakeLock();
}

function nextPhrase() {
  clearTimeout(advanceTimer);
  advancing.value = false;
  phrase.value = generatePhrase({
    low: settings.practiceLow,
    high: settings.practiceHigh,
    includeAccidentals: options.includeAccidentals.value,
    length: options.phraseLength.value,
    previous: phrase.value.map((n) => n.midi),
  });
  if (phrase.value.length === 0) { sequence.value = null; return; }
  sequence.value = new SequenceMatcher(phrase.value.map((n) => n.midi), settings.matcherConfig);
  sequence.value.reset(performance.now());
  syncFromMatcher();
}

function onFrame(reading, now) {
  const s = sequence.value;
  if (!s || advancing.value) return;

  const before = s.completed.length;
  const state = s.update(reading, now);
  syncFromMatcher(now);

  // Every note landed is its own attempt, exactly like the single-note
  // drills -- a phrase is several attempts, not one.
  if (s.completed.length > before) {
    const done = s.completed[s.completed.length - 1];
    session.record({ midi: done.midi, ms: done.ms, hinted: done.hinted, mode: PRACTICE_MODE.MULTI });
  }

  if (state === MATCH.CORRECT && s.done) {
    advancing.value = true;
    // A beat on the last green note before the next phrase, same as the
    // single-note drills' success pause.
    advanceTimer = setTimeout(nextPhrase, 700);
  }
}

function syncFromMatcher(now = performance.now()) {
  const s = sequence.value;
  if (!s || !s.matcher) return;
  currentIndex.value = s.index;
  matchState.value = s.matcher.state;
  hintShown.value = s.matcher.hintShown;
  nameShown.value = s.matcher.nameShown;
  liveCents.value = s.matcher.cents;
  holdProgress.value = s.matcher.holdProgress(now);
}

function revealHint() {
  sequence.value?.revealHint();
  hintShown.value = true;
  nameShown.value = true;
}

/** Skips the current note within the phrase, not the whole phrase -- no
 *  penalty, same philosophy as every other drill's Skip. Skipping the last
 *  note in a phrase simply moves on to the next one. */
function skip() {
  const s = sequence.value;
  if (!s || advancing.value) return;
  s.skip(performance.now());
  if (s.done) nextPhrase();
  else syncFromMatcher();
}

// Changing the practice range, semitones, or phrase length mid-session
// should take effect on the next phrase, not wait for a reload.
watch(() => [
  settings.practiceLow, settings.practiceHigh,
  options.includeAccidentals.value, options.phraseLength.value,
], () => {
  if (running.value) nextPhrase();
});

watch(() => options.bpm.value, (bpm) => metronome.setBpm(bpm));
watch(() => options.rhythmEnabled.value, (on) => {
  if (!running.value) return;
  if (on) metronome.start(mic.context.value);
  else metronome.stop();
});

const noteState = computed(() => {
  if (matchState.value === MATCH.CORRECT) return 'correct';
  if (matchState.value === MATCH.HOLDING) return 'holding';
  if (matchState.value === MATCH.WRONG) return 'wrong';
  return 'waiting';
});

const feedback = computed(() => {
  if (!running.value) return '';
  switch (matchState.value) {
    case MATCH.CORRECT: return 'Yes — that’s it';
    case MATCH.HOLDING: return 'Hold it…';
    case MATCH.WRONG:
      return sequence.value?.matcher?.heardMidi != null
        ? `Hearing ${noteName(sequence.value.matcher.heardMidi)}`
        : 'Not quite';
    default: return 'Play the note';
  }
});

onUnmounted(stop);
</script>

<template>
  <SessionLayout>
    <template #music>
      <!-- Pre-flight: microphone permission and failure states. -->
      <div v-if="!running" class="gate">
        <template v-if="mic.status.value === MIC.DENIED || mic.status.value === MIC.UNSUPPORTED || mic.status.value === MIC.ERROR">
          <p class="error">{{ mic.error.value }}</p>
          <button class="primary" @click="begin">Try again</button>
        </template>
        <template v-else>
          <p class="blurb">
            A short phrase appears on the staff. Play it one note at a time — the
            cursor moves on as soon as you land each note, in your own time.
          </p>
          <button class="primary" :disabled="mic.status.value === MIC.REQUESTING" @click="begin">
            {{ mic.status.value === MIC.REQUESTING ? 'Waiting for microphone…' : 'Start practicing' }}
          </button>
          <p v-if="pool.length === 0" class="error">
            The practice range contains no notes. Widen it in Settings.
          </p>
        </template>
      </div>

      <template v-else-if="phrase.length > 0">
        <p class="progress">Note {{ Math.min(currentIndex + 1, phrase.length) }} of {{ phrase.length }}</p>
        <PhraseDisplay
          :notes="phrase"
          :current-index="currentIndex"
          :state="noteState"
          :show-name="nameShown"
        />
      </template>
    </template>

    <template #toolbar>
      <label class="toggle">
        <input type="checkbox" v-model="options.includeAccidentals.value" />
        Include sharps
      </label>
      <label class="toggle">
        <input type="checkbox" v-model="options.rhythmEnabled.value" />
        Rhythm (click track)
      </label>
      <label v-if="options.rhythmEnabled.value" class="range-field" for="multi-bpm">
        Tempo
        <input id="multi-bpm" v-model.number="options.bpm.value" type="range" min="40" max="160" step="2" />
        <span class="value">{{ options.bpm.value }} BPM</span>
      </label>
      <label class="range-field" for="multi-length">
        Phrase length
        <input id="multi-length" v-model.number="options.phraseLength.value" type="range" min="4" max="16" step="1" />
        <span class="value">{{ options.phraseLength.value }} notes</span>
      </label>
    </template>

    <template #sidebar>
      <PracticeSidebar
        :hint-midi="currentNote?.midi ?? null"
        :hint-shown="running && hintShown"
        :can-reveal="running && phrase.length > 0"
        :reading="detection.reading.value"
        :cents="liveCents"
        :tolerance="settings.toleranceCents"
        :hold-progress="holdProgress"
        :note-state="noteState"
        :feedback="feedback"
        @reveal="revealHint"
      >
        <template v-if="running && phrase.length > 0">
          <button @click="skip">Skip</button>
          <button @click="stop">Stop</button>
        </template>

        <template #footer>
          <p class="streak">
            Streak <strong>{{ session.streak }}</strong>
            <span v-if="session.bestStreak > 0"> · best {{ session.bestStreak }}</span>
          </p>
        </template>
      </PracticeSidebar>
    </template>
  </SessionLayout>
</template>

<style scoped>
.toggle { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; }
.range-field { display: flex; align-items: center; gap: 0.5rem; }
.range-field input[type='range'] { width: 8rem; accent-color: var(--accent); }
.range-field .value {
  min-width: 4.5em; color: var(--ink); font-variant-numeric: tabular-nums; font-weight: 600;
}

.gate { display: flex; flex-direction: column; gap: 1rem; align-items: center; text-align: center; padding: 2rem 0; }
.blurb { margin: 0; max-width: 34ch; color: var(--ink-dim); font-size: 0.9rem; line-height: 1.55; }
.error { margin: 0; max-width: 40ch; color: var(--accent-warn); font-size: 0.85rem; line-height: 1.5; }

.progress { margin: 0; font-size: 0.78rem; color: var(--ink-faint); text-align: center; }

button {
  font: inherit; font-size: 0.85rem; padding: 0.55rem 0.9rem; cursor: pointer;
  border: 1px solid var(--line); background: var(--surface-2); color: var(--ink);
  border-radius: 8px;
}
button.primary {
  background: var(--accent); border-color: var(--accent); color: var(--on-accent);
  font-size: 0.95rem; padding: 0.7rem 1.4rem; font-weight: 600;
}
button:disabled { opacity: 0.6; cursor: default; }

.streak { margin: 0; }
</style>
