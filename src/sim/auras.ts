/**
 * General auras (02 §3.1): rings on the ground; same kind keeps the strongest;
 * at most 2 auras per foe; Ấn Phá and silence turn them off for a while.
 * Owner: sim-battle (LANES.md). Stub: signatures fixed, bodies TODO.
 */
import type { AuraKind } from "../content/types";
import type { EnemyState, WorldInit, World } from "./world";

export interface AuraState {
  /** Per foe slot: bitmask of aura kinds affecting it this tick (index = AURA_BITS). */
  readonly bySlot: number[];
  /** Per general slot: tick its auras come back after a seal (−1: on). */
  readonly offUntil: number[];
}

export const AURA_BITS: readonly AuraKind[] = ["speed", "damage", "attack-rate", "armour", "resist", "word-shield", "heal", "tenacity", "hide-words", "trap-slow", "no-push", "thorns", "range"];

export function createAuraState(init: WorldInit): AuraState {
  return { bySlot: [], offUntil: [] };
}

/** Recomputes who stands in which aura; emits `aura` on/off. */
export function stepAuras(world: World): void {
  // TODO(sim-battle)
}

/** Total bonus of `kind` on `enemy` in %, after the strongest-of-kind rule. */
export function auraPct(world: World, enemy: EnemyState, kind: AuraKind): number {
  // TODO(sim-battle)
  return 0;
}

/** Ấn Phá typed: auras of `general` off for the seal's time (01 §3.6). */
export function sealGeneral(world: World, general: EnemyState): void {
  // TODO(sim-battle)
}
