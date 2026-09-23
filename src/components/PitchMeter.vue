<script setup>
import { computed } from 'vue';
import { READING } from '../audio/detector.js';
import { noteName } from '../music/pitch.js';

const props = defineProps({
  reading: { type: Object, required: true },
  cents: { type: Number, default: null },
  tolerance: { type: Number, default: 50 },
});

/** Clamp to the meter's visible span so a wild note pins rather than escapes. */
const SPAN = 100;
const offset = computed(() => {
  if (props.cents === null) return null;
  return Math.max(-SPAN, Math.min(SPAN, props.cents)) / SPAN;
});

const inTune = computed(() =>
  props.cents !== null && Math.abs(props.cents) <= props.tolerance);

/** Tolerance band as a percentage of the meter's half-width. */
const bandWidth = computed(() => Math.min(100, (props.tolerance / SPAN) * 100));

const caption = computed(() => {
  const r = props.reading;
  if (r.status === READING.SILENT) return 'Listening…';
  if (r.status === READING.UNCLEAR) return 'Keep the note steady';
  if (r.status === READING.OUT_OF_RANGE) return 'Out of range';
  if (props.cents === null) return '';
  const sign = props.cents > 0 ? '+' : '';
  return `${noteName(r.midi)} · ${sign}${Math.round(props.cents)}¢`;
});
</script>

<template>
  <div class="meter" :class="{ active: offset !== null }">
    <div class="track">
      <div class="band" :style="{ width: `${bandWidth}%` }" />
      <div class="centre" />
      <div
        v-if="offset !== null"
        class="needle"
        :class="{ 'in-tune': inTune }"
        :style="{ left: `${50 + offset * 50}%` }"
      />
    </div>
    <p class="caption" :class="{ 'in-tune': inTune }">{{ caption }}</p>
  </div>
</template>

<style scoped>
.meter { width: 100%; max-width: 340px; margin: 0 auto; }
.track {
  position: relative;
  height: 26px;
  border-radius: 13px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  overflow: hidden;
}
.band {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  transform: translateX(-50%);
  background: color-mix(in srgb, var(--accent-ok) 18%, transparent);
}
.centre {
  position: absolute;
  left: 50%;
  top: 4px;
  bottom: 4px;
  width: 2px;
  margin-left: -1px;
  background: var(--ink-dim);
}
.needle {
  position: absolute;
  top: 2px;
  bottom: 2px;
  width: 4px;
  margin-left: -2px;
  border-radius: 2px;
  background: var(--accent-warn);
  transition: left 80ms linear, background 120ms ease;
}
.needle.in-tune { background: var(--accent-ok); }
.caption {
  margin: 0.35rem 0 0;
  text-align: center;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink-dim);
  min-height: 1.2em;
}
.caption.in-tune { color: var(--accent-ok); }
</style>
