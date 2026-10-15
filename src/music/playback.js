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

/** Slack for comparing whole-note times, which abcjs rounds to 6 places. */
const TIME_EPS = 1e-6;

/**
 * @typedef {object} TimelineEntry
 * @property {number} time when this note starts sounding, in whole notes
 *   from the top of the performance
 * @property {number} index into the parsed `notes` (rests included)
 */

/**
 * The straight-through timeline: every note once, in written order, at its
 * own `startTime`. What a tune without repeats plays, and the fallback when
 * the synth's note map can't be matched up with the parsed notes.
 * @param {import('./abc.js').AbcEvent[]} notes
 * @returns {TimelineEntry[]}
 */
export function linearTimeline(notes) {
  return notes.map((n, i) => ({ time: n.startTime, index: i }));
}

/**
 * The order the synth actually plays the parsed notes in, and when. The
 * parsed notes are straight through, but abcjs's synth expands repeats and
 * endings -- so for a tune with `|: :|`, "where is note N in the audio" and
 * "which note is sounding at time T" both need the synth's own note map,
 * not `startTime`.
 *
 * The synth only emits sounding notes, so this also fills in what it leaves
 * out: rests, and the second half of a tie (merged into the first). Each
 * gap is walked forward from the previous sounding note by written
 * duration, until the next sounding note's time is reached -- which is also
 * what stops the walk at a repeat's jump back.
 * @param {import('./abc.js').AbcEvent[]} notes
 * @param {{start: number, startChar?: number}[]} played the synth's note
 *   events, in play order: `start` in whole notes, `startChar` already
 *   relative to the same ABC source `notes` was parsed from
 * @returns {TimelineEntry[]}
 */
export function buildPlaybackTimeline(notes, played) {
  const indexByChar = new Map();
  notes.forEach((n, i) => {
    if (n.startChar !== undefined && !indexByChar.has(n.startChar)) indexByChar.set(n.startChar, i);
  });

  const anchors = [];
  for (const ev of played ?? []) {
    const index = indexByChar.get(ev.startChar);
    if (index === undefined) continue; // e.g. a grace note, which carries no source offset
    // The same note again before it has even finished is one note split
    // into several events, not a repeat of it.
    const prev = anchors.at(-1);
    if (prev?.index === index && ev.start < prev.time + notes[index].duration - TIME_EPS) continue;
    anchors.push({ time: ev.start, index });
  }
  if (anchors.length === 0) return linearTimeline(notes);

  const timeline = [];
  const fill = (fromIndex, fromTime, until) => {
    let time = fromTime;
    for (let j = fromIndex; j < notes.length && time < until - TIME_EPS; j += 1) {
      timeline.push({ time, index: j });
      time += notes[j].duration;
    }
  };

  // Leading rests, before the first sounding note.
  if (anchors[0].index > 0) fill(0, 0, anchors[0].time);
  anchors.forEach((a, k) => {
    timeline.push(a);
    const until = anchors[k + 1]?.time ?? Infinity;
    fill(a.index + 1, a.time + notes[a.index].duration, until);
  });
  return timeline;
}

/**
 * Which note is sounding `time` into the performance.
 * @param {TimelineEntry[]} timeline
 * @param {number} time in whole notes
 * @returns {number} an index into the parsed notes, or -1 before the first
 */
export function noteIndexAtTime(timeline, time) {
  let found = -1;
  for (const entry of timeline) {
    if (entry.time > time + TIME_EPS) break;
    found = entry.index;
  }
  return found;
}

/**
 * Where "play from note N" starts: the note's FIRST pass through the
 * performance, so starting inside a repeated section plays the repeat too.
 * A note the timeline doesn't have (an index past the end) resolves to the
 * end of the performance -- nothing left to play.
 * @param {TimelineEntry[]} timeline
 * @param {import('./abc.js').AbcEvent[]} notes
 * @param {number} index
 * @returns {number} time in whole notes
 */
export function timeForNoteIndex(timeline, notes, index) {
  if (timeline.length === 0) return 0;
  const target = Math.max(0, index);
  const entry = timeline.find((e) => e.index === target);
  if (entry) return entry.time;
  const last = timeline[timeline.length - 1];
  return last.time + (notes[last.index]?.duration ?? 0);
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
