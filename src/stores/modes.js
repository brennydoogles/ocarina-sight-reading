import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const STORAGE_KEY = 'ocarina.modes.v1';

/** The four practice modes, in picker order. */
export const PRACTICE_MODES = Object.freeze(['tutorial', 'single', 'multi', 'song']);

/**
 * Per-mode practice options -- separate from src/stores/settings.js, which
 * keeps the cross-cutting concerns (practice range, tolerance, sustain, hint
 * behaviour). A semitone preference is per-mode: Single Note and Multi-Note
 * drills each need their own, so this store namespaces every option by mode
 * rather than sharing one flag across all four.
 */
export const useModesStore = defineStore('modes', () => {
  const tutorialIncludeAccidentals = ref(false);
  const singleIncludeAccidentals = ref(false);
  const multiIncludeAccidentals = ref(false);
  const songIncludeAccidentals = ref(false);

  const fields = {
    tutorialIncludeAccidentals,
    singleIncludeAccidentals,
    multiIncludeAccidentals,
    songIncludeAccidentals,
  };

  const BY_MODE = {
    tutorial: { includeAccidentals: tutorialIncludeAccidentals },
    single: { includeAccidentals: singleIncludeAccidentals },
    multi: { includeAccidentals: multiIncludeAccidentals },
    song: { includeAccidentals: songIncludeAccidentals },
  };

  /**
   * @param {'tutorial'|'single'|'multi'|'song'} mode
   * @returns {{ includeAccidentals: import('vue').Ref<boolean> }}
   */
  function optionsFor(mode) {
    return BY_MODE[mode];
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (!saved) return;
      for (const [key, value] of Object.entries(saved)) {
        if (key in fields && value !== null && value !== undefined) fields[key].value = value;
      }
    } catch {
      // Corrupt or unavailable storage is not worth failing startup over.
    }
  }

  function persist() {
    try {
      const plain = Object.fromEntries(
        Object.entries(fields).map(([k, r]) => [k, r.value]));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plain));
    } catch {
      // Private browsing, quota, etc. Options simply do not survive reload.
    }
  }

  load();
  watch(Object.values(fields), persist, { deep: false });

  return {
    tutorialIncludeAccidentals,
    singleIncludeAccidentals,
    multiIncludeAccidentals,
    songIncludeAccidentals,
    optionsFor,
  };
});
