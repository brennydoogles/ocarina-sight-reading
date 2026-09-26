import { describe, it, expect } from 'vitest';
import { parseAbc, validateSong, transposeAbc } from '../src/music/abc.js';
import { INSTRUMENT_LOW, INSTRUMENT_HIGH } from '../src/music/notes.js';

/** Builds a minimal single-line ABC tune from a body of notes. */
const tune = (notes, { key = 'C', extraHeaders = '' } = {}) =>
  `X:1\nT:Test\nL:1/4\n${extraHeaders}K:${key}\n${notes} |]\n`;

describe('parseAbc', () => {
  it('resolves pitches to absolute MIDI', async () => {
    const parsed = await parseAbc(tune('A B c d e f g a'));
    expect(parsed.notes.map((n) => n.midi)).toEqual([69, 71, 72, 74, 76, 77, 79, 81]);
    expect(parsed.notes.every((n) => !n.isRest)).toBe(true);
  });

  it('reads durations as a fraction of a whole note', async () => {
    // L:1/8 makes each unmarked note an eighth (0.125); "2" doubles it.
    const parsed = await parseAbc('X:1\nL:1/8\nK:C\nA2 B |]\n');
    expect(parsed.notes.map((n) => n.duration)).toEqual([0.25, 0.125]);
  });

  it('includes rests in the sequence', async () => {
    const parsed = await parseAbc(tune('A z B'));
    expect(parsed.notes.map((n) => n.isRest)).toEqual([false, true, false]);
    expect(parsed.notes[1].midi).toBeNull();
  });

  it('applies the key signature to notes with no inline mark', async () => {
    // K:F implies B flat.
    const parsed = await parseAbc(tune('A B c', { key: 'F' }));
    expect(parsed.notes.map((n) => n.midi)).toEqual([69, 70, 72]);
    expect(parsed.notes[1].flats).toBe(true);
  });

  it('lets an inline accidental override the key signature for that bar', async () => {
    // K:F flats B; an explicit natural on this B should cancel it.
    const parsed = await parseAbc(tune('=B c', { key: 'F' }));
    expect(parsed.notes[0].midi).toBe(71);
    expect(parsed.notes[0].flats).toBe(false);
  });

  it('preserves a flat spelling from an inline accidental', async () => {
    const parsed = await parseAbc(tune('_B c'));
    expect(parsed.notes[0].midi).toBe(70);
    expect(parsed.notes[0].flats).toBe(true);
  });

  it('preserves a sharp spelling from an inline accidental', async () => {
    const parsed = await parseAbc(tune('^F A'));
    expect(parsed.notes[0].midi).toBe(66);
    expect(parsed.notes[0].flats).toBe(false);
  });

  it('resets an inline accidental at the next bar', async () => {
    const parsed = await parseAbc('X:1\nL:1/4\nK:C\n^F | F |]\n');
    expect(parsed.notes.map((n) => n.midi)).toEqual([66, 65]);
  });

  it('extracts title, metre and tempo', async () => {
    const parsed = await parseAbc(tune('A B', { extraHeaders: 'M:3/4\nQ:1/4=100\n' }));
    expect(parsed.title).toBe('Test');
    expect(parsed.meter).toEqual({ num: 3, den: 4 });
    expect(parsed.bpm).toBe(100);
  });

  it('flags chords', async () => {
    const parsed = await parseAbc(tune('[CEG] D'));
    expect(parsed.features.hasChords).toBe(true);
    expect(parsed.notes.filter((n) => n.chord)).toHaveLength(2); // the E and G of the chord
  });

  it('flags multiple voices', async () => {
    const parsed = await parseAbc('X:1\nK:C\nV:1\nA B |]\nV:2\nC D |]\n');
    expect(parsed.features.hasMultipleVoices).toBe(true);
  });

  it('flags grace notes', async () => {
    const parsed = await parseAbc(tune('{ag}A B'));
    expect(parsed.features.hasGraceNotes).toBe(true);
  });

  it('flags repeats and endings', async () => {
    const parsed = await parseAbc('X:1\nK:C\n|: A B :|1 C D |2 E F |]\n');
    expect(parsed.features.hasRepeats).toBe(true);
  });

  it('does not flag a plain tune with none of the above', async () => {
    const parsed = await parseAbc(tune('A B c d'));
    expect(parsed.features).toEqual({
      hasChords: false, hasMultipleVoices: false, hasGraceNotes: false, hasRepeats: false, hasMicrotones: false,
    });
  });

  it('produces a useful warning rather than throwing on malformed input', async () => {
    await expect(parseAbc('this is not valid ABC at all !!! ###')).resolves.not.toThrow();
    const parsed = await parseAbc('this is not valid ABC at all !!! ###');
    expect(parsed.warnings.length).toBeGreaterThan(0);
    expect(parsed.warnings.every((w) => !w.includes('<'))).toBe(true); // HTML stripped
  });

  it('handles an empty string without throwing', async () => {
    const parsed = await parseAbc('');
    expect(parsed.notes).toEqual([]);
  });

  it('handles a header with no notes', async () => {
    const parsed = await parseAbc('X:1\nT:No notes\nK:C\n');
    expect(parsed.notes).toEqual([]);
    expect(parsed.title).toBe('No notes');
  });
});

describe('validateSong', () => {
  it('passes an in-range tune', async () => {
    const result = await validateSong(tune('A B c d e f g a'));
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.transposition).toBeNull();
  });

  it('passes a tune sitting exactly on the instrument boundaries', async () => {
    // Uppercase A with no marks is A4 (69); f with one octave-up mark is F6 (89).
    const result = await validateSong(tune("A f'"));
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('reports out-of-range notes by name, bar and how far over', async () => {
    const result = await validateSong(tune("A B c'' "));
    expect(result.valid).toBe(false);
    const issue = result.issues.find((i) => i.code === 'out-of-range');
    expect(issue).toBeTruthy();
    expect(issue.notes).toHaveLength(1);
    expect(issue.notes[0]).toMatchObject({ midi: 96, semitonesOver: 7, semitonesUnder: 0 });
    expect(issue.notes[0].name).toContain('C');
  });

  it('offers a transposition when one would bring the tune into range', async () => {
    // D4..A4 (62..69): 7 semitones below where the instrument starts.
    const result = await validateSong(tune('D E F G A'));
    expect(result.valid).toBe(false);
    expect(result.transposition).toEqual({ semitones: 7, direction: 'up' });
  });

  it('offers no transposition when the tune spans more than the instrument can cover', async () => {
    const result = await validateSong(tune("C,, c'''"));
    expect(result.transposition).toBeNull();
    expect(result.issues.find((i) => i.code === 'out-of-range')).toBeTruthy();
  });

  it('fails on chords', async () => {
    const result = await validateSong(tune('[A c] d'));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'chords' && i.severity === 'error')).toBe(true);
  });

  it('fails on multiple voices', async () => {
    const result = await validateSong('X:1\nK:C\nV:1\nA B |]\nV:2\nc d |]\n');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'multiple-voices' && i.severity === 'error')).toBe(true);
  });

  it('warns, but does not fail, on grace notes', async () => {
    const result = await validateSong(tune('{ag}A B'));
    expect(result.issues.some((i) => i.code === 'grace-notes' && i.severity === 'warning')).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('warns, but does not fail, on repeats', async () => {
    const result = await validateSong('X:1\nK:C\n|: A B :|]\n');
    expect(result.issues.some((i) => i.code === 'repeats' && i.severity === 'warning')).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('is valid with accidentals, but says the tune needs them', async () => {
    const result = await validateSong(tune('A ^c'));
    expect(result.valid).toBe(true);
    expect(result.needsAccidentals).toBe(true);
  });

  it('does not need accidentals for an all-natural tune', async () => {
    const result = await validateSong(tune('A B c'));
    expect(result.needsAccidentals).toBe(false);
  });

  it('fails with a clear reason when there are no notes', async () => {
    const result = await validateSong('X:1\nT:Empty\nK:C\n');
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([{ severity: 'error', code: 'no-notes', message: expect.any(String) }]);
  });

  it('handles an empty string without throwing', async () => {
    await expect(validateSong('')).resolves.not.toThrow();
    const result = await validateSong('');
    expect(result.valid).toBe(false);
  });

  it('accepts a custom instrument range', async () => {
    const result = await validateSong(tune('C D E'), { instrument: { low: INSTRUMENT_LOW, high: INSTRUMENT_HIGH } });
    expect(result.valid).toBe(false); // C4/D4/E4 are below A4 regardless
  });
});

describe('transposeAbc', () => {
  it('shifts both the key signature and every note', async () => {
    const out = await transposeAbc(tune('A B c'), 2);
    const reparsed = await parseAbc(out);
    expect(reparsed.notes.map((n) => n.midi)).toEqual([71, 73, 74]);
  });

  it('produces a tune that then validates as in range', async () => {
    const low = tune('D E F G A'); // D4..A4, 7 semitones under range
    const { transposition } = await validateSong(low);
    const shifted = await transposeAbc(low, transposition.semitones);
    const result = await validateSong(shifted);
    expect(result.valid).toBe(true);
  });
});
