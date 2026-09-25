/**
 * The four practice modes, shared between the modes store (per-mode options)
 * and the session store (per-mode stats) so the two never drift apart on
 * what a "mode" is.
 */

/** In the style of MATCH / HINT_MODE / READING: a frozen enum, not loose strings. */
export const PRACTICE_MODE = Object.freeze({
  TUTORIAL: 'tutorial',
  SINGLE: 'single',
  MULTI: 'multi',
  SONG: 'song',
});

/** Same set, as an ordered array -- handy for iterating (e.g. a picker or a table). */
export const PRACTICE_MODES = Object.freeze(Object.values(PRACTICE_MODE));

/** Display label for each mode, for anywhere that lists them by name. */
export const PRACTICE_MODE_LABELS = Object.freeze({
  [PRACTICE_MODE.TUTORIAL]: 'Tutorial Mode',
  [PRACTICE_MODE.SINGLE]: 'Single Note Drills',
  [PRACTICE_MODE.MULTI]: 'Multi-Note Drills',
  [PRACTICE_MODE.SONG]: 'Song Practice',
});
