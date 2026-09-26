import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSongsStore } from '../src/stores/songs.js';

const STORAGE_KEY = 'ocarina.songs.v1';

/** A minimal in-memory Storage stand-in -- see test/session.test.js. */
function makeStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

let storage;

beforeEach(() => {
  setActivePinia(createPinia());
  storage = makeStorage();
  globalThis.localStorage = storage;
  globalThis.crypto ??= {};
  globalThis.crypto.randomUUID ??= () => `id-${Math.random().toString(36).slice(2)}`;
});

describe('first run', () => {
  it('seeds a few example songs when nothing has ever been saved', () => {
    const songs = useSongsStore();
    expect(songs.songs.length).toBeGreaterThanOrEqual(2);
    expect(songs.songs.every((s) => typeof s.abc === 'string' && s.abc.length > 0)).toBe(true);
  });

  it('persists the seeded examples immediately', () => {
    useSongsStore();
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('does not reseed a library the player has deliberately emptied', () => {
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
