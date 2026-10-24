/**
 * Every M0 sound (05 §7, DESIGN.md §7.2): its bus, priority (P0 pronunciation
 * … P5 footsteps), length, limits and future file. M0a has no audio files:
 * each id is a short WebAudio synth in synth.ts; a file listed in
 * /assets/dragon-hold/audio/manifest.json (not in Git) replaces it later.
 * docs/audio/M0_SOUND_LIST.md describes each id (when, mood, prompt).
 * Owner: audio (LANES.md).
 */
import type { FoeId, Gait, Material, Tier } from "../content/types";
import { ENEMIES } from "../content/data/enemies";
import { GENERALS } from "../content/data/generals";

/** The 12 buses (05 §7): master plus eleven that feed it. */
// "world": bolts, impacts and blasts (05 §7.2 "world −6" under a spoken word); "dragon" keeps the Dragon's own voice.
export const BUSES = ["master", "music", "ui", "typing", "dragon", "world", "enemies", "traps", "units", "ambience", "voice", "stingers", "learning"] as const;
export type Bus = (typeof BUSES)[number];
export type ChildBus = Exclude<Bus, "master">;
export const CHILD_BUSES = BUSES.filter((bus): bus is ChildBus => bus !== "master");

/**
 * 05 §7 priorities: 0 pronunciation and learning, 1 warnings (always play, cut
 * P5), 2 typing and UI, 3 Dragon skills and generals, 4 shots, blasts, traps,
 * enemy blows, 5 steps, small growls, ambience.
 */
export type Priority = 0 | 1 | 2 | 3 | 4 | 5;

/** Shared limits (05 §7): blasts and deaths at most 4 in 120 ms; growls at most 2 at once, 0.4 s apart. */
export type LimitGroup = "blast" | "death" | "growl";

export interface SoundDef {
  readonly bus: ChildBus;
  readonly priority: Priority;
  /** Synth length, ms (the voice table frees the slot after it). */
  readonly lengthMs: number;
  /** Minimum time between two plays of this id, ms. */
  readonly gapMs: number;
  readonly group?: LimitGroup;
  /** Level in dB before the bus. */
  readonly gainDb: number;
  /** Random pitch ±4 %, ±1.5 dB, 0–12 ms offset (05 §7 impacts); typing, UI and learning stay exact. */
  readonly vary: boolean;
  /** File stem under /assets/dragon-hold/audio/ for later (manifest lists the real files). */
  readonly file: string;
  /** A looping bed (ambience, crowd), not a one-shot. */
  readonly loop?: boolean;
}

type Opts = Partial<Pick<SoundDef, "gapMs" | "group" | "gainDb" | "vary" | "loop">>;

const def = (bus: ChildBus, priority: Priority, lengthMs: number, file: string, opts: Opts = {}): SoundDef => ({
  bus,
  priority,
  lengthMs,
  gapMs: opts.gapMs ?? 30,
  ...(opts.group ? { group: opts.group } : {}),
  gainDb: opts.gainDb ?? 0,
  vary: opts.vary ?? (bus !== "typing" && bus !== "ui" && bus !== "learning" && bus !== "stingers"),
  file,
  ...(opts.loop ? { loop: true } : {}),
});

export const SOUNDS = {
  // Typing (P2): wood knock and a small bell a semitone up a letter (05 §7.2).
  "type.key": def("typing", 2, 60, "sfx/typing/key", { gapMs: 0 }),
  "type.miss": def("typing", 2, 60, "sfx/typing/miss", { gapMs: 20, gainDb: -12 }),
  "type.back": def("typing", 2, 45, "sfx/typing/back", { gapMs: 20, gainDb: -6 }),
  "type.switch": def("typing", 2, 80, "sfx/typing/switch", { gapMs: 40, gainDb: -2 }),
  "type.word": def("typing", 2, 320, "sfx/typing/word", { gapMs: 40 }),

  // Hỏa Long (dragon bus; the kit's dragon voice synth through its voice bus).
  "fire.cast": def("world", 4, 750, "sfx/dragon/fire-cast", { gapMs: 45, gainDb: -3 }),
  "fire.impact.a": def("world", 4, 600, "sfx/dragon/fire-impact-a", { gapMs: 30 }),
  "fire.impact.b": def("world", 4, 640, "sfx/dragon/fire-impact-b", { gapMs: 30 }),
  "fire.impact.c": def("world", 4, 1000, "sfx/dragon/fire-impact-c", { gapMs: 30, group: "blast" }),
  "impact.multi": def("world", 4, 700, "sfx/dragon/impact-multi", { gapMs: 90, group: "blast", gainDb: -2 }),
  "dragon.hurt": def("dragon", 3, 600, "sfx/dragon/hurt", { gapMs: 220, gainDb: -2 }),
  "dragon.low": def("stingers", 1, 900, "sfx/dragon/low-alarm", { gapMs: 3000 }),
  "dragon.heartbeat": def("stingers", 1, 420, "sfx/dragon/heartbeat", { gapMs: 900, gainDb: -6 }),
  "dragon.down": def("dragon", 1, 1600, "sfx/dragon/down", { gapMs: 2000 }),
  "dragon.breath": def("world", 3, 1650, "sfx/dragon/breath", { gapMs: 500 }),
  "dragon.skyfire.cast": def("world", 3, 900, "sfx/dragon/skyfire-cast", { gapMs: 500, gainDb: -2 }),
  "dragon.skyfire.impact": def("world", 3, 1800, "sfx/dragon/skyfire-impact", { gapMs: 200, group: "blast" }),
  "dragon.roar": def("dragon", 3, 1300, "sfx/dragon/roar", { gapMs: 600 }),
  "dragon.rage": def("dragon", 3, 1000, "sfx/dragon/rage-full", { gapMs: 1500, gainDb: -2 }),
  "dragon.inferno": def("dragon", 3, 2400, "sfx/dragon/inferno", { gapMs: 800 }),
  "dragon.skill-ready": def("dragon", 3, 380, "sfx/dragon/skill-ready", { gapMs: 600, gainDb: -6, vary: false }),
  "dragon.level": def("dragon", 3, 900, "sfx/dragon/level-up", { gapMs: 800, gainDb: -4, vary: false }),
  "dragon.potion": def("dragon", 3, 750, "sfx/dragon/potion", { gapMs: 300, gainDb: -4 }),

  // Enemies by class (05 §7.1: by class, not species; pitch by size, tone by material).
  "enemy.biped.spawn": def("enemies", 5, 380, "sfx/enemy/biped-spawn", { gapMs: 120, group: "growl", gainDb: -5 }),
  "enemy.biped.windup": def("enemies", 5, 260, "sfx/enemy/biped-windup", { gapMs: 90, gainDb: -8 }),
  "enemy.biped.attack": def("enemies", 4, 240, "sfx/enemy/biped-attack", { gapMs: 60 }),
  "enemy.biped.shoot": def("enemies", 4, 300, "sfx/enemy/biped-shoot", { gapMs: 70, gainDb: -6 }),
  "enemy.biped.hit": def("enemies", 4, 200, "sfx/enemy/biped-hit", { gapMs: 50, gainDb: -5 }),
  "enemy.biped.death": def("enemies", 4, 560, "sfx/enemy/biped-death", { gapMs: 40, group: "death", gainDb: -6 }),
  "enemy.biped.march": def("enemies", 5, 4000, "sfx/enemy/biped-march", { loop: true, gainDb: -14 }),
  "enemy.quadruped.spawn": def("enemies", 5, 420, "sfx/enemy/quadruped-spawn", { gapMs: 120, group: "growl", gainDb: -6 }),
  "enemy.quadruped.windup": def("enemies", 5, 300, "sfx/enemy/quadruped-windup", { gapMs: 90, gainDb: -6 }),
  "enemy.quadruped.attack": def("enemies", 4, 220, "sfx/enemy/quadruped-attack", { gapMs: 60, gainDb: -9 }),
  "enemy.quadruped.charge": def("enemies", 4, 420, "sfx/enemy/quadruped-charge", { gapMs: 120, gainDb: -6 }),
  "enemy.quadruped.howl": def("enemies", 4, 1100, "sfx/enemy/quadruped-howl", { gapMs: 1500, group: "growl", gainDb: -3 }),
  "enemy.quadruped.hit": def("enemies", 4, 200, "sfx/enemy/quadruped-hit", { gapMs: 50, gainDb: -5 }),
  "enemy.quadruped.death": def("enemies", 4, 600, "sfx/enemy/quadruped-death", { gapMs: 40, group: "death", gainDb: -6 }),
  "enemy.quadruped.march": def("enemies", 5, 4000, "sfx/enemy/quadruped-march", { loop: true, gainDb: -16 }),
  "enemy.flyer.spawn": def("enemies", 5, 360, "sfx/enemy/flyer-spawn", { gapMs: 120, group: "growl" }),
  "enemy.flyer.windup": def("enemies", 5, 320, "sfx/enemy/flyer-windup", { gapMs: 90, gainDb: -1 }),
  "enemy.flyer.attack": def("enemies", 4, 300, "sfx/enemy/flyer-attack", { gapMs: 60, gainDb: -8 }),
  "enemy.flyer.hit": def("enemies", 4, 180, "sfx/enemy/flyer-hit", { gapMs: 50, gainDb: -3 }),
  "enemy.flyer.death": def("enemies", 4, 700, "sfx/enemy/flyer-death", { gapMs: 40, group: "death", gainDb: -2 }),
  "enemy.flyer.march": def("enemies", 5, 4000, "sfx/enemy/flyer-buzz", { loop: true, gainDb: -17 }),
  "enemy.swarm.spawn": def("enemies", 5, 300, "sfx/enemy/swarm-spawn", { gapMs: 150, group: "growl", gainDb: -14 }),
  "enemy.swarm.attack": def("enemies", 4, 140, "sfx/enemy/swarm-attack", { gapMs: 70, gainDb: -8 }),
  "enemy.swarm.hit": def("enemies", 4, 140, "sfx/enemy/swarm-hit", { gapMs: 50, gainDb: -8 }),
  "enemy.swarm.death": def("enemies", 4, 380, "sfx/enemy/swarm-death", { gapMs: 40, group: "death", gainDb: -7 }),
  "enemy.swarm.march": def("enemies", 5, 4000, "sfx/enemy/swarm-skitter", { loop: true, gainDb: -17 }),
  "kill.chime": def("enemies", 4, 220, "sfx/enemy/kill-chime", { gapMs: 45, gainDb: -2, vary: false }),

  // Warnings (P1, always heard, 05 §7).
  "warn.strike": def("stingers", 1, 260, "sfx/warn/strike", { gapMs: 800, gainDb: -4 }),
  "warn.telegraph": def("stingers", 1, 700, "sfx/warn/telegraph", { gapMs: 600 }),

  // General G01 Yêu Rêu Cầm Cờ (own set, 02 §3.4).
  "general.g01.horn": def("enemies", 3, 2200, "sfx/general/g01-horn", { gapMs: 3000, gainDb: -3 }),
  "general.g01.attack": def("enemies", 4, 600, "sfx/general/g01-attack", { gapMs: 200, gainDb: -5 }),
  "general.g01.skill": def("enemies", 3, 1100, "sfx/general/g01-banner", { gapMs: 1000, gainDb: -5 }),
  "general.g01.aura": def("enemies", 4, 420, "sfx/general/g01-war-drum", { gapMs: 1500, gainDb: -9 }),
  "general.g01.death": def("enemies", 3, 1800, "sfx/general/g01-death", { gapMs: 1000, gainDb: -4 }),
  "general.aura.break": def("enemies", 3, 700, "sfx/general/aura-break", { gapMs: 400 }),

  // Traps ×2 each: arm (built) and trigger.
  "trap.spikes.arm": def("traps", 4, 380, "sfx/trap/spikes-arm", { gapMs: 120, gainDb: -3 }),
  "trap.spikes.trigger": def("traps", 4, 260, "sfx/trap/spikes-trigger", { gapMs: 70, gainDb: -4 }),
  "trap.pine-bomb.arm": def("traps", 4, 520, "sfx/trap/pine-bomb-arm", { gapMs: 120, gainDb: -4 }),
  "trap.pine-bomb.trigger": def("traps", 4, 1100, "sfx/trap/pine-bomb-trigger", { gapMs: 60, group: "blast", gainDb: -3 }),
  "trap.net.arm": def("traps", 4, 560, "sfx/trap/net-arm", { gapMs: 120, gainDb: -3 }),
  "trap.net.trigger": def("traps", 4, 620, "sfx/trap/net-trigger", { gapMs: 80, gainDb: -4 }),

  // Supports ×2 each: Vệ Binh Rêu (place, down) and Nhà Thuốc Lá (place, pulse); a shared blow on our side.
  "unit.warden.place": def("units", 4, 620, "sfx/unit/warden-place", { gapMs: 150, gainDb: -6 }),
  "unit.warden.down": def("units", 4, 900, "sfx/unit/warden-down", { gapMs: 200, gainDb: -6 }),
  "house.herb.place": def("units", 4, 700, "sfx/house/herb-place", { gapMs: 150, gainDb: -1 }),
  "house.herb.pulse": def("units", 4, 900, "sfx/house/herb-pulse", { gapMs: 300, gainDb: -6 }),
  "unit.hit": def("units", 4, 180, "sfx/unit/hit", { gapMs: 120, gainDb: -5 }),

  // UI ×4 (P2).
  "ui.select": def("ui", 2, 70, "sfx/ui/select", { gapMs: 40 }),
  "ui.confirm": def("ui", 2, 260, "sfx/ui/confirm", { gapMs: 80, gainDb: -5 }),
  "ui.deny": def("ui", 2, 220, "sfx/ui/deny", { gapMs: 250, gainDb: -7 }),
  "ui.gold": def("ui", 2, 380, "sfx/ui/gold", { gapMs: 120, gainDb: -6 }),

  // Phase stingers.
  "wave.horn": def("stingers", 1, 2200, "sfx/stinger/wave-horn", { gapMs: 6000 }),
  "wave.clear": def("stingers", 3, 1300, "sfx/stinger/wave-clear", { gapMs: 3000, gainDb: -2 }),
  "stinger.victory": def("stingers", 1, 3600, "sfx/stinger/victory", { gapMs: 10_000 }),
  "stinger.defeat": def("stingers", 1, 3600, "sfx/stinger/defeat", { gapMs: 10_000 }),

  // Learning (P0, never ducked or stolen).
  "learn.new": def("learning", 0, 700, "sfx/learning/new-word", { gapMs: 250, gainDb: -1 }),
  "learn.right": def("learning", 0, 420, "sfx/learning/right", { gapMs: 150, gainDb: -5 }),
  "learn.wrong": def("learning", 0, 380, "sfx/learning/wrong", { gapMs: 150 }),

  // Ambience beds and one-shots (P5).
  "amb.forest": def("ambience", 5, 6000, "ambience/forest-wind", { loop: true, gainDb: -10 }),
  "amb.river": def("ambience", 5, 5000, "ambience/river", { loop: true, gainDb: -18 }),
  "amb.bird": def("ambience", 5, 700, "ambience/bird", { gapMs: 2500, gainDb: -12 }),
} as const satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;
export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];

export const soundDef = (id: SoundId): SoundDef => SOUNDS[id];

/** Default audio base for files (gitignored public/assets/dragon-hold/audio/). */
export const AUDIO_BASE = "/assets/dragon-hold/audio/";

// ── Class sets (05 §7.1) ────────────────────────────────────────────────────

/** M0a synth classes follow the silhouette gait; 9 file classes (AudioSet) can split them later. */
export type SoundClass = Gait;

export interface ClassSet {
  readonly spawn: SoundId;
  readonly windup: SoundId;
  readonly attack: SoundId;
  readonly shoot: SoundId;
  readonly charge: SoundId;
  readonly hit: SoundId;
  readonly death: SoundId;
  readonly march: SoundId;
}

export const CLASS_SETS: Readonly<Record<SoundClass, ClassSet>> = {
  biped: {
    spawn: "enemy.biped.spawn",
    windup: "enemy.biped.windup",
    attack: "enemy.biped.attack",
    shoot: "enemy.biped.shoot",
    charge: "enemy.biped.attack",
    hit: "enemy.biped.hit",
    death: "enemy.biped.death",
    march: "enemy.biped.march",
  },
  quadruped: {
    spawn: "enemy.quadruped.spawn",
    windup: "enemy.quadruped.windup",
    attack: "enemy.quadruped.attack",
    shoot: "enemy.quadruped.attack",
    charge: "enemy.quadruped.charge",
    hit: "enemy.quadruped.hit",
    death: "enemy.quadruped.death",
    march: "enemy.quadruped.march",
  },
  flyer: {
    spawn: "enemy.flyer.spawn",
    windup: "enemy.flyer.windup",
    attack: "enemy.flyer.attack",
    shoot: "enemy.flyer.attack",
    charge: "enemy.flyer.attack",
    hit: "enemy.flyer.hit",
    death: "enemy.flyer.death",
    march: "enemy.flyer.march",
  },
  swarm: {
    spawn: "enemy.swarm.spawn",
    windup: "enemy.swarm.attack",
    attack: "enemy.swarm.attack",
    shoot: "enemy.swarm.attack",
    charge: "enemy.swarm.attack",
    hit: "enemy.swarm.hit",
    death: "enemy.swarm.death",
    march: "enemy.swarm.march",
  },
};

/** A general's own set (02 §3.4); M0 has G01 only. */
export interface GeneralSet {
  readonly horn: SoundId;
  readonly attack: SoundId;
  readonly skill: SoundId;
  readonly aura: SoundId;
  readonly death: SoundId;
}

export const GENERAL_SETS: Readonly<Record<string, GeneralSet>> = {
  "moss-banner": { horn: "general.g01.horn", attack: "general.g01.attack", skill: "general.g01.skill", aura: "general.g01.aura", death: "general.g01.death" },
};

/** Pitch by size: small things sound higher (05 §7.1). */
const TIER_RATE: Readonly<Record<Tier, number>> = { swarm: 1.3, small: 1.08, medium: 1, heavy: 0.86, giant: 0.74 };

export interface FoeVoice {
  readonly cls: SoundClass;
  readonly general: boolean;
  readonly material: Material;
  readonly rate: number;
  readonly attack: "melee" | "ranged" | "charge";
}

const foeVoices = new Map<FoeId, FoeVoice>();

/** How a foe sounds: class set, material, pitch; null for an unknown id. */
export function foeVoice(foe: FoeId): FoeVoice | null {
  const known = foeVoices.get(foe);
  if (known) return known;
  const enemy = (ENEMIES as Readonly<Record<string, (typeof ENEMIES)[keyof typeof ENEMIES] | undefined>>)[foe];
  const general = (GENERALS as Readonly<Record<string, (typeof GENERALS)[keyof typeof GENERALS] | undefined>>)[foe];
  let voice: FoeVoice | null = null;
  if (enemy) voice = { cls: enemy.gait, general: false, material: enemy.show.material, rate: TIER_RATE[enemy.tier], attack: enemy.attack.kind };
  else if (general) voice = { cls: general.gait, general: true, material: general.show.material, rate: general.rank === "warlord" ? 0.7 : 0.82, attack: general.attack.kind };
  if (voice) foeVoices.set(foe, voice);
  return voice;
}
