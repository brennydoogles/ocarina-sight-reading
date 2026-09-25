/**
 * The instrument's note inventory: what a 12-hole Alto C ocarina can play,
 * and how to pick notes out of that range for an exercise.
 */
import { isNatural, midiFromName, noteName, midiToHz } from './pitch.js';

/** Lowest note on a 12-hole Alto C: all twelve holes covered. */
export const INSTRUMENT_LOW = midiFromName('A4'); // 69
/** Highest note in normal playing range. */
export const INSTRUMENT_HIGH = midiFromName('F6'); // 89

/** The starting practice range: the lower octave, widened in settings. */
export const DEFAULT_PRACTICE_LOW = midiFromName('A4'); // 69
export const DEFAULT_PRACTICE_HIGH = midiFromName('F5'); // 77

/**
 * Frequencies the detector is willing to believe, a semitone either side of
 * the instrument's range. Anything outside this is noise or -- much more
 * likely -- an octave error from the pitch detector, and gets discarded.
 */
export const DETECTABLE_MIN_HZ = midiToHz(INSTRUMENT_LOW - 1);
export const DETECTABLE_MAX_HZ = midiToHz(INSTRUMENT_HIGH + 1);

/**
 * Every note this app drills: the naturals from A4 to F6 by default.
 *
 * The instrument itself is fully chromatic across that span, and the detector
 * always recognises accidentals so that playing one reads as a wrong note
 * rather than as noise -- see DETECTABLE_MIN_HZ above. `includeAccidentals`
 * only controls whether they show up here, in the exercise pool and the
 * fingering data.
 *
 * @param {{ includeAccidentals?: boolean }} [options]
 * @returns {number[]} MIDI numbers, ascending -- thirteen by default, 21 with
 *   `includeAccidentals: true`
 */
export function allInstrumentNotes({ includeAccidentals = false } = {}) {
  const notes = rangeInclusive(INSTRUMENT_LOW, INSTRUMENT_HIGH);
  return includeAccidentals ? notes : notes.filter(isNatural);
}

/**
 * @param {number} low
 * @param {number} high
 * @returns {number[]}
 */
export function rangeInclusive(low, high) {
  const out = [];
  for (let m = low; m <= high; m += 1) out.push(m);
  return out;
}

/**
 * The pool an exercise generator draws from: the practice range, clamped to
 * what the instrument can play and, by default, restricted to naturals.
 * @param {{ low: number, high: number, includeAccidentals?: boolean }} options
 * @returns {number[]} MIDI numbers, ascending
 */
export function notePool({ low, high, includeAccidentals = false }) {
  const lo = Math.max(low, INSTRUMENT_LOW);
  const hi = Math.min(high, INSTRUMENT_HIGH);
  const notes = rangeInclusive(lo, hi);
  return includeAccidentals ? notes : notes.filter(isNatural);
}

/**
 * A note as the rest of the app passes it around. `duration` follows
 * VexFlow's own vocabulary ('w', 'h', 'q', '8') so the renderer never needs a
 * translation table.
 * @typedef {{ midi: number, name: string, hz: number, duration: string }} Note
 */

/**
 * @param {number} midi
 * @param {string} [duration] VexFlow duration code; defaults to a quarter.
 * @returns {Note}
 */
export function makeNote(midi, duration = 'q') {
  return { midi, name: noteName(midi), hz: midiToHz(midi), duration };
}
