/**
 * Drives a phrase: an ordered list of target notes, played one at a time.
 *
 * `NoteMatcher` (matcher.js) is pinned by test/matcher.test.js and is not to
 * be changed -- this wraps it rather than touching it, owning exactly one
 * `NoteMatcher` at a time and swapping in the next target when the current
 * one lands MATCH.CORRECT.
 *
 * Wrong-note rule: a wrong note does not advance the sequence and does not
 * fail it. This falls out of just delegating to `NoteMatcher`, which already
 * treats MATCH.WRONG as something to recover from, not a terminal state --
 * consistent with every other drill in this app, where there is no penalty
 * and an exercise only ever ends in success or a skip.
 *
 * Pure and DOM-free, like matcher.js: time is passed in, not read from a
 * clock, so this is as deterministic and testable as the thing it wraps.
 */
import { NoteMatcher, MATCH } from './matcher.js';

export class SequenceMatcher {
  /**
   * @param {number[]} targets MIDI numbers, in order
   * @param {Partial<import('./matcher.js').DEFAULT_MATCHER_CONFIG>} [config]
   */
  constructor(targets, config = {}) {
    this.targets = targets;
    this.config = config;
    /** Index of the note currently being played. Stops advancing at length. */
    this.index = 0;
    /** One record per note landed correctly: `{ midi, ms, hinted }`. */
    this.completed = [];
    /** @type {NoteMatcher|null} */
    this.matcher = null;
    this.reset(0);
  }

  /** True once every target has been played correctly. */
  get done() {
    return this.index >= this.targets.length;
  }

  get length() {
    return this.targets.length;
  }

  /**
   * (Re)starts the sequence from the first target.
   * @param {number} now milliseconds, monotonic
   */
  reset(now) {
    this.index = 0;
    this.completed = [];
    this.#arm(now);
  }

  #arm(now) {
    if (this.done) return; // nothing to arm; `matcher` keeps the finished one
    this.matcher = new NoteMatcher(this.targets[this.index], this.config);
    this.matcher.reset(now);
  }

  /**
   * Feed in one frame's reading. Once the phrase is done, this is a no-op
   * that keeps returning the last (CORRECT) state -- callers are expected to
   * stop calling once `done` is true, same as the single-note matcher's
   * MATCH.CORRECT latch.
   * @param {import('./detector.js').Reading} reading
   * @param {number} now milliseconds, monotonic
   * @returns {string} one of MATCH
   */
  update(reading, now) {
    // An empty phrase is "done" with no matcher ever armed -- nothing to
    // report but CORRECT, since there was nothing left to get wrong either.
    if (this.done) return this.matcher?.state ?? MATCH.CORRECT;

    const state = this.matcher.update(reading, now);
    if (state === MATCH.CORRECT) {
      this.completed.push({
        midi: this.matcher.target,
        ms: this.matcher.timeToCorrect ?? 0,
        hinted: this.matcher.hintShown,
      });
      this.index += 1;
      this.#arm(now); // no-op once done, leaving the finished matcher in place
    }
    return state;
  }

  /**
   * Advance the clock without a reading, so a hint can appear on the current
   * note while the player is silent.
   * @param {number} now
   */
  tick(now) {
    if (!this.done) this.matcher.tick(now);
  }

  /** Reveal the current note's hint immediately, for the "show me" button. */
  revealHint() {
    if (!this.done) this.matcher.revealHint();
  }

  /**
   * Skip the current note without crediting it -- no different from playing
   * a single-note drill's "Skip", extended to one note within the phrase.
   * @param {number} now
   */
  skip(now) {
    if (this.done) return;
    this.index += 1;
    this.#arm(now);
  }
}
