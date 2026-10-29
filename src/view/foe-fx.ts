/**
 * The foes' side of combat effects (VFX step 3, VFX_STANDARD §3.3 row "Quái ra đòn" and §5.3): every foe's blow in
 * five phases, caster side first, in the foes' crimson (never Hỏa Long's orange, §3.6 rule 3 keeps red for them):
 *   A  wind-up: a crimson glint gathers on the weapon (claw, bow, jaws, tusks, sting) over the sim's wind-up, a
 *      small dark-rimmed ball under it, motes pulled in over its last third (the red ground telegraph is
 *      telegraphs.ts's);
 *   R  strike at the caster: a slash crescent (claws), two closing ones (jaws), a bow or sting flash, a dust burst
 *      (a charge), a hot core over a dark wine puff from frame 1;
 *   T  ranged blows only: an arrow or sting dart with a crimson glow trail, timed to land in 4–9 frames;
 *   I  at the victim: a crimson flash with a pale core, a dark puff behind it from frame 0, sparks by material, and on
 *      the Dragons stone chips and dust off the dais edge nearest the foe;
 *   F  claw scratches on the stone (melee on the dais), dust settling.
 * Spawns: a dark wine ring opens on the ground where a foe comes in, dust and dark motes rise.
 * Everything draws through the host's pools (no draw call of its own). Owner: view-crowd-fx (LANES.md).
 */
import * as THREE from "three";
import type { ParticlePool } from "../kit/three";
import { ENEMIES } from "../content/data/enemies";
import { GENERALS } from "../content/data/generals";
import type { FoeId } from "../content/types";
import { foeDrawLook } from "./foe-look";
import { FX_COLORS, FOE_COLORS } from "./fx-palette";
import type { FlarePool, QuadPool } from "./fx";
import type { StreakSparks } from "./vfx-layers";

const TAU = Math.PI * 2;
/** QuadPool shapes (fx.ts PUFF_FOE, PUFF_SLASH): repeated here so this file needs no value import from fx.ts. */
const SHAPE_FOE = 2;
const SHAPE_SLASH = 3;
/** Mark kinds (fx.ts MARK_FRAGMENT): 1 ring, 7 claw scratches. */
const MARK_RING = 1;
const MARK_SCRATCH = 7;

export type FoeBlow = "slash" | "bite" | "charge" | "arrow" | "sting" | "nip";

/** How each foe strikes (content `show.fx.attack`, 02 §1.5). */
export function foeBlow(foe: string): FoeBlow {
  const enemy = (ENEMIES as Readonly<Record<string, (typeof ENEMIES)[keyof typeof ENEMIES] | undefined>>)[foe];
  const general = (GENERALS as Readonly<Record<string, (typeof GENERALS)[keyof typeof GENERALS] | undefined>>)[foe];
  const attack = enemy?.attack.kind ?? general?.attack.kind ?? "melee";
  if (attack === "charge") return "charge";
  if (attack === "ranged") return enemy?.gait === "flyer" ? "sting" : "arrow";
  if (enemy?.gait === "swarm") return "nip";
  if (enemy?.gait === "quadruped") return "bite";
  return "slash";
}

/** The wind-up of the foe's own attack, ms (content), for a wind-up event without a telegraph. */
export function foeWindupMs(foe: string): number {
  const enemy = (ENEMIES as Readonly<Record<string, (typeof ENEMIES)[keyof typeof ENEMIES] | undefined>>)[foe];
  const general = (GENERALS as Readonly<Record<string, (typeof GENERALS)[keyof typeof GENERALS] | undefined>>)[foe];
  return enemy?.attack.windupMs ?? general?.attack.windupMs ?? 500;
}

export interface FoeFxHost {
  readonly flares: FlarePool;
  readonly puffs: QuadPool;
  readonly rings: QuadPool;
  readonly marks: QuadPool;
  readonly sparks: ParticlePool;
  /** Dark-tailed streaks (normal blend). */
  readonly embers: StreakSparks;
  /** Bright streaks (additive, HDR). */
  readonly glints: StreakSparks;
  readonly random: () => number;
  readonly reduced: boolean;
  readonly k: number;
  heightAt(x: number, z: number): number;
  /** A foe's drawn point (false when it is not drawn). */
  locate(slot: number, serial: number, at: "center" | "top" | "base", out: THREE.Vector3): boolean;
}

/** Who is struck, for the impact's look. */
export type FoeVictim = "dragon" | "guide" | "unit" | "house" | "trap" | "enemy";

interface Windup {
  active: boolean;
  serial: number;
  slot: number;
  blow: FoeBlow;
  age: number;
  duration: number;
  /** Size of the foe (m, drawn height). */
  h: number;
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  dust: number;
  motes: number;
}

interface Flight {
  active: boolean;
  left: number;
  blow: FoeBlow;
  victim: FoeVictim;
  at: THREE.Vector3;
  dirX: number;
  dirZ: number;
  edge: THREE.Vector3 | null;
}

export interface FoeStrike {
  readonly slot: number;
  readonly serial: number;
  readonly foe: string;
  /** Sim positions (m): the foe, and where its blow aims. */
  readonly x: number;
  readonly z: number;
  readonly tx: number;
  readonly tz: number;
  readonly victim: FoeVictim;
  /** Where the blow lands (m); the Dragon's body for the Dragons. */
  readonly hit: THREE.Vector3;
  /** On the Dragons: the dais edge nearest the foe (stone chips, scratches), else null. */
  readonly edge: THREE.Vector3 | null;
}

const MAX_WINDUPS = 24;
const MAX_FLIGHTS = 24;
/** Strikes drawn in full per frame; more only flash at the victim (a crowd at the dais strikes dozens a second). */
const STRIKES_PER_FRAME = 8;
/** Impacts drawn in full per frame; more only flash (the bench's 220-foe ring struck ~60 times a second). */
const IMPACTS_PER_FRAME = 6;
/** Wind-ups drawn per frame (the rest keep their clocks and draw when a slot frees). */
const WINDUPS_DRAWN = 12;
const SPAWNS_PER_FRAME = 3;

export const FOE_FX = {
  /** R: the slash crescent lives this long (held 2 frames). */
  slashS: 8 / 60,
  /** T: an arrow or sting flies at this speed, landing in 4–9 frames. */
  shotMS: 70,
  shotMinS: 4 / 60,
  shotMaxS: 9 / 60,
  /** F: claw scratches on the stone hold, then fade. */
  scratchS: 1.6,
  scratchHoldS: 0.5,
  /** Spawn ring: opens over this long. */
  spawnS: 0.55,
} as const;

export class FoeFx {
  private readonly windups: Windup[] = [];
  private readonly flights: Flight[] = [];
  private strikesThisFrame = 0;
  private impactsThisFrame = 0;
  private spawnsThisFrame = 0;
  private time = 0;
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly u = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  /** Strikes drawn and impacts, for tests and the bench's counters. */
  strikes = 0;
  impacts = 0;
  spawns = 0;

  constructor(private readonly host: FoeFxHost) {
    for (let i = 0; i < MAX_WINDUPS; i += 1) this.windups.push({ active: false, serial: -1, slot: -1, blow: "slash", age: 0, duration: 0.5, h: 1.4, x: 0, y: 0, z: 0, tx: 0, tz: 0, dust: 0, motes: 0 });
    for (let i = 0; i < MAX_FLIGHTS; i += 1) this.flights.push({ active: false, left: 0, blow: "arrow", victim: "dragon", at: new THREE.Vector3(), dirX: 0, dirZ: 1, edge: null });
  }

  /** Live wind-ups, for tests. */
  get windupCount(): number {
    let n = 0;
    for (const w of this.windups) if (w.active) n += 1;
    return n;
  }

  get flightCount(): number {
    let n = 0;
    for (const f of this.flights) if (f.active) n += 1;
    return n;
  }

  // ── A: wind-up ─────────────────────────────────────────────────────────

  /** A foe starts its swing (sim `attack` wind-up); `durationMs` from its telegraph, else the content's. */
  windup(slot: number, serial: number, foe: string, x: number, z: number, tx: number, tz: number, durationMs = foeWindupMs(foe)): void {
    let w = this.windups.find((item) => item.active && item.serial === serial);
    if (w === undefined) w = this.windups.find((item) => !item.active);
    if (w === undefined) w = this.windups.reduce((a, b) => (b.age > a.age ? b : a));
    w.active = true;
    w.serial = serial;
    w.slot = slot;
    w.blow = foeBlow(foe);
    w.age = 0;
    w.duration = Math.max(0.2, durationMs / 1000);
    w.h = foeHeight(foe);
    w.x = x;
    w.z = z;
    w.y = this.host.heightAt(x, z) + w.h * 0.55;
    w.tx = tx;
    w.tz = tz;
    w.dust = 0;
    w.motes = 0;
  }

  /** The foe died or its swing ended. */
  cancel(serial: number): void {
    for (const w of this.windups) if (w.active && w.serial === serial) w.active = false;
  }

  private drawWindup(w: Windup, dt: number): void {
    const host = this.host;
    const f = Math.min(1, w.age / w.duration);
    const soft = host.reduced ? 0.6 : 1;
    const at = this.v;
    if (!host.locate(w.slot, w.serial, "center", at)) at.set(w.x, w.y, w.z);
    else {
      w.x = at.x;
      w.y = at.y;
      w.z = at.z;
    }
    const dx = w.tx - at.x;
    const dz = w.tz - at.z;
    const flat = Math.hypot(dx, dz) || 1;
    const ux = dx / flat;
    const uz = dz / flat;
    const h = w.h;
    // The weapon: claws and bow forward and up, jaws forward, tusks low, the sting under the body.
    const fwd = w.blow === "bite" || w.blow === "charge" ? 0.55 : w.blow === "sting" ? 0.15 : 0.4;
    const up = w.blow === "charge" ? -0.2 : w.blow === "sting" ? -0.25 : w.blow === "bite" ? 0 : 0.25;
    const tip = this.w.set(at.x + ux * fwd * h, at.y + up * h, at.z + uz * fwd * h);
    const flicker = 0.88 + 0.12 * Math.sin(this.time * 47 + w.serial) * Math.sin(this.time * 23 + 1.3);
    const small = w.blow === "nip" ? 0.5 : 1;
    // A dark-rimmed crimson ball under a hot glint, both growing to the strike (they read on sunlit and dusk grass).
    host.puffs.spawn(tip.x, tip.y, tip.z, (0.12 + 0.3 * f) * h * small, 1 / 30, FOE_COLORS.ball, 0.95 * soft, { fadeIn: 0.001, hold: 1 / 30, rot: host.random() * TAU, shape: SHAPE_FOE });
    host.flares.draw(tip, (0.08 + 0.22 * f) * h * small, FOE_COLORS.glint, (0.8 + 2.0 * f) * flicker * soft, 1, 0.4 * h);
    // The last third: motes pulled into the weapon (dark-tailed crimson).
    if (f > 0.66 && w.blow !== "nip") {
      w.motes += dt * 18;
      for (; w.motes >= 1; w.motes -= 1) {
        const angle = host.random() * TAU;
        const r = (0.5 + host.random() * 0.4) * h;
        const start = this.u.set(tip.x + Math.cos(angle) * r, tip.y + (host.random() - 0.3) * 0.6 * h, tip.z + Math.sin(angle) * r);
        const life = Math.max(0.06, (w.duration - w.age) * 0.9);
        this.s.set((tip.x - start.x) / life, (tip.y - start.y) / life, (tip.z - start.z) / life);
        host.embers.spawn(start, this.s, FOE_COLORS.glint, 2.0 * soft, 0.07 * h, 0.06, life, 0, 0);
      }
    }
    // A charge: hooves paw the ground (dust) the whole wind-up.
    if (w.blow === "charge") {
      w.dust += dt * 7;
      for (; w.dust >= 1; w.dust -= 1) {
        const ground = host.heightAt(at.x, at.z);
        host.puffs.spawn(at.x - ux * 0.4 * h + (host.random() - 0.5) * 0.5 * h, ground + 0.15, at.z - uz * 0.4 * h + (host.random() - 0.5) * 0.5 * h, 0.45 * h, 0.5, FX_COLORS.dust, 0.55 * soft, { vy: 0.8, vx: -ux * 1.2, vz: -uz * 1.2, grow: 1.2, fadeIn: 0.04, rot: host.random() * TAU });
      }
    }
  }

  // ── R, T, I: the strike ───────────────────────────────────────────────

  strike(s: FoeStrike): void {
    this.cancel(s.serial);
    const host = this.host;
    const blow = foeBlow(s.foe);
    const h = foeHeight(s.foe);
    const soft = host.reduced ? 0.6 : 1;
    const full = this.strikesThisFrame < STRIKES_PER_FRAME;
    this.strikesThisFrame += 1;
    this.strikes += 1;
    const at = this.v;
    if (!host.locate(s.slot, s.serial, "center", at)) at.set(s.x, host.heightAt(s.x, s.z) + h * 0.55, s.z);
    const dx = s.hit.x - at.x;
    const dz = s.hit.z - at.z;
    const flat = Math.hypot(dx, dz) || 1;
    const ux = dx / flat;
    const uz = dz / flat;
    if (full) this.release(blow, at, ux, uz, h, soft);
    if (blow === "arrow" || blow === "sting") {
      const flight = this.flights.find((item) => !item.active) ?? this.flights.reduce((a, b) => (b.left < a.left ? b : a));
      const from = this.w.set(at.x + ux * 0.4 * h, at.y + (blow === "sting" ? -0.2 : 0.15) * h, at.z + uz * 0.4 * h);
      const dist = from.distanceTo(s.hit);
      const time = Math.min(FOE_FX.shotMaxS, Math.max(FOE_FX.shotMinS, dist / FOE_FX.shotMS));
      const vel = this.s.subVectors(s.hit, from).divideScalar(time);
      // T: the shaft (dark, normal blend) and its crimson glow trail (additive), drag and gravity off: straight in.
      host.embers.spawn(from, vel, FOE_COLORS.shaft, 1, (blow === "sting" ? 0.07 : 0.06) * Math.max(1, h), 0.9 / Math.max(10, vel.length()), time, 0, 0);
      host.glints.spawn(from, vel, FOE_COLORS.glint, 2.2 * soft, (blow === "sting" ? 0.16 : 0.12) * Math.max(1, h), 0.05, time, 0, 0);
      flight.active = true;
      flight.left = time;
      flight.blow = blow;
      flight.victim = s.victim;
      flight.at.copy(s.hit);
      flight.dirX = ux;
      flight.dirZ = uz;
      flight.edge = null;
      return;
    }
    this.impact(blow, s.victim, s.hit, ux, uz, s.edge);
  }

  /** R at the caster: the blow's own shape, a hot core over a dark wine puff (§3.5 rule 4) from frame 1. */
  private release(blow: FoeBlow, at: THREE.Vector3, ux: number, uz: number, h: number, soft: number): void {
    const host = this.host;
    const front = this.u.set(at.x + ux * 0.5 * h, at.y + 0.1 * h, at.z + uz * 0.5 * h);
    if (blow === "slash" || blow === "bite" || blow === "nip") {
      const size = (blow === "slash" ? 1.25 : blow === "bite" ? 0.85 : 0.5) * h;
      const swings = blow === "bite" ? 2 : 1;
      for (let i = 0; i < swings; i += 1) {
        const rot = (blow === "bite" ? (i === 0 ? 0.5 : -0.5) * Math.PI : Math.PI / 2) + (host.random() - 0.5) * 1.2;
        host.puffs.spawn(front.x, front.y, front.z, size, FOE_FX.slashS, FOE_COLORS.ball, 0.97, { fadeIn: 0.001, hold: 2 / 60, grow: 0.25, rot, shape: SHAPE_SLASH });
      }
      host.flares.flare(front, 0.35 * h, FOE_COLORS.core, 2.4 * soft, 4 / 60, 1 / 60, 0.2, 1, 0.3 * h);
      if (blow !== "nip") {
        for (let i = 0; i < 4; i += 1) {
          this.s.set(ux * 6 + (host.random() - 0.5) * 6, 1 + host.random() * 3, uz * 6 + (host.random() - 0.5) * 6);
          host.glints.spawn(front, this.s, FOE_COLORS.glint, 2.0 * soft, 0.05 * h, 0.03, 0.12 + host.random() * 0.08, 3, 6);
        }
      }
    } else if (blow === "charge") {
      // A dust burst at the hooves and a crimson glint at the tusks.
      const ground = host.heightAt(at.x, at.z);
      for (let i = 0; i < 4; i += 1) {
        const a = host.random() * TAU;
        host.puffs.spawn(at.x + Math.cos(a) * 0.4 * h, ground + 0.2, at.z + Math.sin(a) * 0.4 * h, 0.7 * h, 0.7, FX_COLORS.dust, 0.65 * soft, { vx: Math.cos(a) * 2 - ux * 2, vz: Math.sin(a) * 2 - uz * 2, vy: 0.6, grow: 1.4, fadeIn: 1 / 60, rot: host.random() * TAU });
      }
      host.flares.flare(front, 0.45 * h, FOE_COLORS.core, 2.4 * soft, 5 / 60, 1 / 60, 0.2, 1, 0.3 * h);
    } else {
      // Arrow, sting: a flash at the bow or the sting, a snap of sparks along the shot.
      host.flares.flare(front, 0.3 * h, FOE_COLORS.core, 2.2 * soft, 4 / 60, 1 / 60, 0.1, 1, 0.3 * h);
      for (let i = 0; i < 2; i += 1) {
        this.s.set(ux * 9 + (host.random() - 0.5) * 3, 0.5 + host.random(), uz * 9 + (host.random() - 0.5) * 3);
        host.glints.spawn(front, this.s, FOE_COLORS.glint, 1.8 * soft, 0.04 * h, 0.03, 0.1, 3, 4);
      }
    }
    // The dark layer under the bright, from frame 1.
    host.puffs.spawn(front.x - ux * 0.2 * h, front.y, front.z - uz * 0.2 * h, 0.7 * h, 0.3, FOE_COLORS.soot, 0.5 * soft, { vy: 0.5, grow: 0.7, fadeIn: 1 / 60, hold: 2 / 60, rot: host.random() * TAU });
  }

  /** I (and F) at the victim, in the foes' crimson. `edge`: the dais edge nearest the foe (melee on the Dragons). */
  private impact(blow: FoeBlow, victim: FoeVictim, at: THREE.Vector3, ux: number, uz: number, edge: THREE.Vector3 | null): void {
    const host = this.host;
    const soft = host.reduced ? 0.6 : 1;
    const k = host.k;
    const small = blow === "nip" ? 0.55 : blow === "charge" ? 1.4 : 1;
    this.impacts += 1;
    this.impactsThisFrame += 1;
    if (this.impactsThisFrame > IMPACTS_PER_FRAME) {
      host.flares.flare(at, 0.5 * small * k, FOE_COLORS.glint, 1.4 * soft, 4 / 60, 1 / 60, 0.2, 1, 0.4 * k);
      return;
    }
    // A pale core (additive, HDR) over a crimson ball (normal) over a dark wine puff behind it, all from frame 0.
    host.puffs.spawn(at.x + ux * 0.25, at.y + 0.1, at.z + uz * 0.25, 0.8 * small * k, 0.35, FOE_COLORS.soot, 0.55 * soft, { vy: 0.6, grow: 0.8, fadeIn: 0.001, hold: 3 / 60, rot: host.random() * TAU });
    host.puffs.spawn(at.x, at.y, at.z, 0.6 * small * k, 7 / 60, FOE_COLORS.ball, 0.95, { fadeIn: 0.001, hold: 2 / 60, grow: 0.4, rot: host.random() * TAU, shape: SHAPE_FOE });
    host.flares.flare(at, 0.32 * small * k, FOE_COLORS.core, 2.6 * soft, 3 / 60, 1 / 60, 0.1, 1, 0.4 * k);
    host.flares.flare(at, 0.7 * small * k, FOE_COLORS.glint, 0.9 * soft, 5 / 60, 1 / 60, 0.2, 1, 0.4 * k);
    // Sparks by what is struck: scales throw hot crimson glints, wood and leaf splinters, chitin specks.
    const material = victim === "dragon" || victim === "guide" ? FOE_COLORS.glint : victim === "house" || victim === "trap" ? FX_COLORS.wood : FOE_COLORS.chip;
    const n = Math.round((blow === "nip" ? 3 : blow === "charge" ? 9 : 6) * (host.reduced ? 0.6 : 1));
    for (let i = 0; i < n; i += 1) {
      const a = Math.atan2(-uz, -ux) + (host.random() - 0.5) * 2.4;
      const speed = (3 + host.random() * 4) * Math.sqrt(k);
      this.s.set(Math.cos(a) * speed, 2 + host.random() * 4, Math.sin(a) * speed);
      if (victim === "dragon" || victim === "guide") host.glints.spawn(at, this.s, material, 1.8 * soft, 0.06 * k, 0.04, 0.25 + host.random() * 0.2, 1.5, 10);
      else host.embers.spawn(at, this.s, material, 1, 0.08 * k, 0.05, 0.35 + host.random() * 0.25, 1, 12);
    }
    // On the Dragons: the stone takes the blow too (chips, dust and, for claws and jaws, scratches).
    if (edge !== null) {
      for (let i = 0; i < Math.round(5 * (host.reduced ? 0.6 : 1)); i += 1) {
        const a = Math.atan2(-uz, -ux) + (host.random() - 0.5) * 2;
        this.s.set(Math.cos(a) * (2 + host.random() * 3), 2.5 + host.random() * 3, Math.sin(a) * (2 + host.random() * 3));
        host.embers.spawn(edge, this.s, FOE_COLORS.chip, 1, 0.09 * k, 0.04, 0.45 + host.random() * 0.2, 0.8, 14);
      }
      host.puffs.spawn(edge.x, edge.y + 0.2, edge.z, 0.9 * k, 0.6, FX_COLORS.dust, 0.5 * soft, { vy: 0.7, grow: 1.2, fadeIn: 1 / 60, rot: host.random() * TAU });
      if (blow === "slash" || blow === "bite" || blow === "charge") {
        host.marks.spawn(edge.x, edge.y + 0.03, edge.z, (blow === "charge" ? 1.6 : 1.1) * k, FOE_FX.scratchS, FOE_COLORS.scratch, 0.85, { kind: MARK_SCRATCH, thickness: host.random() * 0.9, fadeIn: 0.001, hold: FOE_FX.scratchHoldS, drag: 0, rot: Math.atan2(uz, ux) + Math.PI / 2 + (host.random() - 0.5) * 0.6 });
      }
    }
  }

  // ── Spawn ──────────────────────────────────────────────────────────────

  /** A foe comes in at (x, z) (sim `spawn`); `y` its drawn height (a flyer's altitude). */
  spawn(foe: string, x: number, y: number, z: number): void {
    if (this.spawnsThisFrame >= SPAWNS_PER_FRAME) return;
    this.spawnsThisFrame += 1;
    this.spawns += 1;
    const host = this.host;
    const soft = host.reduced ? 0.6 : 1;
    const h = foeHeight(foe);
    const ground = host.heightAt(x, z);
    // R at the gate: a dark wine ring opens on the ground (normal blend), a crimson flash at the body's middle.
    host.marks.spawn(x, ground + 0.05, z, 0.5 * h, FOE_FX.spawnS, FOE_COLORS.portal, 0.85 * soft, { grow: 2.2, kind: MARK_RING, thickness: 0.3, fadeIn: 0.001, drag: 0 });
    this.v.set(x, y + h * 0.5, z);
    host.flares.flare(this.v, 0.5 * h, FOE_COLORS.glint, 1.6 * soft, 6 / 60, 1 / 60, 0.3, 1, 0.3 * h);
    host.puffs.spawn(x, y + h * 0.4, z, 0.9 * h, 0.5, FOE_COLORS.soot, 0.55 * soft, { vy: 1.2, grow: 1.0, fadeIn: 0.001, hold: 3 / 60, rot: host.random() * TAU });
    // I/F: dust out of the ring and dark motes rising.
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * TAU + host.random();
      host.puffs.spawn(x + Math.cos(a) * 0.4 * h, ground + 0.2, z + Math.sin(a) * 0.4 * h, 0.6 * h, 0.6, FX_COLORS.dust, 0.45 * soft, { vx: Math.cos(a) * 1.5, vz: Math.sin(a) * 1.5, vy: 0.4, grow: 1.2, fadeIn: 1 / 60, rot: host.random() * TAU });
    }
    for (let i = 0; i < 4; i += 1) {
      this.s.set((host.random() - 0.5) * 1.2, 2 + host.random() * 2, (host.random() - 0.5) * 1.2);
      this.w.set(x + (host.random() - 0.5) * 0.6 * h, ground + 0.2, z + (host.random() - 0.5) * 0.6 * h);
      host.embers.spawn(this.w, this.s, FOE_COLORS.glint, 1.4 * soft, 0.05 * h, 0.08, 0.6 + host.random() * 0.3, 0.5, -0.5);
    }
  }

  // ── Frame ──────────────────────────────────────────────────────────────

  update(dt: number): void {
    this.time += dt;
    this.strikesThisFrame = 0;
    this.spawnsThisFrame = 0;
    this.impactsThisFrame = 0;
    let drawn = 0;
    for (const w of this.windups) {
      if (!w.active) continue;
      if (drawn < WINDUPS_DRAWN) this.drawWindup(w, dt);
      drawn += 1;
      w.age += dt;
      // A swing whose strike never came (the foe was pushed, stunned, its target gone) fades out.
      if (w.age > w.duration + 0.25) w.active = false;
    }
    for (const f of this.flights) {
      if (!f.active) continue;
      f.left -= dt;
      if (f.left > 0) continue;
      f.active = false;
      this.impact(f.blow, f.victim, f.at, f.dirX, f.dirZ, f.edge);
    }
  }

  clear(): void {
    for (const w of this.windups) w.active = false;
    for (const f of this.flights) f.active = false;
  }
}

/** A foe's drawn height (m: its placeholder × the draw scale of its tier), for sizing its blows. */
export function foeHeight(foe: string): number {
  const look = foeDrawLook(foe as FoeId);
  return Math.max(0.5, Math.min(3.5, look.placeholder.sizeM[1] * look.scale));
}
