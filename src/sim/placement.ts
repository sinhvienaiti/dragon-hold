/**
 * Map slots (03 §0.1 rule 4): what sits where, at which level, what it cost.
 * Pure queries for shop, UI ghosts and bots: which slots take an item, in
 * the keyboard order of 00 §6 (number key, arrows, Enter), which slots show
 * (only while placing or between waves, 05 §4), prices of upgrades and refunds.
 * Owner: sim-ourside (LANES.md).
 */
import { ENEMIES } from "../content/data/enemies";
import { GENERALS } from "../content/data/generals";
import { HOUSES, OUR_SIDE_TUNING, PLACEABLES, TRAPS, UNITS } from "../content/data/our-side";
import { BLOCK, ECONOMY, ELITE_PM, OUR_SIDE } from "../content/rules";
import type { FoeId, PlaceableId, SlotDef, SlotKind } from "../content/types";
import { dist2, mToU, mmToU, msToTicks } from "./fixed";
import type { WorldInit, World } from "./world";

export interface SlotState {
  readonly index: number;
  readonly def: SlotDef;
  /** Position in u. */
  readonly x: number;
  readonly z: number;
  /** Lane index for trap and block slots (−1: house pad). */
  readonly lane: number;
  /** u from the lane's gate (lane slots). */
  readonly along: number;
  item: PlaceableId | null;
  level: number;
  /** Gold spent on it so far (sell refunds 70 %, 03 §0.2). */
  spent: number;
  /** Break number it was bought in (same break: 100 % refund); −1 for a quick place in a wave. */
  boughtInBreak: number;
  /** Tick the item starts working (a C6+ quick place builds 2 s). */
  activeAt: number;
}

export function createSlots(init: WorldInit): SlotState[] {
  return init.map.slots.map((def, index) => ({
    index,
    def,
    x: mToU(def.pos[0]),
    z: mToU(def.pos[1]),
    lane: def.lane === undefined ? -1 : init.lanes.findIndex((lane) => lane.id === def.lane),
    along: def.atM === undefined ? 0 : mToU(def.atM),
    item: null,
    level: 0,
    spent: 0,
    boughtInBreak: -1,
    activeAt: 0,
  }));
}

export type PlaceCheck = { readonly ok: true } | { readonly ok: false; readonly reason: "slot-kind" | "occupied" | "phase" | "gold" | "limit" | "locked" | "unknown-slot" };

/** Upgrade and sell checks on a filled slot. */
export type SlotCheck = { readonly ok: true; readonly gold: number } | { readonly ok: false; readonly reason: "unknown-slot" | "empty" | "phase" | "gold" | "max-level" | "building" };

/** Highest level without branches (03 §7.3). */
export const MAX_LEVEL = 3;

/** Index of the slot with `id`, or −1. */
export function slotIndex(world: World, id: string): number {
  return world.slots.findIndex((slot) => slot.def.id === id);
}

/** Slot kind an item goes into. */
export const slotKindOf = (item: PlaceableId): SlotKind => PLACEABLES[item].footprint.slot;

/** Base price of an item (03 §7.2, §8.2, §9.2); prices never change inside a stage. */
export const priceOf = (item: PlaceableId): number => PLACEABLES[item].cost;

/** Price of the next level of `item` now at `level` (03 §0.2: level 2 = 70 %, level 3 = 100 % of the base); 0 at the top. */
export function upgradePrice(item: PlaceableId, level: number): number {
  if (level < 1 || level >= MAX_LEVEL) return 0;
  const pct = PLACEABLES[item].upgrade.costPct[level - 1] ?? ECONOMY.upgradeCostPct[level - 1]!;
  return Math.round((priceOf(item) * pct) / 100);
}

/** What selling the slot pays now: 70 % of everything spent, 100 % in the break it was bought (03 §0.2). */
export function sellRefund(world: World, index: number): number {
  const slot = world.slots[index];
  if (!slot || slot.item === null) return 0;
  const same = slot.boughtInBreak === world.shop.breakNo && slot.boughtInBreak >= 0;
  return Math.round((slot.spent * (same ? ECONOMY.sellSameBreakPct : ECONOMY.sellRefundPct)) / 100);
}

/** Full shop (place, upgrade, sell, buy) is open in prep and breaks (03 §0.1 rule 6). */
export const shopOpen = (world: World): boolean => world.phase === "prep" || world.phase === "break";

/** C6+ in a wave: one quick place a wave (03 §4.1); M0 is chapter 2, so never. */
export const quickPlaceOpen = (world: World): boolean =>
  world.phase === "wave" && world.stage.chapter >= OUR_SIDE.quickPlaceFromChapter && world.shop.quickPlaced === 0;

/** Units standing on the map now (03 §9.1 cap: 6). */
const unitCount = (world: World): number => world.units.list.length;

/** Whether `item` may go into slot `index` now (kind, free, phase, gold, limits). */
export function canPlace(world: World, item: PlaceableId, index: number): PlaceCheck {
  const slot = world.slots[index];
  if (!slot) return { ok: false, reason: "unknown-slot" };
  const def = PLACEABLES[item];
  if (!def || !world.stage.carry.includes(item)) return { ok: false, reason: "locked" };
  if (def.footprint.slot !== slot.def.kind) return { ok: false, reason: "slot-kind" };
  if (slot.item !== null) return { ok: false, reason: "occupied" };
  if (!shopOpen(world) && !quickPlaceOpen(world)) return { ok: false, reason: "phase" };
  if (item in UNITS && unitCount(world) + UNITS[item as keyof typeof UNITS].count > BLOCK.maxUnits) return { ok: false, reason: "limit" };
  if (item in HOUSES) {
    const limit = HOUSES[item as keyof typeof HOUSES].limit;
    if (limit !== undefined && world.slots.filter((other) => other.item === item).length >= limit) return { ok: false, reason: "limit" };
  }
  if (world.economy.gold < def.cost) return { ok: false, reason: "gold" };
  return { ok: true };
}

/** Whether the item in slot `index` may go up a level now; `gold` is the price. */
export function canUpgrade(world: World, index: number): SlotCheck {
  const slot = world.slots[index];
  if (!slot) return { ok: false, reason: "unknown-slot" };
  if (slot.item === null) return { ok: false, reason: "empty" };
  if (!shopOpen(world)) return { ok: false, reason: "phase" };
  if (slot.level >= MAX_LEVEL) return { ok: false, reason: "max-level" };
  const gold = upgradePrice(slot.item, slot.level);
  if (world.economy.gold < gold) return { ok: false, reason: "gold" };
  return { ok: true, gold };
}

/** Whether the item in slot `index` may be sold now; `gold` is the refund. */
export function canSell(world: World, index: number): SlotCheck {
  const slot = world.slots[index];
  if (!slot) return { ok: false, reason: "unknown-slot" };
  if (slot.item === null) return { ok: false, reason: "empty" };
  if (!shopOpen(world)) return { ok: false, reason: "phase" };
  if (slot.activeAt > world.tick) return { ok: false, reason: "building" };
  return { ok: true, gold: sellRefund(world, index) };
}

// ── Keyboard order and suggestions (00 §6) ─────────────────────────────────

/** Clockwise from north (−z) as an integer key in [0, 4 000 000): the "diamond angle", no trig. */
function bearingKey(x: number, z: number): number {
  const east = x;
  const north = -z;
  let turn: number;
  if (east === 0 && north === 0) turn = 0;
  else if (east >= 0 && north > 0) turn = east / (east + north);
  else if (east > 0 && north <= 0) turn = 1 + -north / (east - north);
  else if (east <= 0 && north < 0) turn = 2 + -east / (-east - north);
  else turn = 3 + north / (north - east);
  return Math.round(turn * 1_000_000);
}

/** Arrow-key order: clockwise from north around the dais, nearer first on the same bearing. */
export function keyboardOrder(world: World, indices: readonly number[]): number[] {
  const keyed = indices.map((index) => {
    const slot = world.slots[index]!;
    return { index, bearing: bearingKey(slot.x, slot.z), d2: dist2(slot.x, slot.z, 0, 0) };
  });
  keyed.sort((a, b) => a.bearing - b.bearing || a.d2 - b.d2 || a.index - b.index);
  return keyed.map((item) => item.index);
}

const threat10Of = (foe: FoeId): number => ((ENEMIES as Record<string, { threat10: number }>)[foe] ?? (GENERALS as Record<string, { threat10: number }>)[foe])?.threat10 ?? 0;

/** Threat of the next wave per lane (×10), from the wave card's groups (03 §4.1 reads the next wave). */
export function nextWaveLaneThreat(world: World): number[] {
  const out = world.lanes.map(() => 0);
  const wave = world.stage.waves[world.phase === "wave" || world.phase === "warning" ? world.wave - 1 : world.wave];
  if (!wave) return out;
  for (const group of wave.groups) {
    const lane = world.lanes.findIndex((item) => item.id === group.lane);
    if (lane < 0) continue;
    const elite = group.elite ? ELITE_PM : 1000;
    out[lane]! += Math.round((threat10Of(group.foe) * group.count * elite) / 1000);
    if (group.escort) out[lane]! += threat10Of(group.escort.foe) * group.escort.count;
  }
  return out;
}

/** The ground lane the next wave leans on (ties: stage lane order). */
function busiestGroundLane(world: World): number {
  const threat = nextWaveLaneThreat(world);
  let best = -1;
  for (const lane of world.lanes) {
    if (lane.sky) continue;
    if (best < 0 || threat[lane.index]! > threat[best]!) best = lane.index;
  }
  return best;
}

/** The ground lane the next wave sends most swarm clusters down (ties and none: `fallback`). */
function swarmLane(world: World, fallback: number): number {
  const wave = world.stage.waves[world.phase === "wave" || world.phase === "warning" ? world.wave - 1 : world.wave];
  if (!wave) return fallback;
  const count = world.lanes.map(() => 0);
  for (const group of wave.groups) {
    if (group.shape !== "cluster") continue;
    const lane = world.lanes.findIndex((item) => item.id === group.lane);
    if (lane >= 0 && !world.lanes[lane]!.sky) count[lane]! += 1;
  }
  let best = fallback;
  for (const lane of world.lanes) if (count[lane.index]! > (best >= 0 ? count[best]! : 0)) best = lane.index;
  return best;
}

/** Lower is a better first suggestion for `item` in slot `index`. */
function suggestionScore(world: World, item: PlaceableId, index: number, busiest: number): number {
  const slot = world.slots[index]!;
  if (item === "pine-bomb") {
    // A bomb needs ≥ 3 foes within its 3 m (03 §7.2), and foes come one by one: it goes where they bunch, just
    // before a Vệ Binh's hold point on its lane, else where the next wave's swarm clusters walk into the word zone
    // (the outermost trap slot of their lane). Test pass 27/10: the suggestion was the busiest lane's slot nearest
    // the dais, behind the warden, and bombs blew 0–0.6 times a wave.
    const radius = mmToU(TRAPS["pine-bomb"].area.radiusMm);
    let gap = Number.MAX_SAFE_INTEGER;
    for (const other of world.slots) {
      if (other.item !== "moss-warden" || other.lane < 0 || other.lane !== slot.lane) continue;
      const hold = other.along - mmToU(OUR_SIDE_TUNING.contactMm);
      const d = slot.along > hold ? slot.along - hold : hold - slot.along;
      if (d <= radius && d < gap) gap = d;
    }
    if (gap !== Number.MAX_SAFE_INTEGER) return gap;
    const onSwarm = slot.lane === swarmLane(world, busiest) ? 0 : 1;
    return 1e12 + onSwarm * 1e15 + slot.along;
  }
  if (item === "net-launcher") {
    // Nets reach the flyers' ring: the trap slot nearest a sky lane's end.
    let best = Number.MAX_SAFE_INTEGER;
    for (const lane of world.lanes) {
      if (!lane.sky) continue;
      const last = lane.xs.length - 1;
      const d2 = dist2(slot.x, slot.z, lane.xs[last]!, lane.zs[last]!);
      if (d2 < best) best = d2;
    }
    return best;
  }
  if (slot.def.kind === "house") {
    // Heal houses: inner pads first, nearest the busiest lane's end (where foes reach the Dragons).
    const lane = world.lanes[busiest];
    const ring = slot.def.ring === "outer" ? 1 : 0;
    const d2 = lane ? dist2(slot.x, slot.z, lane.xs[lane.xs.length - 1]!, lane.zs[lane.zs.length - 1]!) : 0;
    return ring * 1e15 + d2;
  }
  // Traps and block points: the busiest lane, nearest the dais (every foe of that lane passes there).
  const onBusiest = slot.lane === busiest ? 0 : 1;
  const lane = world.lanes[slot.lane];
  return onBusiest * 1e15 + (lane ? lane.length - slot.along : 0);
}

/** Free slots that take `item`, in keyboard order (the suggested one first). */
export function suggestedSlots(world: World, item: PlaceableId): number[] {
  const def = PLACEABLES[item];
  if (!def) return [];
  const free = world.slots.filter((slot) => slot.item === null && slot.def.kind === def.footprint.slot).map((slot) => slot.index);
  if (free.length === 0) return [];
  const busiest = busiestGroundLane(world);
  let first = free[0]!;
  let firstScore = suggestionScore(world, item, first, busiest);
  for (const index of free) {
    const score = suggestionScore(world, item, index, busiest);
    if (score < firstScore) {
      first = index;
      firstScore = score;
    }
  }
  const ordered = keyboardOrder(world, free);
  // Arrows keep the clockwise order, starting from the suggestion.
  const at = ordered.indexOf(first);
  return [...ordered.slice(at), ...ordered.slice(0, at)];
}

/**
 * Slots the map shows now (05 §4): while placing `placing`, the free slots that
 * take it; otherwise every slot in prep and breaks, none in a wave. Keyboard order.
 */
export function visibleSlots(world: World, placing: PlaceableId | null): number[] {
  if (placing !== null) {
    if (!shopOpen(world) && !quickPlaceOpen(world)) return [];
    return suggestedSlots(world, placing);
  }
  if (!shopOpen(world)) return [];
  return keyboardOrder(world, world.slots.map((slot) => slot.index));
}

/** Filled slots for edit mode (Backquote: arrows pick, `=` upgrades, `-` sells), keyboard order. */
export function editableSlots(world: World): number[] {
  return keyboardOrder(world, world.slots.filter((slot) => slot.item !== null).map((slot) => slot.index));
}

/** Gold sunk into the map now (bots: item mix, G14). */
export const investedGold = (world: World): number => world.slots.reduce((sum, slot) => sum + slot.spent, 0);

/** Quick-place build time in ticks (C6+). */
export const quickBuildTicks = (): number => msToTicks(OUR_SIDE_TUNING.quickBuildMs);
