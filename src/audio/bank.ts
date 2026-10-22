/**
 * Sound keys and their sources (05 §7.1): class sets (infantry, marksman,
 * charger, pack, flyer, bomber, sapper, caster, general) with slots spawn,
 * step, windup, attack, hit, death, skill, buffed; files under
 * /assets/dragon-hold/audio/ (not in Git) or a synth recipe.
 * Owner: audio (LANES.md). Stub: data TODO.
 */
import type { AudioSet } from "../content/types";

export type SoundSlot = "spawn" | "step" | "windup" | "attack" | "hit" | "death" | "skill" | "buffed";

export interface SoundSource {
  /** URL under /assets/dragon-hold/audio/, or null to synthesise. */
  readonly url: string | null;
  readonly gainDb: number;
}

// TODO(audio): fill per class from the M0 sound list (DESIGN.md §7.2).
export const SOUND_SETS: Readonly<Partial<Record<AudioSet, Partial<Record<SoundSlot, SoundSource>>>>> = {};
