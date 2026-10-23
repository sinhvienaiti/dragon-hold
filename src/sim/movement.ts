/**
 * Foe movement (02 §1.3, §2.2, 01 §2.1, §4.1): walk the lane at speed ×
 * slows × auras; stop at a blocker, at the melee ring (6 m), the shooting
 * band (10–16 m) or a general's 8 m; flyers hold at 3 m up and are never
 * blocked unless grounded; fords slow 30 % and leave Wet 4 s; the bridge
 * squeezes foes onto its deck; knockback moves along the lane only.
 * Species: E18 pounces over one blocker (0.5 s red line), E19 paws 1 s then
 * charges 8 m, E11 steps back 2 m when a blocker reaches it, E25 flows as
 * one cluster in a zigzag along the path edge, wolves howl +15 % speed in
 * a pack of 3. Readers get `move` events on mode changes only.
 * Owner: sim-battle (LANES.md).
 */
import { OUR_SIDE_TUNING } from "../content/data/our-side";
import { BATTLE, DIFFICULTY, STATUS } from "../content/rules";
import type { EnemyDef, EntityRef, MoveMode } from "../content/types";
import { auraPct } from "./auras";
import { cancelBanner } from "./boss";
import { chargeImpact, pickTarget, telegraph, unitStanding } from "./combat";
import { emit } from "./events";
import { clamp, mToU, mmToU, msToTicks, ticksToMs, uToM, within } from "./fixed";
import { pointAt, spanAt, type LanePoint, type LaneRuntime } from "./lanes";
import { applyStatus, canMove, hasStatus, stanceNow, statusSpeedPm } from "./status";
import { blockPassPct, blockerFor } from "./units";
import { foeDefOf } from "./waves";
import { wordSlowPct } from "./words";
import type { EnemyState, World } from "./world";

/** EnemyState.action values. */
export const ACTION = { none: 0, pounceWindup: 1, pounce: 2, chargeWindup: 3, charge: 4, retreat: 5, banner: 6 } as const;

/** E18's leap, E19's run, crowding (rules BATTLE). */
const POUNCE_U = mmToU(BATTLE.pounceMm);
const POUNCE_TICKS = msToTicks(BATTLE.pounceMs);
const POUNCE_HEIGHT_U = mmToU(BATTLE.pounceHeightMm);
const CHARGE_SPEED_U = BATTLE.chargeMmS;
const RETREAT_COOLDOWN_TICKS = msToTicks(BATTLE.retreatCooldownMs);
/** A unit this close along the lane touches a foe (units.ts uses the same reach). */
const CONTACT_U = mmToU(OUR_SIDE_TUNING.contactMm);
const KNOCK_TICKS = msToTicks(BATTLE.knockSlideMs);
const SEP_ALONG_U = mmToU(BATTLE.separateAlongMm);
const SEP_LATERAL_U = mmToU(BATTLE.separateAcrossMm);
const SEP_STEP_U = BATTLE.separateMmS;
const EDGE_U = mmToU(BATTLE.edgeMm);
const RING_LATERAL_U = mmToU(BATTLE.ringRoomMm);
const SKY_LATERAL_U = mmToU(BATTLE.skyRoomMm);
const ZIG_AMP_U = mmToU(BATTLE.zigzagMm);
const ZIG_TICKS = msToTicks(BATTLE.zigzagMs);

const point: LanePoint = { x: 0, z: 0 };

const ref = (enemy: EnemyState): { slot: number; serial: number } => ({ slot: enemy.slot, serial: enemy.serial });
const enemyRef = (enemy: EnemyState): EntityRef => ({ kind: "enemy", slot: enemy.slot, serial: enemy.serial });

/** A wind-up the foe was building breaks (stun, knockback, Long Hống); a leap or charge in flight runs on. */
export function interruptFoe(world: World, enemy: EnemyState): void {
  enemy.windupUntil = -1;
  enemy.aim = null;
  if (enemy.action === ACTION.banner) cancelBanner(world, enemy);
  else if (enemy.action === ACTION.pounceWindup || enemy.action === ACTION.chargeWindup || enemy.action === ACTION.retreat) {
    enemy.action = ACTION.none;
    enemy.actionUntil = -1;
  }
}

/** Knock weight (03 §2.1, §2.3): small and medium 1, big 2, generals 2, giants × 0.25. */
function knockDivisorPm(enemy: EnemyState, def: EnemyDef | ReturnType<typeof foeDefOf>): number {
  if (enemy.general) return 2000;
  const tier = (def as EnemyDef).tier;
  if (tier === "giant") return Math.round(1_000_000 / STATUS.giantKnockPm);
  return tier === "heavy" ? 2000 : 1000;
}

/** Pushes `enemy` back along its lane by `distance` u ÷ weight (03 §2.3); never off the lane. */
export function knockBack(world: World, enemy: EnemyState, distance: number): void {
  if (!enemy.alive || distance <= 0 || auraPct(world, enemy, "no-push") > 0) return;
  const def = foeDefOf(enemy.foe);
  const push = Math.round((distance * 1000) / knockDivisorPm(enemy, def));
  interruptFoe(world, enemy);
  if (enemy.action === ACTION.charge || enemy.action === ACTION.pounce) {
    enemy.action = ACTION.none;
    enemy.actionUntil = -1;
  }
  enemy.along = enemy.along > push ? enemy.along - push : 0;
  enemy.blockedBy = -1;
  enemy.y = world.lanes[enemy.lane]!.sky && stanceNow(world, enemy) !== "ground" ? world.lanes[enemy.lane]!.altitude : 0;
  enemy.modeUntil = world.tick + KNOCK_TICKS;
  place(world, enemy);
  setMode(world, enemy, "knockback");
}

function setMode(world: World, enemy: EnemyState, mode: MoveMode): void {
  if (enemy.mode === mode) return;
  enemy.mode = mode;
  emit(world, { type: "move", enemy: ref(enemy), mode, x: uToM(enemy.x), z: uToM(enemy.z) });
}

function place(world: World, enemy: EnemyState): void {
  pointAt(world.lanes[enemy.lane]!, enemy.along, enemy.lateral, point);
  enemy.x = point.x;
  enemy.z = point.z;
}

/** The standing unit on `lane` touching a foe at `along` (E19's impact), or −1. */
function unitInContact(world: World, lane: number, along: number): number {
  for (const unit of world.units.list) {
    if (unit.lane !== lane || !unitStanding(world, unit.index)) continue;
    const gap = along - unit.along;
    if (gap >= -CONTACT_U && gap <= CONTACT_U) return unit.index;
  }
  return -1;
}

/** Nearest standing unit on `enemy`'s lane ahead of it within `reach` u (E19 charge target), or −1. */
function unitAhead(world: World, enemy: EnemyState, reach: number): number {
  let best = -1;
  let bestAlong = 0;
  for (const unit of world.units.list) {
    if (unit.lane !== enemy.lane || !unitStanding(world, unit.index)) continue;
    const gap = unit.along - enemy.along;
    if (gap < -CONTACT_U || gap > reach) continue;
    if (best < 0 || unit.along < bestAlong) {
      best = unit.index;
      bestAlong = unit.along;
    }
  }
  return best;
}

/** Lateral room at `along` (path edge, bridge deck, the ring, the sky). */
function lateralRoom(lane: LaneRuntime, along: number): number {
  if (lane.sky) return SKY_LATERAL_U;
  if (along >= lane.length - mToU(1)) return RING_LATERAL_U;
  const bridge = spanAt(lane.bridges, along);
  const half = bridge ? bridge.halfWidth : lane.halfWidth;
  return half > EDGE_U ? half - EDGE_U : 0;
}

/** Triangle wave in [−amp, amp] with period `ticks` (no trig in sim). */
function triangle(tick: number, phase: number, amp: number, ticks: number): number {
  const t = (tick + phase) % ticks;
  const half = ticks / 2;
  return Math.round(((t < half ? t : ticks - t) * 4 * amp) / ticks) - amp;
}

/** Per-tick cluster centres (u along), for swarm cohesion. */
const clusterSum = new Map<number, number>();
const clusterCount = new Map<number, number>();
const byLane: EnemyState[][] = [];

/** Wolves within the pack-howl radius, the foe itself included. */
function packSize(world: World, enemy: EnemyState, radius: number): number {
  let count = 0;
  for (const other of world.enemies.list) if (other.alive && other.foe === enemy.foe && within(other.x, other.z, enemy.x, enemy.z, radius)) count += 1;
  return count;
}

/** Moves every live foe one tick and updates x, z, y; emits `move` on mode changes only. */
export function stepMovement(world: World): void {
  const list = world.enemies.list;
  clusterSum.clear();
  clusterCount.clear();
  for (const enemy of list) {
    if (!enemy.alive || enemy.cluster < 0) continue;
    clusterSum.set(enemy.cluster, (clusterSum.get(enemy.cluster) ?? 0) + enemy.along);
    clusterCount.set(enemy.cluster, (clusterCount.get(enemy.cluster) ?? 0) + 1);
  }
  for (const enemy of list) if (enemy.alive) moveOne(world, enemy);
  separate(world);
  for (const enemy of list) {
    if (!enemy.alive) continue;
    place(world, enemy);
    // Pick what to hit from where it ends this tick (attacks read it).
    enemy.target = pickTarget(world, enemy);
  }
}

function moveOne(world: World, enemy: EnemyState): void {
  const tick = world.tick;
  const def = foeDefOf(enemy.foe);
  const lane = world.lanes[enemy.lane]!;
  const attack = def.attack;
  const flyer = def.stance !== "ground";
  const grounded = flyer && stanceNow(world, enemy) === "ground";
  const telegraphPm = DIFFICULTY[world.difficulty].telegraphPm;
  enemy.y = lane.sky && !grounded ? lane.altitude : 0;

  // A knockback slide runs out first.
  if (enemy.mode === "knockback" && enemy.modeUntil > tick) return;

  // Leap in flight: lands whatever happens.
  if (enemy.action === ACTION.pounce) {
    const t = POUNCE_TICKS - (enemy.actionUntil - tick);
    enemy.along = Math.min(lane.length, enemy.actionAlong + Math.round((POUNCE_U * t) / POUNCE_TICKS));
    enemy.y = Math.round((4 * POUNCE_HEIGHT_U * t * (POUNCE_TICKS - t)) / (POUNCE_TICKS * POUNCE_TICKS));
    if (tick >= enemy.actionUntil) {
      enemy.action = ACTION.none;
      enemy.actionUntil = tick + RETREAT_COOLDOWN_TICKS;
      enemy.y = 0;
      setMode(world, enemy, "walk");
    } else setMode(world, enemy, "airborne");
    return;
  }

  if (!canMove(enemy.statuses, tick)) {
    if (enemy.action === ACTION.charge) endCharge(world, enemy, def as EnemyDef, false);
    else if (enemy.action !== ACTION.none && enemy.action !== ACTION.banner) interruptFoe(world, enemy);
    const rooted = hasStatus(enemy.statuses, "root", tick) && !hasStatus(enemy.statuses, "stun", tick) && !hasStatus(enemy.statuses, "freeze", tick);
    setMode(world, enemy, grounded ? "grounded" : rooted ? "hold" : "stunned");
    return;
  }

  switch (enemy.action) {
    case ACTION.pounceWindup:
      if (tick >= enemy.actionUntil) {
        // Over the blocker (02 §2.2 E18).
        enemy.action = ACTION.pounce;
        enemy.actionAlong = enemy.along;
        enemy.actionUntil = tick + POUNCE_TICKS;
        enemy.blockedBy = -1;
        enemy.pounces -= 1;
        setMode(world, enemy, "airborne");
      } else setMode(world, enemy, "hold");
      return;
    case ACTION.chargeWindup:
      if (tick >= enemy.actionUntil) {
        enemy.action = ACTION.charge;
        setMode(world, enemy, "charge");
      } else setMode(world, enemy, "hold");
      return;
    case ACTION.charge:
      runCharge(world, enemy, def as EnemyDef, lane);
      return;
    case ACTION.retreat: {
      const step = enemy.speed;
      enemy.along = enemy.along - step > enemy.actionAlong ? enemy.along - step : enemy.actionAlong;
      if (enemy.along <= enemy.actionAlong) {
        enemy.action = ACTION.none;
        enemy.actionUntil = tick + RETREAT_COOLDOWN_TICKS;
        setMode(world, enemy, "hold");
      } else setMode(world, enemy, "retreat");
      return;
    }
    case ACTION.banner:
      setMode(world, enemy, "hold");
      return;
    default:
      break;
  }

  // Blocking (03 §9.1): units.ts holds and lets go (flyers only once grounded); a fresh hold may start a pounce or a step back.
  const heldBefore = enemy.blockedBy;
  const unit = blockerFor(world, enemy);
  if (unit >= 0 && unit !== heldBefore) {
    if (enemy.pounces > 0 && attack.pounceWindupMs !== undefined && tick >= enemy.actionUntil) {
      // E18: held for the wind-up, a red line over the blocker, then the leap.
      const windup = msToTicks((attack.pounceWindupMs * telegraphPm) / 1000);
      enemy.action = ACTION.pounceWindup;
      enemy.actionUntil = tick + windup;
      pointAt(lane, Math.min(lane.length, enemy.along + POUNCE_U), enemy.lateral, point);
      // A wide red lane over the blocker: readable even with word tags near the dais (05 §6.2).
      telegraph(world, enemy, "line", point.x, point.z, 0, 1.4, ticksToMs(windup));
      setMode(world, enemy, "hold");
      return;
    }
    if (attack.retreatMm !== undefined && tick >= enemy.actionUntil) {
      // E11: a blocker reached it, so it lets go, steps back 2 m and shoots.
      enemy.blockedBy = -1;
      enemy.action = ACTION.retreat;
      enemy.actionAlong = enemy.along > mmToU(attack.retreatMm) ? enemy.along - mmToU(attack.retreatMm) : 0;
      enemy.actionUntil = -1;
      setMode(world, enemy, "retreat");
      return;
    }
  }

  // E19: a target within 8 m ahead (a blocker, or the ring) and the charge is ready.
  if (attack.kind === "charge" && tick >= enemy.skillAt) {
    const reach = mmToU(attack.rangeMm);
    const unit = enemy.blockedBy >= 0 ? enemy.blockedBy : unitAhead(world, enemy, reach);
    if (unit >= 0 || enemy.along >= lane.length - reach) {
      const goal = unit >= 0 ? Math.min(lane.length, Math.max(enemy.along, world.units.list[unit]!.along)) : lane.length;
      const windup = msToTicks((attack.windupMs * telegraphPm) / 1000);
      enemy.action = ACTION.chargeWindup;
      enemy.actionUntil = tick + windup;
      enemy.actionAlong = goal;
      enemy.aim = unit >= 0 ? { kind: "unit", slot: unit } : { kind: "hero" };
      pointAt(lane, goal, enemy.lateral, point);
      telegraph(world, enemy, "line", point.x, point.z, 0, 1.2, ticksToMs(windup));
      const target = enemy.aim;
      emit(world, { type: "attack", source: enemyRef(enemy), target, stage: "windup", x: uToM(enemy.x), z: uToM(enemy.z), tx: uToM(point.x), tz: uToM(point.z) });
      setMode(world, enemy, "hold");
      return;
    }
  }

  if (enemy.blockedBy >= 0) {
    setMode(world, enemy, grounded ? "grounded" : "blocked");
    return;
  }

  // Where it stops: shooters also stop when something to shoot is in range.
  const stop = attack.kind === "ranged" || enemy.general ? enemy.stopAt : lane.length;
  if (enemy.along >= stop || (attack.kind === "ranged" && hasShot(world, enemy))) {
    if (enemy.along > stop) enemy.along = stop;
    setMode(world, enemy, grounded ? "grounded" : pickTarget(world, enemy) !== null ? "attack" : "hold");
    wade(world, enemy, lane);
    return;
  }

  // Speed: slows (status), auras and the pack howl, the ford, a new word, a crowded blocker.
  const basePm = statusSpeedPm(world, enemy);
  let bonusPct = auraPct(world, enemy, "speed");
  for (const skill of (def as EnemyDef).skills ?? []) {
    if (skill.kind === "pack-howl" && packSize(world, enemy, mmToU(skill.radiusMm)) >= skill.minPack) bonusPct += skill.speedPct;
  }
  const ford = !lane.sky && !flyer ? spanAt(lane.fords, enemy.along) : null;
  const fordPct = ford ? 100 - ford.slowPct : 100;
  const wordPct = 100 - wordSlowPct(world, enemy);
  const passPct = blockPassPct(world, enemy);
  let step = Math.round((enemy.speed * basePm * (100 + bonusPct) * fordPct * wordPct * passPct) / 1e11);
  // A swarm keeps together: the front waits, the back hurries (spread 0.5 m per side).
  if (enemy.cluster >= 0) {
    const count = clusterCount.get(enemy.cluster) ?? 1;
    const centre = Math.round((clusterSum.get(enemy.cluster) ?? enemy.along) / count);
    const spread = mmToU(("cluster" in def && def.cluster ? def.cluster.spreadMm : 500) * 2);
    if (enemy.along > centre + spread) step = Math.round((step * 60) / 100);
    else if (enemy.along < centre - spread) step = Math.round((step * 130) / 100);
    enemy.lateral = enemy.homeLateral + triangle(tick, enemy.slot * 11, ZIG_AMP_U, ZIG_TICKS);
  }
  enemy.along = Math.min(stop, enemy.along + step);
  wade(world, enemy, lane);
  setMode(world, enemy, grounded ? "grounded" : step > 0 ? "walk" : "hold");
}

/** A shooter has a unit or house in range (it stops for it); the hero is reached at its stop point. */
function hasShot(world: World, enemy: EnemyState): boolean {
  const target = pickTarget(world, enemy);
  return target !== null && target.kind !== "hero";
}

/** Fords (03 §2.4): leaving the water leaves Wet. */
function wade(world: World, enemy: EnemyState, lane: LaneRuntime): void {
  if (lane.sky) return;
  const ford = spanAt(lane.fords, enemy.along);
  if (enemy.wading && !ford) {
    const left = lane.fords.find((span) => enemy.along > span.to) ?? lane.fords[0];
    applyStatus(world, enemyRef(enemy), enemy.statuses, { id: "wet", durationMs: left ? ticksToMs(left.wetTicks) : STATUS.wetMs });
  }
  enemy.wading = ford !== null;
}

function runCharge(world: World, enemy: EnemyState, def: EnemyDef, lane: LaneRuntime): void {
  const goal = enemy.actionAlong;
  const next = Math.min(goal, enemy.along + CHARGE_SPEED_U);
  const unit = unitInContact(world, enemy.lane, next);
  enemy.along = next;
  if (unit >= 0) {
    chargeImpact(world, enemy, { kind: "unit", slot: unit });
    endCharge(world, enemy, def, true);
    return;
  }
  if (next >= goal) {
    if (goal >= lane.length) chargeImpact(world, enemy, { kind: "hero" });
    endCharge(world, enemy, def, true);
    return;
  }
  setMode(world, enemy, "charge");
}

/** After a charge E19 stands stunned and takes more damage (02 §2.2); the next charge waits its cooldown. */
function endCharge(world: World, enemy: EnemyState, def: EnemyDef, landed: boolean): void {
  const attack = def.attack;
  enemy.action = ACTION.none;
  enemy.actionUntil = -1;
  enemy.aim = null;
  enemy.skillAt = world.tick + msToTicks(attack.periodMs);
  if (!landed) return;
  const selfStunMs = attack.selfStunMs ?? 0;
  if (selfStunMs > 0) {
    const target = enemyRef(enemy);
    applyStatus(world, target, enemy.statuses, { id: "stun", durationMs: selfStunMs, self: true });
    if (attack.vulnerablePct) applyStatus(world, target, enemy.statuses, { id: "vulnerable", durationMs: selfStunMs, value: attack.vulnerablePct, self: true });
    setMode(world, enemy, "stunned");
  }
}

/** Foes too close on the same lane slide apart sideways (swarm mates keep their formation). */
function separate(world: World): void {
  const lanes = world.lanes;
  while (byLane.length < lanes.length) byLane.push([]);
  for (const bucket of byLane) bucket.length = 0;
  for (const enemy of world.enemies.list) if (enemy.alive && enemy.mode !== "airborne") byLane[enemy.lane]!.push(enemy);
  for (let index = 0; index < lanes.length; index += 1) {
    const lane = lanes[index]!;
    const bucket = byLane[index]!;
    // Insertion sort by along, then slot (mostly sorted already; deterministic).
    for (let i = 1; i < bucket.length; i += 1) {
      const item = bucket[i]!;
      let j = i - 1;
      while (j >= 0 && (bucket[j]!.along > item.along || (bucket[j]!.along === item.along && bucket[j]!.slot > item.slot))) {
        bucket[j + 1] = bucket[j]!;
        j -= 1;
      }
      bucket[j + 1] = item;
    }
    for (let i = 0; i < bucket.length; i += 1) {
      const a = bucket[i]!;
      for (let j = i + 1; j < bucket.length; j += 1) {
        const b = bucket[j]!;
        if (b.along - a.along > SEP_ALONG_U) break;
        if (a.cluster >= 0 && a.cluster === b.cluster) continue;
        const gap = b.lateral - a.lateral;
        if (gap >= SEP_LATERAL_U || gap <= -SEP_LATERAL_U) continue;
        const dir = gap > 0 || (gap === 0 && b.slot > a.slot) ? 1 : -1;
        a.lateral -= dir * SEP_STEP_U;
        b.lateral += dir * SEP_STEP_U;
      }
    }
    for (const enemy of bucket) {
      const room = lateralRoom(lane, enemy.along);
      enemy.lateral = clamp(enemy.lateral, -room, room);
      if (enemy.cluster >= 0) enemy.homeLateral = clamp(enemy.homeLateral, -room, room);
    }
  }
}
