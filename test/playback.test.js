import { describe, it, expect } from 'vitest';
import {
  scaleTempo, secondsPerWholeNote, secondsForNoteIndex, noteDurationSeconds,
  MIN_TEMPO_PERCENT, MAX_TEMPO_PERCENT,
} from '../src/music/playback.js';

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

describe('secondsForNoteIndex', () => {
  const notes = [note(0, 0.25), note(0.25, 0.25), note(0.5, 0.5)];
  const meter = { num: 4, den: 4 };
  const msPerMeasure = 2000; // 2 seconds per whole note

  it('resolves to a note\'s own start time, in seconds', () => {
    expect(secondsForNoteIndex(notes, 0, msPerMeasure, meter)).toBeCloseTo(0, 9);
    expect(secondsForNoteIndex(notes, 1, msPerMeasure, meter)).toBeCloseTo(0.5, 9);
    expect(secondsForNoteIndex(notes, 2, msPerMeasure, meter)).toBeCloseTo(1, 9);
  });

  it('resolves an out-of-range index to the tune\'s end', () => {
    const end = secondsForNoteIndex(notes, 99, msPerMeasure, meter);
    expect(end).toBeCloseTo(2, 9); // last note starts at 0.5, lasts 0.5 -> ends at 1.0 whole notes = 2s
  });

  it('clamps a negative index to the start', () => {
    expect(secondsForNoteIndex(notes, -5, msPerMeasure, meter)).toBeCloseTo(0, 9);
  });

  it('returns 0 for an empty note list', () => {
    expect(secondsForNoteIndex([], 0, msPerMeasure, meter)).toBe(0);
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
