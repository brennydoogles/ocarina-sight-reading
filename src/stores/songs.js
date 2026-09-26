import { defineStore } from 'pinia';
import { ref } from 'vue';

const STORAGE_KEY = 'ocarina.songs.v1';

/**
 * Two or three short public-domain tunes, so Song Practice isn't an empty
 * library on first open. All three sit in C5-A5 -- comfortably inside the
 * instrument's A4-F6 -- and use nothing `validateSong` would object to.
 */
const EXAMPLE_SONGS = [
  {
    title: 'Mary Had a Little Lamb',
    abc: 'X:1\nT:Mary Had a Little Lamb\nM:4/4\nL:1/4\nQ:1/4=100\nK:C\n'
      + 'e d c d | e e e2 | d d d2 | e g g2 |\n'
      + 'e d c d | e e e e | d d e d | c4 |]\n',
  },
  {
    title: 'Twinkle, Twinkle, Little Star',
    abc: 'X:1\nT:Twinkle, Twinkle, Little Star\nM:4/4\nL:1/4\nQ:1/4=100\nK:C\n'
      + 'c c g g | a a g2 | f f e e | d d c2 |\n'
      + 'g g f f | e e d2 | g g f f | e e d2 |\n'
      + 'c c g g | a a g2 | f f e e | d d c2 |]\n',
  },
  {
    title: "Ode to Joy",
    abc: "X:1\nT:Ode to Joy\nM:4/4\nL:1/4\nQ:1/4=100\nK:C\n"
      + 'e e f g | g f e d | c c d e | e2 d2 |\n'
      + 'e e f g | g f e d | c c d e | d2 c2 |]\n',
  },
];

/**
 * The song library: user-entered ABC tunes, persisted to `localStorage` since
 * this app has no backend. `add`/`update` do not validate -- that is
 * `validateSong`'s job (see src/music/abc.js) and the UI's to enforce before
 * ever calling these; this store just stores what it's given.
 */
export const useSongsStore = defineStore('songs', () => {
  /** @type {import('vue').Ref<{id: string, title: string, abc: string, addedAt: number}[]>} */
  const songs = ref([]);

  function makeId() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `song-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * @param {{ title: string, abc: string }} fields
   * @returns {object} the stored song, with its assigned id and date
   */
  function add({ title, abc }) {
    const song = { id: makeId(), title: title?.trim() || 'Untitled', abc, addedAt: Date.now() };
    songs.value = [...songs.value, song];
    persist();
    return song;
  }

  /** @param {string} id @param {{ title: string, abc: string }} fields */
  function update(id, { title, abc }) {
    songs.value = songs.value.map((s) => (s.id === id ? { ...s, title: title?.trim() || 'Untitled', abc } : s));
    persist();
  }

  /** @param {string} id */
  function remove(id) {
    songs.value = songs.value.filter((s) => s.id !== id);
    persist();
  }

  /** The only backup a player has, since there is no account or sync. */
  function exportJson() {
    return JSON.stringify({ version: 1, songs: songs.value }, null, 2);
  }

  /**
   * Adds every song from a previously exported library, each under a fresh
   * id -- an import never collides with, or silently overwrites, what's
   * already here.
   * @param {string} json
   * @returns {number} how many songs were imported
   * @throws {Error} if `json` is not a recognisable export
   */
  function importJson(json) {
    const parsed = JSON.parse(json);
    const incoming = Array.isArray(parsed) ? parsed : parsed?.songs;
    if (!Array.isArray(incoming)) throw new Error('That file is not a song library export.');
    const additions = incoming
      .filter((s) => s && typeof s.abc === 'string')
      .map((s) => ({ id: makeId(), title: (s.title ?? '').trim() || 'Untitled', abc: s.abc, addedAt: Date.now() }));
    songs.value = [...songs.value, ...additions];
    persist();
    return additions.length;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        // A true first run -- nothing has ever been saved here. A library
        // the player has deliberately emptied persists as "[]", which is
        // NOT this case, so deleting every song does not bring the
        // examples back.
        songs.value = EXAMPLE_SONGS.map((s) => ({ ...s, id: makeId(), addedAt: Date.now() }));
        persist();
        return;
      }
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) songs.value = saved;
    } catch {
      // Corrupt or unavailable storage is not worth failing startup over.
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(songs.value));
    } catch {
      // Private browsing, quota, etc. The library simply does not survive reload.
    }
  }

  load();

  return {
    songs, add, update, remove, exportJson, importJson,
  };
});
