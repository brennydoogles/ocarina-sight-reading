import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSessionStore } from '../src/stores/session.js';
import { PRACTICE_MODE } from '../src/stores/practiceModes.js';

const STORAGE_KEY = 'ocarina.stats.v2';
const LEGACY_STORAGE_KEY = 'ocarina.stats.v1';

/**
 * A minimal in-memory Storage stand-in. Vitest runs in the `node`
 * environment (see vite.config.js), so there is no browser localStorage to
 * reach for.
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

describe('record()', () => {
  it('updates the shared per-note pool', () => {
    const session = useSessionStore();
    session.record({ midi: 69, ms: 500, hinted: false, mode: PRACTICE_MODE.SINGLE });
    session.record({ midi: 69, ms: 300, hinted: true, mode: PRACTICE_MODE.MULTI });

    const s = session.stats[69];
    expect(s.attempts).toBe(2);
    expect(s.hinted).toBe(1);
    expect(s.totalMs).toBe(800);
    expect(s.bestMs).toBe(300);
  });

  it('tallies attempts per mode, separately from the shared per-note pool', () => {
    const session = useSessionStore();
    session.record({ midi: 69, ms: 500, hinted: false, mode: PRACTICE_MODE.SINGLE });
    session.record({ midi: 71, ms: 200, hinted: true, mode: PRACTICE_MODE.SINGLE });
    session.record({ midi: 69, ms: 900, hinted: false, mode: PRACTICE_MODE.MULTI });

    const single = session.modeBreakdown.find((r) => r.mode === PRACTICE_MODE.SINGLE);
    expect(single.attempts).toBe(2);
    expect(single.hintRate).toBeCloseTo(0.5, 9);
    expect(single.avgMs).toBeCloseTo(350, 9);

    const multi = session.modeBreakdown.find((r) => r.mode === PRACTICE_MODE.MULTI);
    expect(multi.attempts).toBe(1);
    expect(multi.hintRate).toBe(0);

    const tutorial = session.modeBreakdown.find((r) => r.mode === PRACTICE_MODE.TUTORIAL);
    expect(tutorial.attempts).toBe(0);
    expect(tutorial.hintRate).toBe(0);
    expect(tutorial.avgMs).toBe(0);
  });

  it('keeps rankedNotes global, across every mode', () => {
    const session = useSessionStore();
    session.record({ midi: 69, ms: 500, hinted: false, mode: PRACTICE_MODE.SINGLE });
    session.record({ midi: 69, ms: 100, hinted: true, mode: PRACTICE_MODE.SONG });

    expect(session.rankedNotes).toHaveLength(1);
    expect(session.rankedNotes[0].attempts).toBe(2);
  });
});

describe('streak', () => {
  it('grows on unhinted attempts and resets on a hinted one', () => {
    const session = useSessionStore();
    session.record({ midi: 69, ms: 400, hinted: false, mode: PRACTICE_MODE.SINGLE });
    session.record({ midi: 71, ms: 400, hinted: false, mode: PRACTICE_MODE.SINGLE });
    expect(session.streak).toBe(2);

    session.record({ midi: 72, ms: 400, hinted: true, mode: PRACTICE_MODE.SINGLE });
    expect(session.streak).toBe(0);
  });

  it('only ever grows bestStreak, even after a reset streak', () => {
    const session = useSessionStore();
    session.record({ midi: 69, ms: 400, hinted: false, mode: PRACTICE_MODE.SINGLE });
    session.record({ midi: 71, ms: 400, hinted: false, mode: PRACTICE_MODE.SINGLE });
    session.record({ midi: 72, ms: 400, hinted: true, mode: PRACTICE_MODE.SINGLE });
    session.record({ midi: 74, ms: 400, hinted: false, mode: PRACTICE_MODE.SINGLE });

    expect(session.streak).toBe(1);
    expect(session.bestStreak).toBe(2);
  });
});

describe('v1 -> v2 migration', () => {
  const v1Payload = {
    stats: {
      69: { attempts: 5, hinted: 1, totalMs: 5000, bestMs: 800 },
      71: { attempts: 3, hinted: 0, totalMs: 1200, bestMs: 300 },
    },
    bestStreak: 7,
    completed: 8,
  };

  it('attributes every v1 attempt to Single Note Drills and preserves streak/completed', () => {
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(v1Payload));
    const session = useSessionStore();

    expect(session.stats).toEqual(v1Payload.stats);
    expect(session.modeStats[PRACTICE_MODE.SINGLE]).toEqual({
      attempts: 8, hinted: 1, totalMs: 6200,
    });
    expect(session.bestStreak).toBe(7);
    expect(session.completed).toBe(8);
  });

  it('leaves the v1 key in place', () => {
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(v1Payload));
    useSessionStore();
    expect(JSON.parse(storage.getItem(LEGACY_STORAGE_KEY))).toEqual(v1Payload);
  });

  it('writes v2 immediately, so the migration runs only once', () => {
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(v1Payload));
    useSessionStore();
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('prefers v2 over v1 when both are present', () => {
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(v1Payload));
    storage.setItem(STORAGE_KEY, JSON.stringify({
      stats: {}, modeStats: {}, bestStreak: 42, completed: 100,
    }));
    const session = useSessionStore();

    expect(session.bestStreak).toBe(42);
    expect(session.completed).toBe(100);
    expect(session.stats).toEqual({});
  });
});

describe('corrupt or unavailable storage', () => {
  it('does not throw on corrupt JSON in v2', () => {
    storage.setItem(STORAGE_KEY, '{not json');
    expect(() => useSessionStore()).not.toThrow();
  });

  it('does not throw on corrupt JSON in v1', () => {
    storage.setItem(LEGACY_STORAGE_KEY, '{not json');
    expect(() => useSessionStore()).not.toThrow();
  });

  it('does not throw when localStorage is unavailable', () => {
    delete globalThis.localStorage;
    expect(() => useSessionStore()).not.toThrow();
  });
});
