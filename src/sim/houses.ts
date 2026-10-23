/**
 * Magic houses (03 §8): auras on allies, HP 600 (+40 % a level), Đổ Nát at 0
 * (off, never lost; repair 30 % of the spent price, or half mends itself at
 * wave end), energy +1 per word kill inside the area, pulse at 5 (03 §10.2).
 * M0: Nhà Thuốc Lá heals 1.5 % max HP a second to units and both Dragons
 * within 7 m (the Dragons count up to the dais edge), pulse heals 10 %.
 * Levels 2–3: +45 % then +35 % healing (03 §3.3); chain tiers add 5–20 % (03 §10.4).
 * Owner: sim-ourside (LANES.md).
 */
import { HOUSES, OUR_SIDE_TUNING } from "../content/data/our-side";
import { CHAIN, ECONOMY, OUR_SIDE } from "../content/rules";
import type { DamageType, EntityRef, HouseDef, HouseId } from "../content/types";
import { spend } from "./economy";
import { emit } from "./events";
import { dist2, mToU, mmToU, msToTicks, uToM, within } from "./fixed";
import { healGuide, healHero } from "./status";
import { healUnit } from "./units";
import { chainTier } from "./words";
import type { EnemyState, WorldInit, World } from "./world";

export interface HouseState {
  readonly slot: number;
  readonly house: HouseId;
  level: number;
  hp: number;
  hpMax: number;
  energy: number;
  ruined: boolean;
  /** Tick of the next aura beat. */
  beatAt: number;
}

export interface HousesState {
  readonly list: HouseState[];
}

export function createHousesState(init: WorldInit): HousesState {
  return { list: [] };
}

/** Effect × permille at `level` (×1.45, then ×1.35 more). */
export function houseMainPm(def: HouseDef, level: number): number {
  let pm = 1000;
  for (let step = 1; step < level && step <= def.upgrade.mainPct.length; step += 1) pm = Math.round((pm * (100 + def.upgrade.mainPct[step - 1]!)) / 100);
  return pm;
}

/** Max HP at `level`: 600 × g(c), +40 % a level (03 §8.1). */
export function houseHpMax(world: World, def: HouseDef, level: number): number {
  let hp = Math.round((def.hp * world.gPm) / 1000);
  const step = def.upgrade.hpPct ?? OUR_SIDE.houseHpPerLevelPct;
  for (let at = 1; at < level; at += 1) hp = Math.round((hp * (100 + step)) / 100);
  return hp;
}

export function buildHouse(world: World, slot: number, house: HouseId): void {
  const hp = houseHpMax(world, HOUSES[house], 1);
  const active = world.slots[slot]?.activeAt ?? world.tick;
  world.houses.list.push({ slot, house, level: 1, hp, hpMax: hp, energy: 0, ruined: false, beatAt: (active > world.tick ? active : world.tick) + msToTicks(OUR_SIDE_TUNING.houseBeatMs) });
}

export function levelHouse(world: World, slot: number, level: number): void {
  const house = world.houses.list.find((item) => item.slot === slot);
  if (!house) return;
  const hpMax = houseHpMax(world, HOUSES[house.house], level);
  house.level = level;
  if (!house.ruined) house.hp += hpMax - house.hpMax;
  house.hpMax = hpMax;
}

export function removeHouse(world: World, slot: number): void {
  const index = world.houses.list.findIndex((item) => item.slot === slot);
  if (index >= 0) world.houses.list.splice(index, 1);
}

/** Repair price of a ruined house: 30 % of what was spent on its slot (03 §8.1). */
export function repairPrice(world: World, slot: number): number {
  return Math.round(((world.slots[slot]?.spent ?? 0) * ECONOMY.repairCostPct) / 100);
}

/** Repairs a ruined house to full HP (any phase but the end); rejects when it stands or gold is short. */
export function repairHouse(world: World, slot: number): void {
  const house = world.houses.list.find((item) => item.slot === slot);
  if (!house || !house.ruined) {
    emit(world, { type: "rejected", command: "upgrade", reason: "not-ruined" });
    return;
  }
  if (!spend(world, repairPrice(world, slot), "repair")) {
    emit(world, { type: "rejected", command: "upgrade", reason: "gold" });
    return;
  }
  house.ruined = false;
  house.hp = house.hpMax;
  house.beatAt = world.tick + msToTicks(OUR_SIDE_TUNING.houseBeatMs);
  // WANT EVENT: house-repaired { slot } (the view reads `ruined` meanwhile).
}

/** Wave end: every damaged house mends 50 % of its max HP; a ruined one stands again (03 §8.1). */
export function mendHousesAtWaveEnd(world: World): void {
  for (const house of world.houses.list) {
    if (house.hp >= house.hpMax) continue;
    const mend = Math.round((house.hpMax * ECONOMY.waveEndAutoRepairPct) / 100);
    house.hp = house.hp + mend > house.hpMax ? house.hpMax : house.hp + mend;
    if (house.ruined && house.hp > 0) {
      house.ruined = false;
      house.beatAt = world.tick + msToTicks(OUR_SIDE_TUNING.houseBeatMs);
    }
  }
}

/** Damage to a house (foes that break buildings, archers): Đổ Nát at 0; emits `hit`. Returns HP removed. */
export function damageHouse(world: World, slot: number, amount: number, type: DamageType, source: EntityRef): number {
  const house = world.houses.list.find((item) => item.slot === slot);
  if (!house || house.ruined || amount <= 0) return 0;
  const dealt = amount > house.hp ? house.hp : amount;
  house.hp -= dealt;
  // Đổ Nát: off until repaired; its energy stays (03 §10.2).
  if (house.hp <= 0) house.ruined = true;
  const state = world.slots[slot]!;
  emit(world, { type: "hit", target: { kind: "house", slot }, source, amount: dealt, damageType: type, tier: 1, grade: null, x: uToM(state.x), z: uToM(state.z), hpLeft: house.hp });
  return dealt;
}

/** Heal of a beat or pulse on one ally: `pm` permille of its max HP, with level and chain bonuses. */
const healOf = (hpMax: number, pm: number, mainPm: number, chainPct: number): number => {
  const amount = Math.round((hpMax * pm * mainPm * (100 + chainPct)) / 100_000_000);
  return amount < 1 ? 1 : amount;
};

/** What one ally gets from one house this beat: its heal, the house it comes from. */
interface HealPick {
  amount: number;
  house: HouseState;
}

/**
 * Heals every ally in reach by `pm` permille of their max HP. With `only`,
 * the house heals just that ally (the aura beat picks the strongest house per
 * ally); a pulse heals all of them. One `heal` event per ally healed.
 */
function healAllies(world: World, house: HouseState, pm: number): void {
  for (const target of targetsOf(world, house)) applyHeal(world, house, target, healFor(world, house, target, pm));
}

type AllyTarget = { readonly kind: "hero" } | { readonly kind: "guide" } | { readonly kind: "unit"; readonly index: number };

/** Allies inside `house`'s area: the Dragons up to the dais edge, standing units within its radius. */
function targetsOf(world: World, house: HouseState): AllyTarget[] {
  const def = HOUSES[house.house];
  const slot = world.slots[house.slot]!;
  const radius = mmToU(def.radiusMm);
  const reach = radius + mmToU(OUR_SIDE_TUNING.heroReachMm);
  const daisX = mToU(world.map.dais.center[0]);
  const daisZ = mToU(world.map.dais.center[1]);
  const out: AllyTarget[] = [];
  if (world.hero.hp < world.hero.hpMax && within(slot.x, slot.z, daisX, daisZ, reach)) out.push({ kind: "hero" });
  if (world.guide.downUntil < 0 && world.guide.hp < world.guide.hpMax && within(slot.x, slot.z, daisX, daisZ, reach)) out.push({ kind: "guide" });
  for (const unit of world.units.list) {
    if (unit.downUntil >= 0 || unit.hp >= unit.hpMax) continue;
    if (dist2(unit.x, unit.z, slot.x, slot.z) <= radius * radius) out.push({ kind: "unit", index: unit.index });
  }
  return out;
}

/** The heal `house` gives `target` at `pm` permille, with its level and the chain bonus. */
function healFor(world: World, house: HouseState, target: AllyTarget, pm: number): number {
  const def = HOUSES[house.house];
  const mainPm = houseMainPm(def, house.level);
  const chainPct = CHAIN.ourSideBonusPct[chainTier(world.words.chain)] ?? 0;
  const hpMax = target.kind === "hero" ? world.hero.hpMax : target.kind === "guide" ? world.guide.hpMax : world.units.list[target.index]!.hpMax;
  return healOf(hpMax, pm, mainPm, chainPct);
}

function applyHeal(world: World, house: HouseState, target: AllyTarget, amount: number): void {
  const slot = world.slots[house.slot]!;
  const source: EntityRef = { kind: "house", slot: house.slot };
  const x = uToM(slot.x);
  const z = uToM(slot.z);
  let gained = 0;
  let ref: EntityRef;
  let tx: number;
  let tz: number;
  if (target.kind === "hero") {
    gained = healHero(world, amount);
    ref = { kind: "hero" };
    [tx, tz] = world.map.dais.center;
  } else if (target.kind === "guide") {
    gained = healGuide(world, amount);
    ref = { kind: "guide" };
    [tx, tz] = world.map.dais.guideAt;
  } else {
    const unit = world.units.list[target.index]!;
    const before = unit.hp;
    healUnit(world, unit, amount);
    gained = unit.hp - before;
    ref = { kind: "unit", slot: unit.index };
    tx = uToM(unit.x);
    tz = uToM(unit.z);
  }
  if (gained > 0) emit(world, { type: "heal", source, target: ref, amount: gained, x, z, tx, tz });
}

const targetKey = (target: AllyTarget): string => (target.kind === "unit" ? "u" + target.index : target.kind);

/**
 * Auras and pulses; emits `heal` per ally a beat reaches. The aura beats once
 * a second for all houses together, and an ally in reach of several houses
 * gets only the strongest (03 §8: "Hào quang cùng loại không cộng; lấy mạnh
 * nhất"). It beats only in a wave: breaks already heal 10 % (00 §4.5), and
 * the break's heal cap (20 % with Tổ Ấm or Thư Viện) must not grow by a house
 * healing all break long.
 */
export function stepHouses(world: World): void {
  const tick = world.tick;
  const beat = msToTicks(OUR_SIDE_TUNING.houseBeatMs);
  const ready: HouseState[] = [];
  for (const house of world.houses.list) {
    // 0 HP from a blow dealt outside damageHouse is Đổ Nát too.
    if (!house.ruined && house.hp <= 0) house.ruined = true;
    if (house.ruined || tick < house.beatAt) continue;
    if (tick < (world.slots[house.slot]?.activeAt ?? 0)) continue;
    ready.push(house);
  }
  if (world.phase !== "wave" || tick % beat !== 0 || ready.length === 0) return;
  const best = new Map<string, HealPick & { target: AllyTarget }>();
  for (const house of ready) {
    const effect = HOUSES[house.house].effect;
    if (effect.kind !== "heal-aura") continue;
    for (const target of targetsOf(world, house)) {
      const amount = healFor(world, house, target, effect.healPmPerS);
      const key = targetKey(target);
      const current = best.get(key);
      if (current === undefined || amount > current.amount) best.set(key, { amount, house, target });
    }
  }
  for (const pick of best.values()) applyHeal(world, pick.house, pick.target, pick.amount);
}

/** Word kills inside a house's area give it energy (03 §10.2); cleanup calls it once per dead foe. */
export function onEnemyKilled(world: World, enemy: EnemyState): void {
  if (enemy.killedBy !== "word") return;
  for (const house of world.houses.list) {
    if (house.ruined) continue;
    const def = HOUSES[house.house];
    const slot = world.slots[house.slot]!;
    if (!within(enemy.x, enemy.z, slot.x, slot.z, mmToU(def.radiusMm))) continue;
    house.energy += 1;
    if (house.energy < OUR_SIDE.houseEnergyMax) continue;
    house.energy = 0;
    // Xung: Nhà Thuốc Lá heals 10 % at once.
    if (def.pulse.kind === "heal-burst") healAllies(world, house, def.pulse.healPct * 10);
    emit(world, { type: "house-pulse", slot: house.slot, house: house.house, x: uToM(slot.x), z: uToM(slot.z) });
  }
}
