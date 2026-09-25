<script setup>
import { ref, shallowRef, watch, onMounted } from 'vue';
// The `bravura` entry bundles Bravura + Academico as base64 inside the JS.
// The default `vexflow` entry pulls six fonts from jsDelivr at runtime, which
// would leave the installed PWA unable to draw a staff offline.
import VexFlow from 'vexflow/bravura';
import { toVexKey, noteName, isNatural } from '../music/pitch.js';

const props = defineProps({
  midi: { type: Number, required: true },
  state: { type: String, default: 'waiting' },
  /** First rung of the hint ladder: name the note without giving the fingering. */
  showName: { type: Boolean, default: false },
});

const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } = VexFlow;

const host = ref(null);
const fontsReady = shallowRef(false);

onMounted(async () => {
  // Font.load() is kicked off by the entry module but not awaited, so glyphs
  // can be missing on the first paint if we draw immediately.
  try {
    await document.fonts.ready;
  } catch { /* older browsers: draw anyway */ }
  fontsReady.value = true;
  draw();
});

// flush: 'post' matters. draw() writes to the DOM imperatively, outside Vue's
// render; a default pre-flush watcher would run it BEFORE Vue patches the rest
// of the tree, so for one frame the staff could show a different note from the
// fingering hint beside it. Post-flush puts both in the same frame.
watch(() => [props.midi, props.state], draw, { flush: 'post' });

function draw() {
  if (!fontsReady.value || !host.value) return;
  host.value.innerHTML = '';

  const width = 320;
  const height = 220;
  const renderer = new Renderer(host.value, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const ink = getComputedStyle(host.value).getPropertyValue('--staff-ink').trim() || '#000';
  ctx.setFillStyle(ink);
  ctx.setStrokeStyle(ink);

  // Generous vertical room: F6 sits on three ledger lines above the staff and
  // A4 on one below, so the stave cannot be centred in the box.
  const stave = new Stave(10, 70, width - 20);
  stave.addClef('treble');
  stave.setContext(ctx).draw();

  const note = new StaveNote({
    keys: [toVexKey(props.midi)],
    duration: 'w',
    clef: 'treble',
  });
  // VexFlow doesn't infer an accidental from the key string ("a#/4") -- a
  // sharp silently renders as a natural unless a modifier is attached.
  if (!isNatural(props.midi)) note.addModifier(new Accidental('#'), 0);
  const colour = {
    correct: getVar('--note-correct', '#3fb950'),
    wrong: getVar('--note-wrong', '#d98a3a'),
    holding: getVar('--note-holding', '#4a9eff'),
  }[props.state];
  if (colour) note.setStyle({ fillStyle: colour, strokeStyle: colour });

  const voice = new Voice({ numBeats: 4, beatValue: 4 }).addTickables([note]);
  new Formatter().joinVoices([voice]).format([voice], width - 100);
  voice.draw(ctx, stave);

  const svg = host.value.querySelector('svg');
  if (svg) {
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('role', 'img');
    // noteName() already renders the "#", but screen readers don't reliably
    // announce that glyph, so spell it out too.
    const spoken = isNatural(props.midi) ? noteName(props.midi) : `${noteName(props.midi)} (sharp)`;
    svg.setAttribute('aria-label', `${spoken} on the treble clef`);
  }
}

function getVar(name, fallback) {
  const v = getComputedStyle(host.value).getPropertyValue(name).trim();
  return v || fallback;
}
</script>

<template>
  <div class="staff-block">
    <!-- Always in the layout, only sometimes visible: toggling the element
         itself would shift the staff underneath it mid-attempt. -->
    <p class="note-name" :class="{ shown: showName }" aria-live="polite">
      <span v-if="showName">{{ noteName(midi) }}</span>
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
