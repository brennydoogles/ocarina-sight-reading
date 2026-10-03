<script setup>
import { ref, nextTick } from 'vue';
import ModePicker from './components/ModePicker.vue';
import PracticeView from './components/PracticeView.vue';
import TutorialView from './components/TutorialView.vue';
import MultiNoteView from './components/MultiNoteView.vue';
import SongPracticeView from './components/SongPracticeView.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import StatsPanel from './components/StatsPanel.vue';
import FingeringReference from './components/FingeringReference.vue';

const TABS = [
  { id: 'practice', label: 'Practice' },
  { id: 'reference', label: 'Fingerings' },
  { id: 'stats', label: 'Progress' },
  { id: 'settings', label: 'Settings' },
];
const tab = ref('practice');

/** Arrow keys, Home and End move between tabs (the WAI-ARIA tabs pattern).
 *  Selection follows focus: switching is cheap, and every mode view is
 *  KeepAlive'd, so nothing is lost by passing through a tab. */
async function onTabKeydown(event) {
  const current = TABS.findIndex((t) => t.id === tab.value);
  const next = {
    ArrowRight: (current + 1) % TABS.length,
    ArrowLeft: (current - 1 + TABS.length) % TABS.length,
    Home: 0,
    End: TABS.length - 1,
  }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  tab.value = TABS[next].id;
  await nextTick();
  document.getElementById(`tab-${TABS[next].id}`)?.focus();
}

/** Selected practice mode, or null for the Practice tab's picker screen. */
const mode = ref(null);

const currentYear = new Date().getFullYear();
</script>

<template>
  <div class="app">
    <header>
      <h1>Ocarina Sight Reading</h1>
      <p class="sub">12-hole Alto C</p>
    </header>

    <!-- Tabs across the top on wide screens; a bottom bar on phones, moved
         there by CSS. Either way it comes before <main> in reading order. -->
    <nav aria-label="Sections">
      <div class="tabs" role="tablist" @keydown="onTabKeydown">
        <button
          v-for="t in TABS"
          :id="`tab-${t.id}`"
          :key="t.id"
          role="tab"
          :class="{ on: tab === t.id }"
          :aria-selected="tab === t.id"
          aria-controls="main-panel"
          :tabindex="tab === t.id ? 0 : -1"
          @click="tab = t.id"
        >{{ t.label }}</button>
      </div>
    </nav>

    <main id="main-panel" role="tabpanel" :aria-labelledby="`tab-${tab}`" tabindex="0">
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

      <footer>
        Copyright Brendon Dugan {{ currentYear }}
        <a href="https://www.brendondugan.com">www.brendondugan.com</a>
      </footer>
    </main>
  </div>
</template>

<style scoped>
/*
 * The shell spans the whole window so that, on wide screens, <main> can be
 * the scroll container with its scrollbar at the window's edge; the content
 * is centered within it by padding rather than by a max-width box.
 */
.app {
  --shell-width: 1400px;
  --gutter: max(1rem, calc((100% - var(--shell-width)) / 2 + 1rem));
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}
header {
  text-align: center;
  padding: max(1rem, env(safe-area-inset-top)) var(--gutter) 0;
  margin-bottom: 1rem;
}
h1 { margin: 0; font-size: 1.05rem; font-weight: 600; letter-spacing: -0.01em; }
.sub { margin: 0.1rem 0 0; font-size: 0.75rem; color: var(--ink-faint); }

main {
  order: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 var(--gutter) 1rem;
}

.back {
  align-self: flex-start; margin: 0 0 0.85rem; font: inherit; font-size: 0.8rem;
  padding: 0.4rem 0.7rem; cursor: pointer;
  border: 1px solid var(--line); background: var(--surface-2); color: var(--ink-dim);
  border-radius: 8px;
}

footer {
  margin-top: auto;
  padding-top: 1.5rem;
  text-align: center;
  font-size: 0.7rem;
  color: var(--ink-faint);
}
footer a { color: inherit; }

/* Phones: a sticky bottom bar of filled buttons, in thumb reach. */
nav {
  order: 2;
  position: sticky;
  bottom: 0;
  padding: 0.5rem var(--gutter) calc(0.5rem + env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--surface) 70%, transparent);
}
.tabs { display: flex; gap: 0.35rem; }
.tabs button {
  flex: 1; font: inherit; font-size: 0.78rem; padding: 0.55rem 0.3rem;
  border: 1px solid var(--line); background: var(--surface-2); color: var(--ink-dim);
  border-radius: 8px; cursor: pointer;
}
.tabs button.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }

/* Wide screens: underline tabs under the title, and the page itself never
   scrolls -- the practice screens fill exactly the height left for <main>,
   and anything taller (a long song library, a short window) scrolls inside
   <main>, so the tabs stay put. Keep in step with WIDE_LAYOUT_QUERY in
   components/useMediaQuery.js. */
@media (min-width: 900px) {
  .app { height: 100dvh; }
  header { margin-bottom: 0.5rem; }
  nav {
    order: 0;
    position: static;
    margin-bottom: 1rem;
    padding: 0 var(--gutter);
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }
  .tabs { gap: 0.25rem; }
  .tabs button {
    flex: none;
    margin-bottom: -1px;
    padding: 0.6rem 1rem;
    font-size: 0.85rem;
    background: none;
    border: none;
    border-bottom: 2.5px solid transparent;
    border-radius: 0;
  }
  .tabs button:hover { color: var(--ink); }
  .tabs button.on {
    background: none;
    color: var(--ink);
    border-bottom-color: var(--accent);
  }
  main { min-height: 0; overflow-y: auto; }
}
</style>
