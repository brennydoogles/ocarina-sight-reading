import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WIDTHS, RAGGED_LAST_LINE, MAX_STRETCH, barWidth, packLines, justifyLine,
} from '../src/music/staffLayout.js';

/** `count` bars of `notesPerBar` notes each, indexed from 0. */
const bars = (count, notesPerBar = 4) => Array.from({ length: count }, (_, index) => ({
  notes: Array.from({ length: notesPerBar }, () => ({})),
  index,
}));
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

describe('barWidth', () => {
  it('adds the clef only to the first bar of a line', () => {
    const [, second] = bars(2);
    expect(barWidth(second, { isFirstInLine: true }) - barWidth(second, { isFirstInLine: false }))
      .toBe(DEFAULT_WIDTHS.clef);
  });

  it('adds the time signature only to the first bar of the piece', () => {
    const [first, second] = bars(2);
    expect(barWidth(first, { isFirstInLine: false }) - barWidth(second, { isFirstInLine: false }))
      .toBe(DEFAULT_WIDTHS.timeSignature);
  });

  it('grows with the number of notes', () => {
    const [sparse] = bars(1, 2);
    const [busy] = bars(1, 8);
    expect(barWidth(busy, { isFirstInLine: true }) - barWidth(sparse, { isFirstInLine: true }))
      .toBe(6 * DEFAULT_WIDTHS.perNote);
  });
});

describe('packLines', () => {
  it('fits more bars on a line as the width grows', () => {
    const piece = bars(16);
    const perLine = (width) => packLines(piece, width)[0].length;
    expect(perLine(300)).toBe(1);
    expect(perLine(1000)).toBeGreaterThan(perLine(500));
    expect(perLine(500)).toBeGreaterThan(perLine(300));
  });

  it('puts every bar on exactly one line, in order', () => {
    const piece = bars(13, 3);
    const lines = packLines(piece, 640);
    expect(lines.flat()).toEqual(piece);
  });

  it('gives every line at least one bar, even when a bar is wider than the line', () => {
    const lines = packLines(bars(3, 20), 200);
    expect(lines).toHaveLength(3);
    lines.forEach((line) => expect(line).toHaveLength(1));
  });

  it('keeps each line within the width when its bars fit', () => {
    const lines = packLines(bars(20, 4), 900);
    for (const line of lines) {
      const natural = sum(line.map((bar, i) => barWidth(bar, { isFirstInLine: i === 0 })));
      expect(natural).toBeLessThanOrEqual(900);
    }
  });

  it('returns no lines for no bars', () => {
    expect(packLines([], 500)).toEqual([]);
  });
});

describe('justifyLine', () => {
  it('stretches a line to exactly the line width', () => {
    const [line] = packLines(bars(8), 1000);
    expect(sum(justifyLine(line, 1000))).toBeCloseTo(1000, 6);
  });

  it('squeezes a bar wider than the line down to the line width', () => {
    const [line] = packLines(bars(1, 20), 200);
    expect(sum(justifyLine(line, 200))).toBeCloseTo(200, 6);
  });

  it('keeps the clef and time signature at their natural size', () => {
    const line = bars(2, 4);
    const [first, second] = justifyLine(line, 1000);
    const firstContent = first - DEFAULT_WIDTHS.clef - DEFAULT_WIDTHS.timeSignature;
    // Same note count, so the note areas are stretched to the same width.
    expect(firstContent).toBeCloseTo(second, 6);
  });

  it('leaves a short last line ragged', () => {
    const line = bars(1, 2);
    const natural = barWidth(line[0], { isFirstInLine: true });
    const lineWidth = natural / (RAGGED_LAST_LINE / 2);
    expect(justifyLine(line, lineWidth, { isLastLine: true })).toEqual([natural]);
  });

  it('still stretches a last line that is mostly full', () => {
    const line = bars(3, 4);
    const natural = sum(line.map((bar, i) => barWidth(bar, { isFirstInLine: i === 0 })));
    const lineWidth = natural / 0.8;
    expect(sum(justifyLine(line, lineWidth, { isLastLine: true }))).toBeCloseTo(lineWidth, 6);
  });

  it('stretches a short line that is not the last', () => {
    const line = bars(2, 4);
    const natural = sum(line.map((bar, i) => barWidth(bar, { isFirstInLine: i === 0 })));
    expect(sum(justifyLine(line, natural * 1.5))).toBeCloseTo(natural * 1.5, 6);
  });

  it('stops stretching note spacing at MAX_STRETCH', () => {
    const line = bars(1, 4);
    const [only] = justifyLine(line, 5000);
    const decoration = DEFAULT_WIDTHS.clef + DEFAULT_WIDTHS.timeSignature;
    const content = barWidth(line[0], { isFirstInLine: true }) - decoration;
    expect(only).toBeCloseTo(decoration + content * MAX_STRETCH, 6);
    expect(only).toBeLessThan(5000);
  });
});
