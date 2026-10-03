<script setup>
import { ref, shallowRef, computed, watch, onMounted } from 'vue';
// Same bundled-fonts entry as StaffDisplay.vue/PhraseDisplay.vue, for the
// same reason: Bravura + Academico inlined as base64 so the PWA can draw a
// staff offline. Do not switch to the default `vexflow` entry.
import VexFlow from 'vexflow/bravura';
import { toVexKey, noteName } from '../music/pitch.js';
import { packLines, justifyLine } from '../music/staffLayout.js';
import { useElementSize } from './useElementSize.js';

const props = defineProps({
  /** @type {import('vue').PropType<import('../music/abc.js').AbcEvent[]>} */
  notes: { type: Array, required: true },
  /** The tune's opening key signature, straight from parseAbc(). */
  keySignature: { type: Object, default: null },
  meter: { type: Object, default: () => ({ num: 4, den: 4 }) },
  /** Index into `notes` (rests included) of the note currently being played. */
  currentIndex: { type: Number, default: 0 },
  /** `waiting` | `holding` | `wrong` | `correct`, applied to the current note only. */
  state: { type: String, default: 'waiting' },
  showName: { type: Boolean, default: false },
});

const {
  Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Barline, Dot,
} = VexFlow;

/** How many staff lines are drawn at once. A song can run much longer than
 *  a phone screen; rather than one huge scrolling SVG (or hand-rolled
 *  scroll-into-view math against a responsively-scaled SVG), only a window
 *  starting at the current line is ever drawn, sliding forward as the
 *  cursor crosses a line boundary. That keeps "the current note stays on
 *  screen" trivially true and bounds render cost for a long tune. */
const WINDOW_SIZE = 4;
const ROW_HEIGHT = 150;
const TOP_MARGIN = 70;
/** On-screen pixels per SVG unit. The drawing is as wide as the box it sits
 *  in divided by this, so a wider screen fits more bars at the same note
 *  size rather than drawing the same bars bigger. */
const NOTE_SCALE = 1;
const STAVE_MARGIN = 20; // 10 units either side of each line

const SHARP_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const FLAT_KEYS = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];

/** Quarter-note-unit durations VexFlow can draw, longest first, each
 *  optionally dotted (1.5x) or double-dotted (1.75x). Anything else (a
 *  triplet, an odd tuplet) rounds to the closest of these -- rhythmic
 *  fidelity beyond this is out of scope, and the cursor still advances
 *  correctly regardless, since that's driven by pitch, not by how the note
 *  looks on the page. */
const BASE_DURATIONS = [[4, 'w'], [2, 'h'], [1, 'q'], [0.5, '8'], [0.25, '16'], [0.125, '32']];
const EPS = 1e-6;

const host = ref(null);
const fontsReady = shallowRef(false);
const hostSize = useElementSize(host);
/** Drawing width in SVG units; 0 until the host has been laid out. */
const width = computed(() => Math.floor(hostSize.width.value / NOTE_SCALE));

onMounted(async () => {
  try {
    await document.fonts.ready;
  } catch { /* older browsers: draw anyway */ }
  fontsReady.value = true;
  draw();
});

watch(
  () => [props.notes, props.keySignature, props.meter, props.currentIndex, props.state, width.value],
  draw,
  { flush: 'post' },
);

/** The key signature's sharp/flat count and direction determine the
 *  standard major key with that exact accidental set -- true regardless of
 *  what mode the tune is actually in, since a mode shares its parent
 *  major's key signature. */
function vexKeyName(keySignature) {
  const accidentals = keySignature?.accidentals ?? [];
  if (accidentals.length === 0) return 'C';
  const table = accidentals[0].acc === 'flat' ? FLAT_KEYS : SHARP_KEYS;
  return table[Math.min(accidentals.length, table.length - 1)];
}

function vexDurationFor(quarters) {
  for (const [q, code] of BASE_DURATIONS) {
    if (Math.abs(quarters - q) < EPS) return { duration: code, dots: 0 };
    if (Math.abs(quarters - q * 1.5) < EPS) return { duration: code, dots: 1 };
    if (Math.abs(quarters - q * 1.75) < EPS) return { duration: code, dots: 2 };
  }
  let best = BASE_DURATIONS[0];
  let bestDiff = Infinity;
  for (const entry of BASE_DURATIONS) {
    const diff = Math.abs(quarters - entry[0]);
    if (diff < bestDiff) { bestDiff = diff; best = entry; }
  }
  return { duration: best[1], dots: 0 };
}

function buildStaveNote(note) {
  const { duration, dots } = vexDurationFor(note.duration * 4);
  const staveNote = note.isRest
    ? new StaveNote({ keys: ['b/4'], duration: `${duration}r`, clef: 'treble' })
    : new StaveNote({ keys: [toVexKey(note.midi, { flats: note.flats })], duration, clef: 'treble' });
  for (let i = 0; i < dots; i += 1) Dot.buildAndAttach([staveNote], { all: true });
  return staveNote;
}

/** Groups notes into bars using each note's own `bar` number (assigned by
 *  parseAbc), rather than re-deriving bar boundaries from durations. */
function groupIntoBars(notes) {
  const bars = [];
  let current = null;
  notes.forEach((note, i) => {
    if (!current || current.barNumber !== note.bar) {
      current = {
        barNumber: note.bar, notes: [], startIndex: i, index: bars.length,
      };
      bars.push(current);
    }
    current.notes.push(note);
  });
  return bars;
}

function lineIndexForNote(lines, globalIndex, totalNotes) {
  if (globalIndex >= totalNotes) return Math.max(0, lines.length - 1);
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li];
    const lastBar = line[line.length - 1];
    const lineEnd = lastBar.startIndex + lastBar.notes.length;
    if (globalIndex < lineEnd) return li;
  }
  return Math.max(0, lines.length - 1);
}

function draw() {
  // A zero width means the host is detached (KeepAlive) or not laid out yet:
  // keep whatever was last drawn rather than redrawing at a bogus size.
  if (!fontsReady.value || !host.value || width.value === 0) return;
  host.value.innerHTML = '';
  if (props.notes.length === 0) return;

  const drawWidth = width.value;
  const lineWidth = drawWidth - STAVE_MARGIN;
  const bars = groupIntoBars(props.notes);
  const lines = packLines(bars, lineWidth);
  const currentLine = lineIndexForNote(lines, props.currentIndex, props.notes.length);
  const windowLines = lines.slice(currentLine, currentLine + WINDOW_SIZE);
  const height = TOP_MARGIN + windowLines.length * ROW_HEIGHT;

  const renderer = new Renderer(host.value, Renderer.Backends.SVG);
  renderer.resize(drawWidth, height);
  const ctx = renderer.getContext();

  const ink = getComputedStyle(host.value).getPropertyValue('--staff-ink').trim() || '#000';
  ctx.setFillStyle(ink);
  ctx.setStrokeStyle(ink);

  const colorFor = {
    correct: getVar('--note-correct', '#3fb950'),
    wrong: getVar('--note-wrong', '#d98a3a'),
    holding: getVar('--note-holding', '#4a9eff'),
  };
  const doneColor = colorFor.correct;
  const keyName = vexKeyName(props.keySignature);

  windowLines.forEach((line, li) => {
    const y = TOP_MARGIN + li * ROW_HEIGHT;
    let x = STAVE_MARGIN / 2;
    const barWidths = justifyLine(line, lineWidth, {
      isLastLine: lines.length > 1 && line === lines[lines.length - 1],
    });

    line.forEach((bar, bi) => {
      const isFirstOfPiece = bar.index === 0;
      const barWidth = barWidths[bi];
      const stave = new Stave(x, y, barWidth);
      if (bi === 0) {
        stave.addClef('treble');
        stave.addKeySignature(keyName);
      }
      if (isFirstOfPiece) stave.addTimeSignature(`${props.meter.num}/${props.meter.den}`);
      if (li === windowLines.length - 1 && bi === line.length - 1 && bar.index === bars.length - 1) {
        stave.setEndBarType(Barline.type.END);
      }
      stave.setContext(ctx).draw();
      ctx.fillText(`${bar.barNumber}`, stave.getX() + 2, y - 8);

      const staveNotes = bar.notes.map((note, ni) => {
        const globalIndex = bar.startIndex + ni;
        const staveNote = buildStaveNote(note);
        const color = globalIndex === props.currentIndex ? colorFor[props.state]
          : globalIndex < props.currentIndex ? doneColor
            : null;
        if (color) staveNote.setStyle({ fillStyle: color, strokeStyle: color });
        return staveNote;
      });

      const voice = new Voice({ numBeats: props.meter.num, beatValue: props.meter.den });
      // Defensive, not load-bearing: a real tune can have a short pickup
      // (anacrusis) bar that doesn't fill the meter, or an odd final bar.
      voice.setStrict(false);
      voice.addTickables(staveNotes);
      Accidental.applyAccidentals([voice], keyName);
      const fit = stave.getNoteEndX() - stave.getNoteStartX();
      new Formatter().joinVoices([voice]).format([voice], fit - 20);
      voice.draw(ctx, stave);

      x += barWidth;
    });
  });

  const svg = host.value.querySelector('svg');
  if (svg) {
    svg.setAttribute('viewBox', `0 0 ${drawWidth} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('role', 'img');
    const atEnd = props.currentIndex >= props.notes.length;
    const currentBar = atEnd
      ? bars[bars.length - 1]?.barNumber ?? 1
      : bars.find((b) => props.currentIndex >= b.startIndex && props.currentIndex < b.startIndex + b.notes.length)?.barNumber ?? 1;
    svg.setAttribute('aria-label', atEnd
      ? 'Song complete.'
      : `Song, ${props.meter.num}/${props.meter.den} time, currently on measure ${currentBar}.`);
  }
}

function currentNoteName() {
  const note = props.notes[Math.min(props.currentIndex, props.notes.length - 1)];
  if (!note || note.isRest) return '';
  return noteName(note.midi, { flats: note.flats });
}

function getVar(name, fallback) {
  const v = getComputedStyle(host.value).getPropertyValue(name).trim();
  return v || fallback;
}
</script>

<template>
  <div class="staff-block">
    <p class="note-name" :class="{ shown: showName }" aria-live="polite">
      <span v-if="showName">{{ currentNoteName() }}</span>
    </p>
    <div ref="host" class="staff" />
  </div>
</template>

<style scoped>
.staff-block {
  width: 100%;
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
