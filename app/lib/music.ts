export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

const FLAT_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

/** Labels for the key picker, showing both spellings of the black keys. */
export const KEY_LABELS = NOTE_NAMES.map((sharp, i) =>
  sharp === FLAT_NAMES[i] ? sharp : `${sharp} / ${FLAT_NAMES[i]}`,
);

/** Major keys traditionally written with flats, plus their relative minors. */
const FLAT_MAJORS = new Set([5, 10, 3, 8, 1, 6]);

export type Mode = "major" | "minor";

/** Semitone offsets of each scale degree from the tonic. */
const SCALES: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

const ROMAN: Record<Mode, string[]> = {
  major: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
  minor: ["i", "ii°", "III", "iv", "v", "VI", "VII"],
};

/** How many chords the gesture mapping exposes (1 finger .. 7 fingers). */
export const DEGREE_COUNT = 7;

export interface Chord {
  /** 1-based scale degree, matching the number of fingers shown. */
  degree: number;
  /** Roman numeral, e.g. "ii". */
  roman: string;
  /** Readable name, e.g. "Dm". */
  name: string;
  quality: "major" | "minor" | "diminished" | "augmented";
  /** Triad as MIDI note numbers, root position, low to high. */
  notes: number[];
}

export const mtof = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * MIDI note for a scale step, where step 0 is the tonic and steps beyond 6
 * wrap into the next octave.
 */
function scaleMidi(tonic: number, mode: Mode, step: number, octave: number) {
  const scale = SCALES[mode];
  const octaveShift = Math.floor(step / scale.length);
  const index = ((step % scale.length) + scale.length) % scale.length;
  return (octave + 1) * 12 + tonic + scale[index] + octaveShift * 12;
}

/** Db major reads better than C# major, so pick the spelling per key. */
export function usesFlats(tonic: number, mode: Mode) {
  const relativeMajor = mode === "minor" ? (tonic + 3) % 12 : tonic;
  return FLAT_MAJORS.has(relativeMajor);
}

export function noteName(midiOrPitchClass: number, flats: boolean) {
  const pc = ((midiOrPitchClass % 12) + 12) % 12;
  return flats ? FLAT_NAMES[pc] : NOTE_NAMES[pc];
}

function qualityOf(notes: number[]): Chord["quality"] {
  const third = notes[1] - notes[0];
  const fifth = notes[2] - notes[0];
  if (third === 3 && fifth === 6) return "diminished";
  if (third === 3) return "minor";
  if (fifth === 8) return "augmented";
  return "major";
}

const SUFFIX: Record<Chord["quality"], string> = {
  major: "",
  minor: "m",
  diminished: "dim",
  augmented: "aug",
};

/** Builds the diatonic triad for a scale degree (1-7) of the given key. */
export function chordForDegree(
  tonic: number,
  mode: Mode,
  degree: number,
  octave: number,
): Chord {
  const step = degree - 1;
  const notes = [0, 2, 4].map((interval) =>
    scaleMidi(tonic, mode, step + interval, octave),
  );
  const quality = qualityOf(notes);
  const rootName = noteName(notes[0], usesFlats(tonic, mode));

  return {
    degree,
    roman: ROMAN[mode][step],
    name: `${rootName}${SUFFIX[quality]}`,
    quality,
    notes,
  };
}

/** Every chord in the key, indexed by finger count - 1. */
export function chordsForKey(tonic: number, mode: Mode, octave: number) {
  return Array.from({ length: DEGREE_COUNT }, (_, i) =>
    chordForDegree(tonic, mode, i + 1, octave),
  );
}
