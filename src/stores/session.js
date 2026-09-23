import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { noteName } from '../music/pitch.js';

const STORAGE_KEY = 'ocarina.stats.v1';

/**
 * Per-note practice statistics, persisted so progress survives a reload.
 * Also tracks the current streak, which is the bit that makes practising
 * faintly addictive.
 */
export const useSessionStore = defineStore('session', () => {
  /** @type {import('vue').Ref<Record<number, {attempts:number, hinted:number, totalMs:number, bestMs:number|null}>>} */
  const stats = ref({});
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

  function record({ midi, ms, hinted }) {
    const s = stats.value[midi] ?? { attempts: 0, hinted: 0, totalMs: 0, bestMs: null };
    s.attempts += 1;
    s.totalMs += ms;
    if (hinted) s.hinted += 1;
    if (s.bestMs === null || ms < s.bestMs) s.bestMs = ms;
    stats.value = { ...stats.value, [midi]: s };

    completed.value += 1;
    // A note you needed the diagram for is not one you read; it breaks the run.
    streak.value = hinted ? 0 : streak.value + 1;
    if (streak.value > bestStreak.value) bestStreak.value = streak.value;
    persist();
  }

  function reset() {
    stats.value = {};
    streak.value = 0;
    bestStreak.value = 0;
    completed.value = 0;
    persist();
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (!saved) return;
      stats.value = saved.stats ?? {};
      bestStreak.value = saved.bestStreak ?? 0;
      completed.value = saved.completed ?? 0;
    } catch { /* ignore */ }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        stats: stats.value, bestStreak: bestStreak.value, completed: completed.value,
      }));
    } catch { /* ignore */ }
  }

  load();

  return { stats, streak, bestStreak, completed, totalAttempts, hintRate, rankedNotes, record, reset };
});
