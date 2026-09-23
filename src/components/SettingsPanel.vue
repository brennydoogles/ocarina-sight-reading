<script setup>
import { useSettingsStore } from '../stores/settings.js';
import { INSTRUMENT_LOW, INSTRUMENT_HIGH } from '../music/notes.js';
import { HINT_MODE, NAME_HINT_FRACTION } from '../audio/matcher.js';
import { noteName } from '../music/pitch.js';

const s = useSettingsStore();
</script>

<template>
  <section class="panel">
    <h2>Settings</h2>

    <div class="field">
      <label for="low">Practice range</label>
      <div class="range-pair">
        <input
          id="low" type="range" :min="INSTRUMENT_LOW" :max="INSTRUMENT_HIGH" step="1"
          :value="s.practiceLow" @input="s.setPracticeLow(Number($event.target.value))"
        >
        <span class="value">{{ noteName(s.practiceLow) }}</span>
      </div>
      <div class="range-pair">
        <input
          type="range" :min="INSTRUMENT_LOW" :max="INSTRUMENT_HIGH" step="1"
          :value="s.practiceHigh" @input="s.setPracticeHigh(Number($event.target.value))"
        >
        <span class="value">{{ noteName(s.practiceHigh) }}</span>
      </div>
      <p class="hint">
        {{ s.pool.length }} note{{ s.pool.length === 1 ? '' : 's' }} in play —
        naturals from {{ noteName(INSTRUMENT_LOW) }} to {{ noteName(INSTRUMENT_HIGH) }}.
      </p>
    </div>

    <div class="field">
      <label for="tol">Tolerance <span class="value">±{{ s.toleranceCents }}¢</span></label>
      <input id="tol" v-model.number="s.toleranceCents" type="range" min="10" max="50" step="5">
      <p class="hint">
        50¢ accepts anything that rounds to the right note. Lower values turn this
        into an intonation drill.
      </p>
    </div>

    <div class="field">
      <label for="sus">Hold for <span class="value">{{ s.sustainMs }} ms</span></label>
      <input id="sus" v-model.number="s.sustainMs" type="range" min="50" max="500" step="25">
      <p class="hint">How long the note must stay in tune before it counts.</p>
    </div>

    <div class="field">
      <label>Fingering hint</label>
      <div class="segmented">
        <button
          v-for="opt in [
            { v: HINT_MODE.TIMEOUT, label: 'After a pause' },
            { v: HINT_MODE.ALWAYS, label: 'Always' },
            { v: HINT_MODE.NEVER, label: 'Never' },
          ]"
          :key="opt.v"
          :class="{ on: s.hintMode === opt.v }"
          @click="s.hintMode = opt.v"
        >{{ opt.label }}</button>
      </div>
      <template v-if="s.hintMode === HINT_MODE.TIMEOUT">
        <label for="hint" class="sub">
          Wait <span class="value">{{ (s.hintTimeoutMs / 1000).toFixed(1) }}s</span>
        </label>
        <input id="hint" v-model.number="s.hintTimeoutMs" type="range" min="1000" max="30000" step="500">
        <p class="hint">
          Help arrives in two stages: the note's name after
          {{ (s.hintTimeoutMs * NAME_HINT_FRACTION / 1000).toFixed(1) }}s,
          then the fingering at {{ (s.hintTimeoutMs / 1000).toFixed(1) }}s.
        </p>
      </template>
    </div>

    <details class="advanced">
      <summary>Advanced</summary>
      <div class="field">
        <label for="clar">Clarity threshold <span class="value">{{ s.clarityThreshold.toFixed(2) }}</span></label>
        <input id="clar" v-model.number="s.clarityThreshold" type="range" min="0.5" max="0.99" step="0.01">
        <p class="hint">Raise if noise is registering as notes; lower if real notes are ignored.</p>
      </div>
      <div class="field">
        <label for="gate">Noise gate <span class="value">{{ s.noiseGateDb }} dB</span></label>
        <input id="gate" v-model.number="s.noiseGateDb" type="range" min="-70" max="-20" step="1">
      </div>
      <div class="field checkbox">
        <label><input v-model="s.showDebug" type="checkbox"> Show detector readout</label>
      </div>
      <button class="reset" @click="s.reset()">Reset to defaults</button>
    </details>
  </section>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; gap: 1.25rem; }
h2 { margin: 0; font-size: 1rem; font-weight: 600; }
.field { display: flex; flex-direction: column; gap: 0.4rem; }
label { font-size: 0.85rem; color: var(--ink-dim); display: flex; justify-content: space-between; gap: 0.5rem; }
label.sub { margin-top: 0.4rem; }
.value { color: var(--ink); font-variant-numeric: tabular-nums; font-weight: 600; }
.hint { margin: 0; font-size: 0.75rem; color: var(--ink-faint); line-height: 1.45; }
input[type='range'] { width: 100%; accent-color: var(--accent); }
.range-pair { display: flex; align-items: center; gap: 0.6rem; }
.range-pair .value { min-width: 2.8em; text-align: right; }
.segmented { display: flex; gap: 0.35rem; }
.segmented button {
  flex: 1; padding: 0.5rem 0.4rem; font: inherit; font-size: 0.8rem;
  border: 1px solid var(--line); background: var(--surface-2); color: var(--ink-dim);
  border-radius: 8px; cursor: pointer;
}
.segmented button.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.advanced { border-top: 1px solid var(--line); padding-top: 0.75rem; }
.advanced summary { cursor: pointer; font-size: 0.85rem; color: var(--ink-dim); }
.advanced > .field { margin-top: 0.9rem; }
.checkbox label { justify-content: flex-start; gap: 0.5rem; align-items: center; }
.reset {
  margin-top: 0.9rem; padding: 0.5rem 0.8rem; font: inherit; font-size: 0.8rem;
  border: 1px solid var(--line); background: var(--surface-2);
  color: var(--ink-dim); border-radius: 8px; cursor: pointer;
}
</style>
