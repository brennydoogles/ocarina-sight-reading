import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { PRACTICE_MODES } from './practiceModes.js';

const STORAGE_KEY = 'ocarina.modes.v1';

export { PRACTICE_MODES };

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

  // Multi-Note Drills only (#9): whether to show phrases in rhythm, and if
  // so at what tempo, plus how many notes make up a phrase. BPM/phrase length
  // are stored even with rhythm off, so the toggle remembers the last value.
  const multiRhythmEnabled = ref(false);
  const multiBpm = ref(90);
  const multiPhraseLength = ref(8);

  const fields = {
    tutorialIncludeAccidentals,
    singleIncludeAccidentals,
    multiIncludeAccidentals,
    songIncludeAccidentals,
    multiRhythmEnabled,
    multiBpm,
    multiPhraseLength,
  };

  const BY_MODE = {
    tutorial: { includeAccidentals: tutorialIncludeAccidentals },
    single: { includeAccidentals: singleIncludeAccidentals },
    multi: {
      includeAccidentals: multiIncludeAccidentals,
      rhythmEnabled: multiRhythmEnabled,
      bpm: multiBpm,
      phraseLength: multiPhraseLength,
    },
    song: { includeAccidentals: songIncludeAccidentals },
  };

  /**
   * @param {'tutorial'|'single'|'multi'|'song'} mode
   * @returns {{ includeAccidentals: import('vue').Ref<boolean> }
   *   & (typeof mode extends 'multi'
   *     ? { rhythmEnabled: import('vue').Ref<boolean>, bpm: import('vue').Ref<number>,
   *         phraseLength: import('vue').Ref<number> }
   *     : {})}
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
    multiRhythmEnabled,
    multiBpm,
    multiPhraseLength,
    optionsFor,
  };
});
