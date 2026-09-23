/**
 * Pure pitch-detection logic, deliberately free of Web Audio.
 *
 * Everything here takes a plain Float32Array of samples and returns a plain
 * object, which is what makes the synthetic-audio tests possible: they feed
 * generated sine waves straight through and assert on the result, with no
 * browser, no microphone, and no timing.
 *
 * `usePitchDetection.js` owns the AnalyserNode and rAF loop and calls in here.
 */
import { PitchDetector } from 'pitchy';
import { nearestNote } from '../music/pitch.js';
import { DETECTABLE_MIN_HZ, DETECTABLE_MAX_HZ } from '../music/notes.js';

/** Why a frame did not yield a usable note -- surfaced in the debug view. */
export const READING = Object.freeze({
  OK: 'ok',
  SILENT: 'silent',
  UNCLEAR: 'unclear',
  OUT_OF_RANGE: 'out-of-range',
});

export const DEFAULT_DETECTOR_CONFIG = Object.freeze({
  /**
   * pitchy's clarity score below which we discard the frame. An ocarina is a
   * Helmholtz resonator putting out a near-pure sine, so a real note clears
   * this comfortably; anything marginal is room noise or a fumbled breath.
   */
  clarityThreshold: 0.85,
  /** RMS noise gate, in dBFS. Below this we do not even run the detector. */
  noiseGateDb: -45,
});

/**
 * Root mean square amplitude of a frame.
 * @param {Float32Array} buffer
 * @returns {number} 0..1
 */
export function rms(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

/**
 * @param {number} amplitude linear 0..1
 * @returns {number} dBFS; -Infinity for digital silence
 */
export function toDb(amplitude) {
  return 20 * Math.log10(amplitude);
}

/**
 * pitchy allocates FFT scratch space sized to the input, so reuse one
 * detector per buffer length rather than rebuilding it every frame.
 * @type {Map<number, ReturnType<typeof PitchDetector.forFloat32Array>>}
 */
const detectorCache = new Map();

function detectorFor(length) {
  let detector = detectorCache.get(length);
  if (!detector) {
    detector = PitchDetector.forFloat32Array(length);
    detectorCache.set(length, detector);
  }
  return detector;
}

/**
 * @typedef {object} Reading
 * @property {string} status one of READING
 * @property {number|null} hz detected frequency, null unless status is OK
 * @property {number} clarity pitchy's confidence, 0..1
 * @property {number} rms linear amplitude of the frame
 * @property {number} db amplitude in dBFS
 * @property {number|null} midi nearest MIDI note, null unless status is OK
 * @property {number|null} cents deviation from that note, null unless OK
 */

/**
 * Analyse one frame of audio.
 *
 * The gates run cheapest-first, and each exists for a specific failure:
 * the noise gate stops room tone becoming phantom notes, the clarity gate
 * stops breath and key noise, and the range guard catches the octave errors
 * that are autocorrelation's characteristic mistake.
 *
 * @param {Float32Array} buffer time-domain samples
 * @param {number} sampleRate Hz
 * @param {Partial<typeof DEFAULT_DETECTOR_CONFIG>} [config]
 * @returns {Reading}
 */
export function analyseFrame(buffer, sampleRate, config = {}) {
  const { clarityThreshold, noiseGateDb } = { ...DEFAULT_DETECTOR_CONFIG, ...config };

  const level = rms(buffer);
  const db = toDb(level);
  const base = { hz: null, clarity: 0, rms: level, db, midi: null, cents: null };

  if (db < noiseGateDb) return { ...base, status: READING.SILENT };

  const [hz, clarity] = detectorFor(buffer.length).findPitch(buffer, sampleRate);

  if (!Number.isFinite(hz) || hz <= 0 || clarity < clarityThreshold) {
    return { ...base, clarity, status: READING.UNCLEAR };
  }
  if (hz < DETECTABLE_MIN_HZ || hz > DETECTABLE_MAX_HZ) {
    return { ...base, hz, clarity, status: READING.OUT_OF_RANGE };
  }

  const { midi, cents } = nearestNote(hz);
  return { status: READING.OK, hz, clarity, rms: level, db, midi, cents };
}
