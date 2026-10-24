/**
 * Spawning (02 §5.2–5.5): a wave's groups queue at their gates, gaps scaled
 * by 1000 / k_E and difficulty; one group per gate every 1.5 s; lanes start
 * ≥ 0.6 s apart; the live cap holds groups at the gate (00 §4.8, D10) while
 * the wave clock runs on. Clusters spawn together with 0.5 m jitter from the
 * `spawn` RNG stream, hugging one edge of the path (02 §2.2 E25).
 * Owner: sim-battle (LANES.md).
 */
import { GENERALS } from "../content/data/generals";
import { DAMAGE, DIFFICULTY, ELITE_PM, FLOW, RINGS, enemyHp } from "../content/rules";
import type { EliteTraitId, EnemyDef, FoeId, GeneralDef, SpawnShape, WaveDef } from "../content/types";
import { resetAuraSlot } from "./auras";
import { directorSpawnPm } from "./director";
import { emit } from "./events";
import { clamp, dist2, mToU, mmToU, msToTicks, uToM } from "./fixed";
import { pointAt, type LanePoint, type LaneRuntime } from "./lanes";
import { foeDefOf, groupMembers } from "./waves";
import { allocEnemy, type EnemyState, type WorldInit, type World } from "./world";

/** Bit order of EnemyState.traits. */
export const ELITE_TRAITS: readonly EliteTraitId[] = [
  "frenzy", "death-blast", "blight-trail", "double-shot", "stone-armour", "mist-shield", "regrowth", "thorns", "swift", "unstoppable", "trap-proof", "drain",
];

export const traitBit = (trait: EliteTraitId): number => 1 << ELITE_TRAITS.indexOf(trait);
export const hasTrait = (enemy: EnemyState, trait: EliteTraitId): boolean => (enemy.traits & traitBit(trait)) !== 0;

/** One member of a queued group, offset in ticks from the group's start. */
export interface QueuedMember {
  readonly offset: number;
  readonly foe: FoeId;
  readonly heads: number;
}

export interface QueuedGroup {
  /** Tick it may leave the gate (the next member's tick once started). */
  at: number;
  wave: number;
  lane: number;
  shape: SpawnShape;
  foe: FoeId;
  count: number;
  elite: boolean;
  /** Members in spawn order (escorts, leaders, a cluster as one member). */
  readonly members: QueuedMember[];
  next: number;
  /** Tick the group left its gate (−1: waiting). */
  startedAt: number;
  readonly traits: number;
  readonly variant: string | null;
}

export interface SpawnState {
  readonly queue: QueuedGroup[];
  /** Per lane: the earliest tick its gate may send the next group. */
  readonly gateFreeAt: number[];
  /** Next swarm cluster id. */
  nextCluster: number;
  /** Last group start on any gate, and its lane (lane stagger, 01 §1.4). */
  lastStartAt: number;
  lastStartLane: number;
  /** Tick the live cap last counted a wait (once per tick). */
  capWaitAt: number;
}

export function createSpawnState(init: WorldInit): SpawnState {
  return { queue: [], gateFreeAt: init.lanes.map(() => 0), nextCluster: 1, lastStartAt: -1_000_000, lastStartLane: -1, capWaitAt: -1 };
}

/** Spawn time scale (BALANCE.md §4.1, §4.2, 00 §4.10): × 1000 / k, × the difficulty's spawn gap, × the pace director's scale. */
export const spawnMs = (world: World, ms: number): number =>
  Math.round((((ms * DIFFICULTY[world.difficulty].spawnGapPm) / world.pace.kPm) * directorSpawnPm(world)) / 1000);

/** Queues every group of `wave` (called by waves at wave start). */
export function scheduleWave(world: World, wave: WaveDef): void {
  const spawn = world.spawn;
  for (const group of wave.groups) {
    const lane = world.stage.lanes.indexOf(group.lane);
    if (lane < 0) throw new Error("spawn: wave " + wave.n + " uses lane " + group.lane + " outside stage " + world.stage.id);
    let traits = 0;
    for (const trait of group.traits ?? []) traits |= traitBit(trait);
    const members = groupMembers(group).map((member) => ({ offset: msToTicks(spawnMs(world, member.offsetMs)), foe: member.foe, heads: member.heads }));
    const entry: QueuedGroup = {
      at: world.tick + msToTicks(spawnMs(world, group.atMs)), wave: wave.n, lane, shape: group.shape, foe: group.foe, count: group.count,
      elite: group.elite === true, members, next: 0, startedAt: -1, traits, variant: group.variant ?? null,
    };
    // Keep the queue in start order (stable): a waiting group never jumps an earlier one.
    let index = spawn.queue.length;
    while (index > 0 && spawn.queue[index - 1]!.startedAt < 0 && spawn.queue[index - 1]!.at > entry.at) index -= 1;
    spawn.queue.splice(index, 0, entry);
    world.waves.pending[wave.n - 1] = (world.waves.pending[wave.n - 1] ?? 0) + 1;
  }
}

/** Releases due groups that fit under the live cap. */
export function stepSpawn(world: World): void {
  const spawn = world.spawn;
  const queue = spawn.queue;
  const tick = world.tick;
  // The gate rules are spawn gaps too (00 §4.4: k stretches the spawn timing): at the run's spawn time scale the
  // plan keeps its shape at every pace. Unscaled, a k of 1.44–1.50 bunched delayed groups into 1.44–1.45 short peaks (G9 ≤ 1.40).
  const gateGap = msToTicks(spawnMs(world, FLOW.gateGapMs));
  const stagger = msToTicks(spawnMs(world, FLOW.laneStaggerMs));
  let index = 0;
  while (index < queue.length) {
    const group = queue[index]!;
    if (group.at > tick) {
      index += 1;
      continue;
    }
    if (group.startedAt < 0) {
      // One group per gate every 1.5 s; different gates ≥ 0.6 s apart (a pincer starts with its twin).
      const gateBusy = spawn.gateFreeAt[group.lane]! > tick;
      const staggered = group.shape !== "pincer" && spawn.lastStartLane !== group.lane && tick - spawn.lastStartAt < stagger;
      if (gateBusy || staggered) {
        index += 1;
        continue;
      }
    }
    const member = group.members[group.next]!;
    if (world.enemies.live + member.heads > world.liveCap) {
      // Live cap (00 §4.8): the group waits at its gate; later groups wait behind it.
      if (spawn.capWaitAt !== tick) {
        spawn.capWaitAt = tick;
        world.stats.capWaitTicks += 1;
      }
      return;
    }
    spawnMember(world, group, member);
    if (group.startedAt < 0) {
      group.startedAt = tick;
      spawn.gateFreeAt[group.lane] = tick + gateGap;
      spawn.lastStartAt = tick;
      spawn.lastStartLane = group.lane;
    }
    group.next += 1;
    if (group.next >= group.members.length) {
      queue.splice(index, 1);
      const pending = world.waves.pending;
      if (pending[group.wave - 1]! > 0) pending[group.wave - 1] = pending[group.wave - 1]! - 1;
      continue;
    }
    group.at = group.startedAt + group.members[group.next]!.offset;
    index += 1;
  }
}

function spawnMember(world: World, group: QueuedGroup, member: QueuedMember): void {
  const lane = world.lanes[group.lane]!;
  const def = foeDefOf(member.foe);
  const elite = group.elite && member.foe === group.foe;
  if ("cluster" in def && def.cluster && member.heads > 1) {
    const cluster = world.spawn.nextCluster;
    world.spawn.nextCluster += 1;
    const spread = mmToU(def.cluster.spreadMm);
    // The cluster hugs one edge of the path (02 §2.2 E25).
    const edge = lane.sky ? 0 : lane.halfWidth - spread - mToU(0.2);
    const side = world.rng.spawn.int(0, 1) === 0 ? -1 : 1;
    const base = edge > 0 ? side * edge : 0;
    for (let k = 0; k < member.heads; k += 1) {
      const lateral = base + world.rng.spawn.int(-spread, spread);
      const along = world.rng.spawn.int(0, spread * 2);
      spawnFoe(world, member.foe, group.lane, group.wave, { cluster, lateral, along, traits: group.traits, variant: group.variant });
    }
    return;
  }
  spawnFoe(world, member.foe, group.lane, group.wave, { elite, traits: elite ? group.traits : 0, variant: group.variant });
}

/** Stop radius → u from the gate, cached per lane (lanes are static input). */
const stopCache = new WeakMap<LaneRuntime, Map<number, number>>();
const scratch: LanePoint = { x: 0, z: 0 };

/** The first point along `lane` within `radius` u of the dais (lanes close in on it); the lane end when it never does. */
export function alongAtRadius(lane: LaneRuntime, radius: number): number {
  let cache = stopCache.get(lane);
  if (!cache) {
    cache = new Map();
    stopCache.set(lane, cache);
  }
  const hit = cache.get(radius);
  if (hit !== undefined) return hit;
  pointAt(lane, lane.length, 0, scratch);
  let result = lane.length;
  if (dist2(scratch.x, scratch.z, 0, 0) <= radius * radius) {
    let lo = 0;
    let hi = lane.length;
    while (hi - lo > 60) {
      const mid = Math.floor((lo + hi) / 2);
      pointAt(lane, mid, 0, scratch);
      if (dist2(scratch.x, scratch.z, 0, 0) <= radius * radius) hi = mid;
      else lo = mid;
    }
    result = hi;
  }
  cache.set(radius, result);
  return result;
}

/** Where a foe stops on its lane (01 §2.1, §4.1): generals at 8 m, shooters at their hold distance, the rest at the melee ring. */
export function stopAlongFor(lane: LaneRuntime, def: EnemyDef | GeneralDef, general: boolean): number {
  if (general) return alongAtRadius(lane, mmToU(RINGS.generalStopMm));
  if (def.role === "ranged") return alongAtRadius(lane, mmToU(def.attack.holdMm ?? def.attack.rangeMm));
  return lane.length;
}

export interface SpawnOptions {
  elite?: boolean;
  cluster?: number;
  /** u right of travel; default a seeded spot on the path. */
  lateral?: number;
  /** u from the gate; default 0. */
  along?: number;
  traits?: number;
  variant?: string | null;
}

/** One foe at its gate on `lane`, HP by W × 90 × g(c) × difficulty (00 §4.1); emits `spawn`. Null at the live cap. */
export function spawnFoe(world: World, foe: FoeId, lane: number, wave: number, options: SpawnOptions = {}): EnemyState | null {
  if (world.enemies.live >= world.liveCap) return null;
  const runtime = world.lanes[lane];
  if (!runtime) throw new Error("spawn: no lane " + lane);
  const def = foeDefOf(foe);
  const general = foe in GENERALS;
  const elite = options.elite === true;
  const traits = options.traits ?? 0;
  const difficulty = DIFFICULTY[world.difficulty];
  const enemy = allocEnemy(world, foe);
  enemy.general = general;
  enemy.elite = elite;
  enemy.wave = wave;
  enemy.lane = lane;
  enemy.cluster = options.cluster ?? -1;
  enemy.traits = traits;
  enemy.variant = options.variant ?? null;
  // HP (00 §4.1, §4.6, §4.10): swarm and small keep W on every difficulty; elites × 1.6.
  const smallTier = !general && ((def as EnemyDef).tier === "swarm" || (def as EnemyDef).tier === "small");
  const w100 = elite ? Math.round((def.w100 * ELITE_PM) / 1000) : def.w100;
  const hp = enemyHp(w100, world.stage.chapter, smallTier ? 1000 : difficulty.wPm);
  enemy.hp = hp > 0 ? hp : 1;
  enemy.hpMax = enemy.hp;
  const armourTier = def.armour + ((traits & traitBit("stone-armour")) !== 0 ? 1 : 0);
  enemy.armour = DAMAGE.tierG[armourTier > 3 ? 3 : armourTier]!;
  enemy.resist = DAMAGE.tierG[def.resist]!;
  const swift = (traits & traitBit("swift")) !== 0 ? 125 : 100;
  enemy.speed = Math.round((def.speedMmS * difficulty.enemySpeedPm * swift) / 100_000);
  // Place it: a seeded spot across the path unless told.
  const maxLateral = runtime.sky ? mToU(1) : runtime.halfWidth - mToU(0.4);
  const lateral = options.lateral ?? (maxLateral > 0 ? world.rng.spawn.int(-maxLateral, maxLateral) : 0);
  enemy.lateral = clamp(lateral, -runtime.halfWidth - mToU(1), runtime.halfWidth + mToU(1));
  enemy.homeLateral = enemy.lateral;
  enemy.along = options.along ?? 0;
  enemy.stopAt = stopAlongFor(runtime, def, general);
  enemy.wordsLeft = Math.ceil(w100 / 100);
  enemy.pounces = def.attack.pounceBlockers ?? 0;
  // Species skills start half charged; a charge is ready on arrival.
  const firstSkill = !general && (def as EnemyDef).skills[0];
  enemy.skillAt = firstSkill && "cooldownMs" in firstSkill ? world.tick + msToTicks(firstSkill.cooldownMs / 2) : world.tick;
  pointAt(runtime, enemy.along, enemy.lateral, scratch);
  enemy.x = scratch.x;
  enemy.z = scratch.z;
  enemy.y = runtime.sky ? runtime.altitude : 0;
  resetAuraSlot(world, enemy);
  if (wave >= 1 && wave <= world.waves.alive.length) world.waves.alive[wave - 1] = world.waves.alive[wave - 1]! + 1;
  emit(world, { type: "spawn", enemy: { slot: enemy.slot, serial: enemy.serial }, foe, lane: runtime.id, x: uToM(enemy.x), z: uToM(enemy.z), elite, cluster: enemy.cluster });
  return enemy;
}

/** The member of `cluster` that carries its word: the first live one in slot order (words.ts deals it the same way). */
export function clusterLeader(world: World, cluster: number): EnemyState | null {
  if (cluster < 0) return null;
  for (const enemy of world.enemies.list) if (enemy.alive && enemy.cluster === cluster) return enemy;
  return null;
}
