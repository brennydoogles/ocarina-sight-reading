import { ref, shallowRef, onScopeDispose } from 'vue';

export const MIC = Object.freeze({
  IDLE: 'idle',
  REQUESTING: 'requesting',
  READY: 'ready',
  DENIED: 'denied',
  UNSUPPORTED: 'unsupported',
  ERROR: 'error',
});

/**
 * Constraints that matter more than they look.
 *
 * Chrome's audio processing chain is built for speech: noise suppression
 * treats a sustained pure tone as stationary noise and attenuates it, and
 * AGC pumps the level. Both wreck pitch detection. Chrome also ties AGC to
 * the echoCancellation flag -- setting autoGainControl alone is ignored, so
 * echoCancellation: false is what actually turns the chain off.
 *
 * Deliberately NOT setting sampleRate: forcing one makes some Android
 * devices fail outright. Take whatever the device gives and read it off the
 * AudioContext.
 */
const AUDIO_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
};

/** Pre-Unified-Plan Chrome spellings. Some Android builds still honour only these. */
const LEGACY_CONSTRAINTS = {
  googEchoCancellation: false,
  googAutoGainControl: false,
  googNoiseSuppression: false,
  googHighpassFilter: false,
};

/**
 * Owns the microphone stream and the AudioContext.
 *
 * @param {{ fftSize?: number }} [options]
 */
export function useMicrophone({ fftSize = 2048 } = {}) {
  const status = ref(MIC.IDLE);
  const error = ref(null);
  const sampleRate = ref(0);
  /** What the browser actually gave us, which may differ from what we asked. */
  const appliedConstraints = ref(null);

  const context = shallowRef(null);
  const analyser = shallowRef(null);
  const stream = shallowRef(null);
  const buffer = shallowRef(null);
  /**
   * Held deliberately. A MediaStreamAudioSourceNode that nothing references
   * is eligible for garbage collection even while connected, and when it goes
   * the graph silently stops delivering audio -- the microphone appears to
   * work and simply produces silence. Keeping it alive is the whole job of
   * this ref.
   */
  const source = shallowRef(null);

  async function start() {
    if (status.value === MIC.READY) return true;

    if (!navigator.mediaDevices?.getUserMedia) {
      // Overwhelmingly this is an insecure context: getUserMedia is simply
      // absent on plain http, which is why dev:lan exists.
      status.value = MIC.UNSUPPORTED;
      error.value = window.isSecureContext
        ? 'This browser does not support microphone capture.'
        : 'Microphone access needs a secure connection (https:// or localhost).';
      return false;
    }

    status.value = MIC.REQUESTING;
    error.value = null;

    try {
      stream.value = await navigator.mediaDevices.getUserMedia({
        audio: { ...AUDIO_CONSTRAINTS, ...LEGACY_CONSTRAINTS },
        video: false,
      });
    } catch (err) {
      // Older browsers reject unknown constraints outright; retry clean.
      if (err?.name === 'OverconstrainedError' || err?.name === 'TypeError') {
        try {
          stream.value = await navigator.mediaDevices.getUserMedia({
            audio: AUDIO_CONSTRAINTS,
            video: false,
          });
        } catch (retryErr) {
          return fail(retryErr);
        }
      } else {
        return fail(err);
      }
    }

    const track = stream.value.getAudioTracks()[0];
    appliedConstraints.value = track?.getSettings?.() ?? null;

    context.value = new AudioContext();
    // Autoplay policy can hand back a suspended context even after a gesture.
    if (context.value.state === 'suspended') await context.value.resume();

    sampleRate.value = context.value.sampleRate;

    analyser.value = context.value.createAnalyser();
    analyser.value.fftSize = fftSize;
    // Time-domain data only; smoothing would blur the waveform we analyse.
    analyser.value.smoothingTimeConstant = 0;
    source.value = context.value.createMediaStreamSource(stream.value);
    source.value.connect(analyser.value);
    // Note: the analyser is intentionally NOT connected to the destination --
    // routing the mic to the speakers would feed back.

    buffer.value = new Float32Array(analyser.value.fftSize);
    status.value = MIC.READY;
    return true;
  }

  function fail(err) {
    const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
    status.value = denied ? MIC.DENIED : MIC.ERROR;
    error.value = denied
      ? 'Microphone permission was declined. Allow it in the browser’s site settings and try again.'
      : `Could not open the microphone: ${err?.message ?? err}`;
    return false;
  }

  /**
   * Fill the shared buffer with the most recent frame.
   * @returns {Float32Array|null}
   */
  function readFrame() {
    if (!analyser.value || !buffer.value) return null;
    analyser.value.getFloatTimeDomainData(buffer.value);
    return buffer.value;
  }

  function stop() {
    stream.value?.getTracks().forEach((t) => t.stop());
    context.value?.close();
    stream.value = null;
    context.value = null;
    analyser.value = null;
    source.value = null;
    buffer.value = null;
    status.value = MIC.IDLE;
  }

  onScopeDispose(stop);

  return { status, error, sampleRate, appliedConstraints, start, stop, readFrame };
}
