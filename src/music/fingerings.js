/**
 * Fingerings for the 12-hole Alto C ocarina (Asian linear system).
 *
 * NATURALS ONLY. The instrument plays a full chromatic A4-F6, but this app
 * drills the thirteen naturals, so only those are carried here. The
 * accidentals are mechanically re-derivable from the two sources named below
 * if chromatic practice is ever wanted.
 *
 * SOURCING -- this is the one dataset here that describes a physical object
 * rather than arithmetic, so it was cross-checked rather than hand-entered.
 * Two independent open-source fingering tables were compared hole-by-hole:
 * tribbin/Ocarina-Practice (instruments/oot-alto-c-12) and
 * smilack/ocarina-chart. Their hole orderings differ, so the mapping between
 * them was solved from the column signatures across all 21 chromatic notes,
 * then every note compared. The two agree on every one of the thirteen
 * naturals below.
 *
 * Still worth a sanity check against the chart that came with the instrument,
 * since makers vary; the FingeringReference screen exists for exactly that.
 */

/** @typedef {'open'|'closed'|'half'} HoleState */

export const HOLE_STATE = Object.freeze({
  OPEN: 'open',
  CLOSED: 'closed',
  HALF: 'half',
});

// Terse aliases -- the table below is 13 x 12 and reads far better this way.
const O = HOLE_STATE.OPEN;
const C = HOLE_STATE.CLOSED;

/**
 * The twelve holes. Order is fixed and load-bearing: tests assert every
 * fingering has exactly these keys.
 */
export const HOLE_IDS = Object.freeze([
  'LT', 'RT',                    // thumb holes, back of the instrument
  'L1', 'L2', 'L3', 'L4',        // left hand: index, middle, ring, pinky
  'R1', 'R2', 'R3', 'R4',        // right hand: index, middle, ring, pinky
  'SubL', 'SubR',                // subholes, beside each middle finger
]);

/**
 * Presentation metadata for each hole: which side of the instrument it is on,
 * which finger plays it, and whether it is a small subhole.
 *
 * `artLabel` and `elementId` are the bridge to the hand-drawn diagrams: the
 * inkscape:label the artwork uses for that hole, and the id written onto it by
 * scripts/tag-hole-ids.mjs. Changing either means re-running that script.
 */
export const HOLE_META = Object.freeze({
  LT:   { view: 'back',  hand: 'left',  finger: 'thumb',  small: false, label: 'L thumb',   artLabel: 'Left Thumb',    elementId: 'leftThumb' },
  RT:   { view: 'back',  hand: 'right', finger: 'thumb',  small: false, label: 'R thumb',   artLabel: 'Right Thumb',   elementId: 'rightThumb' },
  L1:   { view: 'front', hand: 'left',  finger: 'index',  small: false, label: 'L index',   artLabel: 'Left Pointer',  elementId: 'leftPointer' },
  L2:   { view: 'front', hand: 'left',  finger: 'middle', small: false, label: 'L middle',  artLabel: 'Left Middle',   elementId: 'leftMiddle' },
  L3:   { view: 'front', hand: 'left',  finger: 'ring',   small: false, label: 'L ring',    artLabel: 'Left Ring',     elementId: 'leftRing' },
  L4:   { view: 'front', hand: 'left',  finger: 'pinky',  small: false, label: 'L pinky',   artLabel: 'Left Pinky',    elementId: 'leftPinky' },
  R1:   { view: 'front', hand: 'right', finger: 'index',  small: false, label: 'R index',   artLabel: 'Right Pointer', elementId: 'rightPointer' },
  R2:   { view: 'front', hand: 'right', finger: 'middle', small: false, label: 'R middle',  artLabel: 'Right Middle',  elementId: 'rightMiddle' },
  R3:   { view: 'front', hand: 'right', finger: 'ring',   small: false, label: 'R ring',    artLabel: 'Right Ring',    elementId: 'rightRing' },
  R4:   { view: 'front', hand: 'right', finger: 'pinky',  small: false, label: 'R pinky',   artLabel: 'Right Pinky',   elementId: 'rightPinky' },
  SubL: { view: 'front', hand: 'left',  finger: 'middle', small: true,  label: 'L subhole', artLabel: 'Left Sub',      elementId: 'leftSub' },
  SubR: { view: 'front', hand: 'right', finger: 'middle', small: true,  label: 'R subhole', artLabel: 'Right Sub',     elementId: 'rightSub' },
});
/**
 * @typedef {Record<'LT'|'RT'|'L1'|'L2'|'L3'|'L4'|'R1'|'R2'|'R3'|'R4'|'SubL'|'SubR', HoleState>} Fingering
 */

/**
 * Fingering per MIDI note, for the thirteen naturals from A4 (69) to F6 (89).
 * @type {Record<number, Fingering>}
 */
export const FINGERINGS = Object.freeze({
  // A4   (MIDI 69)
  69: {
    LT: C, RT: C, L1: C, L2: C, L3: C, L4: C,
    R1: C, R2: C, R3: C, R4: C, SubL: C, SubR: C
  },
  // B4   (MIDI 71)
  71: {
    LT: C, RT: C, L1: C, L2: C, L3: C, L4: C,
    R1: C, R2: C, R3: C, R4: C, SubL: O, SubR: C
  },
  // C5   (MIDI 72)
  72: {
    LT: C, RT: C, L1: C, L2: C, L3: C, L4: C,
    R1: C, R2: C, R3: C, R4: C, SubL: O, SubR: O
  },
  // D5   (MIDI 74)
  74: {
    LT: C, RT: C, L1: C, L2: C, L3: C, L4: C,
    R1: C, R2: C, R3: C, R4: O, SubL: O, SubR: O
  },
  // E5   (MIDI 76)
  76: {
    LT: C, RT: C, L1: C, L2: C, L3: C, L4: C,
    R1: C, R2: C, R3: O, R4: O, SubL: O, SubR: O
  },
  // F5   (MIDI 77)
  77: {
    LT: C, RT: C, L1: C, L2: C, L3: C, L4: C,
    R1: C, R2: O, R3: O, R4: O, SubL: O, SubR: O
  },
  // G5   (MIDI 79)
  79: {
    LT: C, RT: C, L1: C, L2: C, L3: C, L4: C,
    R1: O, R2: O, R3: O, R4: O, SubL: O, SubR: O
  },
  // A5   (MIDI 81)
  81: {
    LT: C, RT: C, L1: C, L2: C, L3: O, L4: C,
    R1: O, R2: O, R3: O, R4: O, SubL: O, SubR: O
  },
  // B5   (MIDI 83)
  83: {
    LT: C, RT: C, L1: C, L2: O, L3: O, L4: C,
    R1: O, R2: O, R3: O, R4: O, SubL: O, SubR: O
  },
  // C6   (MIDI 84)
  84: {
    LT: C, RT: C, L1: O, L2: O, L3: O, L4: C,
    R1: O, R2: O, R3: O, R4: O, SubL: O, SubR: O
  },
  // D6   (MIDI 86)
  86: {
    LT: O, RT: C, L1: O, L2: O, L3: O, L4: C,
    R1: O, R2: O, R3: O, R4: O, SubL: O, SubR: O
  },
  // E6   (MIDI 88)
  88: {
    LT: O, RT: O, L1: O, L2: O, L3: O, L4: C,
    R1: O, R2: O, R3: O, R4: O, SubL: O, SubR: O
  },
  // F6   (MIDI 89)
  89: {
    LT: O, RT: O, L1: O, L2: O, L3: O, L4: O,
    R1: O, R2: O, R3: O, R4: O, SubL: O, SubR: O
  },
});

/**
 * @param {number} midi
 * @returns {Fingering|null} the fingering, or null for any note this app does
 *   not drill -- including the accidentals.
 */
export function getFingering(midi) {
  return FINGERINGS[midi] ?? null;
}
