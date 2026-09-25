<script setup>
defineEmits(['select']);

const MODES = [
  {
    id: 'tutorial',
    label: 'Tutorial Mode',
    description: 'Learn each note’s fingering at your own pace.',
  },
  {
    id: 'single',
    label: 'Single Note Drills',
    description: 'Sight-read one note at a time and get instant feedback.',
  },
  {
    id: 'multi',
    label: 'Multi-Note Drills',
    description: 'Read short phrases of notes in a row.',
  },
  {
    id: 'song',
    label: 'Song Practice',
    description: 'Play through an imported tune from start to finish.',
  },
];
</script>

<template>
  <div class="picker">
    <button
      v-for="mode in MODES"
      :key="mode.id"
      class="card"
      type="button"
      @click="$emit('select', mode.id)"
    >
      <span class="label">{{ mode.label }}</span>
      <span class="description">{{ mode.description }}</span>
    </button>
  </div>
</template>

<style scoped>
.picker { display: flex; flex-direction: column; gap: 0.7rem; }
.card {
  display: flex; flex-direction: column; gap: 0.3rem; text-align: left;
  font: inherit; padding: 0.9rem 1rem; cursor: pointer;
  border: 1px solid var(--line); background: var(--surface-2); color: var(--ink);
  border-radius: 12px;
}
.card:hover { border-color: var(--accent); }
.label { font-size: 0.95rem; font-weight: 700; }
.description { font-size: 0.8rem; color: var(--ink-dim); line-height: 1.45; }
</style>
