#!/usr/bin/env node
/**
 * Derives the 21 fingering diagrams from `base.svg`, the hand-drawn artwork
 * all of them share, using the hole-state table in src/music/fingerings.js.
 *
 * `base.svg` is a 1920x1080 Inkscape file whose twelve holes are <ellipse>
 * elements, each carrying an id (HOLE_META[*].elementId, e.g. "leftPointer")
 * and drawn open (`fill:#ffffff`). For each note, this script copies that
 * file and, for each of the twelve holes, flips just the `fill:` token in
 * that element's `style` attribute to `#000000` when the table says CLOSED.
 * Nothing else in the file -- geometry, stroke, the Ocarina Body path, the
 * Triforce decoration -- is touched, so a generated file is visually
 * identical to the hand-drawn naturals it sits alongside.
 *
 * These files are meant to be redrawn by hand afterwards, so by default this
 * script WILL NOT overwrite a file that already exists -- running it again is
 * safe and only fills in what is missing. Pass --force to regenerate
 * everything, discarding hand edits. Do not run --force and commit the
 * result for the 13 hand-drawn naturals -- they are the source of truth this
 * script derives from, not something it should regenerate over.
 *
 *   node scripts/render-fingerings.mjs            fill in missing files
 *   node scripts/render-fingerings.mjs --force    regenerate all
 *   node scripts/render-fingerings.mjs --check    verify, write nothing
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { FINGERINGS, HOLE_IDS, HOLE_META, HOLE_STATE } from '../src/music/fingerings.js';
import { allInstrumentNotes } from '../src/music/notes.js';
import { noteName } from '../src/music/pitch.js';
import { fingeringFileStem, FINGERING_DIR } from '../src/music/fingeringFiles.js';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', FINGERING_DIR);
const BASE_SVG_PATH = join(OUT_DIR, 'base.svg');

/** HOLE_META[*].elementId -> the HOLE_IDS key it belongs to. */
const HOLE_BY_ELEMENT_ID = new Map(HOLE_IDS.map((id) => [HOLE_META[id].elementId, id]));

/** Self-closing shape elements, which is how Inkscape writes these holes. */
const ELEMENT = /<(ellipse|circle|path|rect)\b[^>]*\/>/g;

/**
 * Flip the `fill:` token inside a style attribute, leaving everything else
 * in it -- fill-opacity, stroke, stroke-width -- untouched.
 * @param {string} elementText
 * @param {string} hex e.g. "#000000"
 * @returns {string}
 */
function setFill(elementText, hex) {
  if (!/style="[^"]*fill:#[0-9a-fA-F]{6}/.test(elementText)) {
    throw new Error(`No fill: token found to replace in element: ${elementText.slice(0, 120)}`);
  }
  return elementText.replace(/(style="[^"]*?fill:)#[0-9a-fA-F]{6}/, `$1${hex}`);
}

/**
 * @param {number} midi
 * @param {string} baseSvg contents of base.svg
 * @returns {string} the note's diagram, derived from baseSvg
 */
function render(midi, baseSvg) {
  const fingering = FINGERINGS[midi];
  const seen = new Set();

  const out = baseSvg.replace(ELEMENT, (el) => {
    const elementId = /\sid="([^"]*)"/.exec(el)?.[1];
    const hole = HOLE_BY_ELEMENT_ID.get(elementId);
    if (!hole) return el;

    seen.add(hole);
    const state = fingering[hole];
    if (state === HOLE_STATE.HALF) {
      // base.svg has no half-filled hole to derive from, and the table never
      // produces HALF today -- see fingerings.js for why. Fail loudly rather
      // than silently emitting an unrecognised third colour.
      throw new Error(`${noteName(midi)}: HOLE_STATE.HALF has no drawing to derive (hole ${hole})`);
    }
    return setFill(el, state === HOLE_STATE.CLOSED ? '#000000' : '#ffffff');
  });

  const missing = HOLE_IDS.filter((id) => !seen.has(id));
  if (missing.length) {
    throw new Error(`base.svg is missing element(s) for: ${missing.map((id) => HOLE_META[id].elementId).join(', ')}`);
  }
  return out;
}

/**
 * XML comments may not contain "--" anywhere in their body, and a file that
 * trips over it fails to parse as a whole rather than degrading. Catch it
 * here rather than in the browser.
 * @param {string} svg
 * @param {string} label
 */
function assertWellFormedComments(svg, label) {
  for (const [, body] of svg.matchAll(/<!--([\s\S]*?)-->/g)) {
    if (body.includes('--')) {
      throw new Error(`${label}: XML comment contains "--", which is not legal XML`);
    }
  }
}

// --- main ---------------------------------------------------------------
const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const checkOnly = args.has('--check');
const notes = allInstrumentNotes({ includeAccidentals: true });

if (!checkOnly) mkdirSync(OUT_DIR, { recursive: true });

const baseSvg = readFileSync(BASE_SVG_PATH, 'utf8');

const written = [];
const kept = [];
const missing = [];

for (const midi of notes) {
  const stem = fingeringFileStem(midi);
  const present = existsSync(join(OUT_DIR, `${stem}.svg`));

  if (checkOnly) {
    (present ? kept : missing).push(`${stem}.svg`);
    continue;
  }
  if (present && !force) {
    kept.push(`${stem}.svg`);
    continue;
  }
  const svg = render(midi, baseSvg);
  assertWellFormedComments(svg, `${stem}.svg`);
  writeFileSync(join(OUT_DIR, `${stem}.svg`), svg, 'utf8');
  written.push(`${stem}.svg`);
}

if (checkOnly) {
  console.log(`${kept.length}/${notes.length} fingering files present in public/${FINGERING_DIR}/`);
  if (missing.length) {
    console.error(`Missing ${missing.length}: ${missing.join(', ')}`);
    console.error('Run: npm run render:fingerings');
    process.exit(1);
  }
  process.exit(0);
}

console.log(`Wrote ${written.length} file(s) to public/${FINGERING_DIR}/`);
if (written.length) console.log(`  ${written.join(', ')}`);
if (kept.length) {
  console.log(`Left ${kept.length} existing file(s) untouched (use --force to regenerate).`);
}
