/**
 * Filenames and URLs for the bundled default songs under `public/songs/`,
 * plus the pure seeding-selection logic the songs store uses to decide
 * which of them still need adding. Kept framework- and fetch-free so it's
 * testable without a DOM or network -- see `songs.js` for the fetching and
 * storage side.
 */

/** Where the bundled .abc files (and their manifest) live, relative to the served root. */
export const SONGS_DIR = 'songs';

/** Written by vite-songs-plugin.mjs; lists every public/songs/*.abc filename. */
export const MANIFEST_FILENAME = 'index.json';

/**
 * The three tunes that used to ship as the `EXAMPLE_SONGS` array, now as
 * files under `public/songs/`. A player who already has a library from
 * before this change gets these marked seeded without being re-added --
 * see `initialSeededFilenames`.
 */
export const MIGRATED_FILENAMES = Object.freeze([
  'marys_little_lamb.abc',
  'twinkle_twinkle_little_star.abc',
  'ode_to_joy.abc',
]);

/** @param {string} [base] defaults to the Vite base URL, or '/' outside Vite */
export function songManifestUrl(base = defaultBase()) {
  return `${trimBase(base)}/${SONGS_DIR}/${MANIFEST_FILENAME}`;
}

/** @param {string} filename @param {string} [base] */
export function songFileUrl(filename, base = defaultBase()) {
  return `${trimBase(base)}/${SONGS_DIR}/${filename}`;
}

function trimBase(base) {
  return base.replace(/\/$/, '');
}

function defaultBase() {
  // import.meta.env is absent under plain Node (tests).
  return import.meta.env?.BASE_URL ?? '/';
}

/**
 * Which manifest filenames still need seeding: everything listed that isn't
 * already in `seededFilenames`. Order follows the manifest.
 * @param {string[]} manifestFilenames
 * @param {Iterable<string>} seededFilenames
 * @returns {string[]}
 */
export function filenamesNeedingSeed(manifestFilenames, seededFilenames) {
  const seeded = new Set(seededFilenames);
  return manifestFilenames.filter((f) => !seeded.has(f));
}

/**
 * The seeded set to start from when no seeded-list record has ever been
 * saved. A brand-new player -- no library either -- starts empty, so every
 * manifest file seeds normally. A player upgrading from before this
 * feature already has a library (from the old `EXAMPLE_SONGS` array), so
 * the migrated filenames are pre-marked to avoid duplicating them.
 * @param {boolean} libraryExists whether a songs library was already
 *   persisted before seeding ever ran
 * @returns {string[]}
 */
export function initialSeededFilenames(libraryExists) {
  return libraryExists ? [...MIGRATED_FILENAMES] : [];
}

/**
 * Humanizes a `.abc` filename into a fallback title, for a tune with no
 * `T:` field of its own: strip the extension, turn underscores into spaces,
 * title-case each word. `"ode_to_joy.abc"` -> `"Ode To Joy"`.
 * @param {string} filename
 * @returns {string}
 */
export function titleFromFilename(filename) {
  const stem = filename.replace(/\.abc$/i, '');
  return stem
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}
