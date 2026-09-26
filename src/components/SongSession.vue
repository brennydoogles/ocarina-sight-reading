<script setup>
import {
  ref, computed, shallowRef, onMounted, onUnmounted,
} from 'vue';
import SongDisplay from './SongDisplay.vue';
import FingeringChart from './FingeringChart.vue';
import PitchMeter from './PitchMeter.vue';
import { useMicrophone, MIC } from '../audio/useMicrophone.js';
import { usePitchDetection } from '../audio/usePitchDetection.js';
import { SequenceMatcher } from '../audio/sequenceMatcher.js';
import { MATCH } from '../audio/matcher.js';
import { useSongPlayback } from '../audio/useSongPlayback.js';
import { parseAbc } from '../music/abc.js';
import { playableTargets, renderIndexForPlayable, playableIndexForBar } from '../music/songSession.js';
import { scaleTempo, MIN_TEMPO_PERCENT, MAX_TEMPO_PERCENT } from '../music/playback.js';
import { useSettingsStore } from '../stores/settings.js';
import { useSessionStore } from '../stores/session.js';
import { PRACTICE_MODE } from '../stores/practiceModes.js';
import { noteName } from '../music/pitch.js';

const props = defineProps({
  song: { type: Object, required: true },
});
const emit = defineEmits(['back']);

const settings = useSettingsStore();
const session = useSessionStore();

const mic = useMicrophone({ fftSize: 2048 });
const detection = usePitchDetection(mic, () => settings.detectorConfig);
const playback = useSongPlayback();

/** @type {import('vue').Ref<import('../music/abc.js').ParsedTune|null>} */
const parsed = shallowRef(null);
const parseError = ref('');

const sequence = shallowRef(null);
const currentRenderIndex = ref(0);
const matchState = ref(MATCH.WAITING);
const hintShown = ref(false);
const nameShown = ref(false);
const liveCents = ref(null);
const holdProgress = ref(0);
const advancing = ref(false);
const finished = ref(false);

const startBar = ref(1);
const jumpBar = ref(1);

/** True while either continuous Listen or single-note step playback is the
 *  active mode -- pitch detection is stopped for the whole stretch, not
 *  toggled per note, so the player is never left wondering whether this
 *  particular instant is being listened to. */
const listening = ref(false);
const tempoPercent = ref(100);
/** Render-index position for Listen/step playback -- independent of
 *  `currentRenderIndex` (the real play-along position), so previewing a
 *  passage never advances or credits anything in the actual practice. */
const stepIndex = ref(0);

// Deliberately NOT `&& detection.running.value` -- unlike every other mode,
// detection here gets paused mid-session for Listen/step playback (see
// beginListenMode()), and the session itself is still very much "running"
// while that's happening. Gating the whole practice UI on detection's own
// running flag would hide it every time playback starts.
const running = computed(() => mic.status.value === MIC.READY);
const maxBar = computed(() => parsed.value?.notes.at(-1)?.bar ?? 1);

/** What the staff highlights: the real play-along cursor normally, or the
 *  Listen/step position while that's the active mode -- SongDisplay itself
 *  doesn't need to know which is driving it. */
const displayIndex = computed(() => (listening.value ? stepIndex.value : currentRenderIndex.value));
const displayState = computed(() => (listening.value ? 'holding' : noteState.value));

/** Bounds-safe, same reasoning as MultiNoteView.vue's `currentNote`. */
const currentNote = computed(() => {
  const notes = parsed.value?.notes ?? [];
  return notes[Math.min(displayIndex.value, notes.length - 1)] ?? null;
});

onMounted(async () => {
  const result = await parseAbc(props.song.abc);
  if (playableTargets(result.notes).length === 0) {
    parseError.value = 'This song has no notes to play.';
    return;
  }
  parsed.value = result;
});

/** A wake lock so the phone does not sleep mid-song. Best-effort. */
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
  if (!sequence.value) {
    sequence.value = new SequenceMatcher(playableTargets(parsed.value.notes), settings.matcherConfig);
    sequence.value.seekTo(playableIndexForBar(parsed.value.notes, startBar.value), performance.now());
  }
  syncFromMatcher();
  detection.start(onFrame);
}

/** Unlike Stop, does not forget the current position -- pausing to switch
 *  tabs (see the <KeepAlive> around this whole view) should not lose your
 *  place in a multi-minute tune. */
function stop() {
  if (listening.value) { playback.stop(); listening.value = false; }
  detection.stop();
  advancing.value = false;
  releaseWakeLock();
}

function restart() {
  if (!sequence.value) return;
  finished.value = false;
  sequence.value.reset(performance.now());
  syncFromMatcher();
}

function jumpToBar(bar) {
  if (!sequence.value) return;
  finished.value = false;
  advancing.value = false;
  sequence.value.seekTo(playableIndexForBar(parsed.value.notes, bar), performance.now());
  syncFromMatcher();
}

function skipNote() {
  const s = sequence.value;
  if (!s || advancing.value) return;
  s.skip(performance.now());
  if (s.done) {
    finished.value = true;
    currentRenderIndex.value = parsed.value.notes.length;
  } else {
    syncFromMatcher();
  }
}

function onFrame(reading, now) {
  const s = sequence.value;
  if (!s || advancing.value) return;

  const before = s.completed.length;
  const state = s.update(reading, now);
  syncFromMatcher(now);

  if (s.completed.length > before) {
    const done = s.completed[s.completed.length - 1];
    session.record({
      midi: done.midi, ms: done.ms, hinted: done.hinted, mode: PRACTICE_MODE.SONG,
    });
  }

  if (state === MATCH.CORRECT && s.done) {
    advancing.value = true;
    finished.value = true;
  }
}

/** `sequence.matcher` can be stale immediately after a jump/skip that lands
 *  exactly on "done" -- see the comment on SequenceMatcher's `#arm`. Check
 *  `done` first, rather than trust `.matcher.state` blindly, same as
 *  MultiNoteView.vue does for its own skip(). */
function syncFromMatcher(now = performance.now()) {
  const s = sequence.value;
  if (!s) return;
  if (s.done) {
    finished.value = true;
    currentRenderIndex.value = parsed.value.notes.length;
    return;
  }
  matchState.value = s.matcher.state;
  hintShown.value = s.matcher.hintShown;
  nameShown.value = s.matcher.nameShown;
  liveCents.value = s.matcher.cents;
  holdProgress.value = s.matcher.holdProgress(now);
  currentRenderIndex.value = renderIndexForPlayable(parsed.value.notes, s.index);
}

function revealHint() {
  sequence.value?.revealHint();
  hintShown.value = true;
  nameShown.value = true;
}

/**
 * Pausing pitch detection for playback is not optional -- useMicrophone.js
 * requests the stream with echo cancellation, noise suppression and AGC all
 * disabled (they mangle a sustained tone), so the app's own output would
 * otherwise go straight back into the detector and the matcher would chase
 * the playback instead of the player.
 */
function beginListenMode() {
  stepIndex.value = currentRenderIndex.value;
  listening.value = true;
  detection.stop();
}

function stopListening() {
  playback.stop();
  listening.value = false;
  if (running.value) detection.start(onFrame);
}

/** Continuous playback, from wherever the practice cursor currently is. */
async function listenFromHere() {
  if (listening.value || !parsed.value) return;
  beginListenMode();
  const bpm = scaleTempo(parsed.value.bpm, tempoPercent.value);
  await playback.playFrom(props.song.abc, {
    audioContext: mic.context.value,
    bpm,
    notes: parsed.value.notes,
    meter: parsed.value.meter ?? { num: 4, den: 4 },
    fromIndex: stepIndex.value,
    onEnded: stopListening,
  });
}

/** Single-note step mode: sounds exactly the note at `stepIndex`, then
 *  advances it for the next click -- a listening aid, not a substitute for
 *  actually playing the note, so it never touches the real play-along
 *  cursor or credits anything. */
async function stepPlayback() {
  const notes = parsed.value?.notes ?? [];
  if (notes.length === 0) return;
  if (!listening.value) beginListenMode();

  while (stepIndex.value < notes.length && notes[stepIndex.value].isRest) stepIndex.value += 1;
  if (stepIndex.value >= notes.length) { stopListening(); return; }

  const bpm = scaleTempo(parsed.value.bpm, tempoPercent.value);
  await playback.stepOne(props.song.abc, {
    audioContext: mic.context.value,
    bpm,
    notes,
    meter: parsed.value.meter ?? { num: 4, den: 4 },
    index: stepIndex.value,
    onDone: () => { stepIndex.value += 1; },
  });
}

const noteState = computed(() => {
  if (finished.value) return 'correct';
  if (matchState.value === MATCH.CORRECT) return 'correct';
  if (matchState.value === MATCH.HOLDING) return 'holding';
  if (matchState.value === MATCH.WRONG) return 'wrong';
  return 'waiting';
});

const feedback = computed(() => {
  if (!running.value) return '';
  if (listening.value) return 'Listening paused — playing back';
  if (finished.value) return 'Song complete';
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

onUnmounted(() => {
  detection.stop();
  releaseWakeLock();
});
</script>

<template>
  <section class="session">
    <button class="back" @click="emit('back')">&larr; Songs</button>
    <h3 class="title">{{ song.title }}</h3>

    <p v-if="parseError" class="error">{{ parseError }}</p>

    <template v-else-if="!parsed">
      <p class="hint">Loading…</p>
    </template>

    <template v-else>
      <div v-if="!running" class="gate">
        <template v-if="mic.status.value === MIC.DENIED || mic.status.value === MIC.UNSUPPORTED || mic.status.value === MIC.ERROR">
          <p class="error">{{ mic.error.value }}</p>
          <button class="primary" @click="begin">Try again</button>
        </template>
        <template v-else>
          <p class="blurb">
            Play through the tune one note at a time. The cursor waits for the
            right pitch, held steady, and moves on whenever you're ready.
          </p>
          <label class="bar-field">
            Start from bar
            <input v-model.number="startBar" type="number" min="1" :max="maxBar" />
          </label>
          <button class="primary" :disabled="mic.status.value === MIC.REQUESTING" @click="begin">
            {{ mic.status.value === MIC.REQUESTING ? 'Waiting for microphone…' : 'Start playing' }}
          </button>
        </template>
      </div>

      <template v-else>
        <SongDisplay
          :notes="parsed.notes"
          :key-signature="parsed.keySignature"
          :meter="parsed.meter ?? { num: 4, den: 4 }"
          :current-index="displayIndex"
          :state="displayState"
          :show-name="nameShown"
        />

        <PitchMeter
          :reading="detection.reading.value"
          :cents="liveCents"
          :tolerance="settings.toleranceCents"
        />

        <div class="status" :class="noteState">
          <div class="hold-track"><div class="hold-fill" :style="{ width: `${holdProgress * 100}%` }" /></div>
          <p class="feedback" :class="{ listening }">{{ feedback }}</p>
        </div>

        <Transition name="fade">
          <div v-if="(hintShown || listening) && currentNote && !currentNote.isRest && !finished" class="hint-box">
            <FingeringChart :midi="currentNote.midi" />
          </div>
        </Transition>

        <div class="actions">
          <button v-if="!hintShown && !finished" :disabled="listening" @click="revealHint">Show fingering</button>
          <button v-if="!finished" :disabled="listening" @click="skipNote">Skip note</button>
          <button :disabled="listening" @click="restart">Restart</button>
          <button @click="stop">Stop</button>
        </div>

        <div class="resume">
          <label class="bar-field">
            Jump to bar
            <input v-model.number="jumpBar" type="number" min="1" :max="maxBar" :disabled="listening" />
          </label>
          <button :disabled="listening" @click="jumpToBar(jumpBar)">Go</button>
        </div>

        <div class="playback">
          <label class="tempo-field">
            Tempo <span class="value">{{ tempoPercent }}%</span>
            <input
              v-model.number="tempoPercent" type="range"
              :min="MIN_TEMPO_PERCENT" :max="MAX_TEMPO_PERCENT" step="5"
            />
          </label>
          <div class="playback-actions">
            <button v-if="!listening" @click="listenFromHere">Listen from here</button>
            <button v-if="!listening" @click="stepPlayback">Step one note</button>
            <button v-else @click="stopListening">Stop listening</button>
          </div>
          <p v-if="playback.unavailable.value" class="error">{{ playback.errorMessage.value }}</p>
        </div>

        <p class="streak">
          Streak <strong>{{ session.streak }}</strong>
          <span v-if="session.bestStreak > 0"> · best {{ session.bestStreak }}</span>
        </p>
      </template>
    </template>
  </section>
</template>

<style scoped>
.session { display: flex; flex-direction: column; gap: 1rem; align-items: center; }

.back {
  align-self: flex-start; font: inherit; font-size: 0.8rem;
  padding: 0.4rem 0.7rem; cursor: pointer;
  border: 1px solid var(--line); background: var(--surface-2); color: var(--ink-dim);
  border-radius: 8px;
}
.title { margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--ink); text-align: center; }

.gate { display: flex; flex-direction: column; gap: 1rem; align-items: center; text-align: center; padding: 1.5rem 0; }
.blurb { margin: 0; max-width: 34ch; color: var(--ink-dim); font-size: 0.9rem; line-height: 1.55; }
.error { margin: 0; max-width: 40ch; color: var(--accent-warn); font-size: 0.85rem; line-height: 1.5; }
.hint { margin: 0; color: var(--ink-faint); font-size: 0.85rem; }

.bar-field {
  display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--ink-dim);
}
.bar-field input {
  width: 4.5em; font: inherit; font-size: 0.9rem; padding: 0.4rem 0.5rem;
  border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 8px;
}

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

.status { width: 100%; max-width: 340px; }
.hold-track { height: 3px; background: var(--surface-2); border-radius: 2px; overflow: hidden; }
.hold-fill { height: 100%; background: var(--accent-ok); transition: width 60ms linear; }
.feedback {
  margin: 0.4rem 0 0; text-align: center; font-size: 0.9rem; font-weight: 600;
  color: var(--ink-dim); min-height: 1.3em;
}
.status.correct .feedback { color: var(--accent-ok); }
.status.wrong .feedback { color: var(--accent-warn); }

.hint-box {
  width: 100%; max-width: 340px; background: var(--surface-2);
  border: 1px solid var(--line); border-radius: 12px; padding: 0.85rem;
}
.fade-enter-active { transition: opacity 200ms ease, transform 200ms ease; }
.fade-enter-from { opacity: 0; transform: translateY(6px); }
.fade-leave-active { display: none; }

.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; }
.resume { display: flex; align-items: center; gap: 0.6rem; }

.playback {
  width: 100%; max-width: 340px; display: flex; flex-direction: column; gap: 0.6rem;
  padding-top: 0.85rem; border-top: 1px solid var(--line);
}
.tempo-field { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.8rem; color: var(--ink-dim); }
.tempo-field .value { color: var(--ink); font-variant-numeric: tabular-nums; font-weight: 600; }
.tempo-field input[type='range'] { width: 100%; accent-color: var(--accent); }
.playback-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; }
.feedback.listening { color: var(--accent); }

.streak { margin: 0; font-size: 0.78rem; color: var(--ink-faint); }
</style>
