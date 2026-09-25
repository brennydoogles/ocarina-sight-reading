/**
 * Multi-note phrase generation.
 *
 * `generateExercise` (see exercise.js) hands out one note at a time; a
 * uniform random walk over `length` notes would be unmusical -- random leaps
 * in both directions, nothing a player would meet in an actual tune. This
 * module builds phrases instead, out of two ingredients:
 *
 *  - a small library of recognisable melodic figures (scale runs, triads,
 *    turns, leap-then-resolve), expressed as steps through the note pool so
 *    they transpose to fit whatever range is in play;
 *  - a weighted random walk between figures, heavily biased toward steps,
 *    that fills in the rest and is nudged toward notes that haven't come up
 *    recently so the whole pool stays reachable.
 *
 * Everything here is pure and DOM-free, like the rest of src/music/.
 */
import { makeNote, notePool } from './notes.js';
import { generateRhythm } from './rhythm.js';

/**
 * Cumulative pool-index offsets from a figure's starting note (the first
 * entry is always 0, meaning "the cursor's current note" -- see
 * `applyFigure`, which drops it before pushing new notes). The pool is
 * ascending MIDI order, so an offset of `1` is "the next note up in the
 * pool" -- a scale step on the natural pool, a semitone on the chromatic
 * one -- which is exactly what keeps a transposed figure inside the pool
 * without any extra mapping. Paired with a selection weight: scale motion
 * outweighs arpeggios, which outweigh the wider resolving leaps, so the
 * library itself leans stepwise before the filler even gets a say.
 */
const FIGURES = [
  [[0, 1, 2], 10], // scale run up, 3 notes
  [[0, -1, -2], 10], // scale run down, 3 notes
  [[0, 1, 2, 3], 8], // scale run up, 4 notes
  [[0, -1, -2, -3], 8], // scale run down, 4 notes
  [[0, 1, 2, 3, 4], 5], // scale run up, 5 notes
  [[0, -1, -2, -3, -4], 5], // scale run down, 5 notes
  [[0, 1, 0], 8], // upper neighbour, resolves back
  [[0, -1, 0], 8], // lower neighbour, resolves back
  [[0, 1, 0, -1], 6], // turn: up, back, down
  [[0, -1, 0, 1], 6], // turn: down, back, up
  [[0, 2, 4], 4], // triad arpeggio up (root, third, fifth)
  [[0, -2, -4], 4], // triad arpeggio down
  [[0, 2, 4, 3], 3], // triad up, then a step back down
  [[0, -2, -4, -3], 3], // triad down, then a step back up
  [[0, 2, 1], 5], // third up, then resolves stepwise
  [[0, -2, -1], 5], // third down, then resolves stepwise
  [[0, 3, 2], 3], // fourth up, then resolves stepwise
  [[0, -3, -2], 3], // fourth down, then resolves stepwise
  [[0, 4, 3], 2], // fifth up, then resolves stepwise
  [[0, -4, -3], 2], // fifth down, then resolves stepwise
];
const FIGURES_TOTAL_WEIGHT = FIGURES.reduce((sum, [, weight]) => sum + weight, 0);

/**
 * Interval-size weights for the stepwise filler, keyed by pool-index
 * distance. Heavily biased to steps, tapering fast -- most fills should be
 * ±1, the rest mostly ±2, and anything past ±4 is a rare leap.
 */
const STEP_WEIGHTS = [
  [1, 42],
  [2, 26],
  [3, 14],
  [4, 8],
  [5, 5],
  [6, 3],
  [7, 2],
];

/** Reflects `idx` into `[0, n - 1]`, bouncing at the ends instead of clamping. */
function reflectIndex(idx, n) {
  if (n <= 1) return 0;
  const period = 2 * (n - 1);
  let m = idx % period;
  if (m < 0) m += period;
  return m <= n - 1 ? m : period - m;
}

/**
 * Picks one filler step: a signed pool-index delta, biased toward small
 * magnitudes but nudged toward whichever direction lands on a note that
 * hasn't come up in a while.
 * @param {number} idx current pool index
 * @param {number} n pool size
 * @param {number[]} sinceSeen steps since each pool index last appeared
 * @param {() => number} random
 * @returns {number} the next pool index
 */
function fillerStep(idx, n, sinceSeen, random) {
  const options = [];
  for (const [mag, weight] of STEP_WEIGHTS) {
    for (const sign of [1, -1]) {
      const target = reflectIndex(idx + sign * mag, n);
      if (target === idx) continue; // reflection collapsed the step; skip it
      // Coverage nudge: notes that haven't appeared in a while get a boost,
      // so a pattern-heavy phrase can't quietly starve part of the pool.
      const coverageBoost = 1 + sinceSeen[target] * 0.5;
      options.push({ target, weight: weight * coverageBoost });
    }
  }
  if (options.length === 0) return idx;

  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let r = random() * total;
  for (const o of options) {
    r -= o.weight;
    if (r <= 0) return o.target;
  }
  return options[options.length - 1].target;
}

/**
 * Applies a figure starting at `idx`, reflecting each step off the pool
 * ends. The figure's first offset is always 0 -- "the note the cursor is
 * already on" -- so it's dropped here; only the new notes it adds are
 * returned.
 * @param {number[]} figure cumulative offsets, first entry always 0
 * @param {number} idx starting pool index
 * @param {number} n pool size
 * @returns {number[]}
 */
function applyFigure(figure, idx, n) {
  return figure.slice(1).map((offset) => reflectIndex(idx + offset, n));
}

/** Weighted pick from FIGURES using an injectable `random`. */
function pickFigure(random) {
  let r = random() * FIGURES_TOTAL_WEIGHT;
  for (const [figure, weight] of FIGURES) {
    r -= weight;
    if (r <= 0) return figure;
  }
  return FIGURES[FIGURES.length - 1][0];
}

/**
 * Generates a musical phrase: a mix of recognisable melodic figures and a
 * step-biased random walk between them, drawn from the same practice-range
 * pool `generateExercise` uses.
 *
 * Follows `generateExercise`'s conventions: an options object, an injectable
 * `random` for deterministic tests, and an array of notes in the same shape
 * -- multi-note phrases are a change to `length`, not to consumers.
 *
 * @param {object} options
 * @param {number} options.low practice range low, MIDI
 * @param {number} options.high practice range high, MIDI
 * @param {number} [options.length] notes in the phrase
 * @param {number[]} [options.previous] MIDI numbers of the last phrase
 * @param {() => number} [options.random] injectable for deterministic tests
 * @param {boolean} [options.includeAccidentals] draw from the chromatic pool
 * @param {number} [options.beatsPerBar] time signature numerator, in quarters
 * @returns {import('./notes.js').Note[]}
 */
export function generatePhrase({
  low,
  high,
  length = 8,
  previous = [],
  random = Math.random,
  includeAccidentals = false,
  beatsPerBar = 4,
}) {
  const pool = notePool({ low, high, includeAccidentals });
  if (pool.length === 0 || length <= 0) return [];

  const n = pool.length;
  const lastMidi = previous.length > 0 ? previous[previous.length - 1] : null;
  const lastIndex = pool.indexOf(lastMidi);
  let idx = lastIndex >= 0 ? lastIndex : Math.floor(random() * n);

  const sinceSeen = new Array(n).fill(1);
  const indices = [];
  const place = (placedIdx) => {
    indices.push(placedIdx);
    for (let i = 0; i < n; i += 1) sinceSeen[i] += 1;
    sinceSeen[placedIdx] = 0;
  };

  while (indices.length < length) {
    // Small pools can't fit a whole figure -- fall straight to the filler,
    // which degrades gracefully all the way down to a single note.
    const figure = n >= 3 && random() < 0.35 ? pickFigure(random) : null;
    const newNotes = figure ? applyFigure(figure, idx, n) : null;
    const room = length - indices.length;

    if (newNotes && newNotes.length <= room) {
      newNotes.forEach(place);
      idx = indices[indices.length - 1];
    } else {
      idx = fillerStep(idx, n, sinceSeen, random);
      place(idx);
    }
  }

  const durations = generateRhythm({ length: indices.length, beatsPerBar, random });
  return indices.map((i, pos) => makeNote(pool[i], durations[pos]));
}
