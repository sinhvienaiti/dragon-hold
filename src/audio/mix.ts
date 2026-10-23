/**
 * Bus levels and ducking (05 §7.2, 01 §6.4). Pure: the mixer turns these
 * numbers into gain ramps. Pronunciation always wins: while a word is spoken
 * every bus but `learning` dips (kit BusMix holds those dips), dialogue and
 * boss warnings add their own; the deepest dip of a bus wins, never a mute.
 * Owner: audio (LANES.md).
 */
import { BusMix, type BusTable } from "../kit/audio";
import type { ChildBus } from "./catalog";

export const dbToGain = (db: number): number => 10 ** (db / 20);
export const gainToDb = (gain: number): number => (gain <= 0 ? -120 : 20 * Math.log10(gain));

/** Bus level (linear) and the pronunciation dip in dB (05 §7.2 table, row one). */
const LEVELS: Readonly<Record<ChildBus, { gain: number; pronunciationDb: number }>> = {
  music: { gain: 0.5, pronunciationDb: -4 },
  ui: { gain: 0.85, pronunciationDb: -3 },
  typing: { gain: 0.8, pronunciationDb: -2 },
  dragon: { gain: 0.75, pronunciationDb: -3 },
  enemies: { gain: 0.85, pronunciationDb: -6 },
  traps: { gain: 0.8, pronunciationDb: -6 },
  units: { gain: 0.8, pronunciationDb: -6 },
  ambience: { gain: 0.6, pronunciationDb: -4 },
  // Dialogue waits for the word (05 §7.2 "hoãn thoại"): deep dip until it is held back.
  voice: { gain: 0.85, pronunciationDb: -12 },
  stingers: { gain: 0.75, pronunciationDb: -2 },
  // Learning sounds are the frame's own audio: never ducked.
  learning: { gain: 0.8, pronunciationDb: 0 },
};

/** The kit bus table: level and the pronunciation dip as a factor. */
export const BUS_TABLE: BusTable<ChildBus> = Object.fromEntries(
  (Object.keys(LEVELS) as ChildBus[]).map((bus) => [bus, { gain: LEVELS[bus].gain, duck: dbToGain(LEVELS[bus].pronunciationDb) }]),
) as Record<ChildBus, { gain: number; duck: number }>;

export type DuckKind = "pronunciation" | "dialogue" | "warning";

export interface DuckRule {
  /** Dip per bus in dB; buses not named stay. */
  readonly db: Partial<Record<ChildBus, number>>;
  /** Ramp down and back up, seconds. */
  readonly downS: number;
  readonly upS: number;
}

/** 05 §7.2 ducking table. Pronunciation's dips come from BUS_TABLE (kit BusMix, voice boost aware). */
export const DUCKS: Readonly<Record<DuckKind, DuckRule>> = {
  pronunciation: {
    db: Object.fromEntries((Object.keys(LEVELS) as ChildBus[]).map((bus) => [bus, LEVELS[bus].pronunciationDb])),
    downS: 0.08,
    upS: 0.4,
  },
  dialogue: { db: { music: -6, ambience: -6, enemies: -6, traps: -3 }, downS: 0.1, upS: 0.5 },
  // Boss warning and Cụm Ấn: world −4, music −3, P5 off (ambience nearly gone).
  warning: { db: { dragon: -4, traps: -4, units: -4, enemies: -4, music: -3, ambience: -14 }, downS: 0.08, upS: 0.4 },
};

export type DuckState = Readonly<Record<DuckKind, boolean>>;
export const NO_DUCK: DuckState = { pronunciation: false, dialogue: false, warning: false };

export interface BusTarget {
  /** Duck factor 0–1 (1: no dip). */
  readonly duck: number;
  /** Ramp time to reach it, seconds. */
  readonly rampS: number;
}

/** Bus levels for one game run; the voice boost (1–3) deepens pronunciation dips (kit rule). */
export class AudioMix {
  readonly busMix = new BusMix<ChildBus>(BUS_TABLE);

  setPronunciationBoost(boost: number): void {
    this.busMix.setPronunciationBoost(boost);
  }

  /** The dip of `bus` under `state`: the deepest active rule wins. */
  duck(bus: ChildBus, state: DuckState): number {
    // A bus with no pronunciation dip (learning) keeps it even under the voice boost.
    let factor = BUS_TABLE[bus].duck >= 1 ? 1 : this.busMix.duck(bus, state.pronunciation);
    if (state.dialogue) factor = Math.min(factor, dbToGain(DUCKS.dialogue.db[bus] ?? 0));
    if (state.warning) factor = Math.min(factor, dbToGain(DUCKS.warning.db[bus] ?? 0));
    return factor;
  }

  /**
   * Where `bus` heads from `from` (its current duck) when the state goes from
   * `prev` to `state`: down at the fastest rule that dips it, back up at the
   * slowest rule that just ended (05 §7.2: pronunciation 80 ms down, 400 ms up).
   */
  target(bus: ChildBus, state: DuckState, from: number, prev: DuckState = state): BusTarget {
    const duck = this.duck(bus, state);
    const touches = (kind: DuckKind) => (kind === "pronunciation" ? BUS_TABLE[bus].duck < 1 : (DUCKS[kind].db[bus] ?? 0) < 0);
    let rampS: number;
    if (duck < from - 1e-4) {
      rampS = 1;
      for (const kind of Object.keys(DUCKS) as DuckKind[]) if (state[kind] && touches(kind)) rampS = Math.min(rampS, DUCKS[kind].downS);
    } else {
      rampS = 0;
      for (const kind of Object.keys(DUCKS) as DuckKind[]) if (prev[kind] && !state[kind] && touches(kind)) rampS = Math.max(rampS, DUCKS[kind].upS);
      if (rampS === 0) rampS = DUCKS.pronunciation.upS;
    }
    return { duck, rampS };
  }

  /** The bus level before ducking. */
  level(bus: ChildBus): number {
    return BUS_TABLE[bus].gain;
  }
}

/** Settings volumes 0–1 (06 §3: master 80, music 60, effects 80, voice 80, pronunciation 100). */
export interface AudioVolumes {
  readonly master: number;
  readonly music: number;
  readonly sfx: number;
  readonly voice: number;
  /** Learning frame sounds; the spoken word itself follows the speech volume. */
  readonly learning: number;
}

export const DEFAULT_VOLUMES: AudioVolumes = { master: 0.8, music: 0.6, sfx: 0.8, voice: 0.8, learning: 1 };

/** Which settings slider a bus follows. */
export function volumeFor(bus: ChildBus, volumes: AudioVolumes): number {
  if (bus === "music") return volumes.music;
  if (bus === "voice") return volumes.voice;
  if (bus === "learning") return volumes.learning;
  return volumes.sfx;
}

/** Buses that go through the pause low-pass (05 §7.2: world and enemies; 06 §2: music too). */
export const PAUSE_FILTERED: ReadonlySet<ChildBus> = new Set<ChildBus>(["music", "dragon", "enemies", "traps", "units", "ambience"]);
export const PAUSE_CUTOFF_HZ = 800;
/** Effects dip while paused (the sim stands still; 06 §2 "âm tạm ngưng"). */
export const PAUSE_SFX_DB = -9;
