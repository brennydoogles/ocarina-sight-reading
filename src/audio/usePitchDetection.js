import { ref, shallowRef, onScopeDispose } from 'vue';
import { analyseFrame, READING } from './detector.js';

const IDLE_READING = Object.freeze({
  status: READING.SILENT,
  hz: null, clarity: 0, rms: 0, db: -Infinity, midi: null, cents: null,
});

/**
 * Runs the detector on every animation frame and exposes the latest reading.
 *
 * rAF rather than an AudioWorklet: a 2048-sample window at 48 kHz is ~43 ms of
 * audio, roughly 19 periods of A4 and 60 of F6 -- far more than the McLeod
 * method needs -- and one autocorrelation per frame is cheap. rAF also pauses
 * when the screen sleeps, which is the behaviour we want anyway.
 *
 * @param {ReturnType<typeof import('./useMicrophone.js').useMicrophone>} mic
 * @param {() => object} getConfig detector config, read fresh each frame so
 *   settings changes take effect without restarting the loop
 */
export function usePitchDetection(mic, getConfig = () => ({})) {
  const reading = ref(IDLE_READING);
  const running = ref(false);
  const frameHandle = shallowRef(null);
  /** Called with (reading, timestamp) every frame while running. */
  let onFrame = null;

  function loop(timestamp) {
    if (!running.value) return;
    const frame = mic.readFrame();
    reading.value = frame
      ? analyseFrame(frame, mic.sampleRate.value, getConfig())
      : IDLE_READING;
    onFrame?.(reading.value, timestamp);
    frameHandle.value = requestAnimationFrame(loop);
  }

  function start(callback) {
    onFrame = callback ?? null;
    if (running.value) return;
    running.value = true;
    frameHandle.value = requestAnimationFrame(loop);
  }

  function stop() {
    running.value = false;
    if (frameHandle.value !== null) cancelAnimationFrame(frameHandle.value);
    frameHandle.value = null;
    reading.value = IDLE_READING;
  }

  onScopeDispose(stop);

  return { reading, running, start, stop };
}
