import { describe, it, expect } from 'vitest';
import {
  midiToHz, hzToMidi, centsBetween, nearestNote, centsFromNote,
  noteName, toVexKey, midiFromName, isNatural, octaveOf,
} from '../src/music/pitch.js';

describe('midiToHz / hzToMidi', () => {
  it('anchors on A4 = 440 Hz = MIDI 69', () => {
    expect(midiToHz(69)).toBe(440);
    expect(hzToMidi(440)).toBe(69);
  });

  it('doubles frequency per octave', () => {
    expect(midiToHz(81)).toBeCloseTo(880, 10);
    expect(midiToHz(57)).toBeCloseTo(220, 10);
  });

  it('round-trips across the instrument range', () => {
    for (let m = 69; m <= 89; m += 1) {
      expect(hzToMidi(midiToHz(m))).toBeCloseTo(m, 10);
    }
  });

  it('puts the range boundaries where the ocarina literature does', () => {
    expect(midiToHz(69)).toBeCloseTo(440.0, 1);   // A4, all holes covered
    expect(midiToHz(89)).toBeCloseTo(1396.91, 1); // F6, all holes open
  });
});

describe('centsBetween', () => {
  it('is 1200 cents per octave and 100 per semitone', () => {
    expect(centsBetween(880, 440)).toBeCloseTo(1200, 9);
    expect(centsBetween(midiToHz(70), midiToHz(69))).toBeCloseTo(100, 9);
  });

  it('is signed', () => {
    expect(centsBetween(220, 440)).toBeCloseTo(-1200, 9);
  });
});

describe('nearestNote', () => {
  it('reports zero deviation on exact pitches', () => {
    for (let m = 69; m <= 89; m += 1) {
      const { midi, cents } = nearestNote(midiToHz(m));
      expect(midi).toBe(m);
      expect(cents).toBeCloseTo(0, 9);
    }
  });

  it('reports the offset for a detuned pitch', () => {
    const sharp = midiToHz(69) * Math.pow(2, 30 / 1200); // 30 cents sharp of A4
    const { midi, cents } = nearestNote(sharp);
    expect(midi).toBe(69);
    expect(cents).toBeCloseTo(30, 6);
  });

  it('snaps to the neighbour past the halfway point', () => {
    const justOver = midiToHz(69) * Math.pow(2, 51 / 1200);
    expect(nearestNote(justOver).midi).toBe(70);
  });

  it('always reports within half a semitone', () => {
    for (let c = -600; c <= 600; c += 7) {
      const { cents } = nearestNote(midiToHz(74) * Math.pow(2, c / 1200));
      expect(Math.abs(cents)).toBeLessThanOrEqual(50.000001);
    }
  });
});

describe('centsFromNote', () => {
  it('measures against the given note, not the nearest one', () => {
    // A5 is 1200 cents above A4 and must read as such, not as "0 off A5".
    expect(centsFromNote(880, 69)).toBeCloseTo(1200, 9);
    expect(centsFromNote(440, 69)).toBeCloseTo(0, 9);
  });
});

describe('naming', () => {
  it('names notes in scientific pitch notation', () => {
    expect(noteName(69)).toBe('A4');
    expect(noteName(60)).toBe('C4');
    expect(noteName(72)).toBe('C5');
    expect(noteName(89)).toBe('F6');
    // The app drills naturals, but the detector still has to name what it
    // hears -- "Hearing C#5" is the useful half of the feedback.
    expect(noteName(70)).toBe('A#4');
    expect(noteName(73)).toBe('C#5');
  });

  it('puts middle C in octave 4', () => {
    expect(octaveOf(60)).toBe(4);
  });

  it('produces VexFlow keys', () => {
    expect(toVexKey(69)).toBe('a/4');
    expect(toVexKey(72)).toBe('c/5');
    expect(toVexKey(89)).toBe('f/6');
  });

  it('defaults to sharps for both naming functions', () => {
    expect(noteName(70)).toBe('A#4');
    expect(toVexKey(70)).toBe('a#/4');
  });

  it('spells flats on request, without disturbing the sharp default', () => {
    expect(noteName(70, { flats: true })).toBe('Bb4');
    expect(toVexKey(70, { flats: true })).toBe('bb/4');
    expect(noteName(75, { flats: true })).toBe('Eb5');
    expect(toVexKey(75, { flats: true })).toBe('eb/5');
    // Naturals are spelled the same either way.
    expect(noteName(72, { flats: true })).toBe('C5');
    expect(toVexKey(72, { flats: true })).toBe('c/5');
    // Still defaults to sharps when the option is omitted.
    expect(noteName(70)).toBe('A#4');
    expect(toVexKey(70)).toBe('a#/4');
  });

  it('round-trips a flat spelling back to the same MIDI number', () => {
    for (let m = 69; m <= 89; m += 1) {
      expect(midiFromName(noteName(m, { flats: true }))).toBe(m);
    }
  });

  it('identifies naturals', () => {
    expect([69, 71, 72, 74, 76, 77].every(isNatural)).toBe(true);
    expect([70, 73, 75, 78, 80].some(isNatural)).toBe(false);
  });

  it('parses names back to MIDI, round-tripping', () => {
    expect(midiFromName('A4')).toBe(69);
    expect(midiFromName('F6')).toBe(89);
    expect(midiFromName('Bb4')).toBe(70);
    expect(midiFromName('A#4')).toBe(70);
    for (let m = 69; m <= 89; m += 1) {
      expect(midiFromName(noteName(m))).toBe(m);
    }
    // Flat input still parses, even though nothing emits it.
    expect(midiFromName('Eb5')).toBe(75);
  });

  it('rejects nonsense', () => {
    expect(() => midiFromName('H4')).toThrow();
    expect(() => midiFromName('')).toThrow();
  });
});
