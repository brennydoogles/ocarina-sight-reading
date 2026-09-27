/**
 * Exposes `public/songs/*.abc` as a manifest the app can fetch -- a browser
 * can't list a directory, and Vite won't let JS `import` from `public/`, so
 * this is the only way the app finds out what's bundled.
 *
 * Dev and build get the manifest differently:
 * - **Dev**: a middleware answers `GET /songs/index.json` with a fresh
 *   `readdirSync` on every request. Nothing is written to disk. This is
 *   deliberate -- Vite's dev server snapshots which files exist under
 *   `public/` once, at startup, to answer static requests; a file this
 *   plugin wrote to `public/songs/` during that same startup would race
 *   that snapshot and could end up permanently invisible to it until the
 *   next restart. Answering live sidesteps that entirely, and also means a
 *   `.abc` file dropped in mid-session needs no regeneration step -- the
 *   next manifest request just sees it.
 * - **Build**: `public/` is copied into `dist/` verbatim, so the manifest
 *   has to actually exist on disk beforehand -- written once, in
 *   `buildStart`, before that copy happens.
 */
import { readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SONGS_DIR = 'songs';
const MANIFEST_FILENAME = 'index.json';

export function songsManifestPlugin() {
  let publicDir;
  let isBuild;

  function songsDirPath() {
    return join(publicDir, SONGS_DIR);
  }

  function scanManifest() {
    const dir = songsDirPath();
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => f.endsWith('.abc')).sort();
  }

  return {
    name: 'songs-manifest',
    configResolved(config) {
      publicDir = config.publicDir;
      isBuild = config.command === 'build';
    },
    buildStart() {
      if (!isBuild) return;
      const dir = songsDirPath();
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, MANIFEST_FILENAME), JSON.stringify(scanManifest()));
    },
    configureServer(server) {
      const manifestPath = `${server.config.base.replace(/\/$/, '')}/${SONGS_DIR}/${MANIFEST_FILENAME}`;
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== manifestPath) { next(); return; }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(scanManifest()));
      });
    },
  };
}
