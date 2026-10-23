/**
 * The shop (03 §4): in prep and breaks place, upgrade (2 presses in the UI),
 * sell, buy Tim Rồng, Vảy Cứng and potions; in a wave (C1–C5) only
 * consumables (Alt + 7/8/9, shared 8 s cooldown) and house repairs (`=` on a
 * ruined house); C6+ adds one quick place a wave, built in 2 s. Prices never
 * change inside a stage. Every refusal emits `rejected` with a reason.
 * Owner: sim-ourside (LANES.md).
 */
import { CONSUMABLES, HERO_UPGRADES, HOUSES, TRAPS, UNITS } from "../content/data/our-side";
import { FIRE_DRAGON, OUR_SIDE } from "../content/rules";
import type { ConsumableId, HeroUpgradeId, Phase, PlaceableId, SimCommand, Vec2 } from "../content/types";
import { earn, spend } from "./economy";
import { emit } from "./events";
import { msToTicks } from "./fixed";
import { buildHouse, levelHouse, removeHouse, repairHouse, mendHousesAtWaveEnd } from "./houses";
import { canPlace, canSell, canUpgrade, priceOf, quickBuildTicks, quickPlaceOpen, slotIndex } from "./placement";
import { applyStatus } from "./status";
import { buildTrap, levelTrap, removeTrap } from "./traps";
import { buildUnit, levelUnits, removeUnits, riseAll } from "./units";
import type { WorldInit, World } from "./world";

export interface ShopState {
  /** Consumables held, by id (2 slots × 3, 03 §6.3). */
  readonly held: Record<string, number>;
  /** Tim Rồng and Vảy Cứng bought this run. */
  readonly heroBuys: Record<string, number>;
  /** Shared consumable cooldown ends. */
  consumableReadyAt: number;
  /** Breaks seen so far (same-break refunds); prep is break 0. */
  breakNo: number;
  /** Phase seen at the last step, to catch break and wave starts. */
  lastPhase: Phase;
  /** Quick places this wave (C6+: at most 1). */
  quickPlaced: number;
}

export function createShopState(init: WorldInit): ShopState {
  return { held: {}, heroBuys: {}, consumableReadyAt: 0, breakNo: 0, lastPhase: "prep", quickPlaced: 0 };
}

function reject(world: World, command: SimCommand["type"], reason: string): void {
  emit(world, { type: "rejected", command, reason });
}

const isTrap = (item: PlaceableId): item is keyof typeof TRAPS => item in TRAPS;
const isHouse = (item: PlaceableId): item is keyof typeof HOUSES => item in HOUSES;
const isUnit = (item: PlaceableId): item is keyof typeof UNITS => item in UNITS;

export function place(world: World, item: PlaceableId, slot: string): void {
  const index = slotIndex(world, slot);
  const check = canPlace(world, item, index);
  if (!check.ok) return reject(world, "place", check.reason);
  if (!spend(world, priceOf(item), "build")) return reject(world, "place", "gold");
  const state = world.slots[index]!;
  const quick = !(world.phase === "prep" || world.phase === "break") && quickPlaceOpen(world);
  state.item = item;
  state.level = 1;
  state.spent = priceOf(item);
  state.boughtInBreak = quick ? -1 : world.shop.breakNo;
  state.activeAt = quick ? world.tick + quickBuildTicks() : world.tick;
  if (quick) world.shop.quickPlaced += 1;
  if (isTrap(item)) buildTrap(world, index, item);
  else if (isHouse(item)) buildHouse(world, index, item);
  else if (isUnit(item)) buildUnit(world, index, item);
  emit(world, { type: "built", slot: index, item, level: 1 });
}

/** `=` in edit mode: next level in prep and breaks; on a ruined house, a repair (also in a wave, 03 §0.1 rule 6). */
export function upgrade(world: World, slot: string): void {
  const index = slotIndex(world, slot);
  const state = world.slots[index];
  if (state && state.item !== null && isHouse(state.item)) {
    const house = world.houses.list.find((item) => item.slot === index);
    if (house && house.ruined) return repairHouse(world, index);
  }
  const check = canUpgrade(world, index);
  if (!check.ok) return reject(world, "upgrade", check.reason);
  if (!spend(world, check.gold, "upgrade")) return reject(world, "upgrade", "gold");
  const filled = world.slots[index]!;
  const item = filled.item!;
  filled.level += 1;
  filled.spent += check.gold;
  if (isTrap(item)) levelTrap(world, index, filled.level);
  else if (isHouse(item)) levelHouse(world, index, filled.level);
  else if (isUnit(item)) levelUnits(world, index, filled.level);
  emit(world, { type: "upgraded", slot: index, item, level: filled.level });
}

export function sell(world: World, slot: string): void {
  const index = slotIndex(world, slot);
  const check = canSell(world, index);
  if (!check.ok) return reject(world, "sell", check.reason);
  const filled = world.slots[index]!;
  const item = filled.item!;
  if (isTrap(item)) removeTrap(world, index);
  else if (isHouse(item)) removeHouse(world, index);
  else if (isUnit(item)) removeUnits(world, index);
  filled.item = null;
  filled.level = 0;
  filled.spent = 0;
  filled.boughtInBreak = -1;
  filled.activeAt = 0;
  earn(world, check.gold, "sell");
  emit(world, { type: "sold", slot: index, item, refund: check.gold });
}

const isConsumable = (item: ConsumableId | HeroUpgradeId): item is ConsumableId => item in CONSUMABLES;

/** Base max HP of the Fire Dragon at this chapter (01 §2.2, ×g(c)). */
const heroBaseHp = (world: World): number => Math.round((FIRE_DRAGON.hp * world.gPm) / 1000);

/** Max HP Tim Rồng has added so far (hero level-ups must keep it when they rescale max HP). */
export function heroMaxHpBonus(world: World): number {
  const def = HERO_UPGRADES["dragon-heart"];
  if (def.effect.kind !== "max-hp") return 0;
  return (world.shop.heroBuys["dragon-heart"] ?? 0) * Math.round((heroBaseHp(world) * def.effect.pct) / 100);
}

/** Price of the next buy of a hero upgrade (03 §6.2: 80 / 120 / 160…); 0 when sold out. */
export function heroUpgradePrice(world: World, item: HeroUpgradeId): number {
  const def = HERO_UPGRADES[item];
  const count = world.shop.heroBuys[item] ?? 0;
  return count >= def.maxPerRun ? 0 : (def.costs[count] ?? 0);
}

export function buy(world: World, item: ConsumableId | HeroUpgradeId): void {
  const shop = world.shop;
  if (!(world.phase === "prep" || world.phase === "break")) return reject(world, "buy", "phase");
  if (isConsumable(item)) {
    const def = CONSUMABLES[item];
    if (!world.stage.carry.includes(item)) return reject(world, "buy", "locked");
    const held = shop.held[item] ?? 0;
    if (held >= def.stackMax) return reject(world, "buy", "limit");
    const kinds = Object.keys(shop.held).filter((id) => (shop.held[id] ?? 0) > 0).length;
    if (held === 0 && kinds >= OUR_SIDE.consumableSlots) return reject(world, "buy", "limit");
    if (!spend(world, def.cost, "buy")) return reject(world, "buy", "gold");
    shop.held[item] = held + 1;
    emit(world, { type: "bought", item, count: held + 1 });
    return;
  }
  const def = HERO_UPGRADES[item];
  if (!def || !world.stage.unlocks.heroUpgrades.includes(item)) return reject(world, "buy", "locked");
  const count = shop.heroBuys[item] ?? 0;
  if (count >= def.maxPerRun) return reject(world, "buy", "limit");
  if (!spend(world, def.costs[count] ?? 0, "buy")) return reject(world, "buy", "gold");
  shop.heroBuys[item] = count + 1;
  const hero = world.hero;
  const effect = def.effect;
  if (effect.kind === "max-hp") {
    // +10 % of the base max HP, healed at once (03 §6.2).
    const gain = Math.round((heroBaseHp(world) * effect.pct) / 100);
    hero.hpMax += gain;
    hero.hp += gain;
  } else if (effect.kind === "armour") hero.armour += effect.amount;
  else hero.resist += effect.amount;
  emit(world, { type: "bought", item, count: count + 1 });
}

/** Alt + 7/8/9: works in prep, warning, wave and break; shared 8 s cooldown (03 §6.3). */
export function useConsumable(world: World, item: ConsumableId, at?: Vec2): void {
  const shop = world.shop;
  if (world.phase === "victory" || world.phase === "defeat") return reject(world, "consumable", "phase");
  const def = CONSUMABLES[item];
  if (!def || (shop.held[item] ?? 0) <= 0) return reject(world, "consumable", "none");
  if (world.tick < shop.consumableReadyAt) return reject(world, "consumable", "cooldown");
  if (world.hero.hp <= 0) return reject(world, "consumable", "phase");
  const effect = def.effect;
  if (effect.kind === "heal-over-time") {
    // 25 % of max HP over 2 s; poison halves it as it lands (03 §2.3).
    applyStatus(world, { kind: "hero" }, world.hero.statuses, {
      id: "regen",
      durationMs: effect.durationMs,
      value: Math.round((world.hero.hpMax * effect.healPct) / 100),
      by: "consumable",
    });
  }
  shop.held[item] = (shop.held[item] ?? 0) - 1;
  shop.consumableReadyAt = world.tick + msToTicks(def.cooldownMs);
  const [x, z] = def.area && at ? at : world.map.dais.center;
  emit(world, { type: "consumable", item, x, z });
}

/** Phase hooks (stepEconomy calls it each tick): a break starts → break number, units rise, houses mend; a wave starts → quick place resets. */
export function trackPhase(world: World): void {
  const shop = world.shop;
  if (world.phase === shop.lastPhase) return;
  const from = shop.lastPhase;
  shop.lastPhase = world.phase;
  if (world.phase === "break") {
    shop.breakNo += 1;
    world.economy.reviewAnswers = 0;
    riseAll(world);
    mendHousesAtWaveEnd(world);
  } else if (world.phase === "wave" && from !== "wave") shop.quickPlaced = 0;
}
