import { GENERALS } from "../content/data/generals";
import { DIFFICULTY } from "../content/rules";
import { TICK_HZ, mToU, mmToU } from "../sim/fixed";
import { pointAt } from "../sim/lanes";
import { stopAlongFor, traitBit } from "../sim/spawn";
import { foeDefOf } from "../sim/waves";
import { inWordZone } from "../sim/words";
import type { EnemyState, World } from "../sim/world";

const LOOKAHEAD = 1.5 * TICK_HZ;

/** The same x/z placement as movement.ts, including sky lanes; altitude is not part of the word ring. */
function approaching(world: World, enemy: EnemyState, ticks: number, queued = false): boolean {
  if (inWordZone(world, enemy)) return true;
  const along = Math.min(enemy.stopAt, enemy.along + enemy.speed * ticks);
  const lane = world.lanes[enemy.lane]!;
  const point = pointAt(lane, along, enemy.lateral, { x: 0, z: 0 });
  if (queued) {
    // Spawn lateral is random. Preview the closest possible side, without consuming RNG.
    const side = pointAt(lane, along, mToU(1), { x: 0, z: 0 });
    const dx = side.x - point.x, dz = side.z - point.z;
    const room = lane.halfWidth + mToU(1);
    const lateral = Math.max(-room, Math.min(room, Math.round(-(point.x * dx + point.z * dz) * mToU(1) / (dx * dx + dz * dz))));
    pointAt(lane, along, lateral, point);
  }
  return inWordZone(world, { ...enemy, along, x: point.x, z: point.z });
}

/** Read-only, conservative base-speed preview; freezes and slows must never delay cancellation. */
export function idleSpeedUp(world: World): boolean {
  if (world.phase !== "wave" || world.words.live.some((word) => word !== null)) return false;
  for (const enemy of world.enemies.list) if (enemy.alive && approaching(world, enemy, LOOKAHEAD)) return false;
  // Ignore gate/cap delays conservatively: a queued foe may arrive earlier, never later, in this preview.
  for (const group of world.spawn.queue) {
    for (let i = group.next; i < group.members.length; i += 1) {
      const member = group.members[i]!;
      const at = group.startedAt < 0 ? group.at + member.offset : group.startedAt + member.offset;
      const ticks = LOOKAHEAD - Math.max(0, at - world.tick);
      if (ticks < 0) continue;
      const lane = world.lanes[group.lane]!;
      const def = foeDefOf(member.foe);
      const general = member.foe in GENERALS;
      const elite = group.elite && member.foe === group.foe;
      const clustered = member.heads > 1 && "cluster" in def && def.cluster;
      const traits = elite || clustered ? group.traits : 0;
      const swift = (traits & traitBit("swift")) !== 0 ? 125 : 100;
      const speed = Math.round((def.speedMmS * DIFFICULTY[world.difficulty].enemySpeedPm * swift) / 100_000);
      // Spawn jitter is at most twice the cluster spread; preview the furthest head.
      const along = clustered ? mmToU(clustered.spreadMm) * 2 : 0;
      const point = pointAt(lane, along, 0, { x: 0, z: 0 });
      const enemy = { foe: member.foe, general, elite, cluster: member.heads > 1 ? 0 : -1,
        lane: group.lane, along, stopAt: stopAlongFor(lane, def, general), speed, lateral: 0,
        x: point.x, z: point.z, blockedBy: -1, mode: "walk",
      } as EnemyState;
      if (approaching(world, enemy, ticks, true)) return false;
    }
  }
  return true;
}

/** Real-time latch shared by the scale callback and the post-step frame, so a new word cancels immediately. */
export function createIdleSpeed(): { update(world: World, now: number, blocked: boolean): boolean; reset(): void } {
  let since: number | null = null;
  return {
    update(world, now, blocked) {
      if (blocked || !idleSpeedUp(world)) { since = null; return false; }
      since ??= now;
      return now - since >= 300;
    },
    reset() { since = null; },
  };
}

/** Only the sim accumulator receives this multiplier; audio and presentation keep their own clocks. */
export function frameTimeScale(hitStop: number, speed: number, manual: boolean, idle: boolean, blocked: boolean): number {
  return hitStop * (blocked ? 1 : manual ? 2 : idle ? 1.75 : 1) * speed;
}
