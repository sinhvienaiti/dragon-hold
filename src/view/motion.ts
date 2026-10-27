/**
 * Clip choice for one skinned crowd instance (M0b): walk or run at a cadence
 * matched to how fast the body really moves (feet do not slide: past the
 * cadence limits the step shortens by blending toward Idle), a cross-fade
 * between standing and moving, the attack wind-up held until the sim's
 * strike (the red warning is ≥ 0.5 s, the raise fits inside it), a short Hit
 * over whatever plays, and the death clip. Idle starts at a random phase, so
 * a crowd never moves in lockstep. View only: it reads sim events and drawn
 * positions, never the sim's state. Shared by view/actors.ts and the bench.
 * Owner: view (M0b models lane).
 */
import type { CrowdInstance } from "./crowd";
import type { BakedRig, ClipName } from "./crowd-rig";

/** One-shots that take over the body (Hit is an overlay instead). */
type Shot = "attack" | "cast" | "intro" | "block" | "down" | "rise";

export interface MotionSetup {
  /** Ground covered by one walk cycle at full stride, metres (as drawn). */
  readonly strideM: number;
  /** Fewest and most cycles per second while moving. */
  readonly cadence: readonly [number, number];
  /** Seconds into Attack where the blow lands (the wind-up holds there until the strike event). */
  readonly strikeS: number;
  /** Phase seed 0–1 (idle offset). */
  readonly phase: number;
}

const HIT_S = 0.35;
const HIT_BLEND = 0.9;
/** A wind-up with no strike after this long lets go (a cancelled attack). */
const HOLD_MAX_S = 2.2;
/** Moving below this (m/s) counts as standing. */
const STILL_SPEED = 0.25;

export class Motion {
  private readonly index: BakedRig["index"];
  private readonly durations: BakedRig["durations"];
  private moveTime: number;
  private idleTime: number;
  private moving = 0;
  private stride = 1;
  private shot: Shot | null = null;
  private shotTime = 0;
  private holding = false;
  private holdTime = 0;
  private hitTime = -1;
  private deathTime = -1;
  private speed = 0;
  private running = false;

  constructor(rig: Pick<BakedRig, "index" | "durations">, private readonly setup: MotionSetup) {
    this.index = rig.index;
    this.durations = rig.durations;
    this.moveTime = setup.phase;
    this.idleTime = setup.phase * 7;
  }

  /** The sim's attack event: "windup" raises and holds, "strike" lands the blow (alone: a quick blow). */
  attack(stage: "windup" | "strike"): void {
    if (this.deathTime >= 0 || this.index.attack === undefined) return;
    if (stage === "windup") {
      this.shot = "attack";
      this.shotTime = 0;
      this.holding = true;
      this.holdTime = 0;
    } else {
      if (this.shot !== "attack") {
        this.shot = "attack";
        this.shotTime = this.setup.strikeS * 0.8;
      } else this.shotTime = Math.max(this.shotTime, this.setup.strikeS * 0.95);
      this.holding = false;
    }
  }

  /** A one-shot clip by name (G01's Cắm Cờ and intro, the warden's block, fall and rise), when the rig has it. */
  play(name: Shot): boolean {
    if (this.deathTime >= 0 || this.index[name] === undefined) return false;
    this.shot = name;
    this.shotTime = 0;
    this.holding = false;
    return true;
  }

  hit(): void {
    if (this.deathTime < 0 && this.index.hit !== undefined) this.hitTime = 0;
  }

  die(): void {
    if (this.deathTime < 0) this.deathTime = 0;
  }

  get dying(): boolean {
    return this.deathTime >= 0;
  }

  /** Seconds the death clip runs (0 when the rig has none). */
  get deathSeconds(): number {
    return this.durations.death ?? 0;
  }

  /**
   * Advances by `dt` world seconds with the body moving at `speedMps` as drawn;
   * `run`: the charge gait.
   */
  update(dt: number, speedMps: number, run = false): void {
    // Smooth the measured speed: interpolated positions step once a tick.
    this.speed += (speedMps - this.speed) * Math.min(1, dt * 10);
    this.running = run && this.index.run !== undefined;
    const target = this.speed > STILL_SPEED ? 1 : 0;
    this.moving += (target - this.moving) * Math.min(1, dt * 7);
    const [slow, fast] = this.setup.cadence;
    const stride = this.setup.strideM * (this.running ? 1.3 : 1);
    if (stride > 0 && this.speed > 0.01) {
      const cadence = Math.min(fast, Math.max(slow, this.speed / stride));
      // Cadence clamped: the step is as long as the speed needs (blends toward Idle when short).
      this.stride = Math.min(1, this.speed / (cadence * stride));
      this.moveTime += dt * cadence;
    } else {
      this.moveTime += dt * slow;
      this.stride = 1;
    }
    this.idleTime += dt;
    if (this.hitTime >= 0) {
      this.hitTime += dt;
      if (this.hitTime >= HIT_S) this.hitTime = -1;
    }
    if (this.deathTime >= 0) this.deathTime += dt;
    if (this.shot !== null) {
      const length = this.durations[this.shot] ?? 0;
      if (this.holding) {
        this.holdTime += dt;
        this.shotTime = Math.min(this.setup.strikeS, this.shotTime + dt);
        if (this.holdTime > HOLD_MAX_S) this.holding = false;
      } else this.shotTime += dt;
      if (!this.holding && this.shotTime >= length && this.shot !== "down") this.shot = null;
    }
  }

  /** Writes the clips into a crowd instance. */
  write(inst: CrowdInstance): void {
    const index = this.index;
    inst.blend = 0;
    if (this.deathTime >= 0 && index.death !== undefined) {
      inst.clip = index.death;
      inst.clipTime = this.deathTime;
      return;
    }
    if (this.shot !== null) {
      inst.clip = index[this.shot];
      inst.clipTime = this.shotTime;
    } else {
      const walk: ClipName = this.running ? "run" : "move";
      const idle = index.idle ?? index.move;
      const amount = this.moving * this.stride;
      if (index[walk] === undefined || this.moving < 0.02) {
        inst.clip = idle;
        inst.clipTime = index.idle !== undefined ? this.idleTime : this.moveTime;
      } else {
        inst.clip = index[walk];
        inst.clipTime = this.moveTime;
        if (amount < 0.98 && idle !== undefined && idle !== index[walk]) {
          inst.clipB = idle;
          inst.clipTimeB = this.idleTime;
          inst.blend = 1 - amount;
        }
      }
    }
    if (this.hitTime >= 0 && index.hit !== undefined) {
      // The Hit takes clip B for its 0.35 s (it ends at rest, so the hand-back is smooth).
      inst.clipB = index.hit;
      inst.clipTimeB = this.hitTime;
      inst.blend = HIT_BLEND;
    }
  }
}
