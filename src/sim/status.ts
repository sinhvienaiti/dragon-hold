/**
 * Statuses on foes, units and the Dragons (03 §2.3): slow keeps the strongest
 * under its cap, hard control (stun, root, freeze) shrinks on repeats then
 * grants Vững, burn and poison tick, Wet comes from the river.
 * Owner: sim-ourside (LANES.md). Stub: signatures fixed, bodies TODO.
 */
import type { EntityRef, StatusId } from "../content/types";
import type { World } from "./world";

export interface StatusEntry {
  readonly id: StatusId;
  /** Tick it ends (exclusive). */
  until: number;
  /** Strength in % (slow, mark, vulnerable) or per-second damage (burn, poison); 0 when unused. */
  value: number;
  stacks: number;
}

/** Statuses on one actor, oldest first; small on purpose (5 icons shown, 03 §2.3). */
export interface StatusSet {
  readonly list: StatusEntry[];
  /** Hard-control hits in the last 10 s, for diminishing returns. */
  hardHits: number;
  hardWindowEnds: number;
}

export function createStatusSet(): StatusSet {
  return { list: [], hardHits: 0, hardWindowEnds: 0 };
}

export interface ApplyStatus {
  readonly id: StatusId;
  readonly durationMs: number;
  readonly value?: number;
  /** Tenacity of the target in %, already capped (03 §2.3). */
  readonly tenacityPct?: number;
}

/** Applies a status with 03 §2.3 stacking rules and emits a `status` event; returns the ticks it got (0: resisted). */
export function applyStatus(world: World, target: EntityRef, set: StatusSet, status: ApplyStatus): number {
  // TODO(sim-ourside): stacking, caps, diminishing hard control, Vững, events.
  return 0;
}

export function hasStatus(set: StatusSet, id: StatusId, tick: number): boolean {
  for (const entry of set.list) if (entry.id === id && entry.until > tick) return true;
  return false;
}

/** Current slow in %, after the cap for this kind of foe. */
export function slowPct(set: StatusSet, tick: number, capPct: number): number {
  let best = 0;
  for (const entry of set.list) if (entry.id === "slow" && entry.until > tick && entry.value > best) best = entry.value;
  return best > capPct ? capPct : best;
}

/** Ticks damage over time, expires entries, emits `status` off events. */
export function stepStatus(world: World): void {
  // TODO(sim-ourside): burn, poison, regen, expiry on foes, units, heroes.
}
