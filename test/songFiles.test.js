import { describe, it, expect } from 'vitest';
import {
  filenamesNeedingSeed, initialSeededFilenames, titleFromFilename,
  songManifestUrl, songFileUrl, MIGRATED_FILENAMES, SONGS_DIR, MANIFEST_FILENAME,
} from '../src/music/songFiles.js';

describe('filenamesNeedingSeed', () => {
  it('lists every manifest file when nothing has been seeded', () => {
    expect(filenamesNeedingSeed(['a.abc', 'b.abc'], [])).toEqual(['a.abc', 'b.abc']);
  });

  it('excludes filenames already in the seeded set', () => {
    expect(filenamesNeedingSeed(['a.abc', 'b.abc'], ['a.abc'])).toEqual(['b.abc']);
  });

  it('returns nothing once every manifest file has been seeded', () => {
    expect(filenamesNeedingSeed(['a.abc', 'b.abc'], ['a.abc', 'b.abc'])).toEqual([]);
  });

  it('never re-lists a file the manifest no longer has, even if seeded', () => {
    expect(filenamesNeedingSeed(['a.abc'], ['a.abc', 'gone.abc'])).toEqual([]);
  });

  it('accepts any iterable of seeded filenames, not just an array', () => {
    expect(filenamesNeedingSeed(['a.abc', 'b.abc'], new Set(['a.abc']))).toEqual(['b.abc']);
  });
});

describe('initialSeededFilenames', () => {
  it('starts empty for a brand-new player with no library at all', () => {
    expect(initialSeededFilenames(false)).toEqual([]);
  });

  it('pre-marks the migrated filenames for a player with an existing library', () => {
    expect(initialSeededFilenames(true)).toEqual([...MIGRATED_FILENAMES]);
  });

  it('does not hand back a reference to the frozen constant', () => {
    const result = initialSeededFilenames(true);
    result.push('mutated.abc');
    expect(MIGRATED_FILENAMES).not.toContain('mutated.abc');
  });
});

describe('titleFromFilename', () => {
  it('title-cases a snake_case stem', () => {
    expect(titleFromFilename('ode_to_joy.abc')).toBe('Ode To Joy');
  });

  it('handles a single word', () => {
    expect(titleFromFilename('twinkle.abc')).toBe('Twinkle');
  });

  it('is case-insensitive about the extension', () => {
    expect(titleFromFilename('ode_to_joy.ABC')).toBe('Ode To Joy');
  });

  it('collapses repeated underscores', () => {
    expect(titleFromFilename('a__b.abc')).toBe('A B');
  });
});

describe('URLs', () => {
  it('namespaces both under SONGS_DIR', () => {
    expect(songManifestUrl('/')).toBe(`/${SONGS_DIR}/${MANIFEST_FILENAME}`);
    expect(songFileUrl('a.abc', '/')).toBe(`/${SONGS_DIR}/a.abc`);
  });

  it('honors a non-root base without a trailing double slash', () => {
    expect(songManifestUrl('/app/')).toBe(`/app/${SONGS_DIR}/${MANIFEST_FILENAME}`);
    expect(songFileUrl('a.abc', '/app/')).toBe(`/app/${SONGS_DIR}/a.abc`);
  });
});
