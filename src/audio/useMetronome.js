import { ref, onScopeDispose } from 'vue';
import { Metronome } from './metronome.js';

/**
 * Owns the click track's Web Audio side: turns the beats `metronome.js`
 * computes into actual sound, and is the first thing in this app to ever
 * connect a node to `audioContext.destination`.
 *
 * Scheduling: a poll every SCHEDULE_INTERVAL_MS asks the (DOM-free) scheduler
 * for beats due in the next LOOK_AHEAD_SEC, then books each one with
 * `oscillator.start(exactTime)` against `audioContext.currentTime`. The poll
 * interval only decides how promptly a new beat gets QUEUED; the actual
 * playback time is locked in on the audio clock the moment it is queued, so
 * jitter in the poll (a slow tab, a GC pause) does not become audible drift
 * the way driving playback directly off setTimeout/rAF would. This is the
 * standard Web Audio scheduling pattern for exactly that reason.
 *
 * AudioContext: shared with useMicrophone.js rather than opened here --
 * pass its `context.value` (once mic.start() has resolved) to start().
 * See the comment on useMicrophone.js's return for why.
 *
 * Click sound: a short, fast-decaying blip, deliberately pitched above the
 * instrument's detectable range (see DETECTABLE_MAX_HZ in notes.js, ~1480 Hz
 * for this instrument) so that even though the mic WILL pick up the click --
 * echoCancellation is off, see useMicrophone.js -- analyseFrame() rejects it
 * as READING.OUT_OF_RANGE rather than a candidate pitch. The ~15 ms decay is
 * also far short of the matcher's sustain requirement (200 ms by default),
 * a second line of defence if the pitch ever were read as something.
 */
const SCHEDULE_INTERVAL_MS = 25;
const LOOK_AHEAD_SEC = 0.1;
const CLICK_DECAY_SEC = 0.015;
const CLICK_GAIN = 0.18;
const CLICK_HZ = 1800;
const ACCENT_CLICK_HZ = 2400;

/**
 * @param {{ bpm?: number, beatsPerBar?: number }} [options]
 */
export function useMetronome({ bpm: initialBpm = 120, beatsPerBar = 4 } = {}) {
  const running = ref(false);
  const bpm = ref(initialBpm);

  const scheduler = new Metronome({ bpm: initialBpm, beatsPerBar, lookAheadSec: LOOK_AHEAD_SEC });
  /** @type {AudioContext|null} */
  let audioContext = null;
  let timerId = null;

  function playClick(time, accented) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(accented ? ACCENT_CLICK_HZ : CLICK_HZ, time);

    // Fast decay envelope: a blip, not a sustained tone. exponentialRamp
    // cannot target exactly 0, so ramp to a value that reads as silence.
    gain.gain.setValueAtTime(CLICK_GAIN, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + CLICK_DECAY_SEC);

    osc.connect(gain).connect(audioContext.destination);
    osc.start(time);
    osc.stop(time + CLICK_DECAY_SEC + 0.005);
    // Unlike the mic's source node (see useMicrophone.js), nothing needs to
    // hold these alive past their own stop() -- a finished OscillatorNode
    // has nothing left to garbage-collect prematurely.
    osc.addEventListener('ended', () => { osc.disconnect(); gain.disconnect(); });
  }

  function scheduleTick() {
    if (!audioContext) return;
    for (const beat of scheduler.beatsDue(audioContext.currentTime)) {
      playClick(beat.time, beat.accented);
    }
  }

  /**
   * @param {AudioContext} context typically mic.context.value
   */
  function start(context) {
    if (running.value) return;
    audioContext = context;
    scheduler.setBpm(bpm.value);
    scheduler.start(audioContext.currentTime);
    running.value = true;
    scheduleTick();
    timerId = setInterval(scheduleTick, SCHEDULE_INTERVAL_MS);
  }

  function stop() {
    running.value = false;
    scheduler.stop();
    if (timerId !== null) clearInterval(timerId);
    timerId = null;
    audioContext = null;
  }

  /** Takes effect on the next scheduled beat, not retroactively -- see metronome.js. */
  function setBpm(next) {
    bpm.value = next;
    scheduler.setBpm(next);
  }

  onScopeDispose(stop);

  return { running, bpm, start, stop, setBpm };
}
