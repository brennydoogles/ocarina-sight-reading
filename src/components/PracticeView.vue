<script setup>
import { ref, computed, shallowRef, onUnmounted, watch } from 'vue';
import StaffDisplay from './StaffDisplay.vue';
import FingeringChart from './FingeringChart.vue';
import PitchMeter from './PitchMeter.vue';
import { useMicrophone, MIC } from '../audio/useMicrophone.js';
import { usePitchDetection } from '../audio/usePitchDetection.js';
import { NoteMatcher, MATCH } from '../audio/matcher.js';
import { generateExercise } from '../music/exercise.js';
import { useSettingsStore } from '../stores/settings.js';
import { useSessionStore } from '../stores/session.js';
import { noteName } from '../music/pitch.js';
import { READING } from '../audio/detector.js';

const settings = useSettingsStore();
const session = useSessionStore();

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

// Changing the practice range mid-session should take effect now, not on the
// next correct answer.
watch(() => [settings.practiceLow, settings.practiceHigh], () => {
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
  <section class="practice">
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
          {{ mic.status.value === MIC.REQUESTING ? 'Waiting for microphone…' : 'Start practising' }}
        </button>
        <p v-if="settings.pool.length === 0" class="error">
          The practice range contains no notes. Widen it in Settings.
        </p>
      </template>
    </div>

    <template v-else-if="target">
      <StaffDisplay :midi="target.midi" :state="noteState" :show-name="nameShown" />

      <PitchMeter
        :reading="detection.reading.value"
        :cents="liveCents"
        :tolerance="settings.toleranceCents"
      />

      <div class="status" :class="noteState">
        <div class="hold-track"><div class="hold-fill" :style="{ width: `${holdProgress * 100}%` }" /></div>
        <p class="feedback">{{ feedback }}</p>
      </div>

      <!-- Deliberately NOT keyed on the note. FingeringChart swaps its own
           contents when the note changes and guards against a stale fetch
           landing late, so one box can live across the whole session. Keying
           it would make every note change an enter/leave pair, leaving hidden
           copies of the previous diagram in the DOM for hundreds of ms. -->
      <Transition name="fade">
        <div v-if="hintShown" class="hint-box">
          <FingeringChart :midi="target.midi" />
        </div>
      </Transition>

      <div class="actions">
        <button v-if="!hintShown" @click="revealHint">Show fingering</button>
        <button @click="skip">Skip</button>
        <button @click="stop">Stop</button>
      </div>

      <p class="streak">
        Streak <strong>{{ session.streak }}</strong>
        <span v-if="session.bestStreak > 0"> · best {{ session.bestStreak }}</span>
      </p>

      <dl v-if="settings.showDebug" class="debug">
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
  </section>
</template>

<style scoped>
.practice { display: flex; flex-direction: column; gap: 1rem; align-items: center; }
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
/*
 * The hint fades IN -- that moment deserves a beat -- but must never fade
 * out. Vue keeps a leaving element in the DOM, and a visible one would mean
 * the previous note's fingering sitting under the next note's staff.
 */
.fade-leave-active { display: none; }

.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; }
.streak { margin: 0; font-size: 0.78rem; color: var(--ink-faint); }

.debug {
  width: 100%; max-width: 340px; margin: 0; display: grid;
  grid-template-columns: repeat(2, 1fr); gap: 0.2rem 0.8rem;
  font-size: 0.72rem; font-variant-numeric: tabular-nums;
  border-top: 1px solid var(--line); padding-top: 0.6rem;
}
.debug > div { display: flex; justify-content: space-between; gap: 0.5rem; }
.debug dt { color: var(--ink-faint); }
.debug dd { margin: 0; }
</style>
