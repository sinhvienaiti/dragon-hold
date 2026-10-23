/**
 * Helpers for the sim-battle tests: one-wave stages on L2-cau, a world
 * stepped into its wave, foes placed on a lane, an ideal typist, units on
 * block points. Everything goes through the real systems (status, units,
 * traps from sim-ourside; words from typing-learning).
 */
import { STAGE_M0 } from "../../src/content/data/stages";
import type { EventOf, FoeId, Grade, SimEvent, SimEventType, SpawnGroupDef, StageDef, WaveDef } from "../../src/content/types";
import { queueWordStrike } from "../../src/sim/combat";
import { mToU } from "../../src/sim/fixed";
import { slotIndex } from "../../src/sim/placement";
import { spawnFoe } from "../../src/sim/spawn";
import { buildUnit, type UnitState } from "../../src/sim/units";
import { createWorld, step, type EnemyState, type World, type WorldOptions } from "../../src/sim/world";

export const MQ: Readonly<Record<Grade, number>> = { flash: 1250, perfect: 1100, good: 1000, ok: 900, sloppy: 600 };

/** A stage with one wave of `groups` (or several waves) on the M0 map. */
export function battleStage(waves: readonly (readonly SpawnGroupDef[])[], patch: Partial<StageDef> = {}): StageDef {
  const defs: WaveDef[] = waves.map((groups, index) => ({
    n: index + 1,
    durationMs: 60_000,
    load100: 100,
    peakLoad100: 140,
    peaks: [],
    generals: groups.some((group) => group.foe === "moss-banner") ? ["moss-banner"] : [],
    groups,
  }));
  return { ...STAGE_M0, id: "battle-test", waves: defs, ...patch };
}

/** An empty one-wave stage: foes come from spawnFoe in the test. */
export const EMPTY_STAGE: StageDef = battleStage([[{ atMs: 600_000, lane: "cau", shape: "single", foe: "moss-grunt", count: 1 }]]);

/** Events recorded by `run`. */
export class Log {
  readonly all: SimEvent[] = [];
  of<T extends SimEventType>(type: T): EventOf<T>[] {
    return this.all.filter((event): event is EventOf<T> => event.type === type);
  }
  clear(): void {
    this.all.length = 0;
  }
}

/** Steps `ticks` times, draining events into `log`. */
export function run(world: World, ticks: number, log?: Log): void {
  for (let k = 0; k < ticks; k += 1) {
    step(world);
    const events = world.events.drain();
    if (log) log.all.push(...events);
  }
}

/** Steps until `done` holds (or `max` ticks); returns the ticks taken. */
export function runUntil(world: World, done: () => boolean, max: number, log?: Log): number {
  let ticks = 0;
  while (!done() && ticks < max) {
    run(world, 1, log);
    ticks += 1;
  }
  if (!done()) throw new Error("runUntil: not done after " + max + " ticks");
  return ticks;
}

/** A world of `stage` stepped through prep and the 6 s warning into its first wave. */
export function waveWorld(stage: StageDef = EMPTY_STAGE, options: WorldOptions & { seed?: number } = {}, log?: Log): World {
  const world = createWorld(stage, options.seed ?? stage.seed, options);
  step(world, [{ type: "start" }]);
  world.events.drain();
  runUntil(world, () => world.phase === "wave", 400, log);
  return world;
}

const laneIndex = (world: World, id: string): number => world.lanes.findIndex((lane) => lane.id === id);

/** A foe of the current wave at `alongM` metres from the gate of `lane`, in the middle of the path unless told. */
export function foe(world: World, id: FoeId, lane: string, alongM = 0, lateralM = 0): EnemyState {
  const enemy = spawnFoe(world, id, laneIndex(world, lane), world.wave, { along: mToU(alongM), lateral: mToU(lateralM) });
  if (!enemy) throw new Error("foe: live cap");
  return enemy;
}

/** Metres from the gate of `enemy`'s lane to its end (the melee ring). */
export const laneLengthM = (world: World, enemy: EnemyState): number => world.lanes[enemy.lane]!.length / 60_000;

/** A Vệ Binh Rêu on block point `slotId` (sim-ourside's buildUnit). */
export function warden(world: World, slotId: string): UnitState {
  const unit = buildUnit(world, slotIndex(world, slotId), "moss-warden");
  if (!unit) throw new Error("warden: no unit on " + slotId);
  return unit;
}

/** The ideal typist: a finished word on `enemy` now (lands 12 ticks later). */
export function type(world: World, enemy: EnemyState, grade: Grade = "perfect"): void {
  queueWordStrike(world, {
    slot: enemy.slot, serial: enemy.serial, word: -1, kind: enemy.cluster >= 0 ? "cluster" : enemy.general ? "general" : "enemy",
    grade, mqPm: MQ[grade], mcPm: 1000, bonusPm: 0,
  });
}

/** Distance of a foe from the dais centre, metres. */
export const fromDaisM = (enemy: EnemyState): number => Math.sqrt(enemy.x * enemy.x + enemy.z * enemy.z) / 60_000;

/** The foe nearest the dais. */
export function nearest(world: World): EnemyState | null {
  let best: EnemyState | null = null;
  for (const enemy of world.enemies.list) if (enemy.alive && (best === null || enemy.x * enemy.x + enemy.z * enemy.z < best.x * best.x + best.z * best.z)) best = enemy;
  return best;
}

/** Plays a whole stage with an ideal typist (one Perfect word every `every` ticks on the nearest foe); returns the world. */
export function playStage(stage: StageDef, every: number, seed = stage.seed, options: WorldOptions = {}, onTick?: (world: World) => void): World {
  const world = createWorld(stage, seed, options);
  step(world, [{ type: "start" }]);
  let next = 0;
  while (world.phase !== "victory" && world.phase !== "defeat" && world.tick < 60 * 60 * 30) {
    if (world.phase === "wave" && world.tick >= next) {
      const target = nearest(world);
      if (target) {
        type(world, target);
        next = world.tick + every;
      }
    }
    step(world);
    onTick?.(world);
    world.events.drain();
  }
  return world;
}
