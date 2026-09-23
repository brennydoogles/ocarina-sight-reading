import { describe, it, expect } from 'vitest';
import { NoteMatcher, MATCH, HINT_MODE, NAME_HINT_FRACTION } from '../src/audio/matcher.js';
import { READING } from '../src/audio/detector.js';
import { midiToHz } from '../src/music/pitch.js';

const D5 = 74;

/** A usable reading at `cents` from `midi`. */
const at = (midi, cents = 0) => ({
  status: READING.OK,
  hz: midiToHz(midi) * Math.pow(2, cents / 1200),
  clarity: 0.99,
  rms: 0.3,
  db: -10,
  midi,
  cents,
});

const silence = { status: READING.SILENT, hz: null, clarity: 0, rms: 0, db: -Infinity, midi: null, cents: null };

describe('sustain requirement', () => {
  it('does not credit a note held for less than the sustain time', () => {
    const m = new NoteMatcher(D5, { sustainMs: 200 });
    m.reset(0);
    expect(m.update(at(D5), 0)).toBe(MATCH.HOLDING);
    expect(m.update(at(D5), 100)).toBe(MATCH.HOLDING);
    expect(m.update(at(D5), 199)).toBe(MATCH.HOLDING);
    expect(m.state).not.toBe(MATCH.CORRECT);
  });

  it('credits it once the sustain time is met', () => {
    const m = new NoteMatcher(D5, { sustainMs: 200 });
    m.reset(0);
    m.update(at(D5), 0);
    expect(m.update(at(D5), 200)).toBe(MATCH.CORRECT);
    expect(m.timeToCorrect).toBe(200);
  });

  it('restarts the hold when the note is interrupted', () => {
    // Sliding through the target on the way elsewhere must not count.
    const m = new NoteMatcher(D5, { sustainMs: 200 });
    m.reset(0);
    m.update(at(D5), 0);
    m.update(at(D5), 150);
    expect(m.update(at(D5 + 2), 160)).toBe(MATCH.WRONG); // slid past
    expect(m.update(at(D5), 170)).toBe(MATCH.HOLDING);   // came back
    expect(m.update(at(D5), 300)).toBe(MATCH.HOLDING);   // only 130ms so far
    expect(m.update(at(D5), 370)).toBe(MATCH.CORRECT);
  });

  it('restarts the hold after a gap of silence', () => {
    const m = new NoteMatcher(D5, { sustainMs: 200 });
    m.reset(0);
    m.update(at(D5), 0);
    expect(m.update(silence, 100)).toBe(MATCH.WAITING);
    expect(m.update(at(D5), 150)).toBe(MATCH.HOLDING);
    expect(m.update(at(D5), 349)).toBe(MATCH.HOLDING);
    expect(m.update(at(D5), 350)).toBe(MATCH.CORRECT);
  });

  it('stays correct once correct', () => {
    const m = new NoteMatcher(D5, { sustainMs: 100 });
    m.reset(0);
    m.update(at(D5), 0);
    m.update(at(D5), 100);
    expect(m.update(silence, 500)).toBe(MATCH.CORRECT);
    expect(m.update(at(D5 + 5), 600)).toBe(MATCH.CORRECT);
  });

  it('reports hold progress for a progress indicator', () => {
    const m = new NoteMatcher(D5, { sustainMs: 200 });
    m.reset(0);
    expect(m.holdProgress(0)).toBe(0);
    m.update(at(D5), 0);
    expect(m.holdProgress(100)).toBeCloseTo(0.5);
    m.update(at(D5), 200);
    expect(m.holdProgress(200)).toBe(1);
  });
});

describe('tolerance', () => {
  it('accepts a note inside the tolerance', () => {
    const m = new NoteMatcher(D5, { toleranceCents: 25, sustainMs: 0 });
    m.reset(0);
    expect(m.update(at(D5, 20), 0)).toBe(MATCH.CORRECT);
  });

  it('rejects a note outside the tolerance even though it is the right note', () => {
    // 40 cents sharp still rounds to D5, but at a 25-cent setting this is a
    // genuine intonation failure and must not pass.
    const m = new NoteMatcher(D5, { toleranceCents: 25, sustainMs: 0 });
    m.reset(0);
    expect(m.update(at(D5, 40), 0)).toBe(MATCH.WRONG);
  });

  it('accepts anything rounding to the note at the default 50 cents', () => {
    const m = new NoteMatcher(D5, { toleranceCents: 50, sustainMs: 0 });
    m.reset(0);
    expect(m.update(at(D5, 49), 0)).toBe(MATCH.CORRECT);
    m.reset(0);
    expect(m.update(at(D5, -49), 0)).toBe(MATCH.CORRECT);
  });

  it('measures against the target, not the nearest note', () => {
    const m = new NoteMatcher(D5, { toleranceCents: 50, sustainMs: 0 });
    m.reset(0);
    // A5, a perfect fifth above -- an exact note, but the wrong one.
    expect(m.update(at(D5 + 7), 0)).toBe(MATCH.WRONG);
    expect(m.cents).toBeCloseTo(700, 6);
    expect(m.heardMidi).toBe(D5 + 7);
  });

  it('reports which note was heard so the UI can say what went wrong', () => {
    const m = new NoteMatcher(D5, { sustainMs: 0 });
    m.reset(0);
    m.update(at(D5 - 1), 0);
    expect(m.heardMidi).toBe(D5 - 1);
    expect(m.cents).toBeCloseTo(-100, 6);
  });
});

describe('hint timing', () => {
  it('shows the hint once the timeout elapses', () => {
    const m = new NoteMatcher(D5, { hintTimeoutMs: 5000 });
    m.reset(0);
    expect(m.hintShown).toBe(false);
    m.update(silence, 4999);
    expect(m.hintShown).toBe(false);
    m.update(silence, 5000);
    expect(m.hintShown).toBe(true);
  });

  it('shows the hint while the player is silent, via tick', () => {
    // The timeout must fire with no audio at all -- that is the case it is for.
    const m = new NoteMatcher(D5, { hintTimeoutMs: 3000 });
    m.reset(0);
    m.tick(2999);
    expect(m.hintShown).toBe(false);
    m.tick(3000);
    expect(m.hintShown).toBe(true);
  });

  it('keeps the hint visible once shown', () => {
    const m = new NoteMatcher(D5, { hintTimeoutMs: 100, sustainMs: 0 });
    m.reset(0);
    m.tick(200);
    expect(m.hintShown).toBe(true);
    m.update(at(D5), 300);
    expect(m.hintShown).toBe(true);
  });

  it('hides the hint again on the next attempt', () => {
    const m = new NoteMatcher(D5, { hintTimeoutMs: 100 });
    m.reset(0);
    m.tick(200);
    expect(m.hintShown).toBe(true);
    m.reset(1000);
    expect(m.hintShown).toBe(false);
  });

  it('shows immediately in ALWAYS mode', () => {
    const m = new NoteMatcher(D5, { hintMode: HINT_MODE.ALWAYS });
    m.reset(0);
    expect(m.hintShown).toBe(true);
  });

  it('never shows in NEVER mode, however long it takes', () => {
    const m = new NoteMatcher(D5, { hintMode: HINT_MODE.NEVER, hintTimeoutMs: 10 });
    m.reset(0);
    m.tick(999999);
    expect(m.hintShown).toBe(false);
  });

  it('can be revealed on demand', () => {
    const m = new NoteMatcher(D5, { hintTimeoutMs: 999999 });
    m.reset(0);
    m.revealHint();
    expect(m.hintShown).toBe(true);
  });

  it('does not start the hint clock until reset', () => {
    // A matcher built at t=0 but started at t=10000 must not be instantly
    // timed out by the wall clock having moved on.
    const m = new NoteMatcher(D5, { hintTimeoutMs: 5000 });
    m.reset(10000);
    m.tick(12000);
    expect(m.hintShown).toBe(false);
    m.tick(15000);
    expect(m.hintShown).toBe(true);
  });
});

describe('the note-name stage of the hint', () => {
  it('names the note halfway to the fingering', () => {
    const m = new NoteMatcher(D5, { hintTimeoutMs: 6000 });
    m.reset(0);
    expect(m.nameShown).toBe(false);
    m.tick(2999);
    expect(m.nameShown, 'too early').toBe(false);
    m.tick(3000);
    expect(m.nameShown, 'at half the timeout').toBe(true);
    expect(m.hintShown, 'the fingering must still be withheld').toBe(false);
  });

  it('follows NAME_HINT_FRACTION rather than a hardcoded half', () => {
    const timeout = 8000;
    const m = new NoteMatcher(D5, { hintTimeoutMs: timeout });
    m.reset(0);
    m.tick(timeout * NAME_HINT_FRACTION - 1);
    expect(m.nameShown).toBe(false);
    m.tick(timeout * NAME_HINT_FRACTION);
    expect(m.nameShown).toBe(true);
  });

  it('still shows the fingering at the full timeout', () => {
    const m = new NoteMatcher(D5, { hintTimeoutMs: 4000 });
    m.reset(0);
    m.tick(2000);
    expect([m.nameShown, m.hintShown]).toEqual([true, false]);
    m.tick(4000);
    expect([m.nameShown, m.hintShown]).toEqual([true, true]);
  });

  it('keeps the name up once shown', () => {
    const m = new NoteMatcher(D5, { hintTimeoutMs: 1000 });
    m.reset(0);
    m.tick(500);
    expect(m.nameShown).toBe(true);
    m.update(at(D5, 300), 600); // playing the wrong pitch does not retract it
    expect(m.nameShown).toBe(true);
  });

  it('hides the name again on the next attempt', () => {
    const m = new NoteMatcher(D5, { hintTimeoutMs: 1000 });
    m.reset(0);
    m.tick(600);
    expect(m.nameShown).toBe(true);
    m.reset(5000);
    expect(m.nameShown).toBe(false);
  });

  it('never shows the name without eventually showing the fingering', () => {
    // The name is a rung on the same ladder, so hintShown implies nameShown.
    const m = new NoteMatcher(D5, { hintTimeoutMs: 2000 });
    m.reset(0);
    for (let t = 0; t <= 3000; t += 50) {
      m.tick(t);
      if (m.hintShown) expect(m.nameShown, `at ${t}ms`).toBe(true);
    }
  });

  it('shows the name immediately in ALWAYS mode', () => {
    const m = new NoteMatcher(D5, { hintMode: HINT_MODE.ALWAYS });
    m.reset(0);
    expect(m.nameShown).toBe(true);
  });

  it('never names the note in NEVER mode', () => {
    const m = new NoteMatcher(D5, { hintMode: HINT_MODE.NEVER, hintTimeoutMs: 10 });
    m.reset(0);
    m.tick(999999);
    expect(m.nameShown).toBe(false);
    expect(m.hintShown).toBe(false);
  });

  it('reveals the name along with the fingering on demand', () => {
    const m = new NoteMatcher(D5, { hintTimeoutMs: 999999 });
    m.reset(0);
    m.revealHint();
    expect(m.nameShown).toBe(true);
    expect(m.hintShown).toBe(true);
  });

  it('names the note while the player is silent, which is when they need it', () => {
    const m = new NoteMatcher(D5, { hintTimeoutMs: 2000 });
    m.reset(0);
    m.update(silence, 1000);
    expect(m.nameShown).toBe(true);
  });
});

describe('attempt bookkeeping', () => {
  it('has no completion time until it completes', () => {
    const m = new NoteMatcher(D5, { sustainMs: 100 });
    m.reset(0);
    expect(m.timeToCorrect).toBeNull();
    m.update(at(D5), 500);
    m.update(at(D5), 600);
    expect(m.timeToCorrect).toBe(600);
  });
});
