import { describe, it, expect } from 'vitest';
import { analyseFrame, rms, toDb, READING } from '../src/audio/detector.js';
import { midiToHz, noteName } from '../src/music/pitch.js';
import { allInstrumentNotes, DETECTABLE_MIN_HZ, DETECTABLE_MAX_HZ } from '../src/music/notes.js';

const SAMPLE_RATE = 48000; // what Android hands us
const FRAME = 2048;

/**
 * A steady tone. `harmonics` lets us move from a pure sine (which is close to
 * what an ocarina actually produces) toward something brighter, to check the
 * detector does not start reporting overtones as the fundamental.
 */
function tone(hz, { length = FRAME, sampleRate = SAMPLE_RATE, amplitude = 0.4, harmonics = [1], phase = 0 } = {}) {
  const buf = new Float32Array(length);
  const norm = harmonics.reduce((a, b) => a + b, 0);
  for (let i = 0; i < length; i += 1) {
    let s = 0;
    for (let h = 0; h < harmonics.length; h += 1) {
      s += harmonics[h] * Math.sin(2 * Math.PI * hz * (h + 1) * (i / sampleRate) + phase);
    }
    buf[i] = (amplitude * s) / norm;
  }
  return buf;
}

function noise(amplitude, length = FRAME) {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i += 1) buf[i] = (Math.random() * 2 - 1) * amplitude;
  return buf;
}

/** Detune a note by a number of cents. */
const detune = (midi, cents) => midiToHz(midi) * Math.pow(2, cents / 1200);

describe('level helpers', () => {
  it('measures RMS of a known signal', () => {
    // RMS of a full-scale sine is 1/sqrt(2).
    expect(rms(tone(440, { amplitude: 1 }))).toBeCloseTo(Math.SQRT1_2, 2);
  });

  it('reports digital silence as -Infinity dB', () => {
    expect(toDb(rms(new Float32Array(FRAME)))).toBe(-Infinity);
  });
});

describe('analyseFrame on pure tones', () => {
  it.each(allInstrumentNotes())('identifies %i exactly', (midi) => {
    const r = analyseFrame(tone(midiToHz(midi)), SAMPLE_RATE);
    expect(r.status, `${noteName(midi)} status`).toBe(READING.OK);
    expect(r.midi, `${noteName(midi)} note`).toBe(midi);
    expect(Math.abs(r.cents), `${noteName(midi)} cents`).toBeLessThan(5);
    expect(r.hz).toBeCloseTo(midiToHz(midi), 0);
  });

  it('is unaffected by phase', () => {
    for (const phase of [0, 0.7, Math.PI / 2, Math.PI, 4.2]) {
      const r = analyseFrame(tone(midiToHz(74), { phase }), SAMPLE_RATE);
      expect(r.status).toBe(READING.OK);
      expect(r.midi).toBe(74);
    }
  });

  it('works at 44.1 kHz as well as 48 kHz', () => {
    for (const sampleRate of [44100, 48000]) {
      const r = analyseFrame(tone(midiToHz(77), { sampleRate }), sampleRate);
      expect(r.status).toBe(READING.OK);
      expect(r.midi).toBe(77);
    }
  });
});

describe('analyseFrame with harmonics', () => {
  // An ocarina is nearly a pure sine, but a bright one or a cheap mic can add
  // overtones. The fundamental must still win -- reporting the 2nd harmonic
  // would show the player an octave-high note and be baffling.
  it.each(allInstrumentNotes())('tracks the fundamental of %i, not an overtone', (midi) => {
    const r = analyseFrame(tone(midiToHz(midi), { harmonics: [1, 0.3, 0.12] }), SAMPLE_RATE);
    expect(r.status, `${noteName(midi)} status`).toBe(READING.OK);
    expect(r.midi, `${noteName(midi)} landed on an overtone`).toBe(midi);
  });
});

describe('analyseFrame cents accuracy', () => {
  const OFFSETS = [-60, -40, -20, 0, 20, 40, 60];

  it.each(OFFSETS)('measures a %i cent detuning', (offset) => {
    // D5, comfortably mid-range, so +/-60 cents cannot fall off the instrument.
    const r = analyseFrame(tone(detune(74, offset)), SAMPLE_RATE);
    expect(r.status).toBe(READING.OK);
    // Past +/-50 cents the nearest note flips, and the reported deviation is
    // measured from that neighbour instead -- which is exactly why the
    // matcher uses centsFromNote against the target, not nearestNote.
    const expectedMidi = 74 + Math.round(offset / 100);
    const expectedCents = offset - Math.round(offset / 100) * 100;
    expect(r.midi).toBe(expectedMidi);
    expect(r.cents).toBeCloseTo(expectedCents, 0);
  });

  it('stays within a couple of cents across the whole range', () => {
    for (const midi of allInstrumentNotes()) {
      for (const offset of [-35, 0, 35]) {
        const r = analyseFrame(tone(detune(midi, offset)), SAMPLE_RATE);
        expect(r.status).toBe(READING.OK);
        expect(Math.abs(r.cents - offset), `${noteName(midi)} ${offset}c`).toBeLessThan(3);
      }
    }
  });
});

describe('analyseFrame gates', () => {
  it('reports silence below the noise gate', () => {
    const r = analyseFrame(new Float32Array(FRAME), SAMPLE_RATE);
    expect(r.status).toBe(READING.SILENT);
    expect(r.hz).toBeNull();
    expect(r.midi).toBeNull();
  });

  it('reports a quiet tone as silent rather than guessing', () => {
    const r = analyseFrame(tone(440, { amplitude: 0.0005 }), SAMPLE_RATE);
    expect(r.status).toBe(READING.SILENT);
  });

  it('rejects broadband noise as unclear', () => {
    const r = analyseFrame(noise(0.3), SAMPLE_RATE);
    expect([READING.UNCLEAR, READING.OUT_OF_RANGE]).toContain(r.status);
    expect(r.midi).toBeNull();
  });

  it('rejects pitches below the instrument as out of range', () => {
    // A3, an octave under the lowest note -- the classic autocorrelation
    // octave error, and the reason the range guard exists.
    const r = analyseFrame(tone(220), SAMPLE_RATE);
    expect(r.status).toBe(READING.OUT_OF_RANGE);
    expect(r.midi).toBeNull();
  });

  it('rejects pitches above the instrument as out of range', () => {
    const r = analyseFrame(tone(3000), SAMPLE_RATE);
    expect(r.status).toBe(READING.OUT_OF_RANGE);
  });

  it('admits the range boundaries with a semitone of headroom', () => {
    expect(analyseFrame(tone(DETECTABLE_MIN_HZ * 1.01), SAMPLE_RATE).status).toBe(READING.OK);
    expect(analyseFrame(tone(DETECTABLE_MAX_HZ * 0.99), SAMPLE_RATE).status).toBe(READING.OK);
  });

  it('honours a raised clarity threshold', () => {
    const clean = tone(440);
    expect(analyseFrame(clean, SAMPLE_RATE, { clarityThreshold: 0.99 }).status).toBe(READING.OK);
    expect(analyseFrame(clean, SAMPLE_RATE, { clarityThreshold: 1.01 }).status).toBe(READING.UNCLEAR);
  });

  it('honours a raised noise gate', () => {
    const quiet = tone(440, { amplitude: 0.02 });
    expect(analyseFrame(quiet, SAMPLE_RATE, { noiseGateDb: -60 }).status).toBe(READING.OK);
    expect(analyseFrame(quiet, SAMPLE_RATE, { noiseGateDb: -20 }).status).toBe(READING.SILENT);
  });
});

describe('analyseFrame window sizes', () => {
  it('works at 1024 and 4096 as well as 2048', () => {
    for (const length of [1024, 2048, 4096]) {
      const r = analyseFrame(tone(midiToHz(72), { length }), SAMPLE_RATE);
      expect(r.status, `length ${length}`).toBe(READING.OK);
      expect(r.midi, `length ${length}`).toBe(72);
    }
  });
});
