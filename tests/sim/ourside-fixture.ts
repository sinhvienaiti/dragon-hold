/**
 * Fixture for the sim-ourside tests: worlds in a chosen phase, foes placed by
 * hand on a lane, our-side steps in world.ts order. Damage, knockback and XP
 * go through sim-battle's real combat and movement; tests read the `hit`
 * events (G0 foes keep amounts exact: no armour).
 */
import { ENEMIES } from "../../src/content/data/enemies";
import { GENERALS } from "../../src/content/data/generals";
import { STAGE_M0 } from "../../src/content/data/stages";
import { enemyHp } from "../../src/content/rules";
import type { EventOf, FoeId, Phase, SimEvent, StageDef } from "../../src/content/types";
import { onEnemyKilled as economyOnKill, stepEconomy } from "../../src/sim/economy";
import { mToU } from "../../src/sim/fixed";
import { onEnemyKilled as housesOnKill, stepHouses } from "../../src/sim/houses";
import { pointAt } from "../../src/sim/lanes";
import { stepStatus } from "../../src/sim/status";
import { stepTraps } from "../../src/sim/traps";
import { stepUnits } from "../../src/sim/units";
import { allocEnemy, createWorld, type EnemyState, type World, type WorldOptions } from "../../src/sim/world";

export function placeOnLane(world: World, enemy: EnemyState): void {
  const out = { x: 0, z: 0 };
  pointAt(world.lanes[enemy.lane]!, enemy.along, enemy.lateral, out);
  enemy.x = out.x;
  enemy.z = out.z;
}

/**
 * A world in `phase` (default break) with `gold`; the stage is M0 unless given.
 * The Fire Dragon has 01 §2.2's 1 000 HP × g(2) here so heal and damage maths
 * read as in 03; FIRE_DRAGON.hp itself is tuned for the margin S (BALANCE.md §9.1).
 */
export function makeWorld(options: { phase?: Phase; gold?: number; stage?: StageDef; world?: WorldOptions } = {}): World {
  const world = createWorld(options.stage ?? STAGE_M0, (options.stage ?? STAGE_M0).seed, options.world);
  world.hero.hp = world.hero.hpMax = 1020;
  world.phase = options.phase ?? "break";
  world.shop.lastPhase = world.phase;
  if (options.gold !== undefined) world.economy.gold = options.gold;
  world.events.drain();
  return world;
}

/** A foe at `alongM` metres from the gate of lane `laneId`, with C-chapter HP. */
export function foeAt(world: World, foe: FoeId, laneId: string, alongM: number, options: { lateralM?: number; cluster?: number; elite?: boolean; hp?: number } = {}): EnemyState {
  const enemy = allocEnemy(world, foe);
  const def = (ENEMIES as Record<string, { w100: number; speedMmS: number; altitudeMm: number; attack: { pounceBlockers?: number } }>)[foe] ?? GENERALS[foe as keyof typeof GENERALS];
  enemy.general = foe in GENERALS;
  enemy.elite = options.elite === true;
  enemy.lane = world.lanes.findIndex((lane) => lane.id === laneId);
  enemy.along = mToU(alongM);
  enemy.lateral = mToU(options.lateralM ?? 0);
  enemy.hp = options.hp ?? enemyHp(def.w100, world.stage.chapter, 1000);
  enemy.hpMax = enemy.hp;
  enemy.speed = def.speedMmS;
  enemy.y = def.altitudeMm * 60;
  enemy.cluster = options.cluster ?? -1;
  enemy.wave = world.wave;
  // As spawn sets it (E18 pounces over one blocker).
  enemy.pounces = def.attack.pounceBlockers ?? 0;
  placeOnLane(world, enemy);
  return enemy;
}

/** Cleanup as world.ts runs it for our side's hooks (combat and words hooks are other lanes'). */
export function sweepDead(world: World): void {
  for (const enemy of world.enemies.list) {
    if (enemy.alive || enemy.freed) continue;
    if (enemy.killedBy !== null) {
      economyOnKill(world, enemy);
      housesOnKill(world, enemy);
    }
    enemy.freed = true;
    world.enemies.free.push(enemy.slot);
    world.enemies.live -= 1;
  }
}

/** Every event since the last drain, of one type. */
export function eventsOf<T extends SimEvent["type"]>(world: World, type: T): EventOf<T>[] {
  return world.events.drain().filter((event): event is EventOf<T> => event.type === type);
}

/** `hit` events on foes since the last drain from sources of `kind` (trap, unit, hero…), as [tick, foe serial, amount, type]. */
export function foeHits(world: World, kind: string): [tick: number, serial: number, amount: number, type: string][] {
  return eventsOf(world, "hit")
    .filter((event) => event.target.kind === "enemy" && event.source.kind === kind)
    .map((event) => [event.tick, event.target.kind === "enemy" ? event.target.serial : -1, event.amount, event.damageType]);
}

/** Steps our-side systems in world.ts order (the full step also runs other lanes' stubs), then our cleanup hooks. */
export function stepOurSide(world: World, ticks = 1): void {
  for (let k = 0; k < ticks; k += 1) {
    stepTraps(world);
    stepUnits(world);
    stepHouses(world);
    stepStatus(world);
    stepEconomy(world);
    sweepDead(world);
    world.tick += 1;
  }
}
