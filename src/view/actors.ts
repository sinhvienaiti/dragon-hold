/**
 * Maps sim actors to the crowd: foes by serial (appear when the world has
 * them, dissolve on `death`), placed traps, houses and units as placeholders;
 * interpolates positions with FrameInfo.alpha; heights from
 * TerrainView.heightAt. Hit reactions (flash, fake knock-back, squash) come
 * from kit/feedback Reactions with the dragon profile, status tints from
 * `status` and `aura` events and the world's status lists (05 §5, §6.2).
 * Also the FoeLocator other view parts use to follow a drawn foe.
 * M0b: with the owner's models loaded (view/models.ts), each foe, unit and
 * trap draws in its model's layer and plays clips (view/motion.ts): walk at
 * the drawn speed, the attack wind-up held to the strike, a Hit over it, the
 * family death before the dissolve; the warden blocks, falls and rises;
 * spikes sink and pop, the net launcher turns to the nearest flyer, the bomb
 * and the hut breathe. Until a model loads its primitive stands in.
 * Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";
import { DRAGON, Reactions } from "../kit/feedback";
import { HOUSES, TRAPS, UNITS } from "../content/data/our-side";
import type { EntityRef, FoeId, MoveMode, PlaceholderDef, SimEvent, StatusId } from "../content/types";
import { uToM } from "../sim/fixed";
import type { EnemyState, World } from "../sim/world";
import type { FrameInfo, Presenter } from "../app/contracts";
import { createCrowd, TINT, type Crowd, type CrowdGait, type CrowdInstance, type CrowdLook, type CrowdRing, type TintId } from "./crowd";
import { drawnClusters, foeDrawLook, swarmOffset, UNIT_DRAW_SCALE, type FoeLook } from "./foe-look";
import { MODEL_SPECS, type ModelSpec } from "./model-specs";
import type { CrowdModels } from "./models";
import { Motion } from "./motion";
import type { Stage } from "./stage";
import type { TerrainView } from "./terrain";

/** Where on a drawn foe: its ground point, body centre, or just over its head. */
export type FoeAnchor = "base" | "center" | "top";

/** Finds the drawn position of foe {slot, serial}, metres; false when it is not drawn. */
export interface FoeLocator {
  locate(slot: number, serial: number, at: FoeAnchor, out: THREE.Vector3): boolean;
}

/** The disc under our units (a flat pale-blue ellipse, one layer for all of them), as wide as the drawn unit. */
const UNIT_DISC: PlaceholderDef = { shape: "sphere", color: "#5f9fe0", sizeM: [2.3, 0.08, 2.3], hoverM: 0 };
const UNIT_DISC_LOOK: CrowdLook = { foe: false, outline: 0 };
const UNIT_LOOK: CrowdLook = { foe: false, scale: UNIT_DRAW_SCALE };

/** A foe's drawn placeholder, gait and scale (enemies and generals; foe-look.ts). */
export function foeLook(foe: FoeId): FoeLook {
  return foeDrawLook(foe);
}

/** How the crowd draws a foe: its tier scale, full outline and rim; a general a bolder edge and rim. */
function crowdLookOf(look: FoeLook): CrowdLook {
  return look.tier === "general" ? { foe: true, scale: look.scale, outline: 1.5, rim: 0.95, ash: 0.05 } : { foe: true, scale: look.scale };
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
      const h = look.placeholder.sizeM[1] * look.scale;
      out.set(x, ground + (at === "base" ? 0 : lift + (at === "center" ? h * 0.5 : h + 0.15)), z);
      return true;
    },
  };
}

interface FoeRec {
  serial: number;
  slot: number;
  handle: number;
  look: FoeLook;
  /** The owner's model and its clips once the layer is skinned (null: primitive). */
  spec: ModelSpec | null;
  motion: Motion | null;
  /** Last drawn ground point, for the speed the walk cycle follows. */
  lastX: number;
  lastZ: number;
  /** Swarm cluster (−1: none) and the drawn spread from its sim point (view only, metres). */
  cluster: number;
  ox: number;
  oz: number;
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
  /** Seconds since death (−1: alive), and how long its death takes. */
  dying: number;
  deathS: number;
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
  /** The crowd layer it draws in, and its clips once skinned. */
  layer: string | undefined;
  motion: Motion | null;
  lastX: number;
  lastZ: number;
  /** Launcher head yaw (relative, radians) and spikes pop time (s since the last stab, −1: none). */
  aim: number;
  pop: number;
}

const DEATH_SECONDS = 0.6;
/**
 * A general's death lasts longer and sinks into moss (02 §3.4 "thân tan thành
 * rêu"; test pass 27/10: G01 vanished in 0.1 s like a grunt). fx.ts plays the
 * moss and the flinch ring, banners.ts drops its banner.
 */
const GENERAL_DEATH_SECONDS = 1.5;
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
  /** The owner's models (M0b); without them every actor stays a primitive. */
  models?: CrowdModels;
}

/** Seconds into Attack where the blow lands, per rig (the wind-up holds there until the sim's strike). */
export function strikeSeconds(spec: ModelSpec): number {
  const marks = spec.marks;
  if (marks?.kind === "biped") return marks.weapon === "left" && !spec.ours && marks.pole === undefined ? 0.6 : 0.5;
  if (marks?.kind === "hexapod") return 0.4;
  return 0.5;
}

/** A model's death leaves this long for the dissolve after its clip. */
const MODEL_DISSOLVE_S = 0.4;

export function createActors(stage: Stage, terrain: TerrainView, options: ActorsOptions = {}): ActorsView {
  const capacity = options.capacity ?? 320;
  const crowd = createCrowd(capacity);
  stage.layers.actors.add(crowd.group);
  const models = options.models;
  const detachModels = models?.attach(crowd);
  let phaseSeed = 0x9e3779b9;
  const nextPhase = (): number => {
    phaseSeed ^= phaseSeed << 13;
    phaseSeed ^= phaseSeed >>> 17;
    phaseSeed ^= phaseSeed << 5;
    return ((phaseSeed >>> 0) % 9973) / 9973;
  };
  /** A Motion for a model whose layer is skinned now (null: still a primitive, or a rig with no clips). */
  const motionFor = (spec: ModelSpec | null, key: string | undefined, drawnH: number): Motion | null => {
    if (spec === null || key === undefined || models === undefined || !crowd.isSkinned(key)) return null;
    const baked = models.layer(spec.content)?.baked;
    if (!baked) return null;
    return new Motion(baked, { strideM: spec.strideH * drawnH, cadence: spec.cadence, strikeS: strikeSeconds(spec), phase: nextPhase() });
  };
  // Every primitive layer exists from the start: the effects' warm-up compile (fx.ts) covers bodies and outline
  // hulls, so the first foe of a wave never stalls a frame on a shader link.
  for (const shape of ["capsule", "box", "sphere", "cone"] as const) crowd.prepare(shape);
  const reactions = new Reactions(REACTION_SLOTS, DRAGON);
  const ourReactions = new Reactions(64, DRAGON);
  const foes = new Map<number, FoeRec>();
  const ours = new Map<string, OurRec>();
  const statuses = new Map<number, StatusMark[]>();
  /** Swarm clusters: members seen so far (spread index), and this frame's ring per cluster. */
  const clusterNext = new Map<number, number>();
  const ringPool: CrowdRing[] = [];
  const ringBy = new Map<number, { ring: CrowdRing; n: number; sx: number; sz: number; color: string; members: FoeRec[] }>();
  const spread: [number, number] = [0, 0];
  const sample = new Float32Array(5);
  const instance: CrowdInstance = { x: 0, y: 0, z: 0, yaw: 0, flash: 0, squash: 1 };
  let stamp = 0;
  let nowS = 0;

  const heightAt = (x: number, z: number): number => terrain.heightAt(x, z);

  const reset = (inst: CrowdInstance): CrowdInstance => {
    inst.clip = undefined;
    inst.clipTime = undefined;
    inst.clipB = undefined;
    inst.clipTimeB = undefined;
    inst.blend = 0;
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

  const placeOur = (key: string, placeholder: PlaceholderDef, x: number, z: number, yaw: number, extra: Partial<CrowdInstance>, reactSlot: number, gait: CrowdGait = "still", look: CrowdLook = { foe: false }, model?: string): OurRec | null => {
    let rec = ours.get(key);
    if (rec === undefined) {
      const layer = model === undefined ? undefined : models?.layerKey(model);
      const handle = crowd.add(placeholder, gait, layer, look);
      if (handle < 0) return null;
      rec = { handle, key, seen: stamp, layer, motion: null, lastX: x, lastZ: z, aim: 0, pop: -1 };
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
    return rec;
  };
  /** Writes an our-side instance placed by placeOur (after its clips are set). */
  const commitOur = (rec: OurRec | null): void => {
    if (rec !== null) crowd.set(rec.handle, instance);
  };

  /** Adds a live swarm member to its cluster's ring this frame. */
  const gatherRing = (rec: FoeRec): void => {
    let entry = ringBy.get(rec.cluster);
    if (entry === undefined) {
      const ring = ringPool.pop() ?? { x: 0, y: 0, z: 0, radius: 1, color: "#ffffff", alpha: 0.9 };
      entry = { ring, n: 0, sx: 0, sz: 0, color: rec.look.placeholder.color, members: [] };
      ringBy.set(rec.cluster, entry);
    }
    entry.n += 1;
    entry.sx += rec.x;
    entry.sz += rec.z;
    entry.members.push(rec);
  };

  /** This frame's cluster rings (2+ live members): round their drawn bodies, in the family colour. */
  const finishRings = (): CrowdRing[] => {
    const out: CrowdRing[] = [];
    drawnClusters.clear();
    for (const [cluster, entry] of ringBy) {
      ringBy.delete(cluster);
      const ring = entry.ring;
      if (entry.n < 2) {
        ringPool.push(ring);
        continue;
      }
      ring.x = entry.sx / entry.n;
      ring.z = entry.sz / entry.n;
      let far = 0;
      let body = 0;
      for (const member of entry.members) {
        far = Math.max(far, Math.hypot(member.x - ring.x, member.z - ring.z));
        body = Math.max(body, Math.max(member.look.placeholder.sizeM[0], member.look.placeholder.sizeM[2]) * member.look.scale * 0.5);
      }
      ring.y = heightAt(ring.x, ring.z);
      ring.radius = far + body + 0.35;
      ring.color = entry.color;
      ring.alpha = 0.95;
      drawnClusters.set(cluster, { x: ring.x, z: ring.z, radius: ring.radius });
      out.push(ring);
      ringPool.push(ring);
    }
    // Clusters with no member left forget their spread counter.
    if (clusterNext.size > 64) for (const key of clusterNext.keys()) if (![...foes.values()].some((rec) => rec.cluster === key)) clusterNext.delete(key);
    return out;
  };

  /**
   * Trap motion on a model layer: spikes stand up, sink while switched off and pump on each stab; the net
   * launcher's head turns to the nearest flyer; the bomb breathes while ready (05 §6.5). Writes into `instance`.
   */
  const animateTrap = (rec: OurRec, model: string, world: World, x: number, z: number, yaw: number, recharging: boolean, off: boolean, dt: number): void => {
    if (rec.layer === undefined) return;
    const baked = models?.layer(model)?.baked;
    if (rec.pop >= 0) rec.pop += dt;
    if (model === "traps/pine-bomb") {
      if (!recharging) instance.squash *= 1 + 0.035 * Math.sin(nowS * 2.4 + x);
      return;
    }
    if (!baked || !crowd.isSkinned(rec.layer)) return;
    if (baked.index.ready !== undefined) {
      // 0 sunk … 1 up; a stab pops it from half way.
      const pump = rec.pop >= 0 && rec.pop < 0.3 ? 0.45 + 0.55 * (rec.pop / 0.3) : 1;
      instance.clip = baked.index.ready;
      instance.clipTime = off ? 0.12 : pump;
    } else if (baked.index.aim !== undefined) {
      let best = Infinity;
      let want = rec.aim;
      for (const foe of world.enemies.list) {
        if (!foe.alive || foe.mode === "grounded" || uToM(foe.y) < 0.5) continue;
        const dx = uToM(foe.x) - x;
        const dz = uToM(foe.z) - z;
        const d = dx * dx + dz * dz;
        if (d < best) {
          best = d;
          want = Math.atan2(dx, dz) - yaw;
        }
      }
      rec.aim = turnToward(rec.aim, Math.atan2(Math.sin(want), Math.cos(want)), dt * 3.5);
      instance.clip = baked.index.aim;
      instance.clipTime = (Math.atan2(Math.sin(rec.aim), Math.cos(rec.aim)) + Math.PI) / (Math.PI * 2);
    }
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
      const h = rec.look.placeholder.sizeM[1] * rec.look.scale;
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
            if (target.kind === "enemy") {
              reactions.hit(target.slot % REACTION_SLOTS, target.serial, event.tier, dx, dz, nowS);
              foes.get(target.serial)?.motion?.hit();
            } else if (target.kind === "unit") {
              ourReactions.hit(target.slot % 64, 1, event.tier, dx, dz, nowS);
              ours.get(ourKey("unit", target.slot))?.motion?.play("block");
            } else if (target.kind === "house") ourReactions.hit((32 + target.slot) % 64, 1, event.tier, dx, dz, nowS);
            break;
          }
          case "attack": {
            const source = event.source;
            if (source.kind === "enemy") foes.get(source.serial)?.motion?.attack(event.stage);
            else if (source.kind === "unit" && event.stage === "strike") ours.get(ourKey("unit", source.slot))?.motion?.attack("strike");
            break;
          }
          case "banner":
            // G01's Cắm Cờ: stands with the banner high, plants it.
            if (event.stage === "windup") foes.get(event.owner.serial)?.motion?.play("cast");
            break;
          case "unit-down":
            ours.get(ourKey("unit", event.unit))?.motion?.play("down");
            break;
          case "unit-up":
            ours.get(ourKey("unit", event.unit))?.motion?.play("rise");
            break;
          case "death": {
            const rec = foes.get(event.enemy.serial);
            if (rec !== undefined && rec.dying < 0) {
              rec.dying = 0;
              rec.cx = rec.px = event.x;
              rec.cz = rec.pz = event.z;
              rec.motion?.die();
              if (rec.motion !== null) rec.deathS = Math.max(rec.deathS, rec.motion.deathSeconds + MODEL_DISSOLVE_S);
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
          case "trap-trigger": {
            ourReactions.hit((48 + event.slot) % 64, 1, 3, 0, 1, nowS);
            const rec = ours.get(ourKey("trap", event.slot));
            if (rec !== undefined) rec.pop = 0;
            break;
          }
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
          const spec = MODEL_SPECS[look.model] ?? null;
          const layer = spec === null ? undefined : models?.layerKey(look.model);
          const handle = crowd.add(look.placeholder, look.gait, layer, { ...crowdLookOf(look), wash: spec?.wash ?? 0 });
          if (handle < 0) continue;
          let ox = 0;
          let oz = 0;
          if (foe.cluster >= 0 && look.gait === "swarm") {
            // Spread the cluster's bodies on a sunflower spiral, in the order they first show (stable for life).
            const k = clusterNext.get(foe.cluster) ?? 0;
            clusterNext.set(foe.cluster, k + 1);
            swarmOffset(k, spread);
            ox = spread[0];
            oz = spread[1];
          }
          rec = {
            serial: foe.serial,
            slot: foe.slot,
            handle,
            look,
            spec: layer === undefined ? null : spec,
            motion: null,
            lastX: x + ox,
            lastZ: z + oz,
            cluster: look.gait === "swarm" ? foe.cluster : -1,
            ox,
            oz,
            px: x,
            pz: z,
            cx: x,
            cz: z,
            tick,
            x,
            y: 0,
            z,
            lift: 0,
            yaw: Math.atan2(-x, -z),
            mode: foe.mode,
            dying: -1,
            deathS: foe.general ? GENERAL_DEATH_SECONDS : DEATH_SECONDS,
            seen: stamp,
            aura: false,
          };
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
        const drawX = rec.px + (rec.cx - rec.px) * alpha + rec.ox;
        const drawZ = rec.pz + (rec.cz - rec.pz) * alpha + rec.oz;
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
        if (rec.motion === null && rec.spec !== null) {
          rec.motion = motionFor(rec.spec, models?.layerKey(rec.look.model), rec.look.placeholder.sizeM[1] * rec.look.scale);
          // A general shows itself with its banner (02 §3.4 intro).
          if (rec.motion !== null && rec.look.tier === "general") rec.motion.play("intro");
        }
        if (rec.motion !== null) {
          const worldDt = info.worldDt;
          const moved = Math.hypot(drawX - rec.lastX, drawZ - rec.lastZ);
          rec.motion.update(worldDt, worldDt > 1e-4 ? moved / worldDt : 0, foe.mode === "charge");
          rec.motion.write(instance);
          // Stunned or held foes keep the yaw shake and tints (05 §6.2: statuses never change the clip).
        }
        rec.lastX = drawX;
        rec.lastZ = drawZ;
        crowd.set(rec.handle, instance);
        if (rec.cluster >= 0) gatherRing(rec);
      }
      // Dying foes dissolve where they fell; foes gone without a death event fade too.
      for (const rec of foes.values()) {
        if (rec.seen === stamp && rec.dying < 0) continue;
        if (rec.dying < 0) rec.dying = 0;
        rec.dying += info.dt;
        if (rec.dying >= rec.deathS) {
          crowd.remove(rec.handle);
          foes.delete(rec.serial);
          statuses.delete(rec.serial);
          continue;
        }
        reset(instance);
        instance.x = rec.cx + rec.ox;
        instance.y = heightAt(instance.x, rec.cz + rec.oz);
        instance.z = rec.cz + rec.oz;
        instance.yaw = rec.yaw;
        // Flyers spiral down as they go (05 §6.2 "rơi xoáy"); a general slumps and sinks, tinted moss.
        const t = rec.dying / rec.deathS;
        instance.lift = rec.lift * (1 - t);
        instance.yaw += rec.lift > 0.5 ? rec.dying * 9 : 0;
        const general = rec.look.tier === "general";
        if (rec.motion !== null) {
          // The owner's model plays its family's death first; the dissolve takes the end.
          rec.motion.update(info.worldDt, 0);
          rec.motion.write(instance);
          const start = rec.deathS - MODEL_DISSOLVE_S - (general ? 0.3 : 0);
          instance.dissolve = Math.min(1, Math.max(0, (rec.dying - start) / (rec.deathS - start)));
        } else instance.dissolve = Math.min(1, general ? Math.max(0, t * 1.4 - 0.4) : t);
        instance.flash = Math.max(0, 1 - rec.dying * 8);
        if (general) {
          instance.y -= t * t * 0.9;
          if (rec.motion === null) instance.squash = 1 - 0.25 * Math.min(1, t * 2);
          // Moss green (crowd TINT "held" is the moss colour #7fbf5a).
          instance.tint = TINT.held;
          instance.tintMix = Math.min(0.9, t * 1.5);
        }
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
        const off = trap.offUntil > tick;
        const rec = placeOur(ourKey("trap", trap.slot), def.show.placeholder, slot.pos[0], slot.pos[1], yaw, { scale: recharging ? 0.8 : 1, tint: recharging || off ? TINT.stun : TINT.none, tintMix: recharging || off ? 0.4 : 0 }, 48 + trap.slot, "still", { foe: false }, def.show.model);
        if (rec !== null) animateTrap(rec, def.show.model, world, slot.pos[0], slot.pos[1], yaw, recharging, off, info.dt);
        commitOur(rec);
      }
      for (const house of world.houses.list) {
        const slot = slots[house.slot];
        const def = HOUSES[house.house];
        if (!slot || !def) continue;
        const yaw = Math.atan2(-slot.pos[0], -slot.pos[1]);
        const rec = placeOur(ourKey("house", house.slot), def.show.placeholder, slot.pos[0], slot.pos[1], yaw, house.ruined ? { squash: 0.6, tint: TINT.stun, tintMix: 0.6 } : {}, 32 + house.slot, "still", { foe: false }, def.show.model);
        // The hut breathes (a slow swell; its heal drops and pulse are fx.ts), never while ruined.
        if (rec !== null && !house.ruined && rec.layer !== undefined) instance.squash *= 1 + 0.018 * Math.sin(nowS * 1.7 + house.slot);
        commitOur(rec);
      }
      for (const unit of world.units.list) {
        const def = UNITS[unit.unit];
        if (!def) continue;
        const x = uToM(unit.x);
        const z = uToM(unit.z);
        const down = unit.downUntil >= 0;
        const key = ourKey("unit", unit.index);
        // A fallen unit is a bud until it rises (05 §6.6); a model crouches into it first.
        const known = ours.get(key);
        const crouching = known?.motion !== null && known?.motion !== undefined;
        const rec = placeOur(key, def.show.placeholder, x, z, Math.atan2(-x, -z) + Math.PI, down ? { scale: crouching ? 0.55 : 0.4, tint: TINT.bud, tintMix: 1 } : {}, unit.index, "biped", UNIT_LOOK, def.show.model);
        if (rec !== null) {
          const spec = MODEL_SPECS[def.show.model] ?? null;
          if (rec.motion === null && spec !== null) rec.motion = motionFor(spec, rec.layer, def.show.placeholder.sizeM[1] * UNIT_DRAW_SCALE);
          if (rec.motion !== null) {
            const moved = Math.hypot(x - rec.lastX, z - rec.lastZ);
            rec.motion.update(info.worldDt, info.worldDt > 1e-4 ? moved / info.worldDt : 0);
            rec.motion.write(instance);
          }
          rec.lastX = x;
          rec.lastZ = z;
        }
        commitOur(rec);
        // A blue disc under each of ours: told apart from a moss foe at a glance, even before its HP bar shows.
        if (!down) commitOur(placeOur(ourKey("unit-disc", unit.index), UNIT_DISC, x, z, 0, {}, unit.index, "still", UNIT_DISC_LOOK));
      }
      for (const rec of ours.values()) {
        if (rec.seen === stamp) continue;
        crowd.remove(rec.handle);
        ours.delete(rec.key);
      }
      crowd.setRings(finishRings());
      crowd.flush(nowS);
    },

    dispose(): void {
      detachModels?.();
      crowd.dispose();
      foes.clear();
      ours.clear();
      drawnClusters.clear();
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
