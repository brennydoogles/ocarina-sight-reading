import { describe, it, expect } from 'vitest';
import { generatePhrase } from '../src/music/phrases.js';
import { generateRhythm } from '../src/music/rhythm.js';
import {
  notePool, INSTRUMENT_LOW, INSTRUMENT_HIGH,
  DEFAULT_PRACTICE_LOW, DEFAULT_PRACTICE_HIGH,
} from '../src/music/notes.js';

const DEFAULTS = { low: DEFAULT_PRACTICE_LOW, high: DEFAULT_PRACTICE_HIGH };
const DURATION_QUARTERS = { w: 4, h: 2, q: 1, 8: 0.5 };

/** A cheap deterministic stand-in for Math.random, same LCG as exercise.test.js. */
function makeSequence(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('generatePhrase', () => {
  it('returns eight notes by default', () => {
    const phrase = generatePhrase({ ...DEFAULTS, random: makeSequence() });
    expect(phrase).toHaveLength(8);
    for (const note of phrase) {
      expect(note).toHaveProperty('midi');
      expect(note).toHaveProperty('name');
      expect(note).toHaveProperty('hz');
      expect(note).toHaveProperty('duration');
    }
  });

  it('honours a requested length', () => {
    const phrase = generatePhrase({ ...DEFAULTS, length: 20, random: makeSequence() });
    expect(phrase).toHaveLength(20);
  });

  it('never places a note outside [low, high]', () => {
    const pool = notePool(DEFAULTS);
    const random = makeSequence();
    for (let i = 0; i < 100; i += 1) {
      const phrase = generatePhrase({ ...DEFAULTS, length: 16, random });
      for (const note of phrase) expect(pool).toContain(note.midi);
    }
  });

  it('never places a note outside a chromatic [low, high]', () => {
    const range = { low: INSTRUMENT_LOW, high: INSTRUMENT_HIGH, includeAccidentals: true };
    const pool = notePool(range);
    const random = makeSequence();
    for (let i = 0; i < 100; i += 1) {
      const phrase = generatePhrase({ ...range, length: 16, random });
      for (const note of phrase) expect(pool).toContain(note.midi);
    }
  });

  it('is deterministic given a deterministic random source', () => {
    const a = generatePhrase({ ...DEFAULTS, length: 16, random: makeSequence() });
    const b = generatePhrase({ ...DEFAULTS, length: 16, random: makeSequence() });
    expect(a).toEqual(b);
  });

  it('is deterministic over a chromatic pool too', () => {
    const range = { low: INSTRUMENT_LOW, high: INSTRUMENT_HIGH, includeAccidentals: true };
    const a = generatePhrase({ ...range, length: 16, random: makeSequence() });
    const b = generatePhrase({ ...range, length: 16, random: makeSequence() });
    expect(a).toEqual(b);
  });

  it('is step-biased: consecutive intervals are dominated by small steps', () => {
    const random = makeSequence();
    const semitoneGaps = [];
    let previous = [];
    for (let i = 0; i < 300; i += 1) {
      const phrase = generatePhrase({ ...DEFAULTS, length: 12, previous, random });
      for (let j = 1; j < phrase.length; j += 1) {
        semitoneGaps.push(Math.abs(phrase[j].midi - phrase[j - 1].midi));
      }
      previous = phrase.map((n) => n.midi);
    }

    const steps = semitoneGaps.filter((g) => g > 0 && g <= 2).length;
    const bigLeaps = semitoneGaps.filter((g) => g >= 6).length;
    // A uniform random walk over a 6-note natural pool would spread gaps
    // roughly evenly across every interval size; a musical phrase must not.
    expect(steps / semitoneGaps.length).toBeGreaterThan(0.5);
    expect(bigLeaps / semitoneGaps.length).toBeLessThan(0.1);
  });

  it('is not merely uniform random over the pool', () => {
    // A uniform generator would visit every pool index with roughly equal
    // frequency and show no bias toward small steps -- assert both fail here.
    const random = makeSequence();
    const gaps = [];
    let previous = [];
    for (let i = 0; i < 300; i += 1) {
      const phrase = generatePhrase({ ...DEFAULTS, length: 12, previous, random });
      for (let j = 1; j < phrase.length; j += 1) gaps.push(Math.abs(phrase[j].midi - phrase[j - 1].midi));
      previous = phrase.map((n) => n.midi);
    }
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    // The natural pool spans up to 8 semitones (A4-F5); a uniform walk over
    // it averages roughly a third. A step-biased walk should sit well below.
    expect(mean).toBeLessThan(3);
  });

  it('eventually covers the whole natural pool', () => {
    const pool = notePool(DEFAULTS);
    const seen = new Set();
    let previous = [];
    const random = makeSequence();
    for (let i = 0; i < 200 && seen.size < pool.length; i += 1) {
      const phrase = generatePhrase({ ...DEFAULTS, previous, random });
      phrase.forEach((n) => seen.add(n.midi));
      previous = phrase.map((n) => n.midi);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(pool);
  });

  it('eventually covers the whole chromatic pool, accidentals included', () => {
    const range = { low: INSTRUMENT_LOW, high: INSTRUMENT_HIGH, includeAccidentals: true };
    const pool = notePool(range);
    const seen = new Set();
    let previous = [];
    const random = makeSequence();
    for (let i = 0; i < 500 && seen.size < pool.length; i += 1) {
      const phrase = generatePhrase({ ...range, previous, random });
      phrase.forEach((n) => seen.add(n.midi));
      previous = phrase.map((n) => n.midi);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(pool);
  });

  it('durations sum to a whole number of bars', () => {
    const random = makeSequence();
    for (const length of [1, 2, 3, 7, 8, 13, 16]) {
      const phrase = generatePhrase({ ...DEFAULTS, length, random, beatsPerBar: 4 });
      const totalQuarters = phrase.reduce((s, n) => s + DURATION_QUARTERS[n.duration], 0);
      expect(totalQuarters % 4).toBe(0);
    }
  });

  it('durations sum to a whole number of bars in 3/4 too', () => {
    const random = makeSequence();
    // A single note cannot fill a 3/4 bar exactly with no dotted durations
    // in the vocabulary -- every length here is at least the two notes a
    // 3/4 bar needs at minimum (e.g. a quarter plus a half).
    for (const length of [2, 3, 5, 8, 11]) {
      const phrase = generatePhrase({ ...DEFAULTS, length, random, beatsPerBar: 3 });
      const totalQuarters = phrase.reduce((s, n) => s + DURATION_QUARTERS[n.duration], 0);
      expect(totalQuarters % 3).toBe(0);
    }
  });

  it('works with includeAccidentals true and false', () => {
    const random = makeSequence();
    const natural = generatePhrase({ ...DEFAULTS, length: 10, random, includeAccidentals: false });
    const chromatic = generatePhrase({ ...DEFAULTS, length: 10, random, includeAccidentals: true });
    expect(natural.every((n) => notePool(DEFAULTS).includes(n.midi))).toBe(true);
    expect(chromatic.every((n) => notePool({ ...DEFAULTS, includeAccidentals: true }).includes(n.midi))).toBe(true);
  });

  it('does not hang on a one-note pool', () => {
    const phrase = generatePhrase({ low: 72, high: 72, length: 8, random: makeSequence() });
    expect(phrase).toHaveLength(8);
    expect(phrase.every((n) => n.midi === 72)).toBe(true);
  });

  it('does not hang when low === high with a non-natural note', () => {
    const phrase = generatePhrase({
      low: 70, high: 70, length: 8, includeAccidentals: true, random: makeSequence(),
    });
    expect(phrase).toHaveLength(8);
    expect(phrase.every((n) => n.midi === 70)).toBe(true);
  });

  it('returns an empty phrase for an inverted range', () => {
    expect(generatePhrase({ low: 80, high: 70, random: makeSequence() })).toEqual([]);
  });

  it('returns an empty phrase when length is zero', () => {
    expect(generatePhrase({ ...DEFAULTS, length: 0, random: makeSequence() })).toEqual([]);
  });
});

describe('generateRhythm', () => {
  it('returns one duration per note', () => {
    const durations = generateRhythm({ length: 11, random: makeSequence() });
    expect(durations).toHaveLength(11);
  });

  it('sums to a whole number of 4/4 bars', () => {
    const random = makeSequence();
    for (let length = 1; length <= 24; length += 1) {
      const durations = generateRhythm({ length, beatsPerBar: 4, random });
      const total = durations.reduce((s, d) => s + DURATION_QUARTERS[d], 0);
      expect(total % 4).toBe(0);
    }
  });

  it('sums to a whole number of 3/4 bars', () => {
    const random = makeSequence();
    // See the equivalent generatePhrase test: length 1 is infeasible for 3/4.
    for (let length = 2; length <= 24; length += 1) {
      const durations = generateRhythm({ length, beatsPerBar: 3, random });
      const total = durations.reduce((s, d) => s + DURATION_QUARTERS[d], 0);
      expect(total % 3).toBe(0);
    }
  });

  it('is deterministic given a deterministic random source', () => {
    const a = generateRhythm({ length: 16, random: makeSequence() });
    const b = generateRhythm({ length: 16, random: makeSequence() });
    expect(a).toEqual(b);
  });

  it('uses a mix of durations rather than only eighths', () => {
    const random = makeSequence();
    const seen = new Set();
    for (let i = 0; i < 20; i += 1) {
      generateRhythm({ length: 16, random }).forEach((d) => seen.add(d));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('returns an empty list for zero notes', () => {
    expect(generateRhythm({ length: 0, random: makeSequence() })).toEqual([]);
  });
});
