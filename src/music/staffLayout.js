/**
 * Line layout for the multi-bar staves (SongDisplay.vue, PhraseDisplay.vue):
 * which bars share a line, and how wide each one is drawn. Pure and
 * DOM-free, so it is tested without VexFlow.
 *
 * Widths are estimates in SVG units. VexFlow's Formatter spaces the notes
 * inside each stave to fill whatever width it is given, so these only need
 * to be in the right ballpark -- what they really decide is how many bars
 * fit on a line at a given drawing width.
 */

/**
 * @typedef {{ notes: unknown[], index: number }} Bar
 *   `index` is the bar's position in the whole piece; bar 0 carries the
 *   time signature.
 * @typedef {{ base: number, perNote: number, clef: number, timeSignature: number }} BarWidths
 */

/** @type {BarWidths} */
export const DEFAULT_WIDTHS = {
  /** Per-bar padding: the barline and a little air either side. */
  base: 30,
  perNote: 26,
  /** Clef (plus key signature, where there is one), on the first bar of every line. */
  clef: 70,
  /** First bar of the piece only. */
  timeSignature: 25,
};

/** The final line of a multi-line piece is left at its natural width, rather
 *  than stretched across the page, when it would fill less than this
 *  fraction of the line. */
export const RAGGED_LAST_LINE = 0.5;

/** The most a line's note spacing is ever stretched. A short line on a wide
 *  screen stops here and ends early, rather than spreading four notes
 *  across the whole page. */
export const MAX_STRETCH = 3;

function decorationWidth(bar, isFirstInLine, widths) {
  return (isFirstInLine ? widths.clef : 0) + (bar.index === 0 ? widths.timeSignature : 0);
}

/**
 * Estimated natural width of a bar.
 * @param {Bar} bar
 * @param {{ isFirstInLine: boolean }} position
 * @param {BarWidths} [widths]
 */
export function barWidth(bar, { isFirstInLine }, widths = DEFAULT_WIDTHS) {
  return widths.base + bar.notes.length * widths.perNote + decorationWidth(bar, isFirstInLine, widths);
}

/**
 * Greedily packs bars into lines no wider than `lineWidth`. A bar wider than
 * a whole line still gets a line to itself -- every line holds at least one
 * bar -- and is squeezed to fit by justifyLine().
 * @param {Bar[]} bars
 * @param {number} lineWidth
 * @param {BarWidths} [widths]
 * @returns {Bar[][]}
 */
export function packLines(bars, lineWidth, widths = DEFAULT_WIDTHS) {
  const lines = [];
  let current = [];
  let usedWidth = 0;
  for (const bar of bars) {
    if (current.length === 0) {
      current.push(bar);
      usedWidth = barWidth(bar, { isFirstInLine: true }, widths);
      continue;
    }
    const widthIfContinuing = barWidth(bar, { isFirstInLine: false }, widths);
    if (usedWidth + widthIfContinuing <= lineWidth) {
      current.push(bar);
      usedWidth += widthIfContinuing;
    } else {
      lines.push(current);
      current = [bar];
      usedWidth = barWidth(bar, { isFirstInLine: true }, widths);
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * The width to draw each bar of `line` at so that the line spans exactly
 * `lineWidth`. Spare (or missing) space is shared in proportion to each
 * bar's note area, so clefs and time signatures keep their size and a
 * crowded bar gets more room than a sparse one. Stretching stops at
 * MAX_STRETCH, so a short line may end before `lineWidth`.
 * @param {Bar[]} line
 * @param {number} lineWidth
 * @param {{ isLastLine?: boolean, widths?: BarWidths }} [options]
 *   `isLastLine`: the final line of a piece with more than one line.
 * @returns {number[]}
 */
export function justifyLine(line, lineWidth, { isLastLine = false, widths = DEFAULT_WIDTHS } = {}) {
  const parts = line.map((bar, i) => {
    const decoration = decorationWidth(bar, i === 0, widths);
    return { decoration, content: barWidth(bar, { isFirstInLine: i === 0 }, widths) - decoration };
  });
  const natural = parts.reduce((sum, p) => sum + p.decoration + p.content, 0);
  if (isLastLine && natural < lineWidth * RAGGED_LAST_LINE) {
    return parts.map((p) => p.decoration + p.content);
  }

  const totalDecoration = parts.reduce((sum, p) => sum + p.decoration, 0);
  const totalContent = natural - totalDecoration;
  const contentScale = Math.min(MAX_STRETCH, (lineWidth - totalDecoration) / totalContent);
  if (contentScale > 0) return parts.map((p) => p.decoration + p.content * contentScale);
  // Too narrow even for the clef and time signature: shrink everything alike.
  return parts.map((p) => (p.decoration + p.content) * (lineWidth / natural));
}
