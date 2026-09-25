import { describe, it, expect } from 'vitest';
import { buildTutorialSteps, TUTORIAL_SECTION } from '../src/music/tutorial.js';
import { INSTRUMENT_LOW, INSTRUMENT_HIGH } from '../src/music/notes.js';
import { noteName, midiFromName } from '../src/music/pitch.js';

describe('walkthrough section', () => {
  it('has 13 steps naturals-only by default', () => {
    const steps = buildTutorialSteps();
    const walkthrough = steps.filter((s) => s.section === TUTORIAL_SECTION.WALKTHROUGH);
    expect(walkthrough).toHaveLength(13);
  });

  it('has 21 steps with includeAccidentals', () => {
    const steps = buildTutorialSteps({ includeAccidentals: true });
    const walkthrough = steps.filter((s) => s.section === TUTORIAL_SECTION.WALKTHROUGH);
    expect(walkthrough).toHaveLength(21);
  });

  it('is strictly ascending and spans the whole instrument', () => {
    const steps = buildTutorialSteps({ includeAccidentals: true });
    const walkthrough = steps.filter((s) => s.section === TUTORIAL_SECTION.WALKTHROUGH);
    expect(walkthrough[0].midi).toBe(INSTRUMENT_LOW);
    expect(walkthrough[walkthrough.length - 1].midi).toBe(INSTRUMENT_HIGH);
    for (let i = 1; i < walkthrough.length; i += 1) {
      expect(walkthrough[i].midi, `step ${i}`).toBeGreaterThan(walkthrough[i - 1].midi);
    }
  });
});

describe('scale section', () => {
  it('is the C major scale, C5 to C6, eight notes', () => {
    const steps = buildTutorialSteps();
    const scale = steps.filter((s) => s.section === TUTORIAL_SECTION.SCALE);
    expect(scale.map((s) => s.name)).toEqual(['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6']);
  });

  it('has the correct major-scale intervals', () => {
    const steps = buildTutorialSteps();
    const scale = steps.filter((s) => s.section === TUTORIAL_SECTION.SCALE);
    const intervals = scale.slice(1).map((s, i) => s.midi - scale[i].midi);
    // Whole, whole, half, whole, whole, whole, half.
    expect(intervals).toEqual([2, 2, 1, 2, 2, 2, 1]);
  });

  it('is unaffected by includeAccidentals', () => {
    const naturalsOnly = buildTutorialSteps({ includeAccidentals: false })
      .filter((s) => s.section === TUTORIAL_SECTION.SCALE);
    const withAccidentals = buildTutorialSteps({ includeAccidentals: true })
      .filter((s) => s.section === TUTORIAL_SECTION.SCALE);
    expect(withAccidentals).toEqual(naturalsOnly);
  });

  it('comes after the walkthrough section', () => {
    const steps = buildTutorialSteps();
    const sections = steps.map((s) => s.section);
    const firstScale = sections.indexOf(TUTORIAL_SECTION.SCALE);
    expect(sections.slice(0, firstScale).every((s) => s === TUTORIAL_SECTION.WALKTHROUGH)).toBe(true);
    expect(sections.slice(firstScale).every((s) => s === TUTORIAL_SECTION.SCALE)).toBe(true);
  });
});

describe('step shape', () => {
  it('gives every step a midi, a matching name, and a valid section', () => {
    const steps = buildTutorialSteps({ includeAccidentals: true });
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      expect(typeof step.midi).toBe('number');
      expect(step.name).toBe(noteName(step.midi));
      expect(midiFromName(step.name)).toBe(step.midi);
      expect(Object.values(TUTORIAL_SECTION)).toContain(step.section);
    }
  });
});
