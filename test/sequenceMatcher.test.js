import { describe, it, expect } from 'vitest';
import { SequenceMatcher } from '../src/audio/sequenceMatcher.js';
import { MATCH } from '../src/audio/matcher.js';
import { READING } from '../src/audio/detector.js';
import { midiToHz } from '../src/music/pitch.js';

const C5 = 72;
const D5 = 74;
const E5 = 76;

/** A usable reading at `cents` from `midi`. Mirrors test/matcher.test.js. */
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

describe('advancing through a sequence', () => {
  it('advances to the next target once the current one lands correct', () => {
    const s = new SequenceMatcher([C5, D5, E5], { sustainMs: 0 });
    expect(s.index).toBe(0);
    expect(s.update(at(C5), 0)).toBe(MATCH.CORRECT);
    expect(s.index).toBe(1);
    expect(s.update(at(D5), 10)).toBe(MATCH.CORRECT);
    expect(s.index).toBe(2);
  });

  it('does not advance on a wrong note, and does not fail', () => {
    const s = new SequenceMatcher([C5, D5], { sustainMs: 0 });
    expect(s.update(at(E5), 0)).toBe(MATCH.WRONG);
    expect(s.index).toBe(0);
    expect(s.done).toBe(false);
    // Still gettable: the wrong note did not knock anything terminal.
    expect(s.update(at(C5), 10)).toBe(MATCH.CORRECT);
    expect(s.index).toBe(1);
  });

  it('requires the sustain on every note, not just the first', () => {
    const s = new SequenceMatcher([C5, D5], { sustainMs: 200 });
    expect(s.update(at(C5), 0)).toBe(MATCH.HOLDING);
    expect(s.update(at(C5), 200)).toBe(MATCH.CORRECT);
    expect(s.update(at(D5), 200)).toBe(MATCH.HOLDING);
    expect(s.update(at(D5), 399)).toBe(MATCH.HOLDING);
    expect(s.update(at(D5), 400)).toBe(MATCH.CORRECT);
  });

  it('terminates at the end of the phrase', () => {
    const s = new SequenceMatcher([C5, D5], { sustainMs: 0 });
    s.update(at(C5), 0);
    expect(s.done).toBe(false);
    s.update(at(D5), 10);
    expect(s.done).toBe(true);
  });

  it('keeps reporting the last correct state once done, like NoteMatcher', () => {
    const s = new SequenceMatcher([C5], { sustainMs: 0 });
    expect(s.update(at(C5), 0)).toBe(MATCH.CORRECT);
    expect(s.done).toBe(true);
    expect(s.update(silence, 100)).toBe(MATCH.CORRECT);
    expect(s.update(at(D5), 200)).toBe(MATCH.CORRECT);
  });

  it('reports its position for a "note 3 of 8" style readout', () => {
    const s = new SequenceMatcher([C5, D5, E5], { sustainMs: 0 });
    expect(s.index).toBe(0);
    expect(s.length).toBe(3);
    s.update(at(C5), 0);
    expect(s.index).toBe(1);
    s.update(at(D5), 0);
    expect(s.index).toBe(2);
  });

  it('handles a one-note phrase', () => {
    const s = new SequenceMatcher([C5], { sustainMs: 0 });
    expect(s.done).toBe(false);
    expect(s.update(at(C5), 0)).toBe(MATCH.CORRECT);
    expect(s.done).toBe(true);
    expect(s.index).toBe(1);
  });

  it('handles an empty phrase without throwing', () => {
    const s = new SequenceMatcher([], { sustainMs: 0 });
    expect(s.done).toBe(true);
    expect(s.update(at(C5), 0)).toBe(MATCH.CORRECT);
  });
});

describe('bookkeeping of completed notes', () => {
  it('records one entry per note landed correctly, with its own time-to-correct', () => {
    const s = new SequenceMatcher([C5, D5], { sustainMs: 100 });
    s.update(at(C5), 0);
    s.update(at(C5), 100);
    s.update(at(D5), 100);
    s.update(at(D5), 250);
    expect(s.completed).toEqual([
      { midi: C5, ms: 100, hinted: false },
      { midi: D5, ms: 150, hinted: false },
    ]);
  });

  it('does not record a completion for a note that was only skipped', () => {
    const s = new SequenceMatcher([C5, D5], { sustainMs: 0 });
    s.skip(0);
    expect(s.completed).toEqual([]);
    expect(s.index).toBe(1);
    s.update(at(D5), 0);
    expect(s.completed).toEqual([{ midi: D5, ms: 0, hinted: false }]);
  });

  it('flags hinted completions', () => {
    const s = new SequenceMatcher([C5], { sustainMs: 0, hintTimeoutMs: 10 });
    s.tick(20); // past the hint timeout
    s.update(at(C5), 20);
    expect(s.completed).toEqual([{ midi: C5, ms: 20, hinted: true }]);
  });
});

describe('skip', () => {
  it('moves to the next target without crediting the skipped one', () => {
    const s = new SequenceMatcher([C5, D5, E5], { sustainMs: 0 });
    s.skip(0);
    expect(s.index).toBe(1);
    expect(s.update(at(D5), 0)).toBe(MATCH.CORRECT);
    expect(s.index).toBe(2);
  });

  it('can finish the phrase by skipping the last note', () => {
    const s = new SequenceMatcher([C5], { sustainMs: 0 });
    s.skip(0);
    expect(s.done).toBe(true);
    expect(s.completed).toEqual([]);
  });

  it('is a no-op once the phrase is already done', () => {
    const s = new SequenceMatcher([C5], { sustainMs: 0 });
    s.update(at(C5), 0);
    s.skip(10);
    expect(s.done).toBe(true);
    expect(s.index).toBe(1);
  });
});

describe('seekTo', () => {
  it('jumps forward to an arbitrary index without crediting anything skipped', () => {
    const s = new SequenceMatcher([C5, D5, E5, D5], { sustainMs: 0 });
    s.seekTo(2, 0);
    expect(s.index).toBe(2);
    expect(s.completed).toEqual([]);
    expect(s.update(at(E5), 0)).toBe(MATCH.CORRECT);
    expect(s.index).toBe(3);
  });

  it('jumps backward too, e.g. to replay an earlier bar', () => {
    const s = new SequenceMatcher([C5, D5, E5], { sustainMs: 0 });
    s.update(at(C5), 0);
    s.update(at(D5), 0);
    expect(s.index).toBe(2);
    s.seekTo(0, 100);
    expect(s.index).toBe(0);
    expect(s.update(at(C5), 100)).toBe(MATCH.CORRECT);
  });

  it('clamps below zero to the start', () => {
    const s = new SequenceMatcher([C5, D5], { sustainMs: 0 });
    s.seekTo(-5, 0);
    expect(s.index).toBe(0);
  });

  it('clamps past the end to done', () => {
    const s = new SequenceMatcher([C5, D5], { sustainMs: 0 });
    s.seekTo(50, 0);
    expect(s.index).toBe(2);
    expect(s.done).toBe(true);
  });

  it('resets the hint clock for whatever is now current', () => {
    const s = new SequenceMatcher([C5, D5, E5], { hintTimeoutMs: 1000 });
    s.tick(1000);
    expect(s.matcher.hintShown).toBe(true);
    s.seekTo(1, 2000);
    expect(s.matcher.hintShown).toBe(false);
  });
});

describe('hints and ticking', () => {
  it('shows the hint on the current note after the timeout, via tick', () => {
    const s = new SequenceMatcher([C5, D5], { hintTimeoutMs: 1000 });
    s.tick(999);
    expect(s.matcher.hintShown).toBe(false);
    s.tick(1000);
    expect(s.matcher.hintShown).toBe(true);
  });

  it('resets the hint clock for the next target', () => {
    const s = new SequenceMatcher([C5, D5], { hintTimeoutMs: 1000, sustainMs: 0 });
    s.tick(1000);
    expect(s.matcher.hintShown).toBe(true);
    s.update(at(C5), 1000);
    expect(s.matcher.hintShown).toBe(false);
  });

  it('reveals the current note on demand', () => {
    const s = new SequenceMatcher([C5], { hintTimeoutMs: 999999 });
    s.revealHint();
    expect(s.matcher.hintShown).toBe(true);
  });

  it('does nothing when ticked or revealed after the phrase is done', () => {
    const s = new SequenceMatcher([C5], { sustainMs: 0 });
    s.update(at(C5), 0);
    expect(() => s.tick(500)).not.toThrow();
    expect(() => s.revealHint()).not.toThrow();
  });
});
