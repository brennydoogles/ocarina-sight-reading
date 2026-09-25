import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { useModesStore, PRACTICE_MODES } from '../src/stores/modes.js';

const STORAGE_KEY = 'ocarina.modes.v1';

/**
 * A minimal in-memory Storage stand-in. Vitest runs in the `node`
 * environment (see vite.config.js), so there is no browser localStorage to
 * reach for -- the store itself must tolerate that too, which is what the
 * "unavailable" case below checks.
 */
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
});

describe('useModesStore defaults', () => {
  it('defaults every mode to naturals only', () => {
    const store = useModesStore();
    for (const mode of PRACTICE_MODES) {
      expect(store.optionsFor(mode).includeAccidentals.value, mode).toBe(false);
    }
  });

  it('namespaces the flag per mode, not shared across all four', () => {
    const store = useModesStore();
    store.optionsFor('single').includeAccidentals.value = true;
    expect(store.optionsFor('single').includeAccidentals.value).toBe(true);
    expect(store.optionsFor('multi').includeAccidentals.value).toBe(false);
    expect(store.optionsFor('tutorial').includeAccidentals.value).toBe(false);
    expect(store.optionsFor('song').includeAccidentals.value).toBe(false);
  });
});

describe('persistence', () => {
  it('round-trips a change through localStorage', async () => {
    const store = useModesStore();
    store.optionsFor('multi').includeAccidentals.value = true;
    await nextTick(); // the persisting watcher is a pre-flush effect

    // A fresh Pinia app, same backing storage -- load() runs again.
    setActivePinia(createPinia());
    const reloaded = useModesStore();
    expect(reloaded.optionsFor('multi').includeAccidentals.value).toBe(true);
    expect(reloaded.optionsFor('single').includeAccidentals.value).toBe(false);
  });

  it('ignores unknown keys on load rather than failing', () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      bogusKey: 'from a future version',
      singleIncludeAccidentals: true,
    }));
    const store = useModesStore();
    expect(store.optionsFor('single').includeAccidentals.value).toBe(true);
  });

  it('does not throw on corrupt JSON', () => {
    storage.setItem(STORAGE_KEY, '{not json');
    expect(() => useModesStore()).not.toThrow();
    expect(useModesStore().optionsFor('single').includeAccidentals.value).toBe(false);
  });

  it('does not throw when localStorage is unavailable', () => {
    delete globalThis.localStorage;
    expect(() => useModesStore()).not.toThrow();
  });
});
