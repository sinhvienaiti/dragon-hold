/**
 * Blockers and helpers (03 §9): units stand within 4 m of their block point,
 * stop foes while their block slots cover the foe's weight (else the foe
 * pushes on at 50 % speed), fight the foes they block, fall into a bud and
 * rise after the respawn time, all rise at wave end. M0: Vệ Binh Rêu.
 * Owner: sim-ourside (LANES.md). Stub: signatures fixed, bodies TODO.
 */
import type { UnitId } from "../content/types";
import type { EnemyState, WorldInit, World } from "./world";
import type { StatusSet } from "./status";

export interface UnitState {
  readonly index: number;
  /** Map slot (block point) index. */
  readonly slot: number;
  readonly unit: UnitId;
  level: number;
  hp: number;
  hpMax: number;
  /** Position in u (within the leash of its point). */
  x: number;
  z: number;
  /** Tick it rises again (−1: standing). */
  downUntil: number;
  /** Block quarters in use. */
  blockUsed: number;
  attackAt: number;
  lastHitAt: number;
  statuses: StatusSet;
}

export interface UnitsState {
  readonly list: UnitState[];
}

export function createUnitsState(init: WorldInit): UnitsState {
  return { list: [] };
}

export function buildUnit(world: World, slot: number, unit: UnitId): UnitState | null {
  // TODO(sim-ourside): createStatusSet() for its statuses.
  return null;
}

/** The standing unit able to block `enemy` now (−1: none); movement asks before each step. */
export function blockerFor(world: World, enemy: EnemyState): number {
  // TODO(sim-ourside)
  return -1;
}

/** Unit attacks, regen, falls and respawns; emits `unit-down`, `unit-up`, `hit`. */
export function stepUnits(world: World): void {
  // TODO(sim-ourside)
}
