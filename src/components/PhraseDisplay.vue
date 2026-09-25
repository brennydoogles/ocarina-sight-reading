<script setup>
import { ref, shallowRef, watch, onMounted } from 'vue';
// Same bundled-fonts entry as StaffDisplay.vue, for the same reason: Bravura +
// Academico inlined as base64 so the PWA can draw a staff offline. Do not
// switch to the default `vexflow` entry, which fetches fonts from a CDN.
import VexFlow from 'vexflow/bravura';
import { toVexKey, noteName, isNatural } from '../music/pitch.js';
import { QUARTERS_PER_DURATION } from '../music/rhythm.js';

const props = defineProps({
  /** @type {import('vue').PropType<import('../music/notes.js').Note[]>} */
  notes: { type: Array, required: true },
  /** Index into `notes` of the note currently being played. */
  currentIndex: { type: Number, default: 0 },
  /** `waiting` | `holding` | `wrong` | `correct`, applied to the current note only. */
  state: { type: String, default: 'waiting' },
  beatsPerBar: { type: Number, default: 4 },
  /** First rung of the hint ladder: name the current note without the fingering. */
  showName: { type: Boolean, default: false },
});

const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Barline } = VexFlow;

/** Vertical room one stave (with ledger lines either side) needs. Matches
 *  StaffDisplay.vue's single-stave budget, so a one-bar phrase is the same
 *  height as the single-note view. */
const ROW_HEIGHT = 150;
const TOP_MARGIN = 70;
const WIDTH = 320;

const host = ref(null);
const fontsReady = shallowRef(false);

onMounted(async () => {
  try {
    await document.fonts.ready;
  } catch { /* older browsers: draw anyway */ }
  fontsReady.value = true;
  draw();
});

// flush: 'post', for the same reason as StaffDisplay.vue: draw() writes to
// the DOM imperatively, outside Vue's render, and a pre-flush watcher would
// leave the staff a frame behind whatever fingering/status UI sits beside it.
watch(() => [props.notes, props.currentIndex, props.state], draw, { flush: 'post' });

/** Splits `notes` into bars by accumulating duration until a bar's worth of
 *  beats is reached. `generateRhythm` guarantees bars sum exactly, so this
 *  never has to split a note -- a leftover partial bar only happens if a
 *  caller hands in notes whose durations don't add up, which still renders
 *  rather than silently dropping notes. */
function groupIntoBars(notes, beatsPerBar) {
  const bars = [];
  let bar = [];
  let beats = 0;
  for (const note of notes) {
    bar.push(note);
    beats += QUARTERS_PER_DURATION[note.duration] ?? 1;
    if (beats >= beatsPerBar - 1e-9) {
      bars.push(bar);
      bar = [];
      beats = 0;
    }
  }
  if (bar.length > 0) bars.push(bar);
  return bars;
}

function draw() {
  if (!fontsReady.value || !host.value) return;
  host.value.innerHTML = '';
  if (props.notes.length === 0) return;

  const bars = groupIntoBars(props.notes, props.beatsPerBar);
  const height = TOP_MARGIN + bars.length * ROW_HEIGHT;

  const renderer = new Renderer(host.value, Renderer.Backends.SVG);
  renderer.resize(WIDTH, height);
  const ctx = renderer.getContext();

  const ink = getComputedStyle(host.value).getPropertyValue('--staff-ink').trim() || '#000';
  ctx.setFillStyle(ink);
  ctx.setStrokeStyle(ink);

  const colourFor = {
    correct: getVar('--note-correct', '#3fb950'),
    wrong: getVar('--note-wrong', '#d98a3a'),
    holding: getVar('--note-holding', '#4a9eff'),
  };
  /** Every note already played correctly reads as done, in the same green
   *  the current note gets on success -- the phrase so far, at a glance. */
  const doneColour = colourFor.correct;

  let globalIndex = 0;
  bars.forEach((bar, barIndex) => {
    const y = TOP_MARGIN + barIndex * ROW_HEIGHT;
    const stave = new Stave(10, y, WIDTH - 20);
    stave.addClef('treble');
    if (barIndex === 0) stave.addTimeSignature(`${props.beatsPerBar}/4`);
    if (barIndex === bars.length - 1) stave.setEndBarType(Barline.type.END);
    stave.setContext(ctx).draw();

    const staveNotes = bar.map((note) => {
      const i = globalIndex;
      globalIndex += 1;

      const staveNote = new StaveNote({
        keys: [toVexKey(note.midi)],
        duration: note.duration,
        clef: 'treble',
      });
      if (!isNatural(note.midi)) staveNote.addModifier(new Accidental('#'), 0);

      const colour = i === props.currentIndex ? colourFor[props.state]
        : i < props.currentIndex ? doneColour
          : null;
      if (colour) staveNote.setStyle({ fillStyle: colour, strokeStyle: colour });
      return staveNote;
    });

    const voice = new Voice({ numBeats: props.beatsPerBar, beatValue: 4 });
    // Defensive, not load-bearing: generateRhythm guarantees an exact fit,
    // but a mismatched bar should render loosely rather than throw.
    voice.setStrict(false);
    voice.addTickables(staveNotes);
    const fit = stave.getNoteEndX() - stave.getNoteStartX();
    new Formatter().joinVoices([voice]).format([voice], fit - 20);
    voice.draw(ctx, stave);
  });

  const svg = host.value.querySelector('svg');
  if (svg) {
    svg.setAttribute('viewBox', `0 0 ${WIDTH} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', describePhrase());
  }
}

function spoken(midi) {
  return isNatural(midi) ? noteName(midi) : `${noteName(midi)} (sharp)`;
}

function describePhrase() {
  const names = props.notes.map((note) => spoken(note.midi)).join(', ');
  return `Phrase of ${props.notes.length} notes on the treble clef: ${names}. `
    + `Currently on note ${props.currentIndex + 1}.`;
}

function getVar(name, fallback) {
  const v = getComputedStyle(host.value).getPropertyValue(name).trim();
  return v || fallback;
}
</script>

<template>
  <div class="staff-block">
    <!-- Always in the layout, only sometimes visible -- see StaffDisplay.vue. -->
    <p class="note-name" :class="{ shown: showName }" aria-live="polite">
      <span v-if="showName && notes[currentIndex]">{{ noteName(notes[currentIndex].midi) }}</span>
    </p>
    <div ref="host" class="staff" />
  </div>
</template>

<style scoped>
.staff-block {
  width: 100%;
  max-width: 340px;
  margin: 0 auto;
}
.staff {
  --staff-ink: var(--ink);
  width: 100%;
}

.note-name {
  margin: 0;
  height: 1.6rem;
  line-height: 1.6rem;
  text-align: center;
  font-size: 1.15rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  color: var(--ink-dim);
  opacity: 0;
  transition: opacity 220ms ease;
}
.note-name.shown { opacity: 1; }
.staff :deep(svg) {
  width: 100%;
  height: auto;
  display: block;
}
</style>
