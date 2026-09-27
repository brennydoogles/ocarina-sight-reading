import { defineStore } from 'pinia';
import { ref } from 'vue';
import { validateSong } from '../music/abc.js';
import {
  songManifestUrl, songFileUrl, filenamesNeedingSeed, initialSeededFilenames, titleFromFilename,
} from '../music/songFiles.js';

const STORAGE_KEY = 'ocarina.songs.v1';
const SEEDED_KEY = 'ocarina.songs.seeded.v1';

/**
 * The song library: user-entered ABC tunes, persisted to `localStorage` since
 * this app has no backend. `add`/`update` do not validate -- that is
 * `validateSong`'s job (see src/music/abc.js) and the UI's to enforce before
 * ever calling these; this store just stores what it's given.
 *
 * The library starts empty (or however it was left) on its own -- it is
 * `seedFromFolder` that copies in the bundled default songs from
 * `public/songs/`. That runs separately, once per app load (see
 * `main.js`), rather than from this store's own setup, so merely
 * instantiating the store -- as every test does -- never fires a fetch.
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
      if (raw === null) return; // a true first run -- nothing has ever been saved here
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

  /** @returns {string[]|null} the saved seeded-filenames list, or null if none has ever been saved (or it's unreadable) */
  function loadSeededRaw() {
    try {
      const raw = localStorage.getItem(SEEDED_KEY);
      if (raw === null) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /** @param {Set<string>} seeded */
  function persistSeeded(seeded) {
    try {
      localStorage.setItem(SEEDED_KEY, JSON.stringify([...seeded]));
    } catch {
      // Private browsing, quota, etc. -- seeding just runs again next load.
    }
  }

  function libraryAlreadyExists() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Copies in any bundled default song (`public/songs/*.abc`) not yet
   * seeded: fetches the manifest, fetches and validates each new file, and
   * adds the valid ones as ordinary songs -- editable and deletable from
   * then on, and never re-added once deleted, since a filename is marked
   * seeded the moment it's added.
   *
   * Best-effort and never throws: offline, a missing manifest, or a single
   * file failing to fetch or validate just leaves that part of the library
   * as-is for next time. An invalid file is skipped with a console warning
   * naming it and its first issue, and is NOT marked seeded, so fixing the
   * file makes it appear next load.
   * @param {{ fetchImpl?: typeof fetch, validate?: typeof validateSong }} [deps]
   *   injected for testing; default to the real `fetch` and `validateSong`
   */
  async function seedFromFolder({ fetchImpl = fetch, validate = validateSong } = {}) {
    let manifest;
    try {
      const res = await fetchImpl(songManifestUrl());
      if (!res.ok) return;
      manifest = await res.json();
    } catch {
      return; // offline, or the manifest isn't there yet -- try again next load
    }
    if (!Array.isArray(manifest)) return;

    const seeded = new Set(loadSeededRaw() ?? initialSeededFilenames(libraryAlreadyExists()));
    persistSeeded(seeded); // durable even if nothing below needs seeding this run

    for (const filename of filenamesNeedingSeed(manifest, seeded)) {
      let abc;
      try {
        const res = await fetchImpl(songFileUrl(filename));
        if (!res.ok) continue;
        abc = await res.text();
      } catch {
        continue; // this file specifically failed; still try the rest
      }

      const result = await validate(abc);
      if (!result.valid) {
        console.warn(`Skipping bundled song "${filename}": ${result.issues[0]?.message ?? 'failed to validate'}`);
        continue;
      }

      add({ title: result.title || titleFromFilename(filename), abc });
      seeded.add(filename);
      persistSeeded(seeded);
    }
  }

  load();

  return {
    songs, add, update, remove, exportJson, importJson, seedFromFolder,
  };
});
