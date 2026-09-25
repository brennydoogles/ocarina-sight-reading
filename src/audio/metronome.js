/**
 * Pure click-track scheduling, deliberately free of Web Audio.
 *
 * Time is passed in rather than read from a clock -- the same choice
 * matcher.js makes, for the same reason: it turns this into a deterministic
 * state machine that tests can drive with whatever numbers they like, and
 * that `useMetronome.js` drives with `audioContext.currentTime`.
 *
 * All times are in seconds, matching Web Audio's own units, so the numbers
 * this produces can be handed straight to `AudioParam`/`start()` calls with
 * no conversion.
 */

export class Metronome {
  /**
   * @param {object} [config]
   * @param {number} [config.bpm]
   * @param {number} [config.beatsPerBar] which beats are accented downbeats
   * @param {number} [config.lookAheadSec] how far past `now` beatsDue() looks
   */
  constructor({ bpm = 120, beatsPerBar = 4, lookAheadSec = 0.1 } = {}) {
    this.bpm = bpm;
    this.beatsPerBar = beatsPerBar;
    this.lookAheadSec = lookAheadSec;
    /** Time of the next not-yet-returned beat; null while stopped. */
    this.nextBeatTime = null;
    this.beatIndex = 0;
  }

  /**
   * Arm the scheduler so beat 0 (accented) lands at `now`.
   * @param {number} now seconds
   */
  start(now) {
    this.nextBeatTime = now;
    this.beatIndex = 0;
  }

  stop() {
    this.nextBeatTime = null;
    this.beatIndex = 0;
  }

  /**
   * Change tempo. Only affects beats scheduled AFTER this call -- the next
   * beat's time was already fixed when it became "next" and does not move,
   * so a change mid-run cannot land a beat in the past or skip one.
   * @param {number} bpm
   */
  setBpm(bpm) {
    this.bpm = bpm;
  }

  /**
   * Every beat time in [nextBeatTime, now + lookAheadSec), each returned
   * exactly once across however many calls it takes to pass it: repeated
   * calls with a monotonically advancing `now` sweep the whole timeline with
   * no gaps and no duplicates, which is the contract `useMetronome.js`'s
   * polling loop relies on.
   *
   * @param {number} now seconds
   * @returns {{ time: number, beatIndex: number, accented: boolean }[]}
   */
  beatsDue(now) {
    if (this.nextBeatTime === null) return [];

    const due = [];
    const horizon = now + this.lookAheadSec;
    while (this.nextBeatTime < horizon) {
      due.push({
        time: this.nextBeatTime,
        beatIndex: this.beatIndex,
        accented: this.beatIndex % this.beatsPerBar === 0,
      });
      // Read fresh each beat, so a setBpm() between calls changes the gap to
      // the NEXT beat without touching this.nextBeatTime retroactively.
      this.nextBeatTime += 60 / this.bpm;
      this.beatIndex += 1;
    }
    return due;
  }
}
