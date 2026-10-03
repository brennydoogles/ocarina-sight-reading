<script setup>
/**
 * The shared frame for every practice mode: the music, a toolbar of
 * secondary controls under it, and a sidebar (see PracticeSidebar.vue).
 *
 * Wide screens put the sidebar to the right of the music and fill the
 * height of the page, so nothing scrolls. Phones stack the three --
 * music, sidebar, toolbar -- and scroll as normal.
 */
</script>

<template>
  <div class="session-layout">
    <div class="music"><slot name="music" /></div>
    <div v-if="$slots.toolbar" class="toolbar"><slot name="toolbar" /></div>
    <aside class="sidebar" aria-label="Practice controls"><slot name="sidebar" /></aside>
  </div>
</template>

<style scoped>
.session-layout {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: "music" "sidebar" "toolbar";
}
.music {
  grid-area: music;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.75rem;
}
.toolbar {
  grid-area: toolbar;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem 1.5rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--line);
  font-size: 0.8rem;
  color: var(--ink-dim);
}
.sidebar { grid-area: sidebar; min-width: 0; }

/* Keep in step with WIDE_LAYOUT_QUERY in useMediaQuery.js. */
@media (min-width: 900px) {
  .session-layout {
    flex: 1;
    grid-template-columns: minmax(0, 1fr) 320px;
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas: "music sidebar" "toolbar sidebar";
    gap: 1rem 1.75rem;
  }
  .toolbar { justify-content: flex-start; }
  /* Only does anything on a screen too short for the page to fit, where
     <main> scrolls: the controls stay in view beside a long song. */
  .sidebar { position: sticky; top: 0; align-self: start; }
}
</style>
