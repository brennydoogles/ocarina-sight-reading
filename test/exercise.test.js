import { describe, it, expect } from 'vitest';
import { generateExercise } from '../src/music/exercise.js';
import {
  notePool, INSTRUMENT_LOW, INSTRUMENT_HIGH,
  DEFAULT_PRACTICE_LOW, DEFAULT_PRACTICE_HIGH, makeNote,
} from '../src/music/notes.js';
import { isNatural, midiToHz, noteName } from '../src/music/pitch.js';

const DEFAULTS = { low: DEFAULT_PRACTICE_LOW, high: DEFAULT_PRACTICE_HIGH };

describe('notePool', () => {
  it('gives the six naturals of the default A4–F5 range', () => {
    expect(notePool(DEFAULTS).map(noteName)).toEqual(['A4', 'B4', 'C5', 'D5', 'E5', 'F5']);
  });

  it('never includes an accidental', () => {
    const pool = notePool({ low: INSTRUMENT_LOW, high: INSTRUMENT_HIGH });
    expect(pool.every(isNatural)).toBe(true);
    expect(pool).toHaveLength(13);
  });

  it('clamps to what the instrument can play', () => {
    const pool = notePool({ low: 40, high: 120 });
    expect(Math.min(...pool)).toBeGreaterThanOrEqual(INSTRUMENT_LOW);
    expect(Math.max(...pool)).toBeLessThanOrEqual(INSTRUMENT_HIGH);
  });

  it('is empty for an inverted range', () => {
    expect(notePool({ low: 80, high: 70 })).toEqual([]);
  });
});

describe('generateExercise', () => {
  it('returns one note by default', () => {
    const ex = generateExercise(DEFAULTS);
    expect(ex).toHaveLength(1);
    expect(ex[0]).toHaveProperty('midi');
    expect(ex[0]).toHaveProperty('name');
    expect(ex[0]).toHaveProperty('hz');
  });

  it('returns notes from the configured pool only', () => {
    const pool = notePool(DEFAULTS);
    for (let i = 0; i < 200; i += 1) {
      expect(pool).toContain(generateExercise(DEFAULTS)[0].midi);
    }
  });

  it('never repeats the previous note', () => {
    let previous = [];
    for (let i = 0; i < 300; i += 1) {
      const ex = generateExercise({ ...DEFAULTS, previous });
      expect(ex[0].midi).not.toBe(previous[0]);
      previous = ex.map((n) => n.midi);
    }
  });

  it('can still repeat when the pool holds a single note', () => {
    // A one-note range must not deadlock trying to avoid a repeat.
    const single = { low: 72, high: 72 };
    const ex = generateExercise({ ...single, previous: [72] });
    expect(ex[0].midi).toBe(72);
  });

  it('returns an empty exercise when no notes are in range', () => {
    expect(generateExercise({ low: 80, high: 70 })).toEqual([]);
  });

  it('honours a requested length and avoids consecutive repeats within it', () => {
    const ex = generateExercise({ ...DEFAULTS, length: 8, random: makeSequence() });
    expect(ex).toHaveLength(8);
    for (let i = 1; i < ex.length; i += 1) {
      expect(ex[i].midi).not.toBe(ex[i - 1].midi);
    }
  });

  it('is deterministic given a deterministic random source', () => {
    const a = generateExercise({ ...DEFAULTS, length: 6, random: makeSequence() });
    const b = generateExercise({ ...DEFAULTS, length: 6, random: makeSequence() });
    expect(a.map((n) => n.midi)).toEqual(b.map((n) => n.midi));
  });

  it('eventually produces every note in the pool', () => {
    const pool = notePool(DEFAULTS);
    const seen = new Set();
    let previous = [];
    for (let i = 0; i < 500 && seen.size < pool.length; i += 1) {
      const ex = generateExercise({ ...DEFAULTS, previous });
      seen.add(ex[0].midi);
      previous = ex.map((n) => n.midi);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual(pool);
  });
});

describe('makeNote', () => {
  it('carries the name and frequency alongside the MIDI number', () => {
    expect(makeNote(69)).toEqual({ midi: 69, name: 'A4', hz: 440 });
    expect(makeNote(89).hz).toBeCloseTo(midiToHz(89), 9);
  });
});

/** A cheap deterministic stand-in for Math.random. */
function makeSequence() {
  let seed = 1;
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}
