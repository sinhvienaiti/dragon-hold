/**
 * Magic houses (03 §8): auras on allies, HP 600 (+40 % a level), Đổ Nát at 0
 * (off, never lost), energy +1 per word kill inside the area, pulse at 5.
 * M0: Nhà Thuốc Lá heals 1.5 % max HP a second, pulse heals 10 %.
 * Owner: sim-ourside (LANES.md). Stub: signatures fixed, bodies TODO.
 */
import type { HouseId } from "../content/types";
import type { EnemyState, WorldInit, World } from "./world";

export interface HouseState {
  readonly slot: number;
  readonly house: HouseId;
  level: number;
  hp: number;
  hpMax: number;
  energy: number;
  ruined: boolean;
}

export interface HousesState {
  readonly list: HouseState[];
}

export function createHousesState(init: WorldInit): HousesState {
  return { list: [] };
}

export function buildHouse(world: World, slot: number, house: HouseId): void {
  // TODO(sim-ourside)
}

/** Auras and pulses; emits `house-pulse`. */
export function stepHouses(world: World): void {
  // TODO(sim-ourside)
}

/** Word kills inside a house's area give it energy (03 §10.2); cleanup calls it once per dead foe. */
export function onEnemyKilled(world: World, enemy: EnemyState): void {
  // TODO(sim-ourside)
}
