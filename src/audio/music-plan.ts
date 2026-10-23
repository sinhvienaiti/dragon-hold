/**
 * Music plan (05 §7.2): four layers on one tempo and key, Rừng (calm) →
 * + Đợt (battle) → + Dồn (surge: last wave or Hỏa Long under 35 %) → + the
 * general's motif. M0a synthesises Rừng and Đợt; Dồn and the general layer
 * play only from files. Layer changes land on the next bar and fade over 2 s.
 * Pure: the song as numbers and the layer targets as a function of the run.
 * Owner: audio (LANES.md).
 */
export const MUSIC_LAYERS = ["forest", "wave", "surge", "general"] as const;
export type MusicLayer = (typeof MUSIC_LAYERS)[number];

/** A layer change starts at the next bar and takes this long (05 §7.2 "mờ 2 s ở đầu ô nhịp"). */
export const LAYER_FADE_S = 2;

export interface MusicState {
  readonly phase: string;
  readonly wave: number;
  readonly waves: number;
  /** Hỏa Long HP, percent. */
  readonly heroPct: number;
  /** Foes alive now. */
  readonly live: number;
  readonly generals: number;
  /** The portal plays its own music: the game's goes silent (06 §3). */
  readonly sharedMusic: boolean;
}

export interface MusicTargets {
  /** 0 calm … 1 all-out; drives drum density. */
  readonly intensity: number;
  readonly layers: Readonly<Record<MusicLayer, number>>;
}

const SILENT: Readonly<Record<MusicLayer, number>> = { forest: 0, wave: 0, surge: 0, general: 0 };

export function musicTargets(state: MusicState): MusicTargets {
  if (state.sharedMusic || state.phase === "victory" || state.phase === "defeat") return { intensity: 0, layers: SILENT };
  const low = state.heroPct > 0 && state.heroPct < 35;
  const lastWave = state.waves > 0 && state.wave >= state.waves;
  if (state.phase !== "wave") {
    return { intensity: state.phase === "warning" ? 0.2 : 0, layers: { forest: 1, wave: 0, surge: 0, general: 0 } };
  }
  const crowd = Math.min(1, state.live / 40);
  const intensity = Math.min(1, 0.35 + 0.45 * crowd + (low ? 0.25 : 0) + (lastWave ? 0.15 : 0));
  return {
    intensity,
    layers: { forest: 0.7, wave: 1, surge: low || lastWave ? 1 : 0, general: state.generals > 0 ? 1 : 0 },
  };
}

// ── The M0 song: forest folk in D Dorian, 84 BPM ───────────────────────────

export interface MelodyNote {
  /** Bar within the 8-bar loop and 16th step within the bar. */
  readonly bar: number;
  readonly step: number;
  readonly midi: number;
  /** Length in 16ths. */
  readonly steps: number;
}

export interface Song {
  readonly bpm: number;
  readonly beatsPerBar: number;
  readonly stepsPerBeat: number;
  readonly bars: number;
  /** One triad (MIDI) per bar. */
  readonly chords: readonly (readonly [number, number, number])[];
  /** Wooden flute line (calm layer). */
  readonly melody: readonly MelodyNote[];
  /** Harp plucks on 8ths: 1 plays; indices into chord tones over two octaves. */
  readonly harp: readonly (readonly number[])[];
  /** Frame drum per 16th: 0 rest, 1 ghost, 2 slap, 3 boom; [calm, dense]. */
  readonly drum: readonly [readonly number[], readonly number[]];
  /** Cello ostinato on 8ths: 0 root, 1 fifth, 2 octave, −1 rest. */
  readonly cello: readonly number[];
  /** Pentatonic root for word and kill notes (F major pentatonic = D minor pentatonic), Hz. */
  readonly chimeRootHz: number;
}

// Dm C G Dm | F C Am Dm (D Dorian: the G major chord carries its colour).
const Dm = [50, 53, 57] as const;
const C = [48, 52, 55] as const;
const G = [43, 47, 50] as const;
const F = [41, 45, 48] as const;
const Am = [45, 48, 52] as const;

export const FOREST_SONG: Song = {
  bpm: 84,
  beatsPerBar: 4,
  stepsPerBeat: 4,
  bars: 8,
  chords: [Dm, C, G, Dm, F, C, Am, Dm],
  melody: [
    // Bars 1–4: a question, rising to D and settling on G.
    { bar: 0, step: 0, midi: 69, steps: 4 },
    { bar: 0, step: 4, midi: 72, steps: 4 },
    { bar: 0, step: 8, midi: 74, steps: 8 },
    { bar: 1, step: 0, midi: 72, steps: 6 },
    { bar: 1, step: 6, midi: 69, steps: 2 },
    { bar: 1, step: 8, midi: 67, steps: 8 },
    { bar: 2, step: 8, midi: 65, steps: 4 },
    { bar: 2, step: 12, midi: 67, steps: 4 },
    { bar: 3, step: 0, midi: 69, steps: 16 },
    // Bars 5–8: the answer, up to F and home to D.
    { bar: 4, step: 0, midi: 72, steps: 4 },
    { bar: 4, step: 4, midi: 74, steps: 4 },
    { bar: 4, step: 8, midi: 77, steps: 8 },
    { bar: 5, step: 0, midi: 76, steps: 4 },
    { bar: 5, step: 4, midi: 74, steps: 4 },
    { bar: 5, step: 8, midi: 72, steps: 8 },
    { bar: 6, step: 0, midi: 69, steps: 6 },
    { bar: 6, step: 6, midi: 72, steps: 2 },
    { bar: 6, step: 8, midi: 69, steps: 8 },
    { bar: 7, step: 0, midi: 62, steps: 16 },
  ],
  harp: [
    [0, 2, 4, 5, 3, 4, 2, 1],
    [0, 1, 2, 4, 5, 4, 2, 1],
  ],
  drum: [
    [3, 0, 0, 1, 0, 0, 2, 0, 3, 0, 1, 0, 2, 0, 0, 0],
    [3, 0, 1, 1, 2, 0, 2, 1, 3, 0, 1, 3, 2, 1, 2, 1],
  ],
  cello: [0, 0, 1, 2, 0, 1, 2, 1],
  chimeRootHz: 698.46,
};

export const barSeconds = (song: Song): number => (60 / song.bpm) * song.beatsPerBar;
export const stepSeconds = (song: Song): number => 60 / song.bpm / song.stepsPerBeat;
export const stepsPerBar = (song: Song): number => song.beatsPerBar * song.stepsPerBeat;

/** The first bar line at or after `now` for a song started at `start`. */
export function nextBarTime(now: number, start: number, song: Song): number {
  const bar = barSeconds(song);
  if (now <= start) return start;
  return start + Math.ceil((now - start) / bar - 1e-9) * bar;
}

export const midiHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Harp pluck pitch: `index` into the bar's chord over two octaves (up one octave from the chord). */
export function harpMidi(chord: readonly number[], index: number): number {
  const tone = chord[index % chord.length]!;
  return tone + 12 + (index >= chord.length ? 12 : 0);
}
