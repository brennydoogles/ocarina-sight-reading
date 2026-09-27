import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { useSongsStore } from './stores/songs.js';
import './style.css';

createApp(App).use(createPinia()).mount('#app');

// Best-effort and non-blocking: copies in any new bundled default song from
// public/songs/ that hasn't been seeded yet. See seedFromFolder for why this
// runs once per load here rather than from the store's own setup.
useSongsStore().seedFromFolder();
