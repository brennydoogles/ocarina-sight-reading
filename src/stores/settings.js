import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { HINT_MODE, DEFAULT_MATCHER_CONFIG } from '../audio/matcher.js';
import { DEFAULT_DETECTOR_CONFIG } from '../audio/detector.js';
import {
  DEFAULT_PRACTICE_LOW, DEFAULT_PRACTICE_HIGH,
  INSTRUMENT_LOW, INSTRUMENT_HIGH, notePool,
} from '../music/notes.js';

const STORAGE_KEY = 'ocarina.settings.v1';

export const useSettingsStore = defineStore('settings', () => {
  const practiceLow = ref(DEFAULT_PRACTICE_LOW);
  const practiceHigh = ref(DEFAULT_PRACTICE_HIGH);
  const toleranceCents = ref(DEFAULT_MATCHER_CONFIG.toleranceCents);
  const sustainMs = ref(DEFAULT_MATCHER_CONFIG.sustainMs);
  const hintTimeoutMs = ref(DEFAULT_MATCHER_CONFIG.hintTimeoutMs);
  const hintMode = ref(HINT_MODE.TIMEOUT);
  const clarityThreshold = ref(DEFAULT_DETECTOR_CONFIG.clarityThreshold);
  const noiseGateDb = ref(DEFAULT_DETECTOR_CONFIG.noiseGateDb);
  const showDebug = ref(false);

  const fields = {
    practiceLow, practiceHigh, toleranceCents, sustainMs,
    hintTimeoutMs, hintMode, clarityThreshold, noiseGateDb, showDebug,
  };

  /** Notes currently in play -- empty means the range excludes everything. */
  const pool = computed(() =>
    notePool({ low: practiceLow.value, high: practiceHigh.value }));

  const detectorConfig = computed(() => ({
    clarityThreshold: clarityThreshold.value,
    noiseGateDb: noiseGateDb.value,
  }));

  const matcherConfig = computed(() => ({
    toleranceCents: toleranceCents.value,
    sustainMs: sustainMs.value,
    hintTimeoutMs: hintTimeoutMs.value,
    hintMode: hintMode.value,
  }));

  /** Keep the range endpoints from crossing over each other. */
  function setPracticeLow(midi) {
    practiceLow.value = clamp(midi);
    if (practiceHigh.value < practiceLow.value) practiceHigh.value = practiceLow.value;
  }
  function setPracticeHigh(midi) {
    practiceHigh.value = clamp(midi);
    if (practiceLow.value > practiceHigh.value) practiceLow.value = practiceHigh.value;
  }
  const clamp = (m) => Math.min(INSTRUMENT_HIGH, Math.max(INSTRUMENT_LOW, Math.round(m)));

  function reset() {
    practiceLow.value = DEFAULT_PRACTICE_LOW;
    practiceHigh.value = DEFAULT_PRACTICE_HIGH;
    toleranceCents.value = DEFAULT_MATCHER_CONFIG.toleranceCents;
    sustainMs.value = DEFAULT_MATCHER_CONFIG.sustainMs;
    hintTimeoutMs.value = DEFAULT_MATCHER_CONFIG.hintTimeoutMs;
    hintMode.value = HINT_MODE.TIMEOUT;
    clarityThreshold.value = DEFAULT_DETECTOR_CONFIG.clarityThreshold;
    noiseGateDb.value = DEFAULT_DETECTOR_CONFIG.noiseGateDb;
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
      // Private browsing, quota, etc. Settings simply do not survive reload.
    }
  }

  load();
  watch(Object.values(fields), persist, { deep: false });

  return {
    practiceLow, practiceHigh, toleranceCents, sustainMs,
    hintTimeoutMs, hintMode, clarityThreshold, noiseGateDb, showDebug,
    pool, detectorConfig, matcherConfig,
    setPracticeLow, setPracticeHigh, reset,
  };
});
