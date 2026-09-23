/**
 * Loads hand-drawn fingering diagrams from public/fingerings/.
 *
 * The files are fetched and inlined into the DOM rather than used as <img>
 * sources, for two reasons: the app's theme custom properties cascade into
 * inlined SVG (so a redrawn diagram that keeps var(--ink) still follows
 * light/dark), and a broken or missing file can be reported precisely instead
 * of rendering as a silent broken image.
 */
import { fingeringFileStem, fingeringFileUrl } from './fingeringFiles.js';

/** midi -> Promise<SVGElement>. Each note is fetched at most once per session. */
const cache = new Map();

/**
 * Attributes that would let a diagram file run code once inlined. These are
 * first-party files, but inlining is the one place where that assumption
 * becomes load-bearing, so strip the obvious vectors rather than rely on it.
 */
function sanitise(svg) {
  for (const el of svg.querySelectorAll('script, foreignObject')) el.remove();
  for (const el of [svg, ...svg.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || (name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:'))) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return svg;
}

/**
 * @param {string} stem
 * @returns {Promise<SVGElement|null>} null when the file is absent; throws
 *   when it is present but unusable, so the two are reported differently.
 */
async function fetchStem(stem) {
  const response = await fetch(fingeringFileUrl(stem));
  if (!response.ok) return null;

  // A dev server falls back to index.html for unknown paths and answers 200,
  // so "not ok" is not enough to tell a missing file from a real one. An HTML
  // body here means the file is absent, not malformed.
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('html')) return null;

  const text = await response.text();
  if (/^\s*<!doctype html/i.test(text)) return null;

  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new FingeringError('invalid', stem, firstLineOf(parseError.textContent));
  }
  const svg = doc.documentElement;
  if (svg.tagName.toLowerCase() !== 'svg') {
    throw new FingeringError('invalid', stem, 'the root element is not <svg>');
  }
  return sanitise(svg);
}

function firstLineOf(text) {
  return (text ?? '').trim().split('\n')[0] || 'the file could not be parsed';
}

/** Carries the filename and the kind of failure, so the UI can phrase it. */
export class FingeringError extends Error {
  /**
   * @param {'missing'|'invalid'} code
   * @param {string} stem file stem, without the .svg
   * @param {string} [detail]
   */
  constructor(code, stem, detail) {
    super(code === 'missing'
      ? 'No diagram file for this note'
      : `Diagram file is not valid SVG — ${detail}`);
    this.name = 'FingeringError';
    this.code = code;
    this.stem = stem;
  }
}

/**
 * Fetch the diagram for a note.
 *
 * @param {number} midi
 * @returns {Promise<SVGElement>} a detached SVG element, ready to clone
 * @throws {FingeringError} naming the file it looked for, if it is not usable
 */
export function loadFingeringSvg(midi) {
  if (!cache.has(midi)) {
    cache.set(midi, resolve(midi).catch((err) => {
      // Do not cache failures: the point of this app is that the user is
      // actively adding and redrawing these files, and a reload should pick
      // up a file that has just appeared.
      cache.delete(midi);
      throw err;
    }));
  }
  return cache.get(midi);
}

async function resolve(midi) {
  const stem = fingeringFileStem(midi);
  const svg = await fetchStem(stem);
  if (!svg) throw new FingeringError('missing', stem);
  return svg;
}

/** Drop cached diagrams so edited files are picked up without a full reload. */
export function clearFingeringCache() {
  cache.clear();
}
