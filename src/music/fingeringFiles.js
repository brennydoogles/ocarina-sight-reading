/**
 * Maps a note to the SVG file that draws its fingering.
 *
 * The diagrams are hand-drawn files under `public/fingerings/12_hole/`, not
 * generated at runtime, so this mapping is the contract between the app and
 * those files. Keep it pure -- both the app and the render script import it,
 * and a test asserts every note in range resolves to a file that exists.
 */
import { isNatural, noteName } from './pitch.js';

/**
 * Which instrument these diagrams describe. Fingerings are per-instrument, so
 * the files are namespaced by it -- a 6-hole or double ocarina would sit
 * alongside under its own key rather than colliding in one flat directory.
 */
export const INSTRUMENT_KEY = '12_hole';

/** Where the files live, relative to the served root. */
export const FINGERING_DIR = `fingerings/${INSTRUMENT_KEY}`;

/**
 * File stem for a note, e.g. 69 -> "A4".
 *
 * Only naturals have diagrams, which conveniently means a stem is just the
 * note name: no accidental, so nothing to spell out and no '#' to collide
 * with a URL fragment.
 *
 * @param {number} midi
 * @returns {string}
 * @throws {Error} for an accidental, which has no diagram by design
 */
export function fingeringFileStem(midi) {
  if (!isNatural(midi)) {
    throw new Error(`No fingering diagram for ${noteName(midi)}: this app covers naturals only`);
  }
  return noteName(midi);
}

/**
 * URL to fetch a fingering file from, honouring the app's deploy base so this
 * keeps working when served from a subpath.
 * @param {string} stem
 * @param {string} [base] defaults to the Vite base URL, or '/' outside Vite
 * @returns {string}
 */
export function fingeringFileUrl(stem, base = defaultBase()) {
  return `${base.replace(/\/$/, '')}/${FINGERING_DIR}/${stem}.svg`;
}

function defaultBase() {
  // import.meta.env is absent under plain Node (the render script, tests).
  return import.meta.env?.BASE_URL ?? '/';
}
