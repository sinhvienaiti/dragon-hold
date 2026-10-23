/**
 * Maps sim actors to the crowd: foes by serial (appear when the world has
 * them, dissolve on `death`), placed traps, houses and units as placeholders;
 * interpolates positions with FrameInfo.alpha; heights from
 * TerrainView.heightAt. Hit reactions (flash, fake knock-back, squash) come
 * from kit/feedback Reactions with the dragon profile, status tints from
 * `status` and `aura` events and the world's status lists (05 §5, §6.2).
 * Also the FoeLocator other view parts use to follow a drawn foe.
 * Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";
import { DRAGON, Reactions } from "../kit/feedback";
import { ENEMIES } from "../content/data/enemies";
import { GENERALS } from "../content/data/generals";
import { HOUSES, TRAPS, UNITS } from "../content/data/our-side";
import type { EntityRef, FoeId, Gait, MoveMode, PlaceholderDef, SimEvent, StatusId } from "../content/types";
import { uToM } from "../sim/fixed";
import type { EnemyState, World } from "../sim/world";
import type { FrameInfo, Presenter } from "../app/contracts";
import { CHARACTER_SCALE, createCrowd, TINT, type Crowd, type CrowdGait, type CrowdInstance, type TintId } from "./crowd";
import type { Stage } from "./stage";
import type { TerrainView } from "./terrain";

/** Where on a drawn foe: its ground point, body centre, or just over its head. */
export type FoeAnchor = "base" | "center" | "top";

/** Finds the drawn position of foe {slot, serial}, metres; false when it is not drawn. */
export interface FoeLocator {
  locate(slot: number, serial: number, at: FoeAnchor, out: THREE.Vector3): boolean;
}

/** A foe's placeholder and gait (enemies and generals). */
export function foeLook(foe: FoeId): { placeholder: PlaceholderDef; gait: Gait } {
  const enemy = ENEMIES[foe as keyof typeof ENEMIES];
  if (enemy !== undefined) return { placeholder: enemy.show.placeholder, gait: enemy.gait };
  const general = GENERALS[foe as keyof typeof GENERALS];
  if (general !== undefined) return { placeholder: general.show.placeholder, gait: general.gait };
  return { placeholder: { shape: "box", color: "#808080", sizeM: [0.6, 1, 0.6], hoverM: 0 }, gait: "biped" };
}

/** Height above the ground the sim gives a foe (sky lanes), else the placeholder's hover. */
function liftOf(foe: EnemyState, hover: number): number {
  if (foe.mode === "grounded") return 0;
  const y = uToM(foe.y);
  return y > 0.01 ? y : hover;
}

/** The world's own positions (no interpolation): a fallback when no actors view is around. */
export function worldLocator(world: World, terrain?: TerrainView): FoeLocator {
  return {
    locate(slot: number, serial: number, at: FoeAnchor, out: THREE.Vector3): boolean {
      const foe = world.enemies.list[slot];
      if (foe === undefined || foe.serial !== serial) return false;
      const x = uToM(foe.x);
      const z = uToM(foe.z);
      const look = foeLook(foe.foe);
      const ground = terrain?.heightAt(x, z) ?? 0;
      const lift = liftOf(foe, look.placeholder.hoverM);
      const h = look.placeholder.sizeM[1] * CHARACTER_SCALE;
      out.set(x, ground + (at === "base" ? 0 : lift + (at === "center" ? h * 0.5 : h + 0.15)), z);
      return true;
    },
  };
}

interface FoeRec {
  serial: number;
  slot: number;
  handle: number;
  look: { placeholder: PlaceholderDef; gait: Gait };
  /** Positions at the last two ticks seen (metres) and the tick of the latter. */
  px: number;
  pz: number;
  cx: number;
  cz: number;
  tick: number;
  /** Drawn this frame. */
  x: number;
  y: number;
  z: number;
  lift: number;
  yaw: number;
  mode: MoveMode;
  /** Seconds since death (−1: alive). */
  dying: number;
  seen: number;
  aura: boolean;
}

interface StatusMark {
  readonly id: StatusId;
  until: number;
}

interface OurRec {
  handle: number;
  key: string;
  seen: number;
}

const DEATH_SECONDS = 0.6;
const REACTION_SLOTS = 512;

/** Statuses that tint, strongest first (05 §6.2: colour, shake, lean; never a clip). */
const TINT_ORDER: readonly (readonly [StatusId, TintId])[] = [
  ["root", TINT.held],
  ["grounded", TINT.held],
  ["freeze", TINT.slow],
  ["stun", TINT.stun],
  ["burn", TINT.burn],
  ["slow", TINT.slow],
  ["wet", TINT.wet],
];

export interface ActorsView extends Presenter, FoeLocator {
  readonly crowd: Crowd;
  readonly reactions: Reactions;
  /** Foes drawn now (alive and dissolving). */
  readonly foes: number;
}

export interface ActorsOptions {
  /** Crowd capacity per layer (220 foes, dissolving ones and our side). */
  capacity?: number;
}

export function createActors(stage: Stage, terrain: TerrainView, options: ActorsOptions = {}): ActorsView {
  const capacity = options.capacity ?? 320;
  const crowd = createCrowd(capacity);
  stage.layers.actors.add(crowd.group);
  const reactions = new Reactions(REACTION_SLOTS, DRAGON);
  const ourReactions = new Reactions(64, DRAGON);
  const foes = new Map<number, FoeRec>();
  const ours = new Map<string, OurRec>();
  const statuses = new Map<number, StatusMark[]>();
  const sample = new Float32Array(5);
  const instance: CrowdInstance = { x: 0, y: 0, z: 0, yaw: 0, flash: 0, squash: 1 };
  let stamp = 0;
  let nowS = 0;

  const heightAt = (x: number, z: number): number => terrain.heightAt(x, z);

  const reset = (inst: CrowdInstance): CrowdInstance => {
    inst.lift = undefined;
    inst.knockX = 0;
    inst.knockZ = 0;
    inst.dissolve = 0;
    inst.tint = 0;
    inst.tintMix = 0;
    inst.stride = 1;
    inst.scale = 1;
    inst.flash = 0;
    inst.squash = 1;
    return inst;
  };

  const markStatus = (serial: number, id: StatusId, on: boolean, durationMs: number): void => {
    let list = statuses.get(serial);
    if (list === undefined) {
      if (!on) return;
      list = [];
      statuses.set(serial, list);
    }
    const found = list.find((mark) => mark.id === id);
    if (!on) {
      if (found) found.until = 0;
      return;
    }
    const until = nowS + Math.max(0.2, durationMs / 1000);
    if (found) found.until = until;
    else list.push({ id, until });
  };

  const tintOf = (foe: EnemyState, rec: FoeRec, tick: number): TintId => {
    const marks = statuses.get(rec.serial);
    for (const [id, tint] of TINT_ORDER) {
      if (marks?.some((mark) => mark.id === id && mark.until > nowS)) return tint;
      for (const entry of foe.statuses?.list ?? []) if (entry.id === id && entry.until > tick) return tint;
    }
    return rec.aura ? TINT.aura : TINT.none;
  };

  const strideOf = (mode: MoveMode): number => {
    switch (mode) {
      case "walk":
      case "retreat":
        return 1;
      case "charge":
        return 1.6;
      case "knockback":
      case "airborne":
        return 0.4;
      default:
        return 0.12;
    }
  };

  const ourKey = (kind: string, index: number): string => kind + ":" + index;

  const placeOur = (key: string, placeholder: PlaceholderDef, x: number, z: number, yaw: number, extra: Partial<CrowdInstance>, reactSlot: number, gait: CrowdGait = "still"): void => {
    let rec = ours.get(key);
    if (rec === undefined) {
      const handle = crowd.add(placeholder, gait, undefined, { foe: false });
      if (handle < 0) return;
      rec = { handle, key, seen: stamp };
      ours.set(key, rec);
    }
    rec.seen = stamp;
    reset(instance);
    ourReactions.sample(reactSlot % 64, 1, nowS, sample);
    instance.x = x;
    instance.y = heightAt(x, z);
    instance.z = z;
    instance.yaw = yaw;
    instance.flash = sample[0]!;
    instance.squash = sample[3]!;
    instance.stride = gait === "still" ? 0 : 0.12;
    Object.assign(instance, extra);
    crowd.set(rec.handle, instance);
  };

  const view: ActorsView = {
    crowd,
    reactions,
    get foes(): number {
      return foes.size;
    },

    locate(slot: number, serial: number, at: FoeAnchor, out: THREE.Vector3): boolean {
      const rec = foes.get(serial);
      if (rec === undefined || rec.slot !== slot) return false;
      const h = rec.look.placeholder.sizeM[1] * CHARACTER_SCALE;
      out.set(rec.x, rec.y + (at === "base" ? 0 : rec.lift + (at === "center" ? h * 0.5 : h + 0.15)), rec.z);
      return true;
    },

    onEvents(events: readonly SimEvent[], world: World): void {
      for (const event of events) {
        switch (event.type) {
          case "hit": {
            const target = event.target;
            const away = awayFrom(event.source, world);
            const dx = event.x - away[0];
            const dz = event.z - away[1];
            if (target.kind === "enemy") reactions.hit(target.slot % REACTION_SLOTS, target.serial, event.tier, dx, dz, nowS);
            else if (target.kind === "unit") ourReactions.hit(target.slot % 64, 1, event.tier, dx, dz, nowS);
            else if (target.kind === "house") ourReactions.hit((32 + target.slot) % 64, 1, event.tier, dx, dz, nowS);
            break;
          }
          case "death": {
            const rec = foes.get(event.enemy.serial);
            if (rec !== undefined && rec.dying < 0) {
              rec.dying = 0;
              rec.cx = rec.px = event.x;
              rec.cz = rec.pz = event.z;
            }
            statuses.delete(event.enemy.serial);
            break;
          }
          case "status":
            if (event.target.kind === "enemy") markStatus(event.target.serial, event.status, event.on, event.durationMs);
            break;
          case "aura": {
            const rec = foes.get(event.enemy.serial);
            if (rec !== undefined) rec.aura = event.on;
            break;
          }
          case "trap-trigger":
            ourReactions.hit((48 + event.slot) % 64, 1, 3, 0, 1, nowS);
            break;
          default:
            break;
        }
      }
    },

    frame(world: World, info: FrameInfo): void {
      stamp += 1;
      nowS = info.now / 1000;
      const alpha = Math.max(0, Math.min(1, info.alpha));
      const tick = world.tick;
      for (const foe of world.enemies.list) {
        if (!foe.alive || foe.freed) continue;
        let rec = foes.get(foe.serial);
        const x = uToM(foe.x);
        const z = uToM(foe.z);
        if (rec === undefined) {
          const look = foeLook(foe.foe);
          const handle = crowd.add(look.placeholder, look.gait);
          if (handle < 0) continue;
          rec = { serial: foe.serial, slot: foe.slot, handle, look, px: x, pz: z, cx: x, cz: z, tick, x, y: 0, z, lift: 0, yaw: Math.atan2(-x, -z), mode: foe.mode, dying: -1, seen: stamp, aura: false };
          foes.set(foe.serial, rec);
        } else if (rec.tick !== tick) {
          rec.px = rec.cx;
          rec.pz = rec.cz;
          rec.cx = x;
          rec.cz = z;
          rec.tick = tick;
        }
        rec.seen = stamp;
        rec.mode = foe.mode;
        const drawX = rec.px + (rec.cx - rec.px) * alpha;
        const drawZ = rec.pz + (rec.cz - rec.pz) * alpha;
        const mx = rec.cx - rec.px;
        const mz = rec.cz - rec.pz;
        // Face the way it walks; standing, face the dais.
        const want = mx * mx + mz * mz > 1e-6 && foe.mode !== "knockback" ? Math.atan2(mx, mz) : Math.atan2(-drawX, -drawZ);
        rec.yaw = turnToward(rec.yaw, want, info.dt * 9);
        rec.x = drawX;
        rec.z = drawZ;
        rec.y = heightAt(drawX, drawZ);
        rec.lift = liftOf(foe, rec.look.placeholder.hoverM);
        reactions.sample(foe.slot % REACTION_SLOTS, foe.serial, nowS, sample);
        reset(instance);
        instance.x = drawX;
        instance.y = rec.y;
        instance.z = drawZ;
        const stunned = foe.mode === "stunned";
        instance.yaw = rec.yaw + (stunned ? Math.sin(nowS * 21) * 0.18 : 0);
        instance.lift = rec.lift;
        instance.flash = sample[0]!;
        instance.knockX = sample[1]!;
        instance.knockZ = sample[2]!;
        instance.squash = sample[3]!;
        const tint = tintOf(foe, rec, tick);
        instance.tint = tint;
        instance.tintMix = tint === TINT.aura ? 0.35 : tint === TINT.none ? 0 : 0.85;
        instance.stride = strideOf(foe.mode);
        crowd.set(rec.handle, instance);
      }
      // Dying foes dissolve where they fell; foes gone without a death event fade too.
      for (const rec of foes.values()) {
        if (rec.seen === stamp && rec.dying < 0) continue;
        if (rec.dying < 0) rec.dying = 0;
        rec.dying += info.dt;
        if (rec.dying >= DEATH_SECONDS) {
          crowd.remove(rec.handle);
          foes.delete(rec.serial);
          statuses.delete(rec.serial);
          continue;
        }
        reset(instance);
        instance.x = rec.cx;
        instance.y = heightAt(rec.cx, rec.cz);
        instance.z = rec.cz;
        instance.yaw = rec.yaw;
        // Flyers spiral down as they go (05 §6.2 "rơi xoáy").
        instance.lift = rec.lift * (1 - rec.dying / DEATH_SECONDS);
        instance.yaw += rec.lift > 0.5 ? rec.dying * 9 : 0;
        instance.dissolve = Math.min(1, rec.dying / DEATH_SECONDS);
        instance.flash = Math.max(0, 1 - rec.dying * 8);
        instance.stride = 0;
        crowd.set(rec.handle, instance);
      }

      // Our side: traps, houses on their slots, units where the sim keeps them.
      const slots = world.map.slots;
      for (const trap of world.traps.list) {
        const slot = slots[trap.slot];
        const def = TRAPS[trap.trap];
        if (!slot || !def) continue;
        const lane = slot.lane !== undefined ? world.map.lanes.find((item) => item.id === slot.lane) : undefined;
        const yaw = lane !== undefined ? laneYawAt(lane.points, slot.pos) : 0;
        const recharging = trap.readyAt > tick;
        placeOur(ourKey("trap", trap.slot), def.show.placeholder, slot.pos[0], slot.pos[1], yaw, { scale: recharging ? 0.8 : 1, tint: recharging ? TINT.stun : TINT.none, tintMix: recharging ? 0.4 : 0 }, 48 + trap.slot);
      }
      for (const house of world.houses.list) {
        const slot = slots[house.slot];
        const def = HOUSES[house.house];
        if (!slot || !def) continue;
        const yaw = Math.atan2(-slot.pos[0], -slot.pos[1]);
        placeOur(ourKey("house", house.slot), def.show.placeholder, slot.pos[0], slot.pos[1], yaw, house.ruined ? { squash: 0.6, tint: TINT.stun, tintMix: 0.6 } : {}, 32 + house.slot);
      }
      for (const unit of world.units.list) {
        const def = UNITS[unit.unit];
        if (!def) continue;
        const x = uToM(unit.x);
        const z = uToM(unit.z);
        const down = unit.downUntil >= 0;
        // A fallen unit is a bud until it rises (05 §6.6).
        placeOur(ourKey("unit", unit.index), def.show.placeholder, x, z, Math.atan2(-x, -z) + Math.PI, down ? { scale: 0.4, tint: TINT.bud, tintMix: 1 } : {}, unit.index, "biped");
      }
      for (const rec of ours.values()) {
        if (rec.seen === stamp) continue;
        crowd.remove(rec.handle);
        ours.delete(rec.key);
      }
      crowd.flush(nowS);
    },

    dispose(): void {
      crowd.dispose();
      foes.clear();
      ours.clear();
    },
  };
  return view;
}

/** Where a blow comes from, for the knock-back direction: the dais, a trap's slot, a unit. */
function awayFrom(source: EntityRef, world: World): readonly [number, number] {
  if (source.kind === "trap" || source.kind === "house") {
    const slot = world.map.slots[source.slot];
    if (slot) return slot.pos;
  }
  if (source.kind === "unit") {
    const unit = world.units.list[source.slot];
    if (unit) return [uToM(unit.x), uToM(unit.z)];
  }
  return [0, 0];
}

/** Yaw along a lane polyline at the point nearest `pos` (gate to dais). */
export function laneYawAt(points: readonly (readonly [number, number])[], pos: readonly [number, number]): number {
  let best = Infinity;
  let yaw = 0;
  for (let k = 1; k < points.length; k += 1) {
    const [ax, az] = points[k - 1]!;
    const [bx, bz] = points[k]!;
    const mx = (ax + bx) / 2 - pos[0];
    const mz = (az + bz) / 2 - pos[1];
    const d = mx * mx + mz * mz;
    if (d < best) {
      best = d;
      yaw = Math.atan2(bx - ax, bz - az);
    }
  }
  return yaw;
}

/** Turns `from` toward `to` by at most `step` radians, the short way round. */
export function turnToward(from: number, to: number, step: number): number {
  let delta = to - from;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  if (Math.abs(delta) <= step) return to;
  return from + Math.sign(delta) * step;
}
