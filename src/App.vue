<script setup>
import { ref } from 'vue';
import ModePicker from './components/ModePicker.vue';
import PracticeView from './components/PracticeView.vue';
import TutorialView from './components/TutorialView.vue';
import MultiNoteView from './components/MultiNoteView.vue';
import SongPracticeView from './components/SongPracticeView.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import StatsPanel from './components/StatsPanel.vue';
import FingeringReference from './components/FingeringReference.vue';

const TABS = [
  { id: 'practice', label: 'Practise' },
  { id: 'reference', label: 'Fingerings' },
  { id: 'stats', label: 'Progress' },
  { id: 'settings', label: 'Settings' },
];
const tab = ref('practice');

/** Selected practice mode, or null for the Practise tab's picker screen. */
const mode = ref(null);
</script>

<template>
  <div class="app">
    <header>
      <h1>Ocarina Sight Reading</h1>
      <p class="sub">12-hole Alto C</p>
    </header>

    <main>
      <ModePicker v-if="tab === 'practice' && !mode" @select="mode = $event" />

      <button v-if="tab === 'practice' && mode" class="back" @click="mode = null">
        &larr; Modes
      </button>

      <!-- PracticeView is kept alive so switching to Settings mid-session does
           not tear down the microphone and lose the streak. Every mode view
           gets the same treatment, for the same reason. -->
      <KeepAlive>
        <PracticeView v-if="tab === 'practice' && mode === 'single'" />
        <TutorialView v-else-if="tab === 'practice' && mode === 'tutorial'" />
        <MultiNoteView v-else-if="tab === 'practice' && mode === 'multi'" />
        <SongPracticeView v-else-if="tab === 'practice' && mode === 'song'" />
      </KeepAlive>

      <FingeringReference v-if="tab === 'reference'" />
      <StatsPanel v-if="tab === 'stats'" />
      <SettingsPanel v-if="tab === 'settings'" />
    </main>

    <nav>
      <button
        v-for="t in TABS"
        :key="t.id"
        :class="{ on: tab === t.id }"
        :aria-current="tab === t.id ? 'page' : undefined"
        @click="tab = t.id"
      >{{ t.label }}</button>
    </nav>
  </div>
</template>

<style scoped>
.app {
  max-width: 560px;
  margin: 0 auto;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 1rem 1rem 0;
  box-sizing: border-box;
}
header { text-align: center; margin-bottom: 1rem; }
h1 { margin: 0; font-size: 1.05rem; font-weight: 600; letter-spacing: -0.01em; }
.sub { margin: 0.1rem 0 0; font-size: 0.75rem; color: var(--ink-faint); }

main { flex: 1; padding-bottom: 1rem; }

.back {
  display: block; margin: 0 0 0.85rem; font: inherit; font-size: 0.8rem;
  padding: 0.4rem 0.7rem; cursor: pointer;
  border: 1px solid var(--line); background: var(--surface-2); color: var(--ink-dim);
  border-radius: 8px;
}

nav {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 0.35rem;
  padding: 0.5rem 0 calc(0.5rem + env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--surface) 70%, transparent);
}
nav button {
  flex: 1; font: inherit; font-size: 0.78rem; padding: 0.55rem 0.3rem;
  border: 1px solid var(--line); background: var(--surface-2); color: var(--ink-dim);
  border-radius: 8px; cursor: pointer;
}
nav button.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
</style>
