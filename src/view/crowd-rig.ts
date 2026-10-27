/**
 * Rigs and clips for the owner's unrigged Tripo models (M0b; owner rule:
 * Tripo gives the look, motion is ours). Per rig family a small skeleton is
 * placed on the model from its landmarks (view/model-specs.ts), every vertex
 * takes up to 4 bones by its distance to the bone segments (soft falloff,
 * gated by body region), and the clips are poses written in code. The baker
 * samples each clip into a bone texture (3 RGBA32F texels per bone per frame:
 * the rows of the bone's skinning matrix), which the crowd shader reads by
 * instance (view/crowd.ts "bones" layers). A skinned GLB from Blender or
 * Tripo later would go through the same baker with its own pose function.
 *
 * Frame: the crowd's model frame (feet at y = 0, nose +z, the body's left at
 * +x), the model normalised to height 1. Every bone rests world-aligned, so
 * a bone's skinning matrix is its world matrix (no inverse bind needed).
 * Rotations: degrees, about world axes through the bone's pivot; a leg or
 * arm swings forward with a negative x rotation.
 * Owner: view (M0b models lane).
 */
import * as THREE from "three";
import { clipRow, type CrowdClip } from "./crowd";

export { clipRow };
import type { AntMarks, BipedMarks, FlyerMarks, PartMarks, QuadMarks, RigKind, RigMarks, Vec3 } from "./model-specs";

export type ClipName = "idle" | "move" | "run" | "attack" | "hit" | "death" | "cast" | "intro" | "block" | "down" | "rise" | "ready" | "aim";

export interface BoneDef {
  readonly name: string;
  readonly parent: number;
  /** Pivot of the bone's rotation. */
  readonly head: Vec3;
  /** End of the segment its vertices are measured against. */
  readonly tail: Vec3;
  /** Takes vertices (false: a pivot only, like the ground base). */
  readonly skin: boolean;
  /** Distance scale: a thick bone (torso) claims vertices further away. */
  readonly reach: number;
  /** Only vertices inside this box may follow it: [minX, minY, minZ, maxX, maxY, maxZ]. */
  readonly box?: readonly [number, number, number, number, number, number];
}

/** Writes one frame's pose; calls compose (a later call turns about world axes after an earlier one). */
export interface PoseWriter {
  rot(bone: string, x: number, y?: number, z?: number): void;
  /** Turns about an arbitrary axis through the bone's pivot. */
  turn(bone: string, axis: Vec3, degrees: number): void;
  move(bone: string, x: number, y: number, z: number): void;
}

export interface ClipDef {
  readonly name: ClipName;
  readonly duration: number;
  readonly fps: number;
  readonly loop: boolean;
  readonly pose: (t: number, w: PoseWriter) => void;
}

export interface Rig {
  readonly kind: RigKind;
  readonly bones: readonly BoneDef[];
  readonly clips: readonly ClipDef[];
}

export interface BakedRig {
  readonly texture: THREE.DataTexture;
  readonly bones: number;
  readonly clips: readonly CrowdClip[];
  /** Clip index by name. */
  readonly index: Readonly<Partial<Record<ClipName, number>>>;
  /** Seconds per clip by name (once clips end there). */
  readonly durations: Readonly<Partial<Record<ClipName, number>>>;
  /** Texture rows and the raw texels (tests, CPU skinning). */
  readonly rows: number;
  readonly data: Float32Array;
}

// ── Small maths ─────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Smooth 0 → 1 over [a, b]. */
export const ease = (t: number, a = 0, b = 1): number => {
  const u = clamp01((t - a) / (b - a || 1));
  return u * u * (3 - 2 * u);
};
/** 0 → 1 → 0 over [a, b] (a smooth bump). */
const bump = (t: number, a: number, b: number): number => {
  const u = clamp01((t - a) / (b - a || 1));
  return Math.sin(u * Math.PI);
};
const mirror = (p: Vec3): Vec3 => [-p[0], p[1], p[2]];
const mid = (a: Vec3, b: Vec3, k = 0.5): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const BIG = 9;

function bone(name: string, parent: number, head: Vec3, tail: Vec3, reach = 1, box?: BoneDef["box"], skin = true): BoneDef {
  return { name, parent, head, tail, skin, reach, ...(box ? { box } : {}) };
}

// ── Skeletons ───────────────────────────────────────────────────────────────

function bipedBones(m: BipedMarks): BoneDef[] {
  const rShoulder = m.rShoulder ?? mirror(m.shoulder);
  const rElbow = m.rElbow ?? mirror(m.elbow);
  const rHand = m.rHand ?? mirror(m.hand);
  const neckY = m.neck[1] + 0.04;
  const g = m.armGate;
  // Arms reach down to a little below their hand (a weapon tip), never to the feet; legs reach out past the arm gate.
  const armLow = m.hand[1] - 0.2;
  const rArmLow = rHand[1] - 0.2;
  const legOut = g + 0.16;
  const bones: BoneDef[] = [
    // The base pivots just behind the heels: Death falls backwards over them.
    bone("base", -1, [0, 0, -0.08], [0, 0, -0.08], 1, undefined, false),
    bone("hips", 0, m.hips, m.chest, 1.7, [-BIG, m.legTop - 0.1, -BIG, BIG, BIG, BIG]),
    bone("chest", 1, m.chest, m.neck, 1.7, [-BIG, m.hips[1], -BIG, BIG, BIG, BIG]),
    // The head keeps to itself: a shoulder cape or collar stays on the chest (it would twist with the head).
    bone("head", 2, m.neck, m.crown, 1.15, [-0.2, m.neck[1] - 0.02, -BIG, 0.2, BIG, BIG]),
    bone("armL", 2, m.shoulder, m.elbow, 1, [g, armLow, -BIG, BIG, neckY, BIG]),
    bone("foreL", 4, m.elbow, m.hand, 1, [g, armLow, -BIG, BIG, neckY, BIG]),
    bone("armR", 2, rShoulder, rElbow, 1, [-BIG, rArmLow, -BIG, -g, neckY, BIG]),
    bone("foreR", 6, rElbow, rHand, 1, [-BIG, rArmLow, -BIG, -g, neckY, BIG]),
    bone("legL", 1, m.hip, m.knee, 1.1, [-0.02, -BIG, -BIG, legOut, m.legTop, BIG]),
    bone("shinL", 8, m.knee, m.ankle, 1.1, [-0.02, -BIG, -BIG, legOut, m.legTop, BIG]),
    bone("legR", 1, mirror(m.hip), mirror(m.knee), 1.1, [-legOut, -BIG, -BIG, 0.02, m.legTop, BIG]),
    bone("shinR", 10, mirror(m.knee), mirror(m.ankle), 1.1, [-legOut, -BIG, -BIG, 0.02, m.legTop, BIG]),
  ];
  if (m.pole) {
    const p = m.pole;
    // A narrow column round the pole: the foot beside its bottom stays on the leg.
    const px0 = Math.min(p.bottom[0], p.top[0]) - 0.07;
    const px1 = Math.max(p.bottom[0], p.top[0]) + 0.06;
    // The flag and its crossbar, which reaches past the pole on both sides.
    const fx0 = Math.min(p.flagTop[0], p.flagBottom[0]) - 0.24;
    const fx1 = Math.max(p.flagTop[0], p.flagBottom[0]) + 0.16;
    // The pole follows the right hand; its flag hangs from the crossbar and sways.
    bones.push(bone("pole", 7, rHand, p.top, 0.8, [px0, rHand[1] - 0.02, -BIG, px1, BIG, BIG]));
    bones.push(bone("flag", 12, p.flagTop, p.flagBottom, 1.3, [fx0, p.flagBottom[1] - 0.04, -BIG, fx1, BIG, BIG]));
    // The pole below the hand: a child with no motion of its own (one bone holds one segment).
    bones.push(bone("poleLow", 12, rHand, p.bottom, 0.8, [px0, -BIG, -BIG, px1, rHand[1] + 0.02, BIG]));
  }
  return bones;
}

function quadBones(m: QuadMarks): BoneDef[] {
  const midZ = (m.hips[2] + m.chest[2]) / 2;
  const tailMid = mid(m.tailBase, m.tailTip);
  const lt = m.legTop;
  // The base pivots on the right flank's ground line: Death rolls the body onto that side.
  const flank = -Math.max(Math.abs(m.shoulder[0]), Math.abs(m.hip[0])) - 0.06;
  return [
    bone("base", -1, [flank, 0, 0], [flank, 0, 0], 1, undefined, false),
    bone("body", 0, m.hips, m.chest, 2.4),
    bone("neck", 1, m.chest, m.head, 1.6, [-BIG, -BIG, m.chest[2] - 0.08, BIG, BIG, BIG]),
    bone("head", 2, m.head, m.snout, 1.5, [-BIG, -BIG, m.head[2] - 0.12, BIG, BIG, BIG]),
    bone("tail", 1, m.tailBase, tailMid, 1, [-BIG, m.hindPaw[1] + 0.06, -BIG, BIG, BIG, m.tailBase[2] + 0.04]),
    bone("tailTip", 4, tailMid, m.tailTip, 1, [-BIG, m.hindPaw[1] + 0.06, -BIG, BIG, BIG, m.tailBase[2] + 0.04]),
    bone("flU", 1, m.shoulder, m.elbow, 1, [-0.01, -BIG, midZ, BIG, lt, BIG]),
    bone("flL", 6, m.elbow, m.paw, 1, [-0.01, -BIG, midZ, BIG, lt, BIG]),
    bone("frU", 1, mirror(m.shoulder), mirror(m.elbow), 1, [-BIG, -BIG, midZ, 0.01, lt, BIG]),
    bone("frL", 8, mirror(m.elbow), mirror(m.paw), 1, [-BIG, -BIG, midZ, 0.01, lt, BIG]),
    bone("blU", 1, m.hip, m.hock, 1, [-0.01, -BIG, -BIG, BIG, lt, midZ]),
    bone("blL", 10, m.hock, m.hindPaw, 1, [-0.01, -BIG, -BIG, BIG, lt, midZ]),
    bone("brU", 1, mirror(m.hip), mirror(m.hock), 1, [-BIG, -BIG, -BIG, 0.01, lt, midZ]),
    bone("brL", 12, mirror(m.hock), mirror(m.hindPaw), 1, [-BIG, -BIG, -BIG, 0.01, lt, midZ]),
  ];
}

function flyerBones(m: FlyerMarks): BoneDef[] {
  const g = m.wingGate;
  const top = m.wingTop;
  return [
    bone("base", -1, [0, 0, 0], [0, 0, 0], 1, undefined, false),
    bone("thorax", 0, [0, m.thorax[1], m.thorax[2] - 0.1], [0, m.thorax[1], m.thorax[2] + 0.12], 1.8),
    bone("head", 1, [0, m.head[1], m.head[2] - 0.12], m.head, 1.6, [-BIG, -BIG, m.head[2] - 0.16, BIG, BIG, BIG]),
    bone("abdomen", 1, m.abdomen, m.sting, 1.8, [-BIG, -BIG, -BIG, BIG, top + 0.05, m.abdomen[2] + 0.06]),
    bone("wingL", 1, m.wingRoot, m.wingTip, 1, [g, top, -BIG, BIG, BIG, BIG]),
    bone("wingR", 1, mirror(m.wingRoot), mirror(m.wingTip), 1, [-BIG, top, -BIG, -g, BIG, BIG]),
    bone("legs", 1, m.legs, [m.legs[0], m.legs[1] - 0.28, m.legs[2]], 1.4, [-BIG, -BIG, m.abdomen[2] - 0.02, BIG, m.thorax[1] - 0.06, BIG]),
  ];
}

function antBones(m: AntMarks): BoneDef[] {
  const bones: BoneDef[] = [
    bone("base", -1, [0, 0.3, 0], [0, 0.3, 0], 1, undefined, false),
    bone("thorax", 0, m.waist, m.thorax, 1.8, [-BIG, m.legTop - 0.04, -BIG, BIG, BIG, BIG]),
    bone("head", 1, mid(m.thorax, m.head, 0.55), m.jaw, 1.6, [-BIG, -BIG, m.thorax[2] + 0.12, BIG, BIG, BIG]),
    bone("gaster", 1, m.waist, m.tip, 2.2, [-BIG, -BIG, -BIG, BIG, BIG, m.waist[2] + 0.02]),
  ];
  m.legs.forEach(([hip, foot], k) => bones.push(bone("leg" + "L" + (k + 1), 1, hip, foot, 1, [0.03, -BIG, -BIG, BIG, m.legTop, BIG])));
  m.legs.forEach(([hip, foot], k) => bones.push(bone("leg" + "R" + (k + 1), 1, mirror(hip), mirror(foot), 1, [-BIG, -BIG, -BIG, -0.03, m.legTop, BIG])));
  return bones;
}

function partBones(m: PartMarks): BoneDef[] {
  return [
    bone("base", -1, [0, 0, 0], [0, m.split, 0], 1.6, [-BIG, -BIG, -BIG, BIG, m.split, BIG]),
    bone("part", 0, m.pivot, m.end, 3, [-BIG, m.split, -BIG, BIG, BIG, BIG]),
  ];
}

// ── Clips ───────────────────────────────────────────────────────────────────

/** Biped clips (grunt, archer, G01, the warden): walk lom khom and waddling, a 0.5 s wind-up before every blow. */
function bipedClips(m: BipedMarks, ours: boolean): ClipDef[] {
  const armIn = m.armsIn;
  const weaponArm = m.weapon === "right" ? "armR" : "armL";
  const weaponFore = m.weapon === "right" ? "foreR" : "foreL";
  const offArm = m.weapon === "right" ? "armL" : "armR";
  /** Outward for an arm: +z for the left, −z for the right. */
  const out = (arm: string, deg: number): number => (arm.endsWith("L") ? deg : -deg);
  const pole = m.pole !== undefined;
  const rest = (w: PoseWriter): void => {
    w.rot("armL", 0, 0, -armIn);
    w.rot("armR", 0, 0, armIn);
  };
  const flagSway = (w: PoseWriter, swing: number, flutter: number): void => {
    if (!pole) return;
    w.rot("flag", swing, 0, flutter);
  };
  const walk = (lean: number, stride: number, arms: number, bob: number) => (t: number, w: PoseWriter): void => {
    const p = t * TAU;
    const s = Math.sin(p);
    const c = Math.cos(p);
    rest(w);
    w.move("hips", 0, bob * Math.cos(2 * p) - bob, 0);
    w.rot("hips", 0, 6 * s, 4 * s);
    w.rot("chest", lean + 2 * Math.cos(2 * p), -8 * s, -2 * s);
    w.rot("head", -lean * 0.6 + 2 * Math.cos(2 * p), 4 * s, 0);
    w.rot("legL", -stride * s);
    w.rot("legR", stride * s);
    w.rot("shinL", 38 * Math.max(0, c) ** 2 * (stride / 24));
    w.rot("shinR", 38 * Math.max(0, -c) ** 2 * (stride / 24));
    if (pole) {
      // G01 carries the banner upright: the pole arm stays, the flag swings with the step.
      w.rot("armL", arms * s);
      w.rot("foreL", -14);
      w.rot("armR", -10 + 3 * Math.cos(2 * p));
      w.rot("foreR", -6);
      flagSway(w, 10 * Math.sin(p - 0.9), 6 * Math.sin(2 * p - 0.5));
    } else {
      w.rot("armL", arms * s);
      w.rot("armR", -arms * s);
      w.rot("foreL", -14 - 10 * Math.max(0, -s));
      w.rot("foreR", -14 - 10 * Math.max(0, s));
    }
  };
  const clips: ClipDef[] = [
    {
      name: "idle",
      duration: 2.4,
      fps: 20,
      loop: true,
      pose: (t, w) => {
        const p = (t / 2.4) * TAU;
        rest(w);
        w.move("hips", 0, 0.006 * Math.sin(p) - 0.004, 0);
        w.rot("chest", (ours ? 2 : 5) + 2.2 * Math.sin(p), 4 * Math.sin(p * 0.5 + 0.3), 0);
        w.rot("head", 2 * Math.sin(p + 1), 9 * Math.sin(p * 0.5 + 1.2), 0);
        w.rot("armL", 3 * Math.sin(p + 0.5), 0, -2 * Math.sin(p));
        w.rot("armR", 3 * Math.sin(p + 0.9), 0, 2 * Math.sin(p));
        w.rot("foreL", -10);
        w.rot("foreR", -10);
        w.rot("legL", -3);
        w.rot("shinL", 5);
        w.rot("legR", -3);
        w.rot("shinR", 5);
        flagSway(w, 5 * Math.sin(p), 4 * Math.sin(2 * p));
      },
    },
    { name: "move", duration: 1, fps: 30, loop: true, pose: walk(ours ? 4 : 9, 24, 16, 0.02) },
    { name: "run", duration: 1, fps: 30, loop: true, pose: walk(16, 32, 26, 0.035) },
    {
      name: "hit",
      duration: 0.35,
      fps: 30,
      loop: false,
      pose: (t, w) => {
        const k = bump(t, 0, 0.35);
        rest(w);
        w.rot("chest", -16 * k, 0, 6 * k);
        w.rot("head", -22 * k);
        w.rot("armL", -10 * k, 0, out("armL", 18 * k));
        w.rot("armR", -10 * k, 0, out("armR", 18 * k));
        w.move("hips", 0, -0.01 * k, -0.04 * k);
        flagSway(w, -14 * k, 10 * k);
      },
    },
  ];

  if (m.weapon === "left" && !pole && !ours) {
    // Archer: raise the bow, draw the string to the cheek over the 0.6 s aim, loose at the strike.
    clips.push({
      name: "attack",
      duration: 1,
      fps: 30,
      loop: false,
      pose: (t, w) => {
        const up = ease(t, 0, 0.3) * (1 - ease(t, 0.8, 1));
        const draw = ease(t, 0.2, 0.6) * (1 - ease(t, 0.6, 0.66));
        rest(w);
        w.rot("chest", -4 * up, 22 * up, 0);
        w.rot("head", 0, -18 * up, 0);
        w.rot("armL", -84 * up, 0, 10 * up);
        w.rot("foreL", -6 * up);
        w.rot("armR", -78 * up - 6 * draw, 0, -10 * up);
        w.rot("foreR", -40 * up - 70 * draw, 0, 0);
        w.rot("legL", -6 * up);
        w.rot("legR", 8 * up);
      },
    });
  } else {
    // Melee: the weapon arm comes up over 0.5 s (the red arc), cuts down at the strike, recovers.
    clips.push({
      name: "attack",
      duration: 1,
      fps: 30,
      loop: false,
      pose: (t, w) => {
        const raise = ease(t, 0, 0.5);
        const cut = ease(t, 0.5, 0.62);
        const back = ease(t, 0.7, 1);
        const up = raise * (1 - cut);
        const down = cut * (1 - back);
        rest(w);
        if (pole) {
          // G01: đâm cán cờ, the haft drawn back on the wind-up and jabbed forward, the flag kept high.
          w.rot("chest", -8 * up + 18 * down, 14 * up - 10 * down, 0);
          w.rot("armR", -35 * up - 85 * down, 0, out("armR", 10 * up));
          w.rot("foreR", -25 * up + 10 * down);
          w.rot("pole", 40 * up + 45 * down);
          w.move("hips", 0, -0.02 * down, 0.06 * down);
          w.rot("armL", 20 * up - 10 * down);
          flagSway(w, 18 * up - 20 * down, 12 * down);
        } else {
          w.rot("chest", -10 * up + 20 * down, (weaponArm === "armR" ? -1 : 1) * (18 * up - 12 * down), 0);
          w.rot("head", 6 * up - 8 * down);
          w.rot(weaponArm, -135 * up - 25 * down, 0, out(weaponArm, 14 * up));
          w.rot(weaponFore, -45 * up + 5 * down);
          w.rot(offArm, 22 * up - 12 * down, 0, out(offArm, 10 * up));
          w.move("hips", 0, -0.025 * down, 0.05 * down);
        }
        w.rot("legL", -10 * (up + down));
        w.rot("legR", 10 * (up + down));
        w.rot("shinL", 12 * down);
      },
    });
  }

  if (pole) {
    // G01's Cắm Cờ: raise the banner high (stands 1 s), plant it at the end.
    clips.push({
      name: "cast",
      duration: 1.2,
      fps: 30,
      loop: false,
      pose: (t, w) => {
        const up = ease(t, 0, 0.45) * (1 - ease(t, 0.85, 1));
        const slam = ease(t, 0.85, 1);
        rest(w);
        w.rot("chest", -10 * up + 14 * slam, 0, 0);
        w.rot("head", -12 * up);
        // The hand lifts the banner straight up (the pole turned back to upright), then drives it down.
        w.rot("armR", -95 * up - 20 * slam, 0, out("armR", 6 * up));
        w.rot("foreR", -45 * up);
        w.rot("pole", 140 * up + 20 * slam);
        w.move("hips", 0, 0.03 * up - 0.03 * slam, 0);
        w.rot("armL", -30 * up, 0, out("armL", 25 * up));
        flagSway(w, 8 * Math.sin(t * 9) * up, 10 * Math.sin(t * 13) * up);
      },
    });
    clips.push({
      name: "intro",
      duration: 1.6,
      fps: 30,
      loop: false,
      pose: (t, w) => {
        // Phất cờ: the banner lifted upright over the head and swung side to side twice.
        const up = ease(t, 0, 0.3) * (1 - ease(t, 1.3, 1.6));
        const wave = Math.sin(((t - 0.3) / 0.5) * TAU) * ease(t, 0.25, 0.4);
        rest(w);
        w.rot("armR", -95 * up, 0, 0);
        w.rot("foreR", -45 * up);
        w.rot("pole", 140 * up, 0, 22 * wave * up);
        w.rot("chest", -8 * up, 8 * wave * up, 0);
        w.rot("head", -10 * up);
        flagSway(w, 14 * wave * up, 18 * wave * up);
      },
    });
  }

  if (ours) {
    // The warden: shield up on a blow, falls to the bud, rises again.
    clips.push({
      name: "block",
      duration: 0.5,
      fps: 30,
      loop: false,
      pose: (t, w) => {
        const k = ease(t, 0, 0.12) * (1 - ease(t, 0.35, 0.5));
        rest(w);
        w.rot("armL", -70 * k, 0, 10 * k);
        w.rot("foreL", -30 * k);
        w.rot("chest", 8 * k);
        w.rot("legL", -12 * k);
        w.rot("legR", 10 * k);
        w.move("hips", 0, -0.02 * k, 0);
      },
    });
    const crouch = (w: PoseWriter, k: number): void => {
      rest(w);
      w.rot("legL", -55 * k);
      w.rot("legR", -55 * k);
      w.rot("shinL", 95 * k);
      w.rot("shinR", 95 * k);
      w.move("hips", 0, -0.22 * k, -0.04 * k);
      w.rot("chest", 38 * k);
      w.rot("head", 20 * k);
      w.rot("armL", -20 * k, 0, 10 * k);
      w.rot("armR", -20 * k, 0, -10 * k);
    };
    clips.push({ name: "down", duration: 0.6, fps: 30, loop: false, pose: (t, w) => crouch(w, ease(t, 0, 0.6)) });
    clips.push({ name: "rise", duration: 0.6, fps: 30, loop: false, pose: (t, w) => crouch(w, 1 - ease(t, 0, 0.6)) });
  }

  clips.push({
    name: "death",
    duration: pole ? 1.2 : 0.8,
    fps: 30,
    loop: false,
    pose: pole
      ? (t, w) => {
          // G01 slumps to its knees and folds forward; actors.ts sinks it into the moss.
          const k = ease(t, 0, 0.7);
          const fold = ease(t, 0.45, 1.1);
          rest(w);
          w.rot("legL", -50 * k);
          w.rot("legR", -50 * k);
          w.rot("shinL", 90 * k);
          w.rot("shinR", 90 * k);
          w.move("hips", 0, -0.2 * k, 0);
          w.rot("chest", 25 * k + 25 * fold);
          w.rot("head", 25 * fold);
          w.rot("armL", -15 * k, 0, 8 * k);
          w.rot("armR", 30 * fold, 0, -20 * fold);
          // The banner breaks off and drops.
          w.rot("pole", 0, 0, -70 * fold);
          flagSway(w, 30 * fold, 0);
        }
      : (t, w) => {
          // Falls backwards over its heels, arms thrown up, one small bounce.
          const fall = ease(t, 0, 0.55);
          const bounce = bump(t, 0.55, 0.75);
          rest(w);
          w.rot("base", -84 * fall + 6 * bounce);
          w.rot("chest", -10 * fall);
          w.rot("head", -20 * fall + 10 * bounce);
          w.rot("armL", -70 * fall, 0, 30 * fall);
          w.rot("armR", -70 * fall, 0, -30 * fall);
          w.rot("legL", -25 * fall);
          w.rot("shinL", 30 * fall);
          w.rot("legR", -10 * fall);
        },
  });
  return clips;
}

/** Quadruped clips (wolf, boar): a lope matched to the sim speed, a gallop for the charge, a bite or gore. */
function quadClips(m: QuadMarks, boar: boolean): ClipDef[] {
  const legs = (w: PoseWriter, p: number, stride: number, bend: number, phases: readonly [number, number, number, number]): void => {
    const names = [
      ["flU", "flL", 1],
      ["frU", "frL", 1],
      ["blU", "blL", -1],
      ["brU", "brL", -1],
    ] as const;
    names.forEach(([upper, lower, front], k) => {
      const q = p + phases[k]!;
      w.rot(upper, -stride * Math.sin(q));
      // Front knees fold back on the swing, hocks fold forward.
      w.rot(lower, front * bend * Math.max(0, Math.cos(q)) ** 2);
    });
  };
  const gait = (stride: number, bend: number, rock: number, bob: number, headDown: number, phases: readonly [number, number, number, number]) => (t: number, w: PoseWriter): void => {
    const p = t * TAU;
    legs(w, p, stride, bend, phases);
    w.move("body", 0, bob * Math.cos(2 * p) - bob * 0.5, 0);
    w.rot("body", rock * Math.sin(2 * p + 0.6), 0, 0);
    w.rot("neck", headDown - rock * 0.8 * Math.sin(2 * p + 0.6));
    w.rot("head", 2 * Math.sin(2 * p));
    w.rot("tail", 10, 14 * Math.sin(p), 0);
    w.rot("tailTip", 8, 18 * Math.sin(p - 0.8), 0);
  };
  // Trot: diagonal pairs; gallop: front pair then hind pair.
  const trot = [0, Math.PI, Math.PI, 0] as const;
  const gallop = [0, 0.5, Math.PI + 0.2, Math.PI + 0.7] as const;
  return [
    {
      name: "idle",
      duration: 2,
      fps: 20,
      loop: true,
      pose: (t, w) => {
        const p = (t / 2) * TAU;
        w.move("body", 0, 0.008 * Math.sin(p), 0);
        w.rot("neck", 3 * Math.sin(p), 10 * Math.sin(p * 0.5 + 0.4), 0);
        w.rot("head", 4 * Math.sin(p + 1), 0, 4 * Math.sin(p * 0.5));
        w.rot("tail", 6, 22 * Math.sin(2 * p), 0);
        w.rot("tailTip", 4, 26 * Math.sin(2 * p - 0.9), 0);
      },
    },
    { name: "move", duration: 1, fps: 30, loop: true, pose: gait(boar ? 24 : 30, 42, 3, 0.025, boar ? 4 : 2, boar ? trot : gallop) },
    { name: "run", duration: 1, fps: 30, loop: true, pose: gait(36, 55, 7, 0.05, boar ? 14 : 6, gallop) },
    {
      name: "attack",
      duration: 0.9,
      fps: 30,
      loop: false,
      pose: (t, w) => {
        const crouch = ease(t, 0, 0.5) * (1 - ease(t, 0.5, 0.6));
        const lunge = ease(t, 0.5, 0.62) * (1 - ease(t, 0.7, 0.9));
        w.move("body", 0, -0.07 * crouch + 0.02 * lunge, -0.07 * crouch + 0.16 * lunge);
        w.rot("body", 6 * crouch - 6 * lunge);
        if (boar) {
          // Húc: head down on the wind-up, tusks thrown up on the strike.
          w.rot("neck", 22 * crouch - 26 * lunge);
          w.rot("head", 10 * crouch - 14 * lunge);
        } else {
          w.rot("neck", 12 * crouch - 18 * lunge);
          w.rot("head", -10 * crouch + 22 * lunge);
        }
        w.rot("flU", -14 * crouch - 26 * lunge);
        w.rot("frU", -14 * crouch - 22 * lunge);
        w.rot("flL", 30 * crouch);
        w.rot("frL", 30 * crouch);
        w.rot("blU", 12 * crouch + 18 * lunge);
        w.rot("brU", 12 * crouch + 18 * lunge);
        w.rot("tail", 20 * crouch, 0, 0);
      },
    },
    {
      name: "hit",
      duration: 0.35,
      fps: 30,
      loop: false,
      pose: (t, w) => {
        const k = bump(t, 0, 0.35);
        w.rot("body", -4 * k, 0, 9 * k);
        w.move("body", 0, -0.02 * k, -0.05 * k);
        w.rot("neck", -18 * k);
        w.rot("flU", 12 * k);
        w.rot("frU", -8 * k);
      },
    },
    {
      name: "death",
      duration: 0.8,
      fps: 30,
      loop: false,
      pose: (t, w) => {
        // Rolls onto its side in the dust, legs folding.
        const roll = ease(t, 0, 0.5);
        const settle = bump(t, 0.5, 0.7);
        w.rot("base", 0, 0, 86 * roll - 5 * settle);
        w.rot("neck", 15 * roll, 0, -10 * roll);
        w.rot("flU", -30 * roll);
        w.rot("flL", 50 * roll);
        w.rot("frU", -20 * roll);
        w.rot("blU", 25 * roll);
        w.rot("blL", -40 * roll);
        w.rot("brU", 30 * roll);
        w.rot("tail", -20 * roll, 0, 0);
      },
    },
  ];
}

/** The wasp: a fast wing beat with the wings laid flat, a sting curl, wings folding as it spirals down. */
function flyerClips(m: FlyerMarks): ClipDef[] {
  const spanL: Vec3 = [m.wingTip[0] - m.wingRoot[0], m.wingTip[1] - m.wingRoot[1], m.wingTip[2] - m.wingRoot[2]];
  const spanR: Vec3 = [-spanL[0], spanL[1], spanL[2]];
  const wings = (w: PoseWriter, flap: number, extra = 0): void => {
    // The logged fix without Blender: each wing turns about its own span until it lies flat, then beats.
    w.turn("wingL", spanL, m.wingRest);
    w.turn("wingR", spanR, -m.wingRest);
    w.rot("wingL", 0, 0, flap + extra);
    w.rot("wingR", 0, 0, -flap - extra);
  };
  const beat = (t: number, hz: number): number => Math.sin(t * hz * TAU);
  return [
    {
      name: "move",
      duration: 1.2,
      fps: 60,
      loop: true,
      pose: (t, w) => {
        const p = (t / 1.2) * TAU;
        wings(w, 30 * beat(t, 10) - 18);
        w.move("thorax", 0, 0.035 * Math.sin(p), 0);
        w.rot("thorax", 4 * Math.sin(p + 0.8), 0, 3 * Math.sin(p * 2));
        w.rot("abdomen", 6 * Math.sin(2 * p), 0, 0);
        w.rot("legs", 6 * Math.sin(p + 1.5));
        w.rot("head", 0, 6 * Math.sin(p), 0);
      },
    },
    {
      name: "attack",
      duration: 0.8,
      fps: 60,
      loop: false,
      pose: (t, w) => {
        const curl = ease(t, 0, 0.5) * (1 - ease(t, 0.62, 0.8));
        const stab = bump(t, 0.5, 0.65);
        wings(w, 34 * beat(t, 13) - 14);
        w.rot("thorax", -16 * curl + 10 * stab);
        w.rot("abdomen", -62 * curl - 15 * stab);
        w.move("thorax", 0, 0.02 * curl, 0.05 * stab);
        w.rot("legs", -25 * curl);
      },
    },
    {
      name: "hit",
      duration: 0.35,
      fps: 60,
      loop: false,
      pose: (t, w) => {
        const k = bump(t, 0, 0.35);
        wings(w, 20 * beat(t, 10) - 10, 25 * k);
        w.rot("thorax", -10 * k, 0, 28 * k * Math.sin(t * 40));
        w.move("thorax", 0, 0.04 * k, -0.04 * k);
      },
    },
    {
      name: "death",
      duration: 0.8,
      fps: 30,
      loop: false,
      pose: (t, w) => {
        // Wings fold back over the body; the crowd's spiral fall carries it down.
        const k = ease(t, 0, 0.45);
        w.turn("wingL", spanL, m.wingRest);
        w.turn("wingR", spanR, -m.wingRest);
        w.rot("wingL", 0, 50 * k, -30 * k);
        w.rot("wingR", 0, -50 * k, 30 * k);
        w.rot("abdomen", -40 * k);
        w.rot("legs", -40 * k);
        w.rot("head", 20 * k);
      },
    },
  ];
}

/** The ant: a tripod scuttle, a bite, flipping over legs up. */
function antClips(m: AntMarks): ClipDef[] {
  const groupA = new Set(["legL1", "legR2", "legL3"]);
  const legNames = m.legs.flatMap((_, k) => ["legL" + (k + 1), "legR" + (k + 1)]);
  const crawl = (t: number, w: PoseWriter): void => {
    const p = t * TAU;
    for (const name of legNames) {
      const q = p + (groupA.has(name) ? 0 : Math.PI);
      const swing = 24 * Math.sin(q);
      const lift = 16 * Math.max(0, Math.cos(q));
      const left = name.startsWith("legL");
      w.rot(name, 0, left ? -swing : swing, left ? lift : -lift);
    }
    w.move("thorax", 0, 0.025 * Math.abs(Math.cos(p)), 0);
    w.rot("thorax", 0, 4 * Math.sin(p), 0);
    w.rot("gaster", 3 * Math.sin(2 * p), -6 * Math.sin(p), 0);
    w.rot("head", 0, 6 * Math.sin(p + 0.5), 0);
  };
  return [
    {
      name: "idle",
      duration: 1.6,
      fps: 20,
      loop: true,
      pose: (t, w) => {
        const p = (t / 1.6) * TAU;
        w.rot("gaster", 4 * Math.sin(p), 0, 0);
        w.rot("head", 0, 10 * Math.sin(p * 0.5), 0);
        w.rot("legL1", 0, -6 * Math.sin(p), 6 * Math.max(0, Math.sin(p)));
        w.rot("legR1", 0, -6 * Math.sin(p + 1), -6 * Math.max(0, Math.sin(p + 1)));
      },
    },
    { name: "move", duration: 1, fps: 30, loop: true, pose: crawl },
    {
      name: "attack",
      duration: 0.6,
      fps: 30,
      loop: false,
      pose: (t, w) => {
        const rear = ease(t, 0, 0.4) * (1 - ease(t, 0.4, 0.5));
        const bite = bump(t, 0.38, 0.55);
        w.rot("thorax", -14 * rear + 8 * bite);
        w.move("thorax", 0, 0.03 * rear, 0.1 * bite);
        w.rot("head", -18 * rear + 26 * bite);
        w.rot("gaster", 20 * rear);
        w.rot("legL1", 0, 0, 30 * rear);
        w.rot("legR1", 0, 0, -30 * rear);
      },
    },
    {
      name: "hit",
      duration: 0.3,
      fps: 30,
      loop: false,
      pose: (t, w) => {
        const k = bump(t, 0, 0.3);
        w.rot("thorax", -8 * k, 0, 12 * k);
        w.move("thorax", 0, 0.03 * k, -0.06 * k);
      },
    },
    {
      name: "death",
      duration: 0.7,
      fps: 30,
      loop: false,
      pose: (t, w) => {
        // Flips over, legs curling up.
        const flip = ease(t, 0, 0.45);
        const curl = ease(t, 0.3, 0.7);
        w.rot("base", 0, 0, 178 * flip);
        w.move("base", 0, 0.25 * bump(t, 0, 0.45), 0);
        for (const name of legNames) w.rot(name, 0, 0, (name.startsWith("legL") ? 1 : -1) * 55 * curl);
        w.rot("gaster", -15 * curl);
      },
    },
  ];
}

/** Spikes: frames run from sunk (recharging) to fully up; the instance's clip time is how ready the trap is. */
function partClips(m: PartMarks): ClipDef[] {
  if (m.kind === "spikes") {
    return [
      {
        name: "ready",
        duration: 1,
        fps: 20,
        loop: false,
        pose: (t, w) => {
          const up = ease(t, 0, 1);
          w.move("part", 0, -0.5 * (1 - up), 0);
        },
      },
    ];
  }
  // Launcher: frames sweep the head's yaw from −180° to +180°; the instance's clip time picks the aim.
  return [
    {
      name: "aim",
      duration: 1,
      fps: 36,
      loop: true,
      pose: (t, w) => {
        w.rot("part", 0, -180 + 360 * t, 0);
      },
    },
  ];
}

/** The rig of a model: its skeleton and clips (rigid models have none). */
export function rigOf(kind: RigKind, marks: RigMarks | undefined, ours: boolean, id = ""): Rig | null {
  if (marks === undefined || kind === "rigid") return null;
  switch (marks.kind) {
    case "biped":
      return { kind, bones: bipedBones(marks), clips: bipedClips(marks, ours) };
    case "quadruped":
      return { kind, bones: quadBones(marks), clips: quadClips(marks, id.includes("boar")) };
    case "flyer":
      return { kind, bones: flyerBones(marks), clips: flyerClips(marks) };
    case "hexapod":
      return { kind, bones: antBones(marks), clips: antClips(marks) };
    case "spikes":
    case "launcher":
      return { kind, bones: partBones(marks), clips: partClips(marks) };
  }
}

// ── Weights ─────────────────────────────────────────────────────────────────

/** Distance from p to segment ab. */
function segmentDistance(px: number, py: number, pz: number, a: Vec3, b: Vec3): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const len = abx * abx + aby * aby + abz * abz;
  let t = len > 1e-12 ? ((px - a[0]) * abx + (py - a[1]) * aby + (pz - a[2]) * abz) / len : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (a[0] + abx * t);
  const dy = py - (a[1] + aby * t);
  const dz = pz - (a[2] + abz * t);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const inBox = (box: BoneDef["box"], x: number, y: number, z: number): boolean =>
  box === undefined || (x >= box[0] && y >= box[1] && z >= box[2] && x <= box[3] && y <= box[4] && z <= box[5]);

/**
 * Up to 4 bones per vertex: soft falloff on the distance to each bone's
 * segment (÷ its reach), only bones whose region holds the vertex; weights
 * normalised. `positions` are xyz triples in the rig's frame.
 */
export function skinWeights(positions: ArrayLike<number>, bones: readonly BoneDef[], softness = 0.028): { index: Float32Array; weight: Float32Array } {
  const count = Math.floor(positions.length / 3);
  const index = new Float32Array(count * 4);
  const weight = new Float32Array(count * 4);
  const distances = new Float64Array(bones.length);
  const order: number[] = [];
  for (let v = 0; v < count; v += 1) {
    const x = positions[v * 3]!;
    const y = positions[v * 3 + 1]!;
    const z = positions[v * 3 + 2]!;
    let best = Infinity;
    let fallback = 0;
    let fallbackD = Infinity;
    for (let b = 0; b < bones.length; b += 1) {
      const def = bones[b]!;
      if (!def.skin) {
        distances[b] = Infinity;
        continue;
      }
      const d = segmentDistance(x, y, z, def.head, def.tail) / def.reach;
      if (d < fallbackD) {
        fallbackD = d;
        fallback = b;
      }
      distances[b] = inBox(def.box, x, y, z) ? d : Infinity;
      if (distances[b]! < best) best = distances[b]!;
    }
    if (best === Infinity) {
      index[v * 4] = fallback;
      weight[v * 4] = 1;
      continue;
    }
    order.length = 0;
    for (let b = 0; b < bones.length; b += 1) if (distances[b]! < Infinity) order.push(b);
    order.sort((a, b) => distances[a]! - distances[b]!);
    let sum = 0;
    const n = Math.min(4, order.length);
    for (let k = 0; k < n; k += 1) {
      const w = Math.exp(-(distances[order[k]!]! - best) / softness);
      index[v * 4 + k] = order[k]!;
      weight[v * 4 + k] = w < 0.02 ? 0 : w;
      sum += weight[v * 4 + k]!;
    }
    for (let k = 0; k < n; k += 1) weight[v * 4 + k] = weight[v * 4 + k]! / sum;
  }
  return { index, weight };
}

/**
 * Normals averaged over every vertex at the same position (Tripo meshes split
 * at UV seams), so the outline hull pushed along them never cracks open.
 */
export function smoothNormals(positions: ArrayLike<number>, normals: ArrayLike<number>, quantum = 1e-4): Float32Array {
  const count = Math.floor(positions.length / 3);
  const sums = new Map<string, [number, number, number]>();
  const keys: string[] = new Array(count);
  for (let v = 0; v < count; v += 1) {
    const key = Math.round(positions[v * 3]! / quantum) + "," + Math.round(positions[v * 3 + 1]! / quantum) + "," + Math.round(positions[v * 3 + 2]! / quantum);
    keys[v] = key;
    const sum = sums.get(key) ?? [0, 0, 0];
    sum[0] += normals[v * 3]!;
    sum[1] += normals[v * 3 + 1]!;
    sum[2] += normals[v * 3 + 2]!;
    sums.set(key, sum);
  }
  const out = new Float32Array(count * 3);
  for (let v = 0; v < count; v += 1) {
    const [x, y, z] = sums.get(keys[v]!)!;
    const length = Math.hypot(x, y, z) || 1;
    out[v * 3] = x / length;
    out[v * 3 + 1] = y / length;
    out[v * 3 + 2] = z / length;
  }
  return out;
}

// ── Baking ──────────────────────────────────────────────────────────────────

class Poser implements PoseWriter {
  readonly rotations: THREE.Quaternion[];
  readonly moves: THREE.Vector3[];
  private readonly byName = new Map<string, number>();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly axis = new THREE.Vector3();

  constructor(readonly bones: readonly BoneDef[]) {
    this.rotations = bones.map(() => new THREE.Quaternion());
    this.moves = bones.map(() => new THREE.Vector3());
    bones.forEach((def, k) => this.byName.set(def.name, k));
  }

  reset(): void {
    for (const q of this.rotations) q.identity();
    for (const v of this.moves) v.set(0, 0, 0);
  }

  private at(name: string): number {
    const k = this.byName.get(name);
    return k === undefined ? -1 : k;
  }

  rot(name: string, x: number, y = 0, z = 0): void {
    const k = this.at(name);
    if (k < 0 || (x === 0 && y === 0 && z === 0)) return;
    const d = Math.PI / 180;
    this.q.setFromEuler(this.e.set(x * d, y * d, z * d, "XYZ"));
    this.rotations[k]!.premultiply(this.q);
  }

  turn(name: string, axis: Vec3, degrees: number): void {
    const k = this.at(name);
    if (k < 0 || degrees === 0) return;
    this.axis.set(axis[0], axis[1], axis[2]).normalize();
    this.q.setFromAxisAngle(this.axis, (degrees * Math.PI) / 180);
    this.rotations[k]!.premultiply(this.q);
  }

  move(name: string, x: number, y: number, z: number): void {
    const k = this.at(name);
    if (k < 0) return;
    this.moves[k]!.x += x;
    this.moves[k]!.y += y;
    this.moves[k]!.z += z;
  }
}

/** Bone world matrices of the pose in `poser` (parents come before children). */
function worldMatrices(bones: readonly BoneDef[], poser: Poser, out: THREE.Matrix4[]): void {
  const pivot = new THREE.Matrix4();
  const back = new THREE.Matrix4();
  const rotation = new THREE.Matrix4();
  for (let b = 0; b < bones.length; b += 1) {
    const def = bones[b]!;
    const move = poser.moves[b]!;
    pivot.makeTranslation(def.head[0] + move.x, def.head[1] + move.y, def.head[2] + move.z);
    back.makeTranslation(-def.head[0], -def.head[1], -def.head[2]);
    rotation.makeRotationFromQuaternion(poser.rotations[b]!);
    const local = out[b]!.copy(pivot).multiply(rotation).multiply(back);
    if (def.parent >= 0) local.premultiply(out[def.parent]!);
  }
}

/**
 * Samples every clip at its fps into a bone texture: row = frame, 3 texels
 * per bone (the matrix rows). Each clip holds frames + 1 rows: a loop's last
 * row equals its first, a one-shot's is its end pose, so the shader's
 * next-frame read never leaves the clip.
 */
export function bakeRig(rig: Rig): BakedRig {
  const bones = rig.bones;
  const poser = new Poser(bones);
  const matrices = bones.map(() => new THREE.Matrix4());
  const clips: CrowdClip[] = [];
  const index: Partial<Record<ClipName, number>> = {};
  const durations: Partial<Record<ClipName, number>> = {};
  let rows = 0;
  for (const clip of rig.clips) {
    const frames = Math.max(1, Math.round(clip.duration * clip.fps));
    index[clip.name] = clips.length;
    durations[clip.name] = clip.duration;
    clips.push({ start: rows, frames, fps: frames / clip.duration, loop: clip.loop });
    rows += frames + 1;
  }
  const width = bones.length * 3;
  const data = new Float32Array(width * rows * 4);
  rig.clips.forEach((clip, c) => {
    const info = clips[c]!;
    for (let f = 0; f <= info.frames; f += 1) {
      poser.reset();
      clip.pose(clip.loop && f === info.frames ? 0 : (f / info.frames) * clip.duration, poser);
      worldMatrices(bones, poser, matrices);
      const row = info.start + f;
      for (let b = 0; b < bones.length; b += 1) {
        const e = matrices[b]!.elements;
        const at = (row * width + b * 3) * 4;
        // Rows of the 3 × 4 affine part (three stores column-major).
        data[at] = e[0]!;
        data[at + 1] = e[4]!;
        data[at + 2] = e[8]!;
        data[at + 3] = e[12]!;
        data[at + 4] = e[1]!;
        data[at + 5] = e[5]!;
        data[at + 6] = e[9]!;
        data[at + 7] = e[13]!;
        data[at + 8] = e[2]!;
        data[at + 9] = e[6]!;
        data[at + 10] = e[10]!;
        data[at + 11] = e[14]!;
      }
    }
  });
  const texture = new THREE.DataTexture(data, width, rows, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, bones: bones.length, clips, index, durations, rows, data };
}

/** Skins positions on the CPU from a baked rig (tests, debug views): the crowd shader's sum without clip blending. */
export function skinOnCpu(baked: BakedRig, positions: ArrayLike<number>, skinIndex: ArrayLike<number>, skinWeight: ArrayLike<number>, row: number, out = new Float32Array(positions.length)): Float32Array {
  const width = baked.bones * 3;
  const r0 = Math.floor(row);
  const r1 = Math.min(baked.rows - 1, r0 + 1);
  const f = row - r0;
  const data = baked.data;
  const texel = (r: number, b: number, k: number, c: number): number => data[(r * width + b * 3 + k) * 4 + c]!;
  const count = Math.floor(positions.length / 3);
  for (let v = 0; v < count; v += 1) {
    const x = positions[v * 3]!;
    const y = positions[v * 3 + 1]!;
    const z = positions[v * 3 + 2]!;
    let ox = 0;
    let oy = 0;
    let oz = 0;
    for (let i = 0; i < 4; i += 1) {
      const w = skinWeight[v * 4 + i]!;
      if (w === 0) continue;
      const b = skinIndex[v * 4 + i]!;
      const row3 = (k: number): number[] => [0, 1, 2, 3].map((c) => texel(r0, b, k, c) * (1 - f) + texel(r1, b, k, c) * f);
      const a0 = row3(0);
      const a1 = row3(1);
      const a2 = row3(2);
      ox += w * (a0[0]! * x + a0[1]! * y + a0[2]! * z + a0[3]!);
      oy += w * (a1[0]! * x + a1[1]! * y + a1[2]! * z + a1[3]!);
      oz += w * (a2[0]! * x + a2[1]! * y + a2[2]! * z + a2[3]!);
    }
    out[v * 3] = ox;
    out[v * 3 + 1] = oy;
    out[v * 3 + 2] = oz;
  }
  return out;
}
