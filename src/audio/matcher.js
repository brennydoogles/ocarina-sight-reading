/**
 * Decides whether the player has actually played the note on the staff.
 *
 * Time is passed in rather than read from a clock, so this is a deterministic
 * state machine: the composable drives it with performance.now(), and tests
 * drive it with whatever numbers they like.
 */
import { centsFromNote } from '../music/pitch.js';
import { READING } from './detector.js';

export const MATCH = Object.freeze({
  /** Nothing usable coming in. */
  WAITING: 'waiting',
  /** A note is sounding, but it is not the target. */
  WRONG: 'wrong',
  /** The target note is sounding but has not been held long enough yet. */
  HOLDING: 'holding',
  /** Held in tune for long enough. Terminal. */
  CORRECT: 'correct',
});

export const HINT_MODE = Object.freeze({
  TIMEOUT: 'timeout',
  ALWAYS: 'always',
  NEVER: 'never',
});

export const DEFAULT_MATCHER_CONFIG = Object.freeze({
  /**
   * How far out of tune still counts. 50 cents accepts anything that rounds
   * to the right note; tightening it turns the drill into an intonation
   * exercise rather than a note-recognition one.
   */
  toleranceCents: 50,
  /**
   * How long the note must stay in tolerance. Without this, a note gets
   * credited in passing while the player slides through it on the way
   * somewhere else, which teaches nothing.
   */
  sustainMs: 200,
  /** Delay before the fingering diagram appears. */
  hintTimeoutMs: 5000,
  /** See HINT_MODE. */
  hintMode: HINT_MODE.TIMEOUT,
});

/**
 * Help arrives in two stages rather than all at once: the note's NAME at this
 * fraction of the hint timeout, the fingering diagram at the end of it. Naming
 * the note is the smaller nudge -- it answers "which note is that?" and leaves
 * "how do I play it?" to the player, which is the half worth struggling with.
 */
export const NAME_HINT_FRACTION = 0.5;

export class NoteMatcher {
  /**
   * @param {number} targetMidi the note on the staff
   * @param {Partial<typeof DEFAULT_MATCHER_CONFIG>} [config]
   */
  constructor(targetMidi, config = {}) {
    this.target = targetMidi;
    this.config = { ...DEFAULT_MATCHER_CONFIG, ...config };
    this.reset(0);
  }

  /**
   * Begin (or restart) the attempt.
   * @param {number} now milliseconds, monotonic
   */
  reset(now) {
    this.startedAt = now;
    /** When the current unbroken in-tolerance stretch began; null if broken. */
    this.heldSince = null;
    this.state = MATCH.WAITING;
    /** Latched: once the hint is out, it stays out for this attempt. */
    this.hintShown = this.config.hintMode === HINT_MODE.ALWAYS;
    /** Latched likewise, and always at or before hintShown. */
    this.nameShown = this.config.hintMode === HINT_MODE.ALWAYS;
    /** Filled in when the attempt succeeds. */
    this.completedAt = null;
    /** Signed cents from the target for the most recent usable reading. */
    this.cents = null;
    /** What they played instead, when it is a recognisable note. */
    this.heardMidi = null;
  }

  /**
   * Feed in one frame's reading.
   * @param {import('./detector.js').Reading} reading
   * @param {number} now milliseconds, monotonic
   * @returns {string} the new state, one of MATCH
   */
  update(reading, now) {
    if (this.state === MATCH.CORRECT) return this.state;

    this.#updateHint(now);

    if (reading.status !== READING.OK) {
      this.heldSince = null;
      this.cents = null;
      this.heardMidi = null;
      this.state = MATCH.WAITING;
      return this.state;
    }

    // Measured against the target, not the nearest note: being a fifth off
    // must read as 700 cents, not as "0 cents off some other note".
    const cents = centsFromNote(reading.hz, this.target);
    this.cents = cents;
    this.heardMidi = reading.midi;

    if (Math.abs(cents) > this.config.toleranceCents) {
      this.heldSince = null;
      this.state = MATCH.WRONG;
      return this.state;
    }

    if (this.heldSince === null) this.heldSince = now;

    if (now - this.heldSince >= this.config.sustainMs) {
      this.completedAt = now;
      this.state = MATCH.CORRECT;
    } else {
      this.state = MATCH.HOLDING;
    }
    return this.state;
  }

  /**
   * Advance the clock without a reading -- lets the hint appear while the
   * player is silent, which is precisely when they need it.
   * @param {number} now
   */
  tick(now) {
    if (this.state !== MATCH.CORRECT) this.#updateHint(now);
  }

  #updateHint(now) {
    const { hintMode, hintTimeoutMs } = this.config;
    if (hintMode === HINT_MODE.NEVER) {
      this.hintShown = false;
      this.nameShown = false;
      return;
    }
    if (hintMode === HINT_MODE.ALWAYS) {
      this.hintShown = true;
      this.nameShown = true;
      return;
    }
    const elapsed = now - this.startedAt;
    if (!this.nameShown && elapsed >= hintTimeoutMs * NAME_HINT_FRACTION) {
      this.nameShown = true;
    }
    if (!this.hintShown && elapsed >= hintTimeoutMs) {
      this.hintShown = true;
    }
  }

  /**
   * Reveal everything immediately, for the "show me" button. The fingering
   * supersedes the name, so there is no point holding the name back.
   */
  revealHint() {
    this.hintShown = true;
    this.nameShown = true;
  }

  /**
   * Fraction of the sustain requirement met, for a progress ring.
   * @param {number} now
   * @returns {number} 0..1
   */
  holdProgress(now) {
    if (this.state === MATCH.CORRECT) return 1;
    if (this.heldSince === null) return 0;
    return Math.min(1, (now - this.heldSince) / this.config.sustainMs);
  }

  /**
   * @returns {number|null} milliseconds from start to success
   */
  get timeToCorrect() {
    return this.completedAt === null ? null : this.completedAt - this.startedAt;
  }
}
