<script setup>
import { ref, watch, onMounted, shallowRef } from 'vue';
import { loadFingeringSvg } from '../music/fingeringAssets.js';
import { fingeringFileStem, FINGERING_DIR } from '../music/fingeringFiles.js';
import { noteName } from '../music/pitch.js';

const props = defineProps({
  midi: { type: Number, required: true },
  compact: { type: Boolean, default: false },
});

const host = ref(null);
const error = shallowRef(null);
const loading = shallowRef(true);

onMounted(show);
watch(() => props.midi, show);

async function show() {
  const midi = props.midi;
  loading.value = true;
  error.value = null;
  try {
    const svg = await loadFingeringSvg(midi);
    // The note may have changed while the fetch was in flight; a stale diagram
    // under a newer note would teach the wrong fingering.
    if (midi !== props.midi || !host.value) return;
    const copy = svg.cloneNode(true);
    copy.setAttribute('aria-label', `${noteName(midi)} fingering`);
    host.value.replaceChildren(copy);
    error.value = null;
  } catch (err) {
    if (midi !== props.midi) return;
    host.value?.replaceChildren();
    // The stem comes from the error where available, so the filename shown is
    // the one actually looked for rather than a re-derived guess.
    error.value = { message: err.message, stem: err.stem ?? fingeringFileStem(midi) };
  } finally {
    if (midi === props.midi) loading.value = false;
  }
}
</script>

<template>
  <figure class="chart" :class="{ compact }">
    <div ref="host" class="svg-host" :class="{ loading }" />
    <p v-if="error" class="error">
      {{ error.message }}
      <span class="stem">{{ FINGERING_DIR }}/{{ error.stem }}.svg</span>
    </p>
    <figcaption v-else-if="!compact" class="name">{{ noteName(midi) }}</figcaption>
  </figure>
</template>

<style scoped>
.chart { margin: 0; }
.svg-host { min-height: 2rem; }
.svg-host.loading { opacity: 0.4; }
.svg-host :deep(svg) { width: 100%; height: auto; display: block; }

.name {
  margin-top: 0.4rem;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink-dim);
}
.error {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--accent-warn);
  text-align: center;
}
.error .stem {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.72rem;
  opacity: 0.85;
}
.compact .name { display: none; }
</style>
