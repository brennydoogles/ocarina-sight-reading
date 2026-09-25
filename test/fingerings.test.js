import { describe, it, expect } from 'vitest';
import {
  FINGERINGS, HOLE_IDS, HOLE_META, HOLE_STATE, getFingering,
} from '../src/music/fingerings.js';
import {
  INSTRUMENT_LOW, INSTRUMENT_HIGH, allInstrumentNotes, rangeInclusive,
} from '../src/music/notes.js';
import { noteName, isNatural } from '../src/music/pitch.js';

const VALID_STATES = Object.values(HOLE_STATE);

/**
 * These assertions are what a type checker would have given us for free.
 * A typo'd hole name or a missing note must fail here rather than silently
 * render a diagram that teaches the wrong fingering.
 */
describe('fingering table integrity', () => {
  it('covers the full chromatic range, naturals and accidentals alike', () => {
    const keys = Object.keys(FINGERINGS).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual(rangeInclusive(INSTRUMENT_LOW, INSTRUMENT_HIGH));
    expect(keys).toHaveLength(21);
  });

  it('has thirteen natural rows and eight accidental rows', () => {
    const keys = Object.keys(FINGERINGS).map(Number);
    expect(keys.filter(isNatural)).toHaveLength(13);
    expect(keys.filter((m) => !isNatural(m))).toHaveLength(8);
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

  it('never opens more holes as the pitch rises, among the naturals', () => {
    // True of the naturals only -- deliberately NOT extended to all 21 rows.
    // The five highest accidentals are "forked" fingerings: the natural
    // above with R3 closed, e.g. F5 has R3 open but F#5 has it closed, and
    // C5/C#5 open the same *number* of holes. Covering less air raises the
    // pitch only within a fixed fingering family, not across the fork, so
    // monotonicity holds for the naturals' own scale but not once
    // accidentals are mixed in. Do not "fix" the data to make this pass
    // over allInstrumentNotes({ includeAccidentals: true }).
    const notes = allInstrumentNotes();
    for (let i = 1; i < notes.length; i += 1) {
      expect(
        closedCount(notes[i]),
        `${noteName(notes[i])} closes more holes than ${noteName(notes[i - 1])}`,
      ).toBeLessThanOrEqual(closedCount(notes[i - 1]));
    }
  });

  it('gives every one of the 21 notes a distinct fingering', () => {
    const seen = new Map();
    for (const m of Object.keys(FINGERINGS).map(Number)) {
      const key = HOLE_IDS.map((id) => FINGERINGS[m][id]).join('');
      expect(seen.has(key), `${noteName(m)} duplicates ${noteName(seen.get(key))}`).toBe(false);
      seen.set(key, m);
    }
  });

  it('opens SubR (not SubL) for A#4, unlike B4 which opens SubL', () => {
    // The easiest row to typo: the two subholes are not interchangeable.
    expect(FINGERINGS[70].SubL).toBe(HOLE_STATE.CLOSED);
    expect(FINGERINGS[70].SubR).toBe(HOLE_STATE.OPEN);
    expect(FINGERINGS[71].SubL).toBe(HOLE_STATE.OPEN);
    expect(FINGERINGS[71].SubR).toBe(HOLE_STATE.CLOSED);
  });
});

describe('accessors', () => {
  it('returns a fingering within the instrument range and null outside it', () => {
    expect(getFingering(69)).toBeTruthy();
    expect(getFingering(89)).toBeTruthy();
    expect(getFingering(68)).toBeNull();
    expect(getFingering(90)).toBeNull();
  });

  it('returns a fingering for accidentals too, now that the chart is chromatic', () => {
    expect(getFingering(70)).toBeTruthy(); // A#4
    expect(getFingering(75)).toBeTruthy(); // D#5
  });
});
