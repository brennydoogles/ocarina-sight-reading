import { describe, it, expect } from 'vitest';
import {
  FINGERINGS, HOLE_IDS, HOLE_META, HOLE_STATE, getFingering,
} from '../src/music/fingerings.js';
import { INSTRUMENT_LOW, INSTRUMENT_HIGH, allInstrumentNotes } from '../src/music/notes.js';
import { noteName, isNatural } from '../src/music/pitch.js';

const VALID_STATES = Object.values(HOLE_STATE);

/**
 * These assertions are what a type checker would have given us for free.
 * A typo'd hole name or a missing note must fail here rather than silently
 * render a diagram that teaches the wrong fingering.
 */
describe('fingering table integrity', () => {
  it('covers every note the app drills, and nothing outside it', () => {
    const keys = Object.keys(FINGERINGS).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual(allInstrumentNotes());
    expect(keys[0]).toBe(INSTRUMENT_LOW);
    expect(keys[keys.length - 1]).toBe(INSTRUMENT_HIGH);
    expect(keys).toHaveLength(13);
  });

  it('holds naturals only', () => {
    expect(Object.keys(FINGERINGS).map(Number).every(isNatural)).toBe(true);
  });

  it('gives every note exactly the twelve known holes', () => {
    for (const [midi, fingering] of Object.entries(FINGERINGS)) {
      const holes = Object.keys(fingering).sort();
      expect(holes, `${noteName(Number(midi))} hole set`).toEqual([...HOLE_IDS].sort());
    }
  });

  it('uses only valid hole states', () => {
    for (const [midi, fingering] of Object.entries(FINGERINGS)) {
      for (const [hole, state] of Object.entries(fingering)) {
        expect(VALID_STATES, `${noteName(Number(midi))} ${hole}`).toContain(state);
      }
    }
  });

  it('describes all twelve holes in HOLE_META', () => {
    expect(Object.keys(HOLE_META).sort()).toEqual([...HOLE_IDS].sort());
    for (const meta of Object.values(HOLE_META)) {
      expect(['front', 'back']).toContain(meta.view);
      expect(['left', 'right']).toContain(meta.hand);
      expect(typeof meta.label).toBe('string');
    }
  });

  it('has ten front holes and two thumb holes on the back', () => {
    const byView = HOLE_IDS.reduce((acc, id) => {
      acc[HOLE_META[id].view] = (acc[HOLE_META[id].view] ?? 0) + 1;
      return acc;
    }, {});
    expect(byView).toEqual({ front: 10, back: 2 });
  });

  it('has exactly two subholes', () => {
    expect(HOLE_IDS.filter((id) => HOLE_META[id].small)).toEqual(['SubL', 'SubR']);
  });
});

describe('fingering table musical sanity', () => {
  const closedCount = (m) =>
    Object.values(FINGERINGS[m]).filter((s) => s === HOLE_STATE.CLOSED).length;

  it('covers all twelve holes for the lowest note', () => {
    expect(closedCount(INSTRUMENT_LOW)).toBe(12);
  });

  it('opens every hole for the highest note', () => {
    expect(closedCount(INSTRUMENT_HIGH)).toBe(0);
  });

  it('closes the ten main holes and opens both subholes for C5', () => {
    const c5 = FINGERINGS[72];
    expect(c5.SubL).toBe(HOLE_STATE.OPEN);
    expect(c5.SubR).toBe(HOLE_STATE.OPEN);
    const main = HOLE_IDS.filter((id) => !HOLE_META[id].small);
    expect(main.every((id) => c5[id] === HOLE_STATE.CLOSED)).toBe(true);
  });

  it('never opens more holes as the pitch rises', () => {
    // Covering less air raises the pitch, so closed-hole count must be
    // monotonically non-increasing up the scale.
    const notes = allInstrumentNotes();
    for (let i = 1; i < notes.length; i += 1) {
      expect(
        closedCount(notes[i]),
        `${noteName(notes[i])} closes more holes than ${noteName(notes[i - 1])}`,
      ).toBeLessThanOrEqual(closedCount(notes[i - 1]));
    }
  });

  it('gives every note a distinct fingering', () => {
    const seen = new Map();
    for (const m of allInstrumentNotes()) {
      const key = HOLE_IDS.map((id) => FINGERINGS[m][id]).join('');
      expect(seen.has(key), `${noteName(m)} duplicates ${noteName(seen.get(key))}`).toBe(false);
      seen.set(key, m);
    }
  });
});

describe('accessors', () => {
  it('returns a fingering for the notes it drills and null otherwise', () => {
    expect(getFingering(69)).toBeTruthy();
    expect(getFingering(89)).toBeTruthy();
    expect(getFingering(68)).toBeNull();
    expect(getFingering(90)).toBeNull();
  });

  it('returns null for an accidental, which is out of scope', () => {
    expect(getFingering(70)).toBeNull(); // A#4
    expect(getFingering(75)).toBeNull(); // D#5
  });
});
