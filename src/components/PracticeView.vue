<script setup>
import { ref, computed, shallowRef, onUnmounted, watch } from 'vue';
import StaffDisplay from './StaffDisplay.vue';
import SessionLayout from './SessionLayout.vue';
import PracticeSidebar from './PracticeSidebar.vue';
import { useMicrophone, MIC } from '../audio/useMicrophone.js';
import { usePitchDetection } from '../audio/usePitchDetection.js';
import { NoteMatcher, MATCH } from '../audio/matcher.js';
import { generateExercise } from '../music/exercise.js';
import { notePool } from '../music/notes.js';
import { useSettingsStore } from '../stores/settings.js';
import { useSessionStore } from '../stores/session.js';
import { useModesStore } from '../stores/modes.js';
import { PRACTICE_MODE } from '../stores/practiceModes.js';
import { noteName } from '../music/pitch.js';
import { READING } from '../audio/detector.js';

const settings = useSettingsStore();
const session = useSessionStore();
const modes = useModesStore();
const options = modes.optionsFor(PRACTICE_MODE.SINGLE);

const mic = useMicrophone({ fftSize: 2048 });
const detection = usePitchDetection(mic, () => settings.detectorConfig);

const exercise = ref([]);
const matchState = ref(MATCH.WAITING);
const hintShown = ref(false);
const nameShown = ref(false);
const liveCents = ref(null);
const holdProgress = ref(0);
const advancing = ref(false);

const matcher = shallowRef(null);
let advanceTimer = null;

const target = computed(() => exercise.value[0] ?? null);
const running = computed(() => mic.status.value === MIC.READY && detection.running.value);

/**
 * The pool this session actually draws from. Not settings.pool -- that one
 * is always naturals-only, so it can under- or over-report "no notes in
 * range" once accidentals are in play (e.g. a one-note range that lands
 * exactly on an accidental has zero naturals but one playable note).
 */
const pool = computed(() => notePool({
  low: settings.practiceLow,
  high: settings.practiceHigh,
  includeAccidentals: options.includeAccidentals.value,
}));

/** A wake lock so the phone does not sleep mid-practice. Best-effort. */
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
  nextExercise();
  detection.start(onFrame);
}

function stop() {
  detection.stop();
  clearTimeout(advanceTimer);
  advancing.value = false;
  releaseWakeLock();
}

function nextExercise() {
  clearTimeout(advanceTimer);
  advancing.value = false;
  exercise.value = generateExercise({
    low: settings.practiceLow,
    high: settings.practiceHigh,
    includeAccidentals: options.includeAccidentals.value,
    previous: exercise.value.map((n) => n.midi),
  });
  if (!target.value) return;
  matcher.value = new NoteMatcher(target.value.midi, settings.matcherConfig);
  matcher.value.reset(performance.now());
  syncFromMatcher();
}

function onFrame(reading, now) {
  const m = matcher.value;
  if (!m || advancing.value) return;

  const state = m.update(reading, now);
  syncFromMatcher(now);

  if (state === MATCH.CORRECT) {
    advancing.value = true;
    session.record({
      midi: m.target,
      ms: m.timeToCorrect ?? 0,
      hinted: m.hintShown,
      mode: PRACTICE_MODE.SINGLE,
    });
    // A beat on the green note before moving on, so success registers.
    advanceTimer = setTimeout(nextExercise, 700);
  }
}

function syncFromMatcher(now = performance.now()) {
  const m = matcher.value;
  if (!m) return;
  matchState.value = m.state;
  hintShown.value = m.hintShown;
  nameShown.value = m.nameShown;
  liveCents.value = m.cents;
  holdProgress.value = m.holdProgress(now);
}

function revealHint() {
  matcher.value?.revealHint();
  hintShown.value = true;
  nameShown.value = true;
}

function skip() {
  nextExercise();
}

// Changing the practice range, or the semitones toggle, mid-session should
// take effect now, not on the next correct answer.
watch(() => [settings.practiceLow, settings.practiceHigh, options.includeAccidentals.value], () => {
  if (running.value) nextExercise();
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
      return matcher.value?.heardMidi != null
        ? `Hearing ${noteName(matcher.value.heardMidi)}`
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
            A note appears on the staff. Play it, and the app listens and tells you
            whether you got it. If you’re stuck, the fingering appears.
          </p>
          <button class="primary" :disabled="mic.status.value === MIC.REQUESTING" @click="begin">
            {{ mic.status.value === MIC.REQUESTING ? 'Waiting for microphone…' : 'Start practicing' }}
          </button>
          <p v-if="pool.length === 0" class="error">
            The practice range contains no notes. Widen it in Settings.
          </p>
        </template>
      </div>

      <StaffDisplay v-else-if="target" :midi="target.midi" :state="noteState" :show-name="nameShown" />
    </template>

    <template #toolbar>
      <label class="toggle">
        <input type="checkbox" v-model="options.includeAccidentals.value" />
        Include sharps
      </label>
    </template>

    <template #sidebar>
      <PracticeSidebar
        :hint-midi="target?.midi ?? null"
        :hint-shown="running && hintShown"
        :can-reveal="running && !!target"
        :reading="detection.reading.value"
        :cents="liveCents"
        :tolerance="settings.toleranceCents"
        :hold-progress="holdProgress"
        :note-state="noteState"
        :feedback="feedback"
        @reveal="revealHint"
      >
        <template v-if="running && target">
          <button @click="skip">Skip</button>
          <button @click="stop">Stop</button>
        </template>

        <template #footer>
          <p class="streak">
            Streak <strong>{{ session.streak }}</strong>
            <span v-if="session.bestStreak > 0"> · best {{ session.bestStreak }}</span>
          </p>

          <dl v-if="settings.showDebug && running" class="debug">
            <div><dt>status</dt><dd>{{ detection.reading.value.status }}</dd></div>
            <div><dt>Hz</dt><dd>{{ detection.reading.value.hz?.toFixed(2) ?? '—' }}</dd></div>
            <div><dt>note</dt><dd>{{ detection.reading.value.midi != null ? noteName(detection.reading.value.midi) : '—' }}</dd></div>
            <div><dt>cents</dt><dd>{{ liveCents?.toFixed(1) ?? '—' }}</dd></div>
            <div><dt>clarity</dt><dd>{{ detection.reading.value.clarity.toFixed(3) }}</dd></div>
            <div><dt>level</dt><dd>{{ Number.isFinite(detection.reading.value.db) ? detection.reading.value.db.toFixed(1) + ' dB' : '−∞' }}</dd></div>
            <div><dt>rate</dt><dd>{{ mic.sampleRate.value }} Hz</dd></div>
            <div v-if="detection.reading.value.status === READING.OUT_OF_RANGE"><dt>note</dt><dd>outside instrument range</dd></div>
          </dl>
        </template>
      </PracticeSidebar>
    </template>
  </SessionLayout>
</template>

<style scoped>
.toggle { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; }
.gate { display: flex; flex-direction: column; gap: 1rem; align-items: center; text-align: center; padding: 2rem 0; }
.blurb { margin: 0; max-width: 34ch; color: var(--ink-dim); font-size: 0.9rem; line-height: 1.55; }
.error { margin: 0; max-width: 40ch; color: var(--accent-warn); font-size: 0.85rem; line-height: 1.5; }

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

.debug {
  width: 100%; margin: 0; display: grid;
  grid-template-columns: repeat(2, 1fr); gap: 0.2rem 0.8rem;
  font-size: 0.72rem; font-variant-numeric: tabular-nums; color: var(--ink);
  border-top: 1px solid var(--line); padding-top: 0.6rem;
}
.debug > div { display: flex; justify-content: space-between; gap: 0.5rem; }
.debug dt { color: var(--ink-faint); }
.debug dd { margin: 0; }
</style>
