/**
 * Pure timing math for song playback -- pulled out of useSongPlayback.js so
 * it can be tested without an AudioContext or the synth itself. Nothing
 * here touches audio; it only decides *when* (in tempo-scaled seconds)
 * something should happen.
 */

/** Sensible bounds for the tempo slider -- well below written tempo (for
 *  learning) through a bit above it, never so slow or fast it stops being a
 *  tempo. */
export const MIN_TEMPO_PERCENT = 30;
export const MAX_TEMPO_PERCENT = 150;
const FALLBACK_BPM = 120;

/**
 * Scales a tune's written tempo by a percentage. The tune's own tempo is
 * the baseline (100%) rather than some fixed number, since "learning speed"
 * is relative to how the piece was actually written.
 * @param {number|null|undefined} writtenBpm the tune's own tempo, if known
 * @param {number} percent e.g. 50 for half speed
 * @returns {number} a BPM, always at least 1 (never zero or negative)
 */
export function scaleTempo(writtenBpm, percent) {
  const base = writtenBpm && writtenBpm > 0 ? writtenBpm : FALLBACK_BPM;
  return Math.max(1, Math.round((base * percent) / 100));
}

/**
 * Converts "one whole note" into real seconds at a given tempo -- the
 * factor every other time conversion here is built from. Verified against
 * `abcjs`'s own tune.millisecondsPerMeasure()/setUpAudio() output: a whole
 * note is `meterSize` of a measure, and `millisecondsPerMeasure` already
 * bakes in the tempo, so this needs no separate beats-per-minute math.
 * @param {number} millisecondsPerMeasure from `tune.millisecondsPerMeasure(bpm)`
 * @param {{num: number, den: number}|null|undefined} meter
 * @returns {number} seconds per whole note
 */
export function secondsPerWholeNote(millisecondsPerMeasure, meter) {
  const meterSize = (meter?.num ?? 4) / (meter?.den ?? 4);
  return (millisecondsPerMeasure / 1000) / meterSize;
}

/**
 * The playback seek offset, in seconds, for "play from note index N" --
 * what backs both continuous Listen playback and single-note step mode.
 * Clamps `index` into range rather than throwing, so a caller need not
 * special-case an already-finished session; an out-of-range index resolves
 * to the tune's end (nothing left to play).
 * @param {import('./abc.js').AbcEvent[]} notes
 * @param {number} index
 * @param {number} millisecondsPerMeasure
 * @param {{num: number, den: number}|null|undefined} meter
 * @returns {number} seconds from the top of the tune
 */
export function secondsForNoteIndex(notes, index, millisecondsPerMeasure, meter) {
  if (notes.length === 0) return 0;
  const perWhole = secondsPerWholeNote(millisecondsPerMeasure, meter);
  if (index >= notes.length) {
    const last = notes[notes.length - 1];
    return (last.startTime + last.duration) * perWhole;
  }
  const note = notes[Math.max(0, index)];
  return note.startTime * perWhole;
}

/**
 * How long a single note lasts, in seconds -- what single-note step mode
 * waits before cutting playback off, so only that one note is heard.
 * @param {import('./abc.js').AbcEvent[]} notes
 * @param {number} index
 * @param {number} millisecondsPerMeasure
 * @param {{num: number, den: number}|null|undefined} meter
 * @returns {number} seconds
 */
export function noteDurationSeconds(notes, index, millisecondsPerMeasure, meter) {
  const note = notes[index];
  if (!note) return 0;
  return note.duration * secondsPerWholeNote(millisecondsPerMeasure, meter);
}
