/**
 * Scripted skills of generals and bosses (02 §3–4). M0: G01's Cắm Cờ, a
 * banner that stands 8 s, buffs damage +25 % within 5 m and carries a D1
 * word to pull it out. The general stands still 1 s to plant it (the
 * wind-up breaks on stun, flinch, knockback or Long Hống), plants when
 * allies are near or when it has reached its 8 m stop. Boss phases and seal
 * clusters come with M2.
 * Owner: sim-battle (LANES.md).
 */
import { GENERALS } from "../content/data/generals";
import { BATTLE, DIFFICULTY } from "../content/rules";
import type { GeneralId } from "../content/types";
import { emit } from "./events";
import { mmToU, msToTicks, ticksToMs, uToM, within } from "./fixed";
import { ACTION } from "./movement";
import { canAttack, canMove } from "./status";
import { dealWord, releaseWord } from "./words";
import type { EnemyState, WorldInit, World } from "./world";

export interface BannerState {
  /** Planting general's serial; the banner's position in u. */
  owner: number;
  x: number;
  z: number;
  until: number;
  /** Its word slot (−1: none yet). */
  word: number;
  /** Planting general's slot, the buff ring in u and its damage bonus in %. */
  ownerSlot: number;
  radius: number;
  valuePct: number;
  /** Pulled out by its word. */
  down: boolean;
}

export interface BossState {
  readonly banners: BannerState[];
  /** Per general serial: tick its skill is ready. */
  readonly skillReadyAt: Map<number, number>;
}


export function createBossState(init: WorldInit): BossState {
  return { banners: [], skillReadyAt: new Map() };
}

const ref = (enemy: EnemyState) => ({ slot: enemy.slot, serial: enemy.serial });

/** True while banner `index` stands (words drop the flag word when it is gone). */
export function bannerStanding(world: World, index: number): boolean {
  const banner = world.boss.banners[index];
  return banner !== undefined && !banner.down && banner.until > world.tick;
}

/** Index of the banner whose word is in `wordSlot`, or −1. */
export function bannerForWord(world: World, wordSlot: number): number {
  return world.boss.banners.findIndex((banner) => banner.word === wordSlot && !banner.down && banner.until > world.tick);
}

/** A general's Cắm Cờ wind-up broke (stun, knockback, Long Hống): no banner, half the cooldown. */
export function cancelBanner(world: World, enemy: EnemyState): void {
  if (enemy.action !== ACTION.banner) return;
  const skill = GENERALS[enemy.foe as GeneralId].skill;
  enemy.action = ACTION.none;
  enemy.actionUntil = -1;
  world.boss.skillReadyAt.set(enemy.serial, world.tick + msToTicks(skill.cooldownMs / 2));
  emit(world, { type: "banner", banner: -1, owner: ref(enemy), stage: "cancel", x: uToM(enemy.x), z: uToM(enemy.z), radiusM: skill.radiusMm / 1000, durationMs: 0 });
}

function alliesNear(world: World, enemy: EnemyState, radius: number): number {
  let count = 0;
  for (const other of world.enemies.list) if (other !== enemy && other.alive && within(other.x, other.z, enemy.x, enemy.z, radius)) count += 1;
  return count;
}

function plant(world: World, enemy: EnemyState): void {
  const skill = GENERALS[enemy.foe as GeneralId].skill;
  const banners = world.boss.banners;
  const banner: BannerState = {
    owner: enemy.serial, x: enemy.x, z: enemy.z, until: world.tick + msToTicks(skill.durationMs), word: -1,
    ownerSlot: enemy.slot, radius: mmToU(skill.radiusMm), valuePct: skill.damagePct, down: false,
  };
  const index = banners.length;
  banners.push(banner);
  enemy.action = ACTION.none;
  enemy.actionUntil = -1;
  world.boss.skillReadyAt.set(enemy.serial, world.tick + msToTicks(skill.cooldownMs));
  emit(world, { type: "banner", banner: index, owner: ref(enemy), stage: "plant", x: uToM(banner.x), z: uToM(banner.z), radiusM: skill.radiusMm / 1000, durationMs: skill.durationMs });
  // The banner's D1 word (01 §3.6); words keeps it with a null target and finds the banner by word slot.
  banner.word = dealWord(world, "flag", null);
}

/** General skills (telegraph, plant, expire); emits `banner` events. */
export function stepBoss(world: World): void {
  const tick = world.tick;
  const boss = world.boss;
  for (const enemy of world.enemies.list) {
    if (!enemy.alive || !enemy.general) continue;
    const def = GENERALS[enemy.foe as GeneralId];
    const skill = def.skill;
    const free = canMove(enemy.statuses, tick) && canAttack(enemy.statuses, tick, false) && enemy.mode !== "knockback";
    if (enemy.action === ACTION.banner) {
      if (!free) cancelBanner(world, enemy);
      else if (tick >= enemy.actionUntil) plant(world, enemy);
      continue;
    }
    if (enemy.action !== ACTION.none || !free) continue;
    const ready = boss.skillReadyAt.get(enemy.serial) ?? enemy.bornAt + msToTicks(BATTLE.firstPlantMs);
    if (tick < ready) continue;
    const arrived = enemy.along >= enemy.stopAt;
    if (!arrived && alliesNear(world, enemy, mmToU(skill.radiusMm)) < BATTLE.plantAllies) continue;
    const windup = msToTicks((skill.windupMs * DIFFICULTY[world.difficulty].telegraphPm) / 1000);
    enemy.action = ACTION.banner;
    enemy.actionUntil = tick + windup;
    enemy.windupUntil = -1;
    emit(world, { type: "banner", banner: -1, owner: ref(enemy), stage: "windup", x: uToM(enemy.x), z: uToM(enemy.z), radiusM: skill.radiusMm / 1000, durationMs: ticksToMs(windup) });
  }
  for (let index = 0; index < boss.banners.length; index += 1) {
    const banner = boss.banners[index]!;
    if (banner.down || banner.until !== tick) continue;
    emit(world, { type: "banner", banner: index, owner: { slot: banner.ownerSlot, serial: banner.owner }, stage: "expired", x: uToM(banner.x), z: uToM(banner.z), radiusM: uToM(banner.radius), durationMs: 0 });
    // The flag word goes with its banner (typing-learning: never a word on nothing).
    if (banner.word >= 0) releaseWord(world, banner.word, "target-gone");
    banner.word = -1;
  }
}

/** The banner word was typed: the banner falls. */
export function pullBanner(world: World, banner: number): void {
  const state = world.boss.banners[banner];
  if (!state || state.down || state.until <= world.tick) return;
  state.down = true;
  state.until = world.tick;
  emit(world, { type: "banner", banner, owner: { slot: state.ownerSlot, serial: state.owner }, stage: "pulled", x: uToM(state.x), z: uToM(state.z), radiusM: uToM(state.radius), durationMs: 0 });
}
