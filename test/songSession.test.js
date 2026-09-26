import { describe, it, expect } from 'vitest';
import { playableTargets, renderIndexForPlayable, playableIndexForBar } from '../src/music/songSession.js';

/** Builds a minimal note list: pitched notes and rests, tagged with a bar. */
const note = (midi, bar) => ({ isRest: false, midi, flats: false, duration: 0.25, bar, chord: false });
const rest = (bar) => ({ isRest: true, midi: null, duration: 0.25, bar });

describe('playableTargets', () => {
  it('returns the MIDI of every pitched note, in order', () => {
    const notes = [note(69, 1), note(71, 1), note(72, 1)];
    expect(playableTargets(notes)).toEqual([69, 71, 72]);
  });

  it('excludes rests', () => {
    const notes = [note(69, 1), rest(1), note(71, 1)];
    expect(playableTargets(notes)).toEqual([69, 71]);
  });

  it('returns an empty array for an all-rest tune', () => {
    expect(playableTargets([rest(1), rest(2)])).toEqual([]);
  });

  it('returns an empty array for no notes at all', () => {
    expect(playableTargets([])).toEqual([]);
  });
});

describe('renderIndexForPlayable', () => {
  it('maps a playable index straight through when there are no rests', () => {
    const notes = [note(69, 1), note(71, 1), note(72, 1)];
    expect(renderIndexForPlayable(notes, 0)).toBe(0);
    expect(renderIndexForPlayable(notes, 2)).toBe(2);
  });

  it('skips over rests when counting playable notes', () => {
    const notes = [note(69, 1), rest(1), note(71, 1), rest(1), note(72, 1)];
    // playable index 0 -> render index 0 (the first note)
    // playable index 1 -> render index 2 (skipping the rest at 1)
    // playable index 2 -> render index 4 (skipping the rest at 3)
    expect(renderIndexForPlayable(notes, 0)).toBe(0);
    expect(renderIndexForPlayable(notes, 1)).toBe(2);
    expect(renderIndexForPlayable(notes, 2)).toBe(4);
  });

  it('returns notes.length once the playable index is past the end', () => {
    const notes = [note(69, 1), note(71, 1)];
    expect(renderIndexForPlayable(notes, 2)).toBe(2);
    expect(renderIndexForPlayable(notes, 99)).toBe(2);
  });

  it('returns 0 for an empty note list', () => {
    expect(renderIndexForPlayable([], 0)).toBe(0);
  });
});

describe('playableIndexForBar', () => {
  it('resolves to the first playable note of the requested bar', () => {
    const notes = [note(69, 1), note(71, 1), note(72, 2), note(74, 2), note(76, 3)];
    expect(playableIndexForBar(notes, 2)).toBe(2);
    expect(playableIndexForBar(notes, 3)).toBe(4);
  });

  it('skips a rest that opens the requested bar, landing on the first PLAYABLE note', () => {
    const notes = [note(69, 1), rest(2), note(71, 2), note(72, 3)];
    expect(playableIndexForBar(notes, 2)).toBe(1); // playable index of the note at bar 2
  });

  it('clamps to the start for a bar before the tune begins', () => {
    const notes = [note(69, 3), note(71, 3)];
    expect(playableIndexForBar(notes, 1)).toBe(0);
  });

  it('clamps to the end (done) for a bar past the tune\'s last one', () => {
    const notes = [note(69, 1), note(71, 2)];
    expect(playableIndexForBar(notes, 99)).toBe(2);
  });

  it('falls through to the next bar that has a playable note, if the requested one is all rests', () => {
    const notes = [note(69, 1), rest(2), note(71, 3)];
    expect(playableIndexForBar(notes, 2)).toBe(1); // bar 2 has nothing playable; lands on bar 3's note
  });

  it('resolves to done for an all-rest tune', () => {
    expect(playableIndexForBar([rest(1), rest(2)], 1)).toBe(0);
  });

  it('returns 0 for an empty note list', () => {
    expect(playableIndexForBar([], 1)).toBe(0);
  });
});
