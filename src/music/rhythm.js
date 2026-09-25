/**
 * Rhythm generation, kept deliberately separate from pitch generation (see
 * phrases.js) so either can change without touching the other.
 *
 * Works in eighth notes as the atomic unit -- VexFlow's 'w'/'h'/'q'/'8' are
 * 8/4/2/1 eighths respectively -- because a bar in any of the time
 * signatures this app cares about is a whole number of eighths.
 */

const EIGHTHS = [1, 2, 4, 8];
const DURATION_FOR_EIGHTHS = { 1: '8', 2: 'q', 4: 'h', 8: 'w' };
/** Favour short notes; a whole bar's worth in one note is a rare event. */
const EIGHTHS_WEIGHT = { 1: 45, 2: 35, 4: 15, 8: 5 };

/**
 * Whether `remaining` eighths can be split into exactly `notes` parts, each
 * one of EIGHTHS. Memoised because the same (remaining, notes) pair recurs
 * constantly while filling a bar.
 */
function canFill(remaining, notes, memo) {
  if (notes === 0) return remaining === 0;
  const key = remaining * 1000 + notes;
  if (memo.has(key)) return memo.get(key);
  const ok = EIGHTHS.some((d) => d <= remaining && canFill(remaining - d, notes - 1, memo));
  memo.set(key, ok);
  return ok;
}

/** Smallest number of notes that can exactly fill a bar of `budget` eighths. */
function minNotesForBar(budget, memo) {
  for (let notes = 1; notes <= budget; notes += 1) {
    if (canFill(budget, notes, memo)) return notes;
  }
  return budget; // budget eighth notes always fills it
}

/**
 * Picks how many bars to spread `length` notes across. Prefers whichever
 * feasible count puts the average notes-per-bar closest to `idealPerBar` --
 * the minimum feasible count alone tends to pack every slot as tight as
 * possible, which forces eighth notes throughout instead of a mix.
 */
function chooseNumBars(length, minPerBar, maxPerBar, idealPerBar) {
  let best = null;
  let bestScore = Infinity;
  for (let numBars = 1; numBars <= length; numBars += 1) {
    if (minPerBar * numBars > length) break; // the lower bound only grows from here
    if (length > maxPerBar * numBars) continue; // not enough bars yet for this length
    const score = Math.abs(length / numBars - idealPerBar);
    if (score < bestScore) { bestScore = score; best = numBars; }
  }
  return best ?? Math.max(1, Math.ceil(length / maxPerBar));
}

/**
 * How many notes go in each of `numBars` bars, so they sum to exactly
 * `totalNotes`. Distributes as evenly as possible, then repairs any bar left
 * short of the minimum a bar can hold.
 */
function splitNotesAcrossBars(totalNotes, numBars, minPerBar) {
  const counts = new Array(numBars).fill(Math.floor(totalNotes / numBars));
  let extra = totalNotes % numBars;
  for (let i = 0; extra > 0; i = (i + 1) % numBars, extra -= 1) counts[i] += 1;

  for (let i = 0; i < numBars; i += 1) {
    while (counts[i] < minPerBar) {
      const donor = counts.findIndex((c, j) => j !== i && c > minPerBar);
      if (donor === -1) break; // nothing left to borrow; caller's numBars was too tight
      counts[donor] -= 1;
      counts[i] += 1;
    }
  }
  return counts;
}

/** Fills one bar of `budget` eighths with exactly `notes` durations. */
function fillBar(budget, notes, random, memo) {
  const eighths = [];
  let remaining = budget;
  let left = notes;
  while (left > 0) {
    let options = EIGHTHS.filter((d) => d <= remaining && canFill(remaining - d, left - 1, memo));
    // A caller can ask for a note count too small to fill this bar exactly
    // with no dotted durations (e.g. one note in 3/4) -- fall back to the
    // largest duration that still fits rather than produce nothing.
    if (options.length === 0) options = EIGHTHS.filter((d) => d <= remaining);
    if (options.length === 0) options = [1];
    const total = options.reduce((sum, d) => sum + EIGHTHS_WEIGHT[d], 0);
    let r = random() * total;
    let chosen = options[options.length - 1];
    for (const d of options) {
      r -= EIGHTHS_WEIGHT[d];
      if (r <= 0) { chosen = d; break; }
    }
    eighths.push(chosen);
    remaining -= chosen;
    left -= 1;
  }
  return eighths;
}

/**
 * Generates VexFlow duration codes for `length` notes, summing to a whole
 * number of bars in the given time signature.
 * @param {object} options
 * @param {number} options.length number of notes to assign a duration to
 * @param {number} [options.beatsPerBar] time signature numerator, in quarters
 * @param {() => number} [options.random] injectable for deterministic tests
 * @returns {string[]} VexFlow duration codes ('w' | 'h' | 'q' | '8'), one per note
 */
export function generateRhythm({ length, beatsPerBar = 4, random = Math.random }) {
  if (length <= 0) return [];

  const budget = beatsPerBar * 2; // eighths per bar
  const memo = new Map();
  const minPerBar = minNotesForBar(budget, memo);
  const maxPerBar = budget; // an eighth note per slot always fits
  // A mid-density target -- enough notes per bar to leave room for quarters
  // and halves alongside eighths, rather than packing bars edge to edge.
  const idealPerBar = Math.max(minPerBar, Math.round(budget * (2 / 3)));

  const numBars = chooseNumBars(length, minPerBar, maxPerBar, idealPerBar);
  const perBar = splitNotesAcrossBars(length, numBars, minPerBar);
  const eighths = perBar.flatMap((notes) => fillBar(budget, notes, random, memo));
  return eighths.map((d) => DURATION_FOR_EIGHTHS[d]);
}
