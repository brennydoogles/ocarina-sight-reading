/**
 * Exercise generation.
 *
 * v1 always shows a single note, but everything here speaks in arrays of
 * notes so that adding multi-note phrases later is a change to `length`
 * rather than a change to every consumer's shape.
 */
import { makeNote, notePool } from './notes.js';

/**
 * Pick the next exercise.
 *
 * `previous` exists to avoid handing out the same note twice in a row, which
 * is not a drill -- the player is already holding the fingering.
 *
 * @param {object} options
 * @param {number} options.low practice range low, MIDI
 * @param {number} options.high practice range high, MIDI
 * @param {number} [options.length] notes in the exercise; 1 in v1
 * @param {number[]} [options.previous] MIDI numbers of the last exercise
 * @param {() => number} [options.random] injectable for deterministic tests
 * @param {boolean} [options.includeAccidentals] draw from the chromatic pool
 * @returns {import('./notes.js').Note[]}
 */
export function generateExercise({
  low,
  high,
  length = 1,
  previous = [],
  random = Math.random,
  includeAccidentals = false,
}) {
  const pool = notePool({ low, high, includeAccidentals });
  if (pool.length === 0) return [];

  const lastMidi = previous.length > 0 ? previous[previous.length - 1] : null;
  const notes = [];
  let prev = lastMidi;

  for (let i = 0; i < length; i += 1) {
    // Only exclude the previous note when there is something else to pick;
    // a one-note pool must still be able to repeat.
    const candidates = pool.length > 1 ? pool.filter((m) => m !== prev) : pool;
    const midi = candidates[Math.floor(random() * candidates.length)];
    notes.push(makeNote(midi));
    prev = midi;
  }
  return notes;
}
