/**
 * General auras (02 §3.1): rings on the ground; same kind keeps the strongest;
 * at most 2 auras per foe; Ấn Phá and silence turn them off for a while.
 * A planted banner (Cắm Cờ, boss.ts) is a "damage" source of its own.
 * The general's own ring buffs the others, not itself. Readers take the
 * per-foe bits from `bySlot` (tag icons, rim tint); `aura` events mark a
 * ring turning on or off.
 * Owner: sim-battle (LANES.md).
 */
import { GENERALS } from "../content/data/generals";
import type { AuraDef, AuraKind, GeneralId } from "../content/types";
import { emit } from "./events";
import { mmToU, msToTicks, within } from "./fixed";
import { applyStatus, hasStatus } from "./status";
import { foeDefOf } from "./waves";
import type { EnemyState, WorldInit, World } from "./world";

/** A general's ring as the last step saw it (events fire on changes). */
export interface AuraRing {
  readonly slot: number;
  readonly serial: number;
  on: boolean;
}

export interface AuraState {
  /** Per foe slot: bitmask of aura kinds affecting it this tick (index = AURA_BITS). */
  readonly bySlot: number[];
  /** Per general slot: tick its auras come back after a seal (−1: on). */
  readonly offUntil: number[];
  /** Per foe slot × AURA_BITS.length: the strongest value in % of each kind it gets. */
  readonly pct: number[];
  /** Rings of generals still on the field (or just gone). */
  readonly rings: AuraRing[];
}

export const AURA_BITS: readonly AuraKind[] = ["speed", "damage", "attack-rate", "armour", "resist", "word-shield", "heal", "tenacity", "hide-words", "trap-slow", "no-push", "thorns", "range"];
const KINDS = AURA_BITS.length;
const BIT: Readonly<Record<string, number>> = Object.fromEntries(AURA_BITS.map((kind, index) => [kind, index]));
/** At most two auras on one foe (02 §3.1). */
const MAX_PER_FOE = 2;
/** Generals with their rings on this tick (scratch, not state). */
const sources: EnemyState[] = [];

export function createAuraState(init: WorldInit): AuraState {
  return { bySlot: [], offUntil: [], pct: [], rings: [] };
}

/** A fresh foe in a reused slot starts with no auras and its seal timer clear (spawn calls it). */
export function resetAuraSlot(world: World, enemy: EnemyState): void {
  const auras = world.auras;
  const slot = enemy.slot;
  while (auras.bySlot.length <= slot) auras.bySlot.push(0);
  while (auras.offUntil.length <= slot) auras.offUntil.push(-1);
  while (auras.pct.length < (slot + 1) * KINDS) auras.pct.push(0);
  auras.bySlot[slot] = 0;
  auras.offUntil[slot] = -1;
  for (let k = 0; k < KINDS; k += 1) auras.pct[slot * KINDS + k] = 0;
}

/** True while `general`'s auras run: not sealed (Ấn Phá), not silenced (CÂM). */
export function aurasOn(world: World, general: EnemyState): boolean {
  if (!general.alive || !general.general) return false;
  const off = world.auras.offUntil[general.slot] ?? -1;
  return off <= world.tick && !hasStatus(general.statuses, "silence", world.tick);
}

const affects = (aura: AuraDef, enemy: EnemyState): boolean => {
  const target = aura.affects ?? "all";
  if (target === "all") return true;
  const def = foeDefOf(enemy.foe);
  if (target === "beasts") return def.family === "beast";
  if (target === "flyers") return def.gait === "flyer";
  return def.gait === "swarm";
};

/** Recomputes who stands in which aura; emits `aura` on/off. */
export function stepAuras(world: World): void {
  const auras = world.auras;
  const tick = world.tick;
  const list = world.enemies.list;
  // 1. Ring states: on/off transitions and gone generals.
  for (const enemy of list) {
    if (!enemy.alive || !enemy.general) continue;
    if (!auras.rings.some((ring) => ring.serial === enemy.serial)) auras.rings.push({ slot: enemy.slot, serial: enemy.serial, on: false });
  }
  for (let index = auras.rings.length - 1; index >= 0; index -= 1) {
    const ring = auras.rings[index]!;
    const general = list[ring.slot];
    const alive = general !== undefined && general.alive && general.serial === ring.serial;
    const on = alive && aurasOn(world, general);
    if (on !== ring.on) {
      ring.on = on;
      const def = GENERALS[(alive ? general.foe : "moss-banner") as GeneralId];
      for (const aura of def.auras) emit(world, { type: "aura", enemy: { slot: ring.slot, serial: ring.serial }, aura: aura.kind, on, radiusM: aura.radiusMm / 1000 });
    }
    if (!alive) auras.rings.splice(index, 1);
  }
  // 2. Membership: the strongest of each kind, at most two kinds per foe.
  const banners = world.boss.banners;
  sources.length = 0;
  for (const enemy of list) if (enemy.alive && enemy.general && aurasOn(world, enemy)) sources.push(enemy);
  for (const enemy of list) {
    if (!enemy.alive) continue;
    const slot = enemy.slot;
    const base = slot * KINDS;
    for (let k = 0; k < KINDS; k += 1) auras.pct[base + k] = 0;
    for (const source of sources) {
      if (source === enemy) continue;
      for (const aura of GENERALS[source.foe as GeneralId].auras) {
        if (!affects(aura, enemy) || !within(enemy.x, enemy.z, source.x, source.z, mmToU(aura.radiusMm))) continue;
        const k = BIT[aura.kind]!;
        if (aura.valuePct > auras.pct[base + k]!) auras.pct[base + k] = aura.valuePct;
      }
    }
    for (const banner of banners) {
      if (banner.down || banner.until <= tick) continue;
      if (!within(enemy.x, enemy.z, banner.x, banner.z, banner.radius)) continue;
      const k = BIT.damage!;
      if (banner.valuePct > auras.pct[base + k]!) auras.pct[base + k] = banner.valuePct;
    }
    let bits = 0;
    let count = 0;
    // Keep the two strongest kinds; ties go to AURA_BITS order.
    while (count < MAX_PER_FOE) {
      let best = -1;
      for (let k = 0; k < KINDS; k += 1) if ((bits & (1 << k)) === 0 && auras.pct[base + k]! > 0 && (best < 0 || auras.pct[base + k]! > auras.pct[base + best]!)) best = k;
      if (best < 0) break;
      bits |= 1 << best;
      count += 1;
    }
    for (let k = 0; k < KINDS; k += 1) if ((bits & (1 << k)) === 0) auras.pct[base + k] = 0;
    auras.bySlot[slot] = bits;
  }
}

/** Total bonus of `kind` on `enemy` in %, after the strongest-of-kind rule. */
export function auraPct(world: World, enemy: EnemyState, kind: AuraKind): number {
  const k = BIT[kind];
  if (k === undefined) return 0;
  const bits = world.auras.bySlot[enemy.slot] ?? 0;
  return (bits & (1 << k)) !== 0 ? (world.auras.pct[enemy.slot * KINDS + k] ?? 0) : 0;
}

/** Ấn Phá typed: auras of `general` off for the seal's time, a short stagger (01 §3.6). A repeat within the same seal is ignored. */
export function sealGeneral(world: World, general: EnemyState): void {
  if (!general.alive || !general.general) return;
  const seal = GENERALS[general.foe as GeneralId].seal;
  const auras = world.auras;
  const offTicks = msToTicks(seal.auraOffMs);
  const off = auras.offUntil[general.slot] ?? -1;
  if (off - world.tick > offTicks - 30) return;
  auras.offUntil[general.slot] = world.tick + offTicks;
  applyStatus(world, { kind: "enemy", slot: general.slot, serial: general.serial }, general.statuses, { id: "stun", durationMs: seal.staggerMs, self: true });
}
