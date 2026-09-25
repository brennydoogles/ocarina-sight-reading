import { describe, it, expect } from 'vitest';
import { Metronome } from '../src/audio/metronome.js';

describe('beat spacing', () => {
  it('spaces beats at 60/bpm seconds apart', () => {
    const m = new Metronome({ bpm: 120, lookAheadSec: 10 });
    m.start(0);
    const times = m.beatsDue(0).map((b) => b.time);
    // 120 bpm -> 0.5s per beat.
    expect(times).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5]);
  });

  it('reflects a different bpm', () => {
    const m = new Metronome({ bpm: 90, lookAheadSec: 2 });
    m.start(0);
    const times = m.beatsDue(0).map((b) => b.time);
    // 90 bpm -> 2/3 s per beat.
    expect(times).toEqual([0, 2 / 3, 4 / 3]);
  });

  it('starts beat 0 at whatever time start() was given, not always zero', () => {
    const m = new Metronome({ bpm: 60, lookAheadSec: 1 });
    m.start(10);
    expect(m.beatsDue(10).map((b) => b.time)).toEqual([10]);
  });
});

describe('downbeat accents', () => {
  it('accents beat 0 and every beatsPerBar-th beat after it', () => {
    const m = new Metronome({ bpm: 120, beatsPerBar: 4, lookAheadSec: 10 });
    m.start(0);
    const accented = m.beatsDue(0).map((b) => b.accented);
    expect(accented).toEqual([
      true, false, false, false,
      true, false, false, false,
      true, false, false, false,
      true, false, false, false,
      true, false, false, false,
    ]);
  });

  it('follows a different beats-per-bar', () => {
    const m = new Metronome({ bpm: 120, beatsPerBar: 3, lookAheadSec: 3 });
    m.start(0);
    const accented = m.beatsDue(0).map((b) => b.accented);
    expect(accented).toEqual([true, false, false, true, false, false]);
  });
});

describe('sweeping the timeline', () => {
  it('emits every beat exactly once across repeated calls, no gaps or duplicates', () => {
    const m = new Metronome({ bpm: 144, beatsPerBar: 4, lookAheadSec: 0.1 });
    m.start(0);

    const seen = [];
    // Poll in small steps, the way useMetronome.js's timer would, well past
    // where the whole run would have finished scheduling.
    for (let now = 0; now <= 10; now += 0.023) {
      seen.push(...m.beatsDue(now));
    }

    expect(seen.map((b) => b.beatIndex)).toEqual(seen.map((_, i) => i));
    const secondsPerBeat = 60 / 144;
    seen.forEach((beat, i) => {
      expect(beat.time).toBeCloseTo(i * secondsPerBeat, 9);
    });
  });

  it('returns nothing before start() and nothing after stop()', () => {
    const m = new Metronome({ bpm: 120 });
    expect(m.beatsDue(0)).toEqual([]);
    m.start(0);
    m.beatsDue(1);
    m.stop();
    expect(m.beatsDue(100)).toEqual([]);
  });

  it('resumes from beat 0 on a fresh start() after stop()', () => {
    const m = new Metronome({ bpm: 120, lookAheadSec: 1 });
    m.start(0);
    m.beatsDue(1);
    m.stop();
    m.start(5);
    expect(m.beatsDue(5).map((b) => b.beatIndex)).toEqual([0, 1]);
  });
});

describe('a bpm change mid-run', () => {
  it('does not move the already-scheduled next beat', () => {
    const m = new Metronome({ bpm: 60, lookAheadSec: 0.01 });
    m.start(0);
    // Nothing due yet at t=0 beyond beat 0 itself within this tiny window.
    const first = m.beatsDue(0);
    expect(first).toEqual([{ time: 0, beatIndex: 0, accented: true }]);

    // Change tempo before the next beat (at t=1 under the old 60bpm) fires.
    m.setBpm(120);
    const second = m.beatsDue(0.4);
    // The next beat was already fixed at t=1 by the OLD tempo when it
    // became "next" -- it must not jump backward into view early, nor
    // vanish, because of the change.
    expect(second).toEqual([]);
  });

  it('does not skip a beat, and applies the new spacing from then on', () => {
    const m = new Metronome({ bpm: 60, lookAheadSec: 0.01 });
    m.start(0);
    m.beatsDue(0); // beat 0 at t=0
    m.setBpm(120); // 0.5s/beat from here on
    const rest = [];
    for (let now = 0; rest.length < 6; now += 0.05) {
      rest.push(...m.beatsDue(now));
    }
    // Beat 1 still lands at t=1 (fixed under the old tempo); every beat
    // after it is 0.5s apart under the new one.
    expect(rest.map((b) => b.beatIndex)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rest.map((b) => b.time)).toEqual([1, 1.5, 2, 2.5, 3, 3.5]);
  });
});
