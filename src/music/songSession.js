/**
 * The bridge between a parsed tune (src/music/abc.js) and a play-along
 * session: which notes the player actually has to play, and how a bar
 * number maps back to a position in that sequence. Pure and DOM-free.
 *
 * `SequenceMatcher` (src/audio/sequenceMatcher.js) only knows about pitches
 * to match against -- a rest is nothing to play, so it has no place in its
 * target list. But a renderer needs the FULL note sequence, rests included,
 * to lay the tune out correctly. These functions are the translation layer
 * between "index into the pitched notes SequenceMatcher tracks" and "index
 * into the full note sequence a renderer draws".
 */

/**
 * The pitched notes of a parsed tune, in order -- what a `SequenceMatcher`
 * is built from.
 * @param {import('./abc.js').AbcEvent[]} notes
 * @returns {number[]} MIDI targets, one per pitched note
 */
export function playableTargets(notes) {
  return notes.filter((n) => !n.isRest).map((n) => n.midi);
}

/**
 * Maps a `SequenceMatcher` index (counting pitched notes only) to its
 * position in the full note sequence -- what a renderer needs to know which
 * note, rests included, is current.
 * @param {import('./abc.js').AbcEvent[]} notes
 * @param {number} playableIndex
 * @returns {number} an index into `notes`, or `notes.length` once done
 */
export function renderIndexForPlayable(notes, playableIndex) {
  let seen = 0;
  for (let i = 0; i < notes.length; i += 1) {
    if (notes[i].isRest) continue;
    if (seen === playableIndex) return i;
    seen += 1;
  }
  return notes.length;
}

/**
 * The playable (`SequenceMatcher`) index to resume at for "start from bar
 * N" -- the first pitched note in or after that bar, so a bar that opens
 * with a rest still resolves to something the player can actually play.
 * Clamps to the very start for a bar before the first one, and to the end
 * (done) for a bar past the tune's last one.
 * @param {import('./abc.js').AbcEvent[]} notes
 * @param {number} bar
 * @returns {number} a valid `SequenceMatcher` index
 */
export function playableIndexForBar(notes, bar) {
  let seen = 0;
  for (const note of notes) {
    if (note.isRest) continue;
    if (note.bar >= bar) return seen;
    seen += 1;
  }
  return seen;
}
