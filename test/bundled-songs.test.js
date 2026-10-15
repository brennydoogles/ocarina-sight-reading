import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateSong, readAbcTitle } from '../src/music/abc.js';

/**
 * Every bundled default song must actually be playable. At runtime an
 * invalid file is only skipped with a console warning (see
 * `seedFromFolder` in src/stores/songs.js), so a broken one would quietly
 * never reach anyone's library -- this is where it fails loudly instead.
 */
const DIR = join(import.meta.dirname, '..', 'public', 'songs');
const files = readdirSync(DIR).filter((f) => f.endsWith('.abc')).sort();

describe('bundled songs (public/songs)', () => {
  it('has at least one song', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s has a title and validates', async (file) => {
    const abc = readFileSync(join(DIR, file), 'utf8');
    expect(readAbcTitle(abc)).toBeTruthy();
    const result = await validateSong(abc);
    const errors = result.issues.filter((i) => i.severity === 'error').map((i) => i.message);
    expect(errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
