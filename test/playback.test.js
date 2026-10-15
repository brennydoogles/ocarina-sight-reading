import { describe, it, expect } from 'vitest';
import {
  scaleTempo, secondsPerWholeNote, noteDurationSeconds, linearTimeline, buildPlaybackTimeline,
  noteIndexAtTime, timeForNoteIndex, MIN_TEMPO_PERCENT, MAX_TEMPO_PERCENT,
} from '../src/music/playback.js';
import { parseAbc, loadAbcjs } from '../src/music/abc.js';

const note = (startTime, duration) => ({
  isRest: false, midi: 69, flats: false, duration, bar: 1, chord: false, startTime,
});

describe('scaleTempo', () => {
  it('returns the written tempo at 100%', () => {
    expect(scaleTempo(120, 100)).toBe(120);
  });

  it('scales down for learning', () => {
    expect(scaleTempo(120, 50)).toBe(60);
  });

  it('scales up', () => {
    expect(scaleTempo(100, 150)).toBe(150);
  });

  it('falls back to a sensible default when the tune has no written tempo', () => {
    expect(scaleTempo(null, 100)).toBeGreaterThan(0);
    expect(scaleTempo(undefined, 100)).toBeGreaterThan(0);
    expect(scaleTempo(0, 100)).toBeGreaterThan(0);
  });

  it('never returns zero or negative, even at extreme percentages', () => {
    expect(scaleTempo(120, MIN_TEMPO_PERCENT)).toBeGreaterThan(0);
    expect(scaleTempo(1, 1)).toBeGreaterThan(0);
  });

  it('rounds to a whole number of beats per minute', () => {
    expect(Number.isInteger(scaleTempo(90, 33))).toBe(true);
  });

  it('the tempo bounds bracket 100%, so both slowing down and speeding up are possible', () => {
    expect(MIN_TEMPO_PERCENT).toBeLessThan(100);
    expect(MAX_TEMPO_PERCENT).toBeGreaterThan(100);
  });
});

describe('secondsPerWholeNote', () => {
  it('matches manual math for 4/4', () => {
    // 120 BPM, 4/4: a measure is 4 quarters = 2s, and a measure IS one whole note.
    expect(secondsPerWholeNote(2000, { num: 4, den: 4 })).toBeCloseTo(2, 9);
  });

  it('matches manual math for 3/4', () => {
    // 90 BPM, 3/4: a measure is 3 quarters = 2s, but a measure is 3/4 of a whole note.
    const msPerMeasure = (3 / (90 / 60)) * 1000; // 3 beats at 90bpm, in ms
    const result = secondsPerWholeNote(msPerMeasure, { num: 3, den: 4 });
    expect(result).toBeCloseTo(msPerMeasure / 1000 / 0.75, 9);
  });

  it('defaults to 4/4 when no meter is known', () => {
    expect(secondsPerWholeNote(2000, null)).toBeCloseTo(2, 9);
    expect(secondsPerWholeNote(2000, undefined)).toBeCloseTo(2, 9);
  });
});

describe('linearTimeline + timeForNoteIndex', () => {
  const notes = [note(0, 0.25), note(0.25, 0.25), note(0.5, 0.5)];

  it('resolves to a note\'s own start time, in whole notes', () => {
    const timeline = linearTimeline(notes);
    expect(timeForNoteIndex(timeline, notes, 0)).toBeCloseTo(0, 9);
    expect(timeForNoteIndex(timeline, notes, 1)).toBeCloseTo(0.25, 9);
    expect(timeForNoteIndex(timeline, notes, 2)).toBeCloseTo(0.5, 9);
  });

  it('resolves an out-of-range index to the tune\'s end', () => {
    expect(timeForNoteIndex(linearTimeline(notes), notes, 99)).toBeCloseTo(1, 9);
  });

  it('clamps a negative index to the start', () => {
    expect(timeForNoteIndex(linearTimeline(notes), notes, -5)).toBeCloseTo(0, 9);
  });

  it('returns 0 for an empty note list', () => {
    expect(timeForNoteIndex(linearTimeline([]), [], 0)).toBe(0);
  });
});

describe('buildPlaybackTimeline', () => {
  /** Notes with source offsets 10, 20, 30... so played events can name them. */
  const withChars = (specs) => specs.map(([startTime, duration, isRest = false], i) => ({
    ...note(startTime, duration), isRest, midi: isRest ? null : 69, startChar: (i + 1) * 10,
  }));
  const ev = (start, startChar) => ({ start, startChar });
  const indices = (timeline) => timeline.map((e) => e.index);

  it('matches the linear timeline for a tune played straight through', () => {
    const notes = withChars([[0, 0.25], [0.25, 0.25], [0.5, 0.5]]);
    const played = [ev(0, 10), ev(0.25, 20), ev(0.5, 30)];
    expect(buildPlaybackTimeline(notes, played)).toEqual(linearTimeline(notes));
  });

  it('follows a repeat back to its start', () => {
    // |: A B :| C
    const notes = withChars([[0, 0.25], [0.25, 0.25], [0.5, 0.25]]);
    const played = [ev(0, 10), ev(0.25, 20), ev(0.5, 10), ev(0.75, 20), ev(1, 30)];
    const timeline = buildPlaybackTimeline(notes, played);
    expect(indices(timeline)).toEqual([0, 1, 0, 1, 2]);
    expect(timeline.map((e) => e.time)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('takes the right ending on each pass', () => {
    // |: A :|1 B :|2 C |]
    const notes = withChars([[0, 0.25], [0.25, 0.25], [0.5, 0.25]]);
    const played = [ev(0, 10), ev(0.25, 20), ev(0.5, 10), ev(0.75, 30)];
    expect(indices(buildPlaybackTimeline(notes, played))).toEqual([0, 1, 0, 2]);
  });

  it('fills in leading, inner and trailing rests', () => {
    // z A z B z
    const notes = withChars([[0, 0.25, true], [0.25, 0.25], [0.5, 0.25, true], [0.75, 0.25], [1, 0.25, true]]);
    const played = [ev(0.25, 20), ev(0.75, 40)];
    expect(buildPlaybackTimeline(notes, played)).toEqual(linearTimeline(notes));
  });

  it('fills in a rest at the end of a repeated section without running past the jump back', () => {
    // |: A z :| B
    const notes = withChars([[0, 0.25], [0.25, 0.25, true], [0.5, 0.25]]);
    const played = [ev(0, 10), ev(0.5, 10), ev(1, 30)];
    const timeline = buildPlaybackTimeline(notes, played);
    expect(indices(timeline)).toEqual([0, 1, 0, 1, 2]);
    expect(timeline.map((e) => e.time)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('fills in the second half of a tie, which the synth merges into the first', () => {
    // A- A B
    const notes = withChars([[0, 0.25], [0.25, 0.25], [0.5, 0.25]]);
    const played = [ev(0, 10), ev(0.5, 30)];
    expect(buildPlaybackTimeline(notes, played)).toEqual(linearTimeline(notes));
  });

  it('skips events it cannot place, such as grace notes', () => {
    const notes = withChars([[0, 0.25], [0.25, 0.25]]);
    const played = [{ start: 0 }, ev(0.0625, 10), ev(0.25, 20)];
    expect(indices(buildPlaybackTimeline(notes, played))).toEqual([0, 1]);
  });

  it('falls back to the linear timeline when nothing can be matched', () => {
    const notes = withChars([[0, 0.25], [0.25, 0.25]]);
    expect(buildPlaybackTimeline(notes, [])).toEqual(linearTimeline(notes));
    expect(buildPlaybackTimeline(notes, [ev(0, 999)])).toEqual(linearTimeline(notes));
    expect(buildPlaybackTimeline(notes, undefined)).toEqual(linearTimeline(notes));
  });

  it('seeks to a repeated note\'s first pass', () => {
    const notes = withChars([[0, 0.25], [0.25, 0.25], [0.5, 0.25]]);
    const played = [ev(0, 10), ev(0.25, 20), ev(0.5, 10), ev(0.75, 20), ev(1, 30)];
    const timeline = buildPlaybackTimeline(notes, played);
    expect(timeForNoteIndex(timeline, notes, 1)).toBeCloseTo(0.25, 9);
    expect(timeForNoteIndex(timeline, notes, 2)).toBeCloseTo(1, 9);
    expect(timeForNoteIndex(timeline, notes, 3)).toBeCloseTo(1.25, 9);
  });

  it('lines up with real abcjs output for a tune with repeats and endings', async () => {
    const src = 'X:1\nL:1/4\nK:C\n|: A z :|1 B c :|2 d- d e |]\n';
    const { notes } = await parseAbc(src);
    const abcjs = await loadAbcjs();
    const played = abcjs.parseOnly(src)[0].setUpAudio({}).tracks
      .flat().filter((e) => e.cmd === 'note');
    const timeline = buildPlaybackTimeline(notes, played);
    // A z B c | A z d d e
    expect(indices(timeline)).toEqual([0, 1, 2, 3, 0, 1, 4, 5, 6]);
    expect(timeline.map((e) => e.time)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  });
});

describe('noteIndexAtTime', () => {
  const timeline = [{ time: 0.25, index: 0 }, { time: 0.5, index: 1 }, { time: 0.75, index: 0 }];

  it('is -1 before the first note starts', () => {
    expect(noteIndexAtTime(timeline, 0)).toBe(-1);
    expect(noteIndexAtTime([], 1)).toBe(-1);
  });

  it('finds the note sounding at a time, boundaries included', () => {
    expect(noteIndexAtTime(timeline, 0.25)).toBe(0);
    expect(noteIndexAtTime(timeline, 0.4)).toBe(0);
    expect(noteIndexAtTime(timeline, 0.5)).toBe(1);
    expect(noteIndexAtTime(timeline, 0.75)).toBe(0);
  });

  it('stays on the last note past the end', () => {
    expect(noteIndexAtTime(timeline, 10)).toBe(0);
  });
});

describe('noteDurationSeconds', () => {
  it('converts one note\'s own duration to seconds', () => {
    const notes = [note(0, 0.25)];
    expect(noteDurationSeconds(notes, 0, 2000, { num: 4, den: 4 })).toBeCloseTo(0.5, 9);
  });

  it('returns 0 for an out-of-range index rather than throwing', () => {
    expect(noteDurationSeconds([], 0, 2000, { num: 4, den: 4 })).toBe(0);
    expect(noteDurationSeconds([note(0, 0.25)], 5, 2000, { num: 4, den: 4 })).toBe(0);
  });
});
