import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import {
  fingeringFileStem, fingeringFileUrl, FINGERING_DIR, INSTRUMENT_KEY,
} from '../src/music/fingeringFiles.js';
import { allInstrumentNotes } from '../src/music/notes.js';
import { noteName, midiFromName, isNatural } from '../src/music/pitch.js';
import { HOLE_IDS, HOLE_META, HOLE_STATE, FINGERINGS } from '../src/music/fingerings.js';

const DIR = join(process.cwd(), 'public', FINGERING_DIR);

describe('file naming', () => {
  it('namespaces diagrams by instrument', () => {
    expect(INSTRUMENT_KEY).toBe('12_hole');
    expect(FINGERING_DIR).toBe('fingerings/12_hole');
  });

  it('names naturals after the note', () => {
    expect(fingeringFileStem(midiFromName('A4'))).toBe('A4');
    expect(fingeringFileStem(midiFromName('C5'))).toBe('C5');
    expect(fingeringFileStem(midiFromName('F6'))).toBe('F6');
  });

  it('refuses accidentals, which have no diagram by design', () => {
    for (const name of ['A#4', 'C#5', 'D#5', 'D#6']) {
      expect(() => fingeringFileStem(midiFromName(name)), name).toThrow(/naturals only/);
    }
  });

  it('never produces a "#", which would break the URL', () => {
    for (const midi of allInstrumentNotes()) {
      expect(fingeringFileStem(midi)).not.toContain('#');
    }
  });

  it('only names naturals', () => {
    expect(allInstrumentNotes().every(isNatural)).toBe(true);
    expect(allInstrumentNotes()).toHaveLength(13);
  });

  it('gives every note a distinct filename', () => {
    const stems = allInstrumentNotes().map(fingeringFileStem);
    expect(new Set(stems).size).toBe(stems.length);
  });

  it('builds a URL under the deploy base', () => {
    expect(fingeringFileUrl('C5', '/')).toBe('/fingerings/12_hole/C5.svg');
    expect(fingeringFileUrl('A4', '/ocarina/')).toBe('/ocarina/fingerings/12_hole/A4.svg');
  });
});

describe('the diagram files on disk', () => {
  it('exist for every note the app drills', () => {
    const missing = allInstrumentNotes().filter(
      (midi) => !existsSync(join(DIR, `${fingeringFileStem(midi)}.svg`)));
    expect(missing.map(noteName)).toEqual([]);
  });

  it('holds no file named after a note the app does not drill', () => {
    // Files whose names do not look like notes at all -- base.svg and other
    // hand-made templates -- are the author's working material and ignored.
    // A note-SHAPED name that is not one we drill is a mistake: a leftover
    // accidental, or a typo'd rename like D7.svg.
    const expected = new Set(allInstrumentNotes().map(fingeringFileStem));
    const NOTE_SHAPED = /^[A-G](flat|sharp|#|b)?-?\d$/;
    const strays = readdirSync(DIR)
      .filter((f) => f.endsWith('.svg'))
      .map((f) => f.replace(/\.svg$/, ''))
      .filter((stem) => NOTE_SHAPED.test(stem) && !expected.has(stem));
    expect(strays).toEqual([]);
  });

  it('parse as well-formed XML', () => {
    // Parsed for real, not regex-matched. SVG is XML, so a stray "--" inside a
    // comment or an unescaped "&" takes the whole file down -- and the browser
    // is a poor place to discover that.
    for (const midi of allInstrumentNotes()) {
      expect(() => parse(midi), `${noteName(midi)} is not well-formed XML`).not.toThrow();
    }
  });

  it('have an <svg> root with a viewBox', () => {
    for (const midi of allInstrumentNotes()) {
      const root = parse(midi).window.document.documentElement;
      expect(root.tagName.toLowerCase(), noteName(midi)).toBe('svg');
      expect(root.getAttribute('viewBox'), noteName(midi)).toBeTruthy();
    }
  });

  it('keep "--" out of XML comments, which is illegal and unparseable', () => {
    for (const midi of allInstrumentNotes()) {
      for (const [, body] of read(midi).matchAll(/<!--([\s\S]*?)-->/g)) {
        expect(body, `${noteName(midi)} has an illegal XML comment`).not.toContain('--');
      }
    }
  });

  /*
   * The diagrams are hand-drawn, so nothing forces them to agree with the
   * fingering table -- and a diagram that disagrees teaches the wrong
   * fingering, which is worse than having no diagram at all. These tests close
   * that gap using what the artwork already provides: every hole carries an id
   * (see scripts/tag-hole-ids.mjs) and is filled black when covered, white when
   * open.
   */

  /**
   * How the artwork encodes hole state. Change this if the palette changes;
   * an unrecognised fill fails loudly rather than being guessed at.
   */
  const FILL_STATE = { '#000000': HOLE_STATE.CLOSED, '#ffffff': HOLE_STATE.OPEN };

  const holeElement = (doc, hole) => doc.getElementById(HOLE_META[hole].elementId);

  function fillOf(el) {
    const style = el.getAttribute('style') ?? '';
    return (/(?:^|;)\s*fill\s*:\s*([^;]+)/.exec(style)?.[1] ?? el.getAttribute('fill') ?? '')
      .trim().toLowerCase();
  }

  it('give every hole an id, so a hole can be found rather than counted', () => {
    for (const midi of allInstrumentNotes()) {
      const doc = parse(midi).window.document;
      const missing = HOLE_IDS.filter((h) => !holeElement(doc, h));
      expect(missing.map((h) => HOLE_META[h].elementId), `${noteName(midi)} is missing holes`)
        .toEqual([]);
    }
  });

  it('use ids that are unique within a file', () => {
    for (const midi of allInstrumentNotes()) {
      const text = read(midi);
      for (const hole of HOLE_IDS) {
        const id = HOLE_META[hole].elementId;
        const count = text.split(`id="${id}"`).length - 1;
        expect(count, `${noteName(midi)} has ${count} elements with id="${id}"`).toBe(1);
      }
    }
  });

  it('fill every hole with a colour that means something', () => {
    for (const midi of allInstrumentNotes()) {
      const doc = parse(midi).window.document;
      for (const hole of HOLE_IDS) {
        const fill = fillOf(holeElement(doc, hole));
        expect(
          FILL_STATE[fill],
          `${noteName(midi)} ${HOLE_META[hole].elementId} has fill "${fill}", which is neither covered nor open`,
        ).toBeDefined();
      }
    }
  });

  it('draw each hole in the state the fingering table calls for', () => {
    for (const midi of allInstrumentNotes()) {
      const doc = parse(midi).window.document;
      for (const hole of HOLE_IDS) {
        const drawn = FILL_STATE[fillOf(holeElement(doc, hole))];
        expect(
          drawn,
          `${noteName(midi)}: ${HOLE_META[hole].elementId} is drawn ${drawn}, table says ${FINGERINGS[midi][hole]}`,
        ).toBe(FINGERINGS[midi][hole]);
      }
    }
  });

  it('contain no scripting', () => {
    for (const midi of allInstrumentNotes()) {
      const text = read(midi);
      expect(text, noteName(midi)).not.toMatch(/<script[\s>]/i);
      expect(text, noteName(midi)).not.toMatch(/\son\w+\s*=/i);
    }
  });
});

function read(midi) {
  return readFileSync(join(DIR, `${fingeringFileStem(midi)}.svg`), 'utf8');
}

/** Parse a diagram as XML, the way the browser's DOMParser will. */
function parse(midi) {
  return new JSDOM(read(midi), { contentType: 'image/svg+xml' });
}
