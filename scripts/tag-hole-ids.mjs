#!/usr/bin/env node
/**
 * Gives every hole in every hand-drawn diagram a stable, descriptive id.
 *
 * The drawings are Inkscape files. Inkscape's Object Properties dialog offers
 * both an ID and a Label, and it is easy to fill in the Label thinking it is
 * the ID -- which is what happened here: all twelve holes carry a consistent
 * inkscape:label ("Left Pointer", "Right Sub", ...) but most still have
 * generated ids like "path7", and those do not line up between files.
 *
 * So the LABEL is the key, and the id is what gets written. The naming follows
 * the two ids that were set by hand (rightPinky, rightThumb): camelCase of the
 * label.
 *
 * Edits are surgical -- only the id attribute of a labelled hole element is
 * rewritten. Everything else in the file, including Inkscape's own metadata
 * and formatting, is left byte-for-byte alone.
 *
 *   node scripts/tag-hole-ids.mjs           report what would change
 *   node scripts/tag-hole-ids.mjs --write   apply it
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HOLE_META, HOLE_IDS } from '../src/music/fingerings.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fingerings', '12_hole');

/** inkscape:label -> the id to write, derived from HOLE_META. */
const BY_LABEL = new Map(HOLE_IDS.map((id) => [HOLE_META[id].artLabel, HOLE_META[id].elementId]));

/** Self-closing shape elements, which is how Inkscape writes these holes. */
const ELEMENT = /<(ellipse|circle|path|rect)\b[^>]*\/>/g;

function retag(text) {
  const changes = [];
  const seen = new Set();

  const out = text.replace(ELEMENT, (el) => {
    const label = /inkscape:label="([^"]*)"/.exec(el)?.[1];
    const wanted = label && BY_LABEL.get(label);
    if (!wanted) return el;

    seen.add(label);
    const current = /\sid="([^"]*)"/.exec(el)?.[1];
    if (current === wanted) return el;

    changes.push({ label, from: current ?? '(none)', to: wanted });
    return current === undefined
      ? el.replace(/^<(\w+)/, `<$1\n         id="${wanted}"`)
      : el.replace(/(\sid=")[^"]*(")/, `$1${wanted}$2`);
  });

  const missing = [...BY_LABEL.keys()].filter((l) => !seen.has(l));
  return { out, changes, missing };
}

const write = process.argv.includes('--write');
const files = readdirSync(DIR).filter((f) => f.endsWith('.svg')).sort();
let touched = 0;
let problems = 0;

for (const file of files) {
  const path = join(DIR, file);
  const text = readFileSync(path, 'utf8');
  const { out, changes, missing } = retag(text);

  if (missing.length) {
    console.error(`${file}: NO ELEMENT LABELLED ${missing.join(', ')} -- skipped, nothing written`);
    problems += 1;
    continue;
  }
  if (changes.length === 0) {
    console.log(`${file}: already tagged`);
    continue;
  }
  if (write) writeFileSync(path, out, 'utf8');
  touched += 1;
  console.log(`${file}: ${write ? 'set' : 'would set'} ${changes.length} id(s)`);
  for (const c of changes) console.log(`    ${c.label.padEnd(15)} ${c.from.padEnd(12)} -> ${c.to}`);
}

console.log(`\n${write ? 'Updated' : 'Would update'} ${touched} file(s).`);
if (problems) {
  console.error(`${problems} file(s) skipped -- fix the labels and re-run.`);
  process.exit(1);
}
if (!write) console.log('Re-run with --write to apply.');
