import { ref, onScopeDispose } from 'vue';
import { loadAbcjs } from '../music/abc.js';
import { secondsForNoteIndex, noteDurationSeconds } from '../music/playback.js';

/**
 * Bundled locally at public/soundfonts/ocarina-mp3/ rather than fetched from
 * abcjs's default CDN (paulrosen.github.io/midi-js-soundfonts) -- see the
 * README there for why only this one instrument, and only the 21 notes
 * this instrument's A4-F6 range actually needs, are shipped: it keeps
 * playback working offline (this is a PWA) and stays well inside the
 * service worker's precache budget (~525KB, against the existing 4MB cap
 * checked in vite.config.js) instead of pulling in a CDN's full GM set.
 */
const SOUND_FONT_URL = `${import.meta.env.BASE_URL}soundfonts/`;

/**
 * GM "Ocarina" in abcjs's own instrument table
 * (node_modules/abcjs/src/synth/instrument-index-to-name.js). abcjs picks
 * the instrument from a `%%MIDI program` directive in the tune itself, not
 * from an init() option -- and a player's pasted or hand-written tune won't
 * have one -- so it's forced by prepending that directive to the ABC source
 * used for playback only; the notation/validation parse in abc.js never
 * sees it.
 */
const MIDI_PROGRAM = 79;

/** Headroom past a stepped note's own duration before cutting playback off,
 *  so the sample's natural decay isn't chopped off mid-note. */
const STEP_FADE_MS = 60;

/**
 * Owns `abcjs`'s synth for one Song Practice session: playback with the
 * ocarina voice, adjustable tempo, playing from an arbitrary position, and
 * a single-note step mode. Shares its `AudioContext` with the caller
 * (typically `mic.context.value`, once `mic.start()` has resolved) rather
 * than opening a second one -- browsers limit how many can exist, and it is
 * already unlocked by the microphone permission gesture. See
 * useMetronome.js's identical choice, for the same reason.
 */
export function useSongPlayback() {
  const playing = ref(false);
  const loading = ref(false);
  /** True if playback failed to become ready -- offline, unsupported
   *  browser, or similar. The UI should show `errorMessage` and otherwise
   *  keep working; playback is the one feature worth losing gracefully. */
  const unavailable = ref(false);
  const errorMessage = ref('');

  let abcjsMod = null;
  let synth = null;
  /** `${abcSource}|${bpm}` the current synth is primed for, so an unchanged
   *  tempo doesn't re-init and re-prime needlessly. */
  let primedKey = null;
  let primedMsPerMeasure = 0;
  let stepTimer = null;

  /** @returns {Promise<{ synth: object, millisecondsPerMeasure: number }>} */
  async function ensurePrimed(abcSource, audioContext, bpm) {
    const key = `${abcSource}|${bpm}`;
    if (synth && primedKey === key) return { synth, millisecondsPerMeasure: primedMsPerMeasure };

    loading.value = true;
    try {
      abcjsMod = abcjsMod ?? await loadAbcjs();
      const tune = abcjsMod.parseOnly(`%%MIDI program ${MIDI_PROGRAM}\n${abcSource}`)[0];
      const millisecondsPerMeasure = tune.millisecondsPerMeasure(bpm);

      synth?.stop();
      const next = new abcjsMod.synth.CreateSynth();
      await next.init({
        audioContext,
        visualObj: tune,
        millisecondsPerMeasure,
        options: { soundFontUrl: SOUND_FONT_URL },
      });
      await next.prime();

      synth = next;
      primedKey = key;
      primedMsPerMeasure = millisecondsPerMeasure;
      unavailable.value = false;
      errorMessage.value = '';
      return { synth, millisecondsPerMeasure };
    } catch {
      synth = null;
      primedKey = null;
      unavailable.value = true;
      errorMessage.value = "Playback isn't available right now.";
      throw new Error('playback unavailable');
    } finally {
      loading.value = false;
    }
  }

  /**
   * Plays continuously from a note index, to the end of the tune.
   * @param {string} abcSource
   * @param {object} args
   * @param {AudioContext} args.audioContext
   * @param {number} args.bpm
   * @param {import('../music/abc.js').AbcEvent[]} args.notes
   * @param {{num: number, den: number}} args.meter
   * @param {number} [args.fromIndex]
   * @param {() => void} [args.onEnded]
   */
  async function playFrom(abcSource, {
    audioContext, bpm, notes, meter, fromIndex = 0, onEnded,
  }) {
    clearTimeout(stepTimer);
    try {
      const { synth: s, millisecondsPerMeasure } = await ensurePrimed(abcSource, audioContext, bpm);
      const seekSeconds = secondsForNoteIndex(notes, fromIndex, millisecondsPerMeasure, meter);
      s.onEnded = () => { playing.value = false; onEnded?.(); };
      if (seekSeconds > 0) s.seek(seekSeconds, 'seconds');
      s.start();
      playing.value = true;
    } catch {
      playing.value = false;
      onEnded?.();
    }
  }

  /**
   * Plays exactly the note at `index`, then stops itself -- single-note
   * step mode. Driven by our own timer rather than the synth's `onEnded`
   * (which fires on any stop, including this one's own cutoff, so it can't
   * tell "this note finished" apart from "playback was stopped").
   * @param {string} abcSource
   * @param {object} args
   * @param {AudioContext} args.audioContext
   * @param {number} args.bpm
   * @param {import('../music/abc.js').AbcEvent[]} args.notes
   * @param {{num: number, den: number}} args.meter
   * @param {number} args.index
   * @param {() => void} [args.onDone]
   */
  async function stepOne(abcSource, {
    audioContext, bpm, notes, meter, index, onDone,
  }) {
    clearTimeout(stepTimer);
    try {
      const { synth: s, millisecondsPerMeasure } = await ensurePrimed(abcSource, audioContext, bpm);
      const seekSeconds = secondsForNoteIndex(notes, index, millisecondsPerMeasure, meter);
      const durationSeconds = noteDurationSeconds(notes, index, millisecondsPerMeasure, meter);
      s.onEnded = null;
      s.seek(seekSeconds, 'seconds');
      s.start();
      playing.value = true;
      stepTimer = setTimeout(() => {
        s.stop();
        playing.value = false;
        onDone?.();
      }, durationSeconds * 1000 + STEP_FADE_MS);
    } catch {
      playing.value = false;
      onDone?.();
    }
  }

  function stop() {
    clearTimeout(stepTimer);
    synth?.stop();
    playing.value = false;
  }

  onScopeDispose(stop);

  return {
    playing, loading, unavailable, errorMessage, playFrom, stepOne, stop,
  };
}
