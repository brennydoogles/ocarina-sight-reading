import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSongsStore } from '../src/stores/songs.js';
import { MIGRATED_FILENAMES } from '../src/music/songFiles.js';

const STORAGE_KEY = 'ocarina.songs.v1';
const SEEDED_KEY = 'ocarina.songs.seeded.v1';

/** A minimal in-memory Storage stand-in -- see test/session.test.js. */
function makeStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

/**
 * A fetch stand-in serving `files` (filename -> ABC text) at whatever URL
 * `songManifestUrl`/`songFileUrl` build, without caring about the base.
 */
function makeFetch(files) {
  return async (url) => {
    if (url.endsWith('/index.json')) return { ok: true, json: async () => Object.keys(files) };
    const filename = url.split('/').pop();
    if (!(filename in files)) return { ok: false };
    return { ok: true, text: async () => files[filename] };
  };
}

// Lowercase c/d/e/f is C5/D5/E5/F5 -- comfortably inside A4-F6.
const VALID_ABC = 'X:1\nT:Test Tune\nL:1/4\nK:C\nc d e f |]\n';
const NO_TITLE_ABC = 'X:1\nL:1/4\nK:C\nc d e |]\n';
// Two octaves below middle C -- well outside the instrument's A4-F6 range.
const INVALID_ABC = 'X:1\nT:Bad Tune\nL:1/4\nK:C\nC,, |]\n';

let storage;

beforeEach(() => {
  setActivePinia(createPinia());
  storage = makeStorage();
  globalThis.localStorage = storage;
  globalThis.crypto ??= {};
  globalThis.crypto.randomUUID ??= () => `id-${Math.random().toString(36).slice(2)}`;
});

describe('first run', () => {
  it('starts empty when nothing has ever been saved', () => {
    const songs = useSongsStore();
    expect(songs.songs).toEqual([]);
  });

  it('does not persist anything until a mutation happens', () => {
    useSongsStore();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('leaves a deliberately emptied library empty', () => {
    storage.setItem(STORAGE_KEY, '[]');
    const songs = useSongsStore();
    expect(songs.songs).toEqual([]);
  });
});

describe('add / update / remove', () => {
  it('adds a song with an id and an added date', () => {
    const songs = useSongsStore();
    const before = songs.songs.length;
    const song = songs.add({ title: 'A Tune', abc: 'X:1\nK:C\nCDE|]\n' });
    expect(songs.songs).toHaveLength(before + 1);
    expect(song.id).toBeTruthy();
    expect(song.title).toBe('A Tune');
    expect(typeof song.addedAt).toBe('number');
  });

  it('falls back to a placeholder title when none is given', () => {
    const songs = useSongsStore();
    const song = songs.add({ title: '  ', abc: 'X:1\nK:C\nC|]\n' });
    expect(song.title).toBe('Untitled');
  });

  it('updates an existing song in place', () => {
    const songs = useSongsStore();
    const song = songs.add({ title: 'Original', abc: 'X:1\nK:C\nC|]\n' });
    songs.update(song.id, { title: 'Renamed', abc: 'X:1\nK:C\nD|]\n' });
    const updated = songs.songs.find((s) => s.id === song.id);
    expect(updated.title).toBe('Renamed');
    expect(updated.abc).toBe('X:1\nK:C\nD|]\n');
  });

  it('removes a song by id', () => {
    const songs = useSongsStore();
    const song = songs.add({ title: 'Temp', abc: 'X:1\nK:C\nC|]\n' });
    const before = songs.songs.length;
    songs.remove(song.id);
    expect(songs.songs).toHaveLength(before - 1);
    expect(songs.songs.find((s) => s.id === song.id)).toBeUndefined();
  });

  it('persists every mutation', () => {
    const songs = useSongsStore();
    const song = songs.add({ title: 'Persisted', abc: 'X:1\nK:C\nC|]\n' });
    const savedAfterAdd = JSON.parse(storage.getItem(STORAGE_KEY));
    expect(savedAfterAdd.some((s) => s.id === song.id)).toBe(true);

    songs.remove(song.id);
    const savedAfterRemove = JSON.parse(storage.getItem(STORAGE_KEY));
    expect(savedAfterRemove.some((s) => s.id === song.id)).toBe(false);
  });
});

describe('survives a reload', () => {
  it('a second store instance reading the same storage sees prior changes', () => {
    const first = useSongsStore();
    first.add({ title: 'Sticks Around', abc: 'X:1\nK:C\nC|]\n' });

    setActivePinia(createPinia()); // simulate a fresh page load
    const second = useSongsStore();
    expect(second.songs.some((s) => s.title === 'Sticks Around')).toBe(true);
  });
});

describe('export / import', () => {
  it('round-trips the whole library', () => {
    const songs = useSongsStore();
    songs.add({ title: 'Export Me', abc: 'X:1\nK:C\nCDE|]\n' });
    const json = songs.exportJson();

    setActivePinia(createPinia());
    storage.removeItem(STORAGE_KEY);
    const fresh = useSongsStore();
    const before = fresh.songs.length;
    const count = fresh.importJson(json);

    expect(count).toBeGreaterThan(0);
    expect(fresh.songs).toHaveLength(before + count);
    expect(fresh.songs.some((s) => s.title === 'Export Me')).toBe(true);
  });

  it('assigns fresh ids on import rather than colliding with existing ones', () => {
    const songs = useSongsStore();
    const original = songs.add({ title: 'Mine', abc: 'X:1\nK:C\nC|]\n' });
    const json = JSON.stringify({ version: 1, songs: [original] });

    const count = songs.importJson(json);
    expect(count).toBe(1);
    const ids = songs.songs.filter((s) => s.title === 'Mine').map((s) => s.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('also accepts a bare array export', () => {
    const songs = useSongsStore();
    const count = songs.importJson(JSON.stringify([{ title: 'Bare Array', abc: 'X:1\nK:C\nC|]\n' }]));
    expect(count).toBe(1);
    expect(songs.songs.some((s) => s.title === 'Bare Array')).toBe(true);
  });

  it('rejects something that is not a library export', () => {
    const songs = useSongsStore();
    expect(() => songs.importJson(JSON.stringify({ hello: 'world' }))).toThrow();
    expect(() => songs.importJson('not even json')).toThrow();
  });
});

describe('corrupt or unavailable storage', () => {
  it('does not throw on corrupt JSON', () => {
    storage.setItem(STORAGE_KEY, '{not json');
    expect(() => useSongsStore()).not.toThrow();
  });

  it('does not throw when localStorage is unavailable', () => {
    delete globalThis.localStorage;
    expect(() => useSongsStore()).not.toThrow();
  });

  it('does not throw when persisting without localStorage', () => {
    delete globalThis.localStorage;
    const songs = useSongsStore();
    expect(() => songs.add({ title: 'x', abc: 'X:1\nK:C\nC|]\n' })).not.toThrow();
  });
});

describe('seedFromFolder', () => {
  it('adds every manifest file not yet seeded, titled from T:', async () => {
    const songs = useSongsStore();
    await songs.seedFromFolder({ fetchImpl: makeFetch({ 'a.abc': VALID_ABC }) });
    expect(songs.songs.some((s) => s.title === 'Test Tune')).toBe(true);
  });

  it('falls back to a humanized filename when the tune has no T: field', async () => {
    const songs = useSongsStore();
    await songs.seedFromFolder({ fetchImpl: makeFetch({ 'no_title.abc': NO_TITLE_ABC }) });
    expect(songs.songs.some((s) => s.title === 'No Title')).toBe(true);
  });

  it('marks a file seeded so a later call does not add it twice', async () => {
    const songs = useSongsStore();
    const fetchImpl = makeFetch({ 'a.abc': VALID_ABC });
    await songs.seedFromFolder({ fetchImpl });
    const countAfterFirst = songs.songs.length;

    await songs.seedFromFolder({ fetchImpl });
    expect(songs.songs).toHaveLength(countAfterFirst);
  });

  it('does not bring back a seeded song the player deleted', async () => {
    const songs = useSongsStore();
    const fetchImpl = makeFetch({ 'a.abc': VALID_ABC });
    await songs.seedFromFolder({ fetchImpl });

    const added = songs.songs.find((s) => s.title === 'Test Tune');
    songs.remove(added.id);

    await songs.seedFromFolder({ fetchImpl });
    expect(songs.songs.some((s) => s.title === 'Test Tune')).toBe(false);
  });

  it('skips a file that fails validation, warns, and does not mark it seeded', async () => {
    const songs = useSongsStore();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await songs.seedFromFolder({ fetchImpl: makeFetch({ 'bad.abc': INVALID_ABC }) });
    expect(songs.songs).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('bad.abc'));

    // Not marked seeded -- "fixing" the file (a later load serving a valid
    // tune under the same name) makes it appear.
    await songs.seedFromFolder({ fetchImpl: makeFetch({ 'bad.abc': VALID_ABC }) });
    expect(songs.songs.some((s) => s.title === 'Test Tune')).toBe(true);

    warn.mockRestore();
  });

  it('leaves the library untouched when the manifest fetch fails', async () => {
    const songs = useSongsStore();
    songs.add({ title: 'Mine', abc: 'X:1\nK:C\nC|]\n' });

    const fetchImpl = async () => { throw new Error('offline'); };
    await expect(songs.seedFromFolder({ fetchImpl })).resolves.toBeUndefined();
    expect(songs.songs).toHaveLength(1);
  });

  it('leaves the library untouched when the manifest response is not ok', async () => {
    const songs = useSongsStore();
    const fetchImpl = async () => ({ ok: false });
    await songs.seedFromFolder({ fetchImpl });
    expect(songs.songs).toEqual([]);
  });

  it('skips just the one file that fails to fetch, and still tries the rest', async () => {
    const songs = useSongsStore();
    const fetchImpl = async (url) => {
      if (url.endsWith('/index.json')) return { ok: true, json: async () => ['missing.abc', 'a.abc'] };
      if (url.endsWith('/a.abc')) return { ok: true, text: async () => VALID_ABC };
      return { ok: false };
    };
    await songs.seedFromFolder({ fetchImpl });
    expect(songs.songs.some((s) => s.title === 'Test Tune')).toBe(true);
    expect(songs.songs).toHaveLength(1);
  });

  describe('migration for a pre-existing library', () => {
    it('marks the migrated filenames seeded without adding them', async () => {
      storage.setItem(STORAGE_KEY, JSON.stringify([
        { id: '1', title: 'Old Mary', abc: 'X:1\nK:C\nC|]\n', addedAt: 1 },
      ]));
      const songs = useSongsStore();
      const [migratedFilename] = MIGRATED_FILENAMES;
      const fetchImpl = makeFetch({
        [migratedFilename]: 'X:1\nT:Migrated Mary\nL:1/4\nK:C\nc d e |]\n',
        'new_song.abc': 'X:1\nT:New Song\nL:1/4\nK:C\nc d e |]\n',
      });

      await songs.seedFromFolder({ fetchImpl });

      expect(songs.songs.some((s) => s.title === 'Migrated Mary')).toBe(false);
      expect(songs.songs.some((s) => s.title === 'New Song')).toBe(true);
      expect(songs.songs.some((s) => s.title === 'Old Mary')).toBe(true);

      const seeded = JSON.parse(storage.getItem(SEEDED_KEY));
      expect(seeded).toEqual(expect.arrayContaining(MIGRATED_FILENAMES));
    });

    it('adds the migrated-named files normally for a brand-new player', async () => {
      const songs = useSongsStore(); // no pre-existing library
      const [migratedFilename] = MIGRATED_FILENAMES;
      const fetchImpl = makeFetch({ [migratedFilename]: 'X:1\nT:Migrated Mary\nL:1/4\nK:C\nc d e |]\n' });

      await songs.seedFromFolder({ fetchImpl });

      expect(songs.songs.some((s) => s.title === 'Migrated Mary')).toBe(true);
    });
  });
});
