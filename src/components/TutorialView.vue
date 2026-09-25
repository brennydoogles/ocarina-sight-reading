<script setup>
import { ref, computed, shallowRef, onUnmounted, watch } from 'vue';
import StaffDisplay from './StaffDisplay.vue';
import FingeringChart from './FingeringChart.vue';
import PitchMeter from './PitchMeter.vue';
import { useMicrophone, MIC } from '../audio/useMicrophone.js';
import { usePitchDetection } from '../audio/usePitchDetection.js';
import { NoteMatcher, MATCH } from '../audio/matcher.js';
import { buildTutorialSteps, TUTORIAL_SECTION } from '../music/tutorial.js';
import { useSettingsStore } from '../stores/settings.js';
import { useSessionStore } from '../stores/session.js';
import { useModesStore } from '../stores/modes.js';
import { useTutorialStore } from '../stores/tutorial.js';
import { PRACTICE_MODE } from '../stores/practiceModes.js';
import { noteName } from '../music/pitch.js';

const SECTION_LABEL = Object.freeze({
  [TUTORIAL_SECTION.WALKTHROUGH]: 'Note walkthrough',
  [TUTORIAL_SECTION.SCALE]: 'C major scale',
});

const settings = useSettingsStore();
const session = useSessionStore();
const modes = useModesStore();
const progress = useTutorialStore();
const options = modes.optionsFor('tutorial');

const mic = useMicrophone({ fftSize: 2048 });
const detection = usePitchDetection(mic, () => settings.detectorConfig);

const steps = computed(() => buildTutorialSteps({
  includeAccidentals: options.includeAccidentals.value,
  low: settings.practiceLow,
  high: settings.practiceHigh,
}));
/** Never clamped -- only the DISPLAYED index is. Flipping the toggle back
 *  on restores a deeper position instead of losing it to the clamp. */
const isComplete = computed(() => progress.stepIndex >= steps.value.length);
const currentIndex = computed(() => Math.min(progress.stepIndex, steps.value.length - 1));
const step = computed(() => steps.value[currentIndex.value] ?? null);

const matchState = ref(MATCH.WAITING);
const liveCents = ref(null);
const holdProgress = ref(0);
const advancing = ref(false);

const matcher = shallowRef(null);
let advanceTimer = null;

const running = computed(() => mic.status.value === MIC.READY && detection.running.value);

/** A wake lock so the phone does not sleep mid-tutorial. Best-effort. */
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
  beginStep();
  detection.start(onFrame);
}

function stop() {
  detection.stop();
  clearTimeout(advanceTimer);
  advancing.value = false;
  releaseWakeLock();
}

function beginStep() {
  clearTimeout(advanceTimer);
  advancing.value = false;
  if (!step.value) return; // tutorial complete
  matcher.value = new NoteMatcher(step.value.midi, settings.matcherConfig);
  matcher.value.reset(performance.now());
  syncFromMatcher();
}

function onFrame(reading, now) {
  const m = matcher.value;
  if (!m || advancing.value || isComplete.value) return;

  const state = m.update(reading, now);
  syncFromMatcher(now);

  if (state === MATCH.CORRECT) {
    advancing.value = true;
    // The fingering is always on screen here, by design -- it is not
    // something the player asked for, so it should not read as "hinted".
    session.record({
      midi: m.target, ms: m.timeToCorrect ?? 0, hinted: false, mode: PRACTICE_MODE.TUTORIAL,
    });
    // A beat on the green note before moving on, so success registers.
    advanceTimer = setTimeout(advanceStep, 700);
  }
}

function advanceStep() {
  progress.advanceTo(currentIndex.value + 1);
  beginStep();
}

function syncFromMatcher(now = performance.now()) {
  const m = matcher.value;
  if (!m) return;
  matchState.value = m.state;
  liveCents.value = m.cents;
  holdProgress.value = m.holdProgress(now);
}

function skip() {
  advanceStep();
}

function restart() {
  progress.restart();
  if (running.value) beginStep();
}

// Toggling accidentals, or changing the practice range in Settings,
// mid-session changes the step list under the current index; re-arm the
// matcher for whatever note is now current.
watch(() => [options.includeAccidentals.value, settings.practiceLow, settings.practiceHigh], () => {
  if (running.value) beginStep();
});

const noteState = computed(() => {
  if (matchState.value === MATCH.CORRECT) return 'correct';
  if (matchState.value === MATCH.HOLDING) return 'holding';
  if (matchState.value === MATCH.WRONG) return 'wrong';
  return 'waiting';
});

const feedback = computed(() => {
  if (!running.value || isComplete.value) return '';
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
  <section class="tutorial">
    <label class="toggle">
      <input type="checkbox" v-model="options.includeAccidentals.value" />
      Include sharps
    </label>

    <!-- Pre-flight: microphone permission and failure states. -->
    <div v-if="!running" class="gate">
      <template v-if="mic.status.value === MIC.DENIED || mic.status.value === MIC.UNSUPPORTED || mic.status.value === MIC.ERROR">
        <p class="error">{{ mic.error.value }}</p>
        <button class="primary" @click="begin">Try again</button>
      </template>
      <template v-else>
        <p class="blurb">
          A guided walk through your practice range, one note at a time,
          then the C major scale. The fingering is always shown — this is
          for learning, not testing.
        </p>
        <button class="primary" :disabled="mic.status.value === MIC.REQUESTING" @click="begin">
          {{ mic.status.value === MIC.REQUESTING ? 'Waiting for microphone…' : 'Start tutorial' }}
        </button>
        <p v-if="progress.stepIndex > 0" class="resume">
          Resuming at step {{ currentIndex + 1 }} of {{ steps.length }}.
          <button class="link" @click="restart">Start over instead</button>
        </p>
      </template>
    </div>

    <template v-else-if="isComplete">
      <div class="done">
        <h3>Tutorial complete</h3>
        <p>You've worked through your practice range and the C major scale.</p>
        <button class="primary" @click="restart">Restart</button>
      </div>
    </template>

    <template v-else-if="step">
      <p class="section">{{ SECTION_LABEL[step.section] }} · step {{ currentIndex + 1 }} of {{ steps.length }}</p>

      <StaffDisplay :midi="step.midi" :state="noteState" show-name />

      <PitchMeter
        :reading="detection.reading.value"
        :cents="liveCents"
        :tolerance="settings.toleranceCents"
      />

      <div class="status" :class="noteState">
        <div class="hold-track"><div class="hold-fill" :style="{ width: `${holdProgress * 100}%` }" /></div>
        <p class="feedback">{{ feedback }}</p>
      </div>

      <!-- Always shown, unlike the drills' hint ladder: this is a teaching
           mode, so how to play the note is never withheld. -->
      <div class="hint-box">
        <FingeringChart :midi="step.midi" />
      </div>

      <div class="actions">
        <button @click="skip">Skip</button>
        <button @click="restart">Restart</button>
        <button @click="stop">Stop</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.tutorial { display: flex; flex-direction: column; gap: 1rem; align-items: center; }

.toggle {
  align-self: flex-start; display: flex; align-items: center; gap: 0.4rem;
  font-size: 0.8rem; color: var(--ink-dim); cursor: pointer;
}

.gate { display: flex; flex-direction: column; gap: 1rem; align-items: center; text-align: center; padding: 2rem 0; }
.blurb { margin: 0; max-width: 34ch; color: var(--ink-dim); font-size: 0.9rem; line-height: 1.55; }
.error { margin: 0; max-width: 40ch; color: var(--accent-warn); font-size: 0.85rem; line-height: 1.5; }
.resume { margin: 0; font-size: 0.78rem; color: var(--ink-faint); }

.link {
  background: none; border: none; padding: 0; margin-left: 0.3rem;
  color: var(--accent); text-decoration: underline; cursor: pointer; font: inherit;
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

.section { margin: 0; font-size: 0.78rem; color: var(--ink-faint); text-align: center; }

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

.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; }

.done { display: flex; flex-direction: column; gap: 0.7rem; align-items: center; text-align: center; padding: 2rem 0; }
.done h3 { margin: 0; font-size: 1rem; font-weight: 700; }
.done p { margin: 0; max-width: 34ch; color: var(--ink-dim); font-size: 0.88rem; line-height: 1.5; }
</style>
