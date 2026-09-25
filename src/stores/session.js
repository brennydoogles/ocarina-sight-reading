import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { noteName } from '../music/pitch.js';
import { PRACTICE_MODE, PRACTICE_MODES } from './practiceModes.js';

const STORAGE_KEY = 'ocarina.stats.v2';
/**
 * v1 predates the mode picker, when Single Note Drills was the only mode --
 * so every v1 attempt migrates to PRACTICE_MODE.SINGLE. Left in place
 * forever, unread once v2 exists, so a rollback stays survivable.
 */
const LEGACY_STORAGE_KEY = 'ocarina.stats.v1';

/**
 * Per-note practice statistics, persisted so progress survives a reload.
 * Also tracks the current streak, which is the bit that makes practising
 * faintly addictive.
 *
 * Per-note stats (`stats`) are shared across every mode -- "my weakest
 * notes" should mean something across everything you play. `modeStats` is a
 * parallel per-mode aggregate for the Progress tab's breakdown; it does not
 * change what a note record looks like or how `rankedNotes` is computed.
 */
export const useSessionStore = defineStore('session', () => {
  /** @type {import('vue').Ref<Record<number, {attempts:number, hinted:number, totalMs:number, bestMs:number|null}>>} */
  const stats = ref({});
  /** @type {import('vue').Ref<Record<string, {attempts:number, hinted:number, totalMs:number}>>} */
  const modeStats = ref({});
  const streak = ref(0);
  const bestStreak = ref(0);
  const completed = ref(0);

  const totalAttempts = computed(() =>
    Object.values(stats.value).reduce((n, s) => n + s.attempts, 0));

  const hintRate = computed(() => {
    const hinted = Object.values(stats.value).reduce((n, s) => n + s.hinted, 0);
    return totalAttempts.value === 0 ? 0 : hinted / totalAttempts.value;
  });

  /** Weakest notes first: most hints, then slowest. For the stats panel. */
  const rankedNotes = computed(() =>
    Object.entries(stats.value)
      .map(([midi, s]) => ({
        midi: Number(midi),
        name: noteName(Number(midi)),
        ...s,
        avgMs: s.attempts ? s.totalMs / s.attempts : 0,
        hintRate: s.attempts ? s.hinted / s.attempts : 0,
      }))
      .sort((a, b) => b.hintRate - a.hintRate || b.avgMs - a.avgMs));

  /**
   * Attempts/hint-rate/avg-time per mode, for the Progress tab's breakdown.
   * Always one row per PRACTICE_MODES entry, zeroed rather than absent when
   * a mode has never been played.
   */
  const modeBreakdown = computed(() =>
    PRACTICE_MODES.map((mode) => {
      const s = modeStats.value[mode] ?? { attempts: 0, hinted: 0, totalMs: 0 };
      return {
        mode,
        attempts: s.attempts,
        avgMs: s.attempts ? s.totalMs / s.attempts : 0,
        hintRate: s.attempts ? s.hinted / s.attempts : 0,
      };
    }));

  /**
   * @param {object} attempt
   * @param {number} attempt.midi
   * @param {number} attempt.ms
   * @param {boolean} attempt.hinted
   * @param {'tutorial'|'single'|'multi'|'song'} attempt.mode
   */
  function record({ midi, ms, hinted, mode }) {
    const s = stats.value[midi] ?? { attempts: 0, hinted: 0, totalMs: 0, bestMs: null };
    s.attempts += 1;
    s.totalMs += ms;
    if (hinted) s.hinted += 1;
    if (s.bestMs === null || ms < s.bestMs) s.bestMs = ms;
    stats.value = { ...stats.value, [midi]: s };

    const m = modeStats.value[mode] ?? { attempts: 0, hinted: 0, totalMs: 0 };
    m.attempts += 1;
    m.totalMs += ms;
    if (hinted) m.hinted += 1;
    modeStats.value = { ...modeStats.value, [mode]: m };

    completed.value += 1;
    // A note you needed the diagram for is not one you read; it breaks the run.
    streak.value = hinted ? 0 : streak.value + 1;
    if (streak.value > bestStreak.value) bestStreak.value = streak.value;
    persist();
  }

  function reset() {
    stats.value = {};
    modeStats.value = {};
    streak.value = 0;
    bestStreak.value = 0;
    completed.value = 0;
    persist();
  }

  /** Sum of every note's totals -- what modeStats.single should be for a v1 payload. */
  function aggregateOf(notesStats) {
    return Object.values(notesStats ?? {}).reduce(
      (acc, s) => ({
        attempts: acc.attempts + s.attempts,
        hinted: acc.hinted + s.hinted,
        totalMs: acc.totalMs + s.totalMs,
      }),
      { attempts: 0, hinted: 0, totalMs: 0 },
    );
  }

  function load() {
    try {
      const v2 = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (v2) {
        stats.value = v2.stats ?? {};
        modeStats.value = v2.modeStats ?? {};
        bestStreak.value = v2.bestStreak ?? 0;
        completed.value = v2.completed ?? 0;
        return;
      }

      const v1 = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? 'null');
      if (!v1) return;
      // Single Note Drills is the only mode that has ever recorded an
      // attempt before this store existed, so every v1 attempt is its.
      stats.value = v1.stats ?? {};
      modeStats.value = { [PRACTICE_MODE.SINGLE]: aggregateOf(v1.stats) };
      bestStreak.value = v1.bestStreak ?? 0;
      completed.value = v1.completed ?? 0;
      persist(); // write v2 now, so the migration only happens once
    } catch {
      // Corrupt or unavailable storage is not worth failing startup over.
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        stats: stats.value,
        modeStats: modeStats.value,
        bestStreak: bestStreak.value,
        completed: completed.value,
      }));
    } catch {
      // Private browsing, quota, etc. Progress simply does not survive reload.
    }
  }

  load();

  return {
    stats, modeStats, streak, bestStreak, completed,
    totalAttempts, hintRate, rankedNotes, modeBreakdown,
    record, reset,
  };
});
