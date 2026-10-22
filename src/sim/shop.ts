/**
 * The shop (03 §4): in breaks place, upgrade (2 presses), sell, buy Tim Rồng,
 * Vảy Cứng and potions; in a wave (C1–C5) only consumables (Alt + 7/8/9,
 * shared 8 s cooldown). Prices never change inside a stage.
 * Owner: sim-ourside (LANES.md). Stub: signatures fixed, bodies TODO.
 */
import type { ConsumableId, HeroUpgradeId, PlaceableId, Vec2 } from "../content/types";
import type { WorldInit, World } from "./world";

export interface ShopState {
  /** Consumables held, by id (2 slots × 3, 03 §6.3). */
  readonly held: Record<string, number>;
  /** Tim Rồng and Vảy Cứng bought this run. */
  readonly heroBuys: Record<string, number>;
  /** Shared consumable cooldown ends. */
  consumableReadyAt: number;
  /** Breaks seen so far (same-break refunds). */
  breakNo: number;
}

export function createShopState(init: WorldInit): ShopState {
  return { held: {}, heroBuys: {}, consumableReadyAt: 0, breakNo: 0 };
}

export function place(world: World, item: PlaceableId, slot: string): void {
  // TODO(sim-ourside): canPlace, spend, build trap / house / unit, emit `built`.
}

export function upgrade(world: World, slot: string): void {
  // TODO(sim-ourside)
}

export function sell(world: World, slot: string): void {
  // TODO(sim-ourside)
}

export function buy(world: World, item: ConsumableId | HeroUpgradeId): void {
  // TODO(sim-ourside)
}

export function useConsumable(world: World, item: ConsumableId, at?: Vec2): void {
  // TODO(sim-ourside)
}
