/**
 * ABC notation: parsing and playability validation for Song Practice.
 *
 * `abcjs` does the actual parsing (it is far too large a grammar to
 * reimplement), but only for that -- this module resolves the parsed
 * structure into absolute pitches and durations itself, and is otherwise
 * pure and DOM-free, like the rest of src/music/. `abcjs`'s renderer and
 * synth are never touched here; VexFlow stays the app's renderer so the
 * staff looks the same in every mode, and the synth belongs to the
 * playback issue that comes after this one.
 *
 * `abcjs` pulls in its renderer, synth and editor unconditionally the
 * moment anything is imported from it -- there is no tree-shaking a CJS
 * `require()` graph -- so it is loaded with a dynamic `import()` rather
 * than a static one. That puts it in its own chunk, downloaded only when
 * Song Practice is actually opened, so the other three practice modes
 * never pay for it.
 *
 * Pitch resolution, in brief (matching what abcjs's own MIDI renderer does
 * internally, since that is the reference for "what actually sounds"):
 * `abcjs` hands back each note as a `pitch` integer that is a *diatonic*
 * step count from middle C (0 = C, 1 = D, ... 7 = the c an octave up),
 * genuinely ignorant of the key signature -- "F" in the key of D major is
 * still reported as plain pitch 3, not sharped. The actual sounding pitch
 * has to be assembled from three layers, each able to override the last:
 * the key signature's per-letter accidentals, then an inline accidental
 * for the rest of that bar (mid-tune key changes update the first layer
 * as they're encountered), then whatever the note is explicitly marked
 * with. Accidentals are tracked per exact pitch (octave-specific), not
 * per letter -- a sharp on one "c" does not carry to a "C" two octaves
 * away in the same bar, which is standard notation and also what abcjs
 * itself does.
 */
import { INSTRUMENT_LOW, INSTRUMENT_HIGH } from './notes.js';
import { getFingering } from './fingerings.js';
import { noteName, isNatural } from './pitch.js';

/** Semitone offsets of C,D,E,F,G,A,B above the octave's C. */
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

const ACCIDENTAL_DELTA = Object.freeze({
  sharp: 1, flat: -1, natural: 0, dblsharp: 2, dblflat: -2,
  quartersharp: 0.25, quarterflat: -0.25,
});

const NOTE_LETTER_INDEX = Object.freeze({ c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 });

let abcjsPromise = null;
/**
 * Loads `abcjs` on first use and caches the promise. Exported so a Song
 * Practice screen can kick this off as soon as the mode is chosen, rather
 * than waiting for the first parse to start the download.
 * @returns {Promise<object>}
 */
export function loadAbcjs() {
  abcjsPromise ??= import('abcjs').then((mod) => mod.default ?? mod);
  return abcjsPromise;
}

/** Strips the HTML `abcjs` decorates its warning strings with -- diagnostic text only, never DOM. */
function plainWarning(warning) {
  return warning.replace(/<[^>]*>/g, '');
}

function extractNote(pitch) {
  const n = pitch % 7;
  return n < 0 ? n + 7 : n;
}

function extractOctave(pitch) {
  return Math.floor(pitch / 7);
}

/** Per-letter accidental table (index 0=C..6=B) from a key signature (or a mid-tune key-change element, same shape). */
function keyAccidentalTable(keySignature) {
  const table = [0, 0, 0, 0, 0, 0, 0];
  for (const a of keySignature?.accidentals ?? []) {
    const idx = NOTE_LETTER_INDEX[a.note.toLowerCase()];
    if (idx !== undefined) table[idx] += ACCIDENTAL_DELTA[a.acc] ?? 0;
  }
  return table;
}

/**
 * @typedef {object} AbcEvent
 * @property {boolean} isRest
 * @property {number|null} midi absolute MIDI, or null for a rest
 * @property {boolean} [flats] whether the tune spells this note with a flat
 *   (vs. a sharp), so a display layer can pass it straight to
 *   `noteName`/`toVexKey`'s `flats` option
 * @property {boolean} [chord] true for every pitch of a chord past the first
 * @property {number} duration fraction of a whole note
 * @property {number} bar 1-based bar number, for locating a problem note
 */

/**
 * @typedef {object} ParsedTune
 * @property {string|null} title
 * @property {{num: number, den: number}|null} meter
 * @property {number|null} bpm
 * @property {AbcEvent[]} notes in performance order; only the first voice of
 *   the first staff of each line -- see `hasMultipleVoices` below for why
 *   that is exactly the case worth flagging rather than silently mixing in
 * @property {{hasChords: boolean, hasMultipleVoices: boolean,
 *   hasGraceNotes: boolean, hasRepeats: boolean, hasMicrotones: boolean}} features
 * @property {string[]} warnings plain-text `abcjs` parser warnings
 */

/**
 * Parses ABC source into an ordered note sequence, DOM-free. Never throws --
 * `abcjs` itself is lenient (unparsable input becomes a warning plus
 * whatever it could salvage), and this only adds one error case of its own:
 * a `source` that yields no tune at all.
 * @param {string} source
 * @returns {Promise<ParsedTune>}
 */
export async function parseAbc(source) {
  const abcjs = await loadAbcjs();
  const tunes = abcjs.parseOnly(source ?? '');
  const tune = tunes?.[0];
  if (!tune) {
    return {
      title: null, meter: null, bpm: null, notes: [],
      features: { hasChords: false, hasMultipleVoices: false, hasGraceNotes: false, hasRepeats: false, hasMicrotones: false },
      warnings: ['Could not parse this as ABC notation.'],
    };
  }

  const warnings = (tune.warnings ?? []).map(plainWarning);
  const features = {
    hasChords: false, hasMultipleVoices: false, hasGraceNotes: false, hasRepeats: false, hasMicrotones: false,
  };

  // A "voice" per this app's purposes is one melodic line. A line with more
  // than one staff, or a staff with more than one voice, is a part or a
  // harmony this app cannot play -- checked per line, since summing staff
  // counts ACROSS lines would flag every multi-line single-voice tune too.
  for (const line of tune.lines ?? []) {
    if (!line.staff) continue;
    if (line.staff.length > 1 || line.staff.some((s) => (s.voices?.length ?? 0) > 1)) {
      features.hasMultipleVoices = true;
    }
  }

  let keyTable = keyAccidentalTable(tune.getKeySignature?.());
  const barAccidentals = new Map();
  const notes = [];
  let bar = 1;

  for (const line of tune.lines ?? []) {
    const events = line.staff?.[0]?.voices?.[0];
    if (!events) continue;

    for (const elem of events) {
      if (elem.el_type === 'key') {
        keyTable = keyAccidentalTable(elem);
        continue;
      }
      if (elem.el_type === 'bar') {
        barAccidentals.clear();
        if ((typeof elem.type === 'string' && elem.type.includes('repeat')) || elem.startEnding || elem.endEnding) {
          features.hasRepeats = true;
        }
        bar += 1;
        continue;
      }
      if (elem.el_type !== 'note') continue; // clefs, part markers, etc. -- nothing to resolve

      if (elem.gracenotes) features.hasGraceNotes = true;

      if (elem.rest) {
        notes.push({ isRest: true, midi: null, duration: elem.duration, bar });
        continue;
      }
      if (!elem.pitches || elem.pitches.length === 0) continue; // defensive; shouldn't occur

      if (elem.pitches.length > 1) features.hasChords = true;

      elem.pitches.forEach((p, i) => {
        const noteIdx = extractNote(p.pitch);
        let delta;
        if (p.accidental) {
          delta = ACCIDENTAL_DELTA[p.accidental] ?? 0;
          barAccidentals.set(p.pitch, delta); // keyed by the exact (octave-specific) pitch
        } else if (barAccidentals.has(p.pitch)) {
          delta = barAccidentals.get(p.pitch);
        } else {
          delta = keyTable[noteIdx];
        }

        const exact = extractOctave(p.pitch) * 12 + MAJOR_SCALE[noteIdx] + 60 + delta;
        const midi = Math.round(exact);
        if (exact !== midi) features.hasMicrotones = true;

        notes.push({
          isRest: false, midi, flats: delta < 0, duration: elem.duration, bar, chord: i > 0,
        });
      });
    }
  }

  const meterFraction = tune.getMeterFraction?.() ?? null;
  return {
    title: tune.metaText?.title ?? null,
    meter: meterFraction,
    bpm: tune.getBpm?.() ?? null,
    notes,
    features,
    warnings,
  };
}

/**
 * The smallest transposition (fewest semitones from zero) that would bring
 * every pitched note into `[low, high]`, or null if the tune already fits or
 * no single shift could make it fit (its own span exceeds the instrument's).
 * @param {AbcEvent[]} pitched notes with `isRest: false`
 * @param {number} low
 * @param {number} high
 * @returns {{ semitones: number, direction: 'up'|'down' }|null}
 */
function findTransposition(pitched, low, high) {
  if (pitched.length === 0) return null;
  const min = Math.min(...pitched.map((n) => n.midi));
  const max = Math.max(...pitched.map((n) => n.midi));
  if (min >= low && max <= high) return null; // already fits
  if (max - min > high - low) return null; // too wide a span, no shift helps

  const shiftLow = low - min;
  const shiftHigh = high - max;
  // 0 cannot be in [shiftLow, shiftHigh] here (that would mean it already
  // fit, handled above), so this clamp lands on whichever bound is closer.
  const semitones = Math.max(shiftLow, Math.min(0, shiftHigh));
  return { semitones, direction: semitones > 0 ? 'up' : 'down' };
}

/**
 * @typedef {object} ValidationIssue
 * @property {'error'|'warning'} severity
 * @property {string} code
 * @property {string} message
 * @property {object[]} [notes] present on 'out-of-range': one entry per
 *   offending note, with `bar`, `midi`, `name`, `semitonesOver`, `semitonesUnder`
 */

/**
 * Checks whether a tune can actually be played on this instrument. Returns a
 * structured result rather than a boolean -- "invalid" tells a player
 * nothing; which notes, where, and by how much does.
 * @param {string} source ABC notation
 * @param {{ instrument?: { low: number, high: number } }} [options]
 * @returns {Promise<{
 *   valid: boolean, issues: ValidationIssue[],
 *   transposition: { semitones: number, direction: 'up'|'down' }|null,
 *   needsAccidentals: boolean,
 *   title: string|null, meter: {num:number,den:number}|null, bpm: number|null,
 * }>}
 */
export async function validateSong(source, { instrument } = {}) {
  const low = instrument?.low ?? INSTRUMENT_LOW;
  const high = instrument?.high ?? INSTRUMENT_HIGH;

  const parsed = await parseAbc(source);
  const issues = [];

  for (const w of parsed.warnings) {
    issues.push({ severity: 'warning', code: 'parse-warning', message: w });
  }
  if (parsed.notes.length === 0) {
    issues.push({ severity: 'error', code: 'no-notes', message: 'No notes were found in this tune.' });
  }
  // Hard failures: the app plays one melodic line at concert pitch, in
  // semitones -- chords, extra voices/parts and quarter-tones are outside
  // that, not just harder. Grace notes and repeats are decorative or
  // structural rather than a different kind of note, so they are warnings:
  // the tune is still played, just without ornaments / straight through once.
  if (parsed.features.hasChords) {
    issues.push({ severity: 'error', code: 'chords', message: 'This tune has chords. Only a single melodic line can be played.' });
  }
  if (parsed.features.hasMultipleVoices) {
    issues.push({ severity: 'error', code: 'multiple-voices', message: 'This tune has more than one voice or part. Only a single melodic line can be played.' });
  }
  if (parsed.features.hasMicrotones) {
    issues.push({ severity: 'error', code: 'microtones', message: 'This tune uses quarter-tone accidentals, which the ocarina cannot play.' });
  }
  if (parsed.features.hasGraceNotes) {
    issues.push({ severity: 'warning', code: 'grace-notes', message: 'This tune has grace notes. They will be ignored.' });
  }
  if (parsed.features.hasRepeats) {
    issues.push({ severity: 'warning', code: 'repeats', message: 'This tune has repeats or endings. It will be practiced straight through, once.' });
  }

  const pitched = parsed.notes.filter((n) => !n.isRest);
  const outOfRange = pitched
    .filter((n) => n.midi < low || n.midi > high || !getFingering(n.midi))
    .map((n) => ({
      bar: n.bar,
      midi: n.midi,
      name: noteName(n.midi, { flats: n.flats }),
      semitonesOver: n.midi > high ? n.midi - high : 0,
      semitonesUnder: n.midi < low ? low - n.midi : 0,
    }));

  if (outOfRange.length > 0) {
    issues.push({
      severity: 'error',
      code: 'out-of-range',
      message: `${outOfRange.length} note${outOfRange.length === 1 ? '' : 's'} `
        + `fall outside the instrument's ${noteName(low)}–${noteName(high)} range.`,
      notes: outOfRange,
    });
  }

  const transposition = outOfRange.length > 0 ? findTransposition(pitched, low, high) : null;
  const needsAccidentals = pitched.some((n) => !isNatural(n.midi));

  return {
    valid: issues.every((i) => i.severity !== 'error'),
    issues,
    transposition,
    needsAccidentals,
    title: parsed.title,
    meter: parsed.meter,
    bpm: parsed.bpm,
  };
}

/**
 * Applies a semitone shift to an ABC source, rewriting both the key
 * signature and every note -- what backs "accept the suggested
 * transposition" once `validateSong` has offered one.
 * @param {string} source
 * @param {number} semitones
 * @returns {Promise<string>}
 */
export async function transposeAbc(source, semitones) {
  const abcjs = await loadAbcjs();
  const tunes = abcjs.parseOnly(source ?? '');
  return abcjs.strTranspose(source, tunes, semitones);
}
