<script setup>
import { useSessionStore } from '../stores/session.js';
import { PRACTICE_MODE_LABELS } from '../stores/practiceModes.js';
import FingeringChart from './FingeringChart.vue';

const session = useSessionStore();
const fmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);
</script>

<template>
  <section class="panel">
    <h2>Progress</h2>

    <div v-if="session.completed === 0" class="empty">
      Nothing practised yet. Play a few notes and per-note timings show up here.
    </div>

    <template v-else>
      <div class="tiles">
        <div class="tile"><span class="n">{{ session.completed }}</span><span class="l">notes</span></div>
        <div class="tile"><span class="n">{{ session.streak }}</span><span class="l">streak</span></div>
        <div class="tile"><span class="n">{{ session.bestStreak }}</span><span class="l">best</span></div>
        <div class="tile">
          <span class="n">{{ Math.round(session.hintRate * 100) }}%</span>
          <span class="l">needed a hint</span>
        </div>
      </div>

      <div class="modes">
        <h3>By mode</h3>
        <table>
          <thead>
            <tr><th>Mode</th><th>Tries</th><th>Avg</th><th>Hints</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in session.modeBreakdown" :key="row.mode">
              <td class="note">{{ PRACTICE_MODE_LABELS[row.mode] }}</td>
              <td>{{ row.attempts || '—' }}</td>
              <td>{{ row.attempts ? fmt(row.avgMs) : '—' }}</td>
              <td :class="{ warn: row.hintRate > 0.5 }">
                {{ row.attempts ? `${Math.round(row.hintRate * 100)}%` : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Weakest notes</h3>
      <table>
        <thead>
          <tr><th>Note</th><th>Tries</th><th>Avg</th><th>Best</th><th>Hints</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in session.rankedNotes" :key="row.midi">
            <td class="note">{{ row.name }}</td>
            <td>{{ row.attempts }}</td>
            <td>{{ fmt(row.avgMs) }}</td>
            <td>{{ row.bestMs === null ? '—' : fmt(row.bestMs) }}</td>
            <td :class="{ warn: row.hintRate > 0.5 }">{{ Math.round(row.hintRate * 100) }}%</td>
          </tr>
        </tbody>
      </table>
      <p class="hint">Sorted weakest first — most hints needed, then slowest.</p>

      <div v-if="session.rankedNotes.length" class="weakest">
        <h3>Worth reviewing: {{ session.rankedNotes[0].name }}</h3>
        <FingeringChart :midi="session.rankedNotes[0].midi" compact />
      </div>

      <button class="reset" @click="session.reset()">Clear progress</button>
    </template>
  </section>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; gap: 1rem; }
h2 { margin: 0; font-size: 1rem; font-weight: 600; }
.empty { font-size: 0.85rem; color: var(--ink-faint); line-height: 1.5; }
.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
.tile {
  background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px;
  padding: 0.6rem 0.3rem; text-align: center; display: flex; flex-direction: column; gap: 0.15rem;
}
.tile .n { font-size: 1.15rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.tile .l { font-size: 0.65rem; color: var(--ink-faint); line-height: 1.2; }
.modes { display: flex; flex-direction: column; gap: 0.5rem; }
h3 { margin: 0; font-size: 0.8rem; font-weight: 600; color: var(--ink-dim); }
table { width: 100%; border-collapse: collapse; font-size: 0.8rem; font-variant-numeric: tabular-nums; }
th, td { padding: 0.35rem 0.3rem; text-align: right; border-bottom: 1px solid var(--line); }
th:first-child, td:first-child { text-align: left; }
th { color: var(--ink-faint); font-weight: 500; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; }
td.note { font-weight: 600; }
td.warn { color: var(--accent-warn); }
.hint { margin: 0; font-size: 0.72rem; color: var(--ink-faint); }
.weakest { border-top: 1px solid var(--line); padding-top: 0.9rem; }
.weakest h3 { margin: 0 0 0.6rem; font-size: 0.8rem; font-weight: 600; color: var(--ink-dim); }
.reset {
  align-self: flex-start; padding: 0.5rem 0.8rem; font: inherit; font-size: 0.8rem;
  border: 1px solid var(--line); background: var(--surface-2);
  color: var(--ink-dim); border-radius: 8px; cursor: pointer;
}
</style>
