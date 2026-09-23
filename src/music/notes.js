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
 * Every note this app drills: the naturals from A4 to F6.
 *
 * The instrument itself is fully chromatic across that span, and the detector
 * still recognises accidentals so that playing one reads as a wrong note
 * rather than as noise -- see DETECTABLE_MIN_HZ above. They are simply not
 * part of the exercise pool or the fingering data.
 *
 * @returns {number[]} thirteen MIDI numbers, ascending
 */
export function allInstrumentNotes() {
  return rangeInclusive(INSTRUMENT_LOW, INSTRUMENT_HIGH).filter(isNatural);
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
 * what the instrument can play and restricted to naturals.
 * @param {{ low: number, high: number }} options
 * @returns {number[]} MIDI numbers, ascending
 */
export function notePool({ low, high }) {
  const lo = Math.max(low, INSTRUMENT_LOW);
  const hi = Math.min(high, INSTRUMENT_HIGH);
  return rangeInclusive(lo, hi).filter(isNatural);
}

/**
 * A note as the rest of the app passes it around.
 * @typedef {{ midi: number, name: string, hz: number }} Note
 */

/**
 * @param {number} midi
 * @returns {Note}
 */
export function makeNote(midi) {
  return { midi, name: noteName(midi), hz: midiToHz(midi) };
}
