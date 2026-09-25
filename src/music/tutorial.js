/**
 * Tutorial Mode's step list: a note-by-note walkthrough of the player's
 * practice range, then the C major scale as a single ordered run.
 *
 * Pure and DOM-free, like the rest of src/music/* -- TutorialView.vue drives
 * a NoteMatcher over whatever this returns. Kept as a flat array so a future
 * "G major scale" or a descending run is a data change here, not a rewrite
 * of the view.
 */
import { notePool, INSTRUMENT_LOW, INSTRUMENT_HIGH } from './notes.js';
import { noteName, midiFromName } from './pitch.js';

/** Which part of the tutorial a step belongs to. */
export const TUTORIAL_SECTION = Object.freeze({
  WALKTHROUGH: 'walkthrough',
  SCALE: 'scale',
});

/**
 * C major, C5 to C6 ascending -- the first scale most players ever learn,
 * and entirely naturals, so the semitone toggle does not affect it.
 */
const C_MAJOR_SCALE_NAMES = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6'];

/**
 * @param {object} [options]
 * @param {boolean} [options.includeAccidentals] widen the walkthrough
 *   section to include accidentals (naturals-only by default).
 * @param {number} [options.low] walkthrough's lower bound, MIDI. Defaults to
 *   the whole instrument; callers pass the practice range so Tutorial Mode
 *   walks the same notes the player has configured elsewhere, not
 *   necessarily every note the instrument can play.
 * @param {number} [options.high] walkthrough's upper bound, MIDI.
 * @returns {{ midi: number, name: string, section: string }[]}
 */
export function buildTutorialSteps({
  includeAccidentals = false, low = INSTRUMENT_LOW, high = INSTRUMENT_HIGH,
} = {}) {
  const walkthrough = notePool({ low, high, includeAccidentals })
    .map((midi) => makeStep(midi, TUTORIAL_SECTION.WALKTHROUGH));

  const scale = C_MAJOR_SCALE_NAMES
    .map((name) => makeStep(midiFromName(name), TUTORIAL_SECTION.SCALE));

  return [...walkthrough, ...scale];
}

/**
 * @param {number} midi
 * @param {string} section one of TUTORIAL_SECTION
 * @returns {{ midi: number, name: string, section: string }}
 */
function makeStep(midi, section) {
  return { midi, name: noteName(midi), section };
}
