import { defineStore } from 'pinia';
import { ref } from 'vue';

const STORAGE_KEY = 'ocarina.tutorial.v1';

/**
 * Tutorial Mode's own progress: the furthest step reached, so a reload
 * resumes where the player left off instead of restarting from A4.
 *
 * The stored index is never clamped to the current step list -- only ever
 * grown by advanceTo(), or reset to 0 by restart(). Toggling the semitone
 * option changes the list length underneath it (13 walkthrough steps
 * naturals-only, 21 with accidentals), so the view is what clamps this
 * value to the current list length when picking the step to show. Keeping
 * the raw value here means turning the toggle back off and on again
 * restores the deeper position instead of losing it to the clamp.
 */
export const useTutorialStore = defineStore('tutorial', () => {
  const stepIndex = ref(0);

  /** Ratchet forward only -- never lets progress move backwards. */
  function advanceTo(index) {
    if (index > stepIndex.value) {
      stepIndex.value = index;
      persist();
    }
  }

  function restart() {
    stepIndex.value = 0;
    persist();
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (saved && typeof saved.stepIndex === 'number') stepIndex.value = saved.stepIndex;
    } catch {
      // Corrupt or unavailable storage is not worth failing startup over.
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ stepIndex: stepIndex.value }));
    } catch {
      // Private browsing, quota, etc. Progress simply does not survive reload.
    }
  }

  load();

  return { stepIndex, advanceTo, restart };
});
