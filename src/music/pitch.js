/**
 * Conversions between frequency, MIDI note number, and cents.
 *
 * MIDI note numbers are the canonical internal representation of a pitch
 * everywhere in this app: they are integers, they compare and sort correctly,
 * and they make "one semitone up" an increment rather than a multiplication.
 * Frequencies only appear at the boundary with the microphone.
 */

/** Concert pitch. A4 = MIDI 69. */
export const A4_HZ = 440;
export const A4_MIDI = 69;

/**
 * Sharps throughout by default. The app drills naturals only, but the
 * detector still has to name whatever it hears -- telling the player they
 * are sounding a C#5 against a C5 target is the useful half of the feedback.
 */
const NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Flat spellings of the same pitch classes, for sources that spell their own
 * way -- ABC tunes routinely write `_B` for B flat rather than A#.
 */
const NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * Exact frequency of a MIDI note. Accepts fractional values, so
 * `midiToHz(69.5)` is a quarter-tone above A4.
 * @param {number} midi
 * @returns {number} frequency in Hz
 */
export function midiToHz(midi) {
  return A4_HZ * Math.pow(2, (midi - A4_MIDI) / 12);
}

/**
 * Fractional MIDI number for a frequency. Not rounded -- the fractional part
 * carries the intonation information we need.
 * @param {number} hz
 * @returns {number} fractional MIDI number
 */
export function hzToMidi(hz) {
  return A4_MIDI + 12 * Math.log2(hz / A4_HZ);
}

/**
 * Signed interval between two frequencies in cents (1/100 of a semitone).
 * Positive means `hz` is sharp of `refHz`.
 * @param {number} hz
 * @param {number} refHz
 * @returns {number} cents
 */
export function centsBetween(hz, refHz) {
  return 1200 * Math.log2(hz / refHz);
}

/**
 * How far a detected frequency is from the nearest equal-tempered semitone,
 * plus which semitone that is. This is what drives both the tuner needle and
 * the correct/incorrect decision.
 * @param {number} hz
 * @returns {{ midi: number, cents: number }} nearest MIDI note and signed
 *   deviation from it, always within [-50, +50) cents.
 */
export function nearestNote(hz) {
  const exact = hzToMidi(hz);
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100 };
}

/**
 * Deviation of a frequency from a specific target note -- not the nearest one.
 * Used when checking a played note against the note on the staff, where being
 * 700 cents off must read as 700, not as "nearest note, 0 cents off".
 * @param {number} hz
 * @param {number} targetMidi
 * @returns {number} signed cents
 */
export function centsFromNote(hz, targetMidi) {
  return centsBetween(hz, midiToHz(targetMidi));
}

/**
 * @param {number} midi
 * @returns {number} 0 = C, 1 = C#/Db, ... 11 = B
 */
export function pitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

/**
 * Scientific pitch notation octave. C4 is middle C, so MIDI 60 -> 4.
 * @param {number} midi
 * @returns {number}
 */
export function octaveOf(midi) {
  return Math.floor(midi / 12) - 1;
}

/**
 * True for the seven naturals (the white keys) -- the v1 note pool.
 * @param {number} midi
 * @returns {boolean}
 */
export function isNatural(midi) {
  return !NAMES_SHARP[pitchClass(midi)].includes('#');
}

/**
 * Human-readable name, e.g. 69 -> "A4", 70 -> "A#4" (or "Bb4" with
 * `flats: true`).
 * @param {number} midi
 * @param {{ flats?: boolean }} [options]
 * @returns {string}
 */
export function noteName(midi, { flats = false } = {}) {
  const names = flats ? NAMES_FLAT : NAMES_SHARP;
  return `${names[pitchClass(midi)]}${octaveOf(midi)}`;
}

/**
 * VexFlow's key format: lowercase letter, slash, octave, e.g. "a/4", "c/5".
 * A flat name produces a key like "bb/4" rather than "a#/4".
 * @param {number} midi
 * @param {{ flats?: boolean }} [options]
 * @returns {string}
 */
export function toVexKey(midi, { flats = false } = {}) {
  const names = flats ? NAMES_FLAT : NAMES_SHARP;
  return `${names[pitchClass(midi)].toLowerCase()}/${octaveOf(midi)}`;
}

/**
 * Parse scientific pitch notation back to a MIDI number. Used for constants
 * and for reading persisted settings.
 * @param {string} name e.g. "A4", "F#5", "Bb4"
 * @returns {number} MIDI number
 * @throws {Error} if the name is not valid scientific pitch notation
 */
export function midiFromName(name) {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
  if (!match) throw new Error(`Not a note name: "${name}"`);
  const [, letter, accidental, octave] = match;
  const base = NAMES_SHARP.indexOf(letter.toUpperCase());
  const offset = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return base + offset + (Number(octave) + 1) * 12;
}
