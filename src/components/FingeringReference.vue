<script setup>
import { ref } from 'vue';
import FingeringChart from './FingeringChart.vue';
import { allInstrumentNotes } from '../music/notes.js';
import { noteName, isNatural } from '../music/pitch.js';
import { fingeringFileStem, FINGERING_DIR } from '../music/fingeringFiles.js';
import { clearFingeringCache } from '../music/fingeringAssets.js';

/** Bumped to force every chart to re-fetch after the cache is cleared. */
const revision = ref(0);

const notes = allInstrumentNotes({ includeAccidentals: true });
// Split rather than one long grid: 21 diagrams at phone width is a lot of
// scrolling, and the naturals are the ones most players want first.
const naturals = notes.filter(isNatural);
const accidentals = notes.filter((m) => !isNatural(m));

function reloadDiagrams() {
  clearFingeringCache();
  revision.value += 1;
}
</script>

<template>
  <section class="panel">
    <h2>Fingering reference</h2>
    <p class="blurb">
      Each diagram is its own file under <code>public/{{ FINGERING_DIR }}/</code>,
      free to redraw by hand — the filename under each note is the one to edit.
      Worth checking these against the chart that came with your ocarina: the
      underlying table was cross-checked against two independent published
      sources, which agree on every natural, but makers do vary.
    </p>

    <div class="controls">
      <span>{{ notes.length }} notes, A4 to F6 chromatic</span>
      <button class="reload" @click="reloadDiagrams">Reload diagrams</button>
    </div>

    <h3 class="group-heading">Naturals</h3>
    <div class="grid">
      <article v-for="midi in naturals" :key="midi" class="cell">
        <h4>{{ noteName(midi) }}</h4>
        <FingeringChart :key="`${midi}-${revision}`" :midi="midi" compact />
        <code class="file">{{ fingeringFileStem(midi) }}.svg</code>
      </article>
    </div>

    <h3 class="group-heading">Accidentals</h3>
    <div class="grid">
      <article v-for="midi in accidentals" :key="midi" class="cell">
        <h4>{{ noteName(midi) }}</h4>
        <FingeringChart :key="`${midi}-${revision}`" :midi="midi" compact />
        <code class="file">{{ fingeringFileStem(midi) }}.svg</code>
      </article>
    </div>

    <p class="legend">
      Filled circles are covered holes, outlined ones open. The small circles
      are the subholes, played by the middle fingers.
    </p>
  </section>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; gap: 1rem; }
h2 { margin: 0; font-size: 1rem; font-weight: 600; }
.blurb { margin: 0; font-size: 0.78rem; color: var(--ink-faint); line-height: 1.55; }
.blurb code, .file {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.92em;
}
.controls { display: flex; gap: 1rem; align-items: center; font-size: 0.8rem; color: var(--ink-dim); }
.controls label { display: flex; align-items: center; gap: 0.35rem; }
.reload {
  margin-left: auto; font: inherit; font-size: 0.75rem; padding: 0.35rem 0.6rem;
  border: 1px solid var(--line); background: var(--surface-2);
  color: var(--ink-dim); border-radius: 7px; cursor: pointer;
}
.group-heading {
  margin: 0; font-size: 0.78rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--ink-faint);
}
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 0.9rem; }
.cell { background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px; padding: 0.6rem; }
.cell h4 {
  margin: 0 0 0.4rem; font-size: 0.85rem; font-weight: 700;
  display: flex; align-items: center; gap: 0.4rem;
}
.file { display: block; margin-top: 0.4rem; font-size: 0.68rem; color: var(--ink-faint); text-align: center; }
.legend { margin: 0; font-size: 0.72rem; color: var(--ink-faint); line-height: 1.5; }
</style>
