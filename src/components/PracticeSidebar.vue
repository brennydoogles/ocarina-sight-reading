<script setup>
import FingeringChart from './FingeringChart.vue';
import PitchMeter from './PitchMeter.vue';

/**
 * Everything a practice mode shows beside the music, top to bottom: the
 * fingering hint, the pitch meter, the hold/feedback status, the mode's
 * buttons (default slot), then a footer slot for the streak and the like.
 *
 * On wide screens the hint sits in a fixed-size slot: until it is revealed,
 * a dashed placeholder of the same size holds the "Show fingering" button,
 * so revealing it never shifts the meter below. Phones have no room for an
 * empty box -- there the hint appears below the status only once it is
 * shown, and "Show fingering" sits in the button row instead. Both copies
 * of the button are rendered and CSS picks one, so no breakpoint logic
 * lives in JS.
 */
defineProps({
  /** Note whose fingering the hint shows; null when there is none to show
   *  (a rest, or the song is finished). */
  hintMidi: { type: Number, default: null },
  /** Show the fingering now, rather than the placeholder. */
  hintShown: { type: Boolean, default: false },
  /** Offer "Show fingering" while the hint is hidden. */
  canReveal: { type: Boolean, default: false },
  revealDisabled: { type: Boolean, default: false },
  reading: { type: Object, required: true },
  cents: { type: Number, default: null },
  tolerance: { type: Number, required: true },
  holdProgress: { type: Number, default: 0 },
  /** `waiting` | `holding` | `wrong` | `correct` */
  noteState: { type: String, default: 'waiting' },
  feedback: { type: String, default: '' },
  /** Extra class(es) on the feedback line, e.g. Song's `listening`. */
  feedbackClass: { type: [String, Object, Array], default: null },
});

defineEmits(['reveal']);
</script>

<template>
  <div class="practice-sidebar">
    <div class="hint-slot" :class="{ shown: hintShown && hintMidi != null }">
      <!-- Deliberately NOT keyed on the note. FingeringChart swaps its own
           contents when the note changes and guards against a stale fetch
           landing late, so one box can live across the whole session. Keying
           it would make every note change an enter/leave pair, leaving hidden
           copies of the previous diagram in the DOM for hundreds of ms. -->
      <Transition name="fade">
        <div v-if="hintShown && hintMidi != null" class="hint-box">
          <FingeringChart :midi="hintMidi" />
        </div>
      </Transition>
      <div v-if="!(hintShown && hintMidi != null)" class="placeholder">
        <button v-if="canReveal" :disabled="revealDisabled" @click="$emit('reveal')">Show fingering</button>
      </div>
    </div>

    <PitchMeter class="meter" :reading="reading" :cents="cents" :tolerance="tolerance" />

    <div class="status" :class="noteState">
      <div class="hold-track"><div class="hold-fill" :style="{ width: `${holdProgress * 100}%` }" /></div>
      <p class="feedback" :class="feedbackClass">{{ feedback }}</p>
    </div>

    <div v-if="$slots.default || (canReveal && !hintShown)" class="actions">
      <button v-if="canReveal && !hintShown" class="reveal-inline" :disabled="revealDisabled" @click="$emit('reveal')">
        Show fingering
      </button>
      <slot />
    </div>

    <div v-if="$slots.footer" class="footer"><slot name="footer" /></div>
  </div>
</template>

<style scoped>
.practice-sidebar {
  /* The hint slot's height is worked out from this box's width (cqw). */
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.6rem;
}

/*
 * Exactly the height of a revealed hint: the box's padding and border, the
 * 16:9 diagram at the width left over, and FingeringChart's caption line
 * (0.4rem margin + one 0.85rem line). The placeholder and the hint share
 * this one grid cell, so swapping them moves nothing.
 */
.hint-slot {
  --hint-pad: 0.85rem;
  --caption: 1.7rem;
  display: grid;
  height: calc((100cqw - 2 * var(--hint-pad) - 2px) * 9 / 16 + 2 * var(--hint-pad) + 2px + var(--caption));
}
.hint-slot > * { grid-area: 1 / 1; min-width: 0; }
.hint-box {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: var(--hint-pad);
  overflow: hidden;
}
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px dashed var(--line);
  border-radius: 12px;
}

.fade-enter-active { transition: opacity 200ms ease, transform 200ms ease; }
.fade-enter-from { opacity: 0; transform: translateY(6px); }
/*
 * The hint fades IN -- that moment deserves a beat -- but must never fade
 * out. Vue keeps a leaving element in the DOM, and a visible one would mean
 * the previous note's fingering sitting under the next note's staff.
 */
.fade-leave-active { display: none; }

.hold-track { height: 3px; background: var(--surface-2); border-radius: 2px; overflow: hidden; }
.hold-fill { height: 100%; background: var(--accent-ok); transition: width 60ms linear; }
.feedback {
  margin: 0.4rem 0 0; text-align: center; font-size: 0.9rem; font-weight: 600;
  color: var(--ink-dim); min-height: 1.3em;
}
.status.correct .feedback { color: var(--accent-ok); }
.status.wrong .feedback { color: var(--accent-warn); }
.feedback.listening { color: var(--accent); }

.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; }
.reveal-inline { display: none; }

.footer {
  display: flex; flex-direction: column; align-items: center; gap: 0.6rem;
  font-size: 0.78rem; color: var(--ink-faint);
}

button {
  font: inherit; font-size: 0.85rem; padding: 0.55rem 0.9rem; cursor: pointer;
  border: 1px solid var(--line); background: var(--surface-2); color: var(--ink);
  border-radius: 8px;
}
button:disabled { opacity: 0.6; cursor: default; }

/* Phones: keep today's order -- meter, status, then the hint only once it is
   shown -- with "Show fingering" back in the button row. Keep in step with
   WIDE_LAYOUT_QUERY in useMediaQuery.js. */
@media (max-width: 899.98px) {
  .practice-sidebar { gap: 1rem; }
  .meter { order: 1; }
  .status { order: 2; width: 100%; max-width: 340px; margin: 0 auto; }
  .hint-slot { order: 3; height: auto; width: 100%; max-width: 340px; margin: 0 auto; }
  .hint-slot:not(.shown) { display: none; }
  .actions { order: 4; }
  .footer { order: 5; }
  .reveal-inline { display: inline-block; }
}
</style>
