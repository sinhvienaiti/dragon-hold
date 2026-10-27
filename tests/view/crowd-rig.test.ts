// M0b: rigs, weights, the bone-texture baker and clip choice for the owner's models (no WebGL needed).
import { describe, expect, it } from "vitest";
import { bakeRig, clipRow, rigOf, skinOnCpu, skinWeights, type BoneDef, type Rig } from "../../src/view/crowd-rig";
import { MODEL_SPECS } from "../../src/view/model-specs";
import { Motion } from "../../src/view/motion";
import type { CrowdInstance } from "../../src/view/crowd";

const rigged = Object.values(MODEL_SPECS).filter((spec) => spec.rig !== "rigid");

/** A bone's world matrix in clip `name` at `t` (12 numbers, matrix rows) from the baked texture. */
function boneAt(rig: Rig, name: string, clip: string, t: number): number[] {
  const baked = bakeRig(rig);
  const b = rig.bones.findIndex((bone) => bone.name === name);
  const info = baked.clips[baked.index[clip as never]!]!;
  const row = Math.round(clipRow(info, t));
  const at = (row * baked.bones * 3 + b * 3) * 4;
  return [...baked.data.slice(at, at + 12)];
}

/** Where a bone's tail goes in that pose. */
function tailAt(rig: Rig, name: string, clip: string, t: number): [number, number, number] {
  const m = boneAt(rig, name, clip, t);
  const tail = rig.bones.find((bone) => bone.name === name)!.tail;
  return [0, 1, 2].map((r) => m[r * 4]! * tail[0] + m[r * 4 + 1]! * tail[1] + m[r * 4 + 2]! * tail[2] + m[r * 4 + 3]!) as [number, number, number];
}

describe("M0b crowd rigs", () => {
  it("builds a rig for every model that moves: parents before children, unique names, clips with finite poses", () => {
    expect(rigged.length).toBeGreaterThanOrEqual(9);
    for (const spec of rigged) {
      const rig = rigOf(spec.rig, spec.marks, spec.ours, spec.manifest)!;
      expect(rig, spec.content).not.toBeNull();
      const names = new Set(rig.bones.map((bone) => bone.name));
      expect(names.size, spec.content).toBe(rig.bones.length);
      rig.bones.forEach((bone, k) => expect(bone.parent, spec.content + " " + bone.name).toBeLessThan(k));
      const baked = bakeRig(rig);
      expect(baked.data.every(Number.isFinite), spec.content).toBe(true);
      expect(baked.texture.image.width).toBe(rig.bones.length * 3);
      expect(baked.rows).toBe(baked.clips.reduce((sum, clip) => sum + clip.frames + 1, 0));
    }
  });

  it("gives every foe family the clips the game plays (05 §6.2: idle or flight, move, attack, hit, death)", () => {
    for (const spec of rigged.filter((item) => !item.ours)) {
      const baked = bakeRig(rigOf(spec.rig, spec.marks, false, spec.manifest)!);
      for (const clip of ["move", "attack", "hit", "death"] as const) expect(baked.index[clip], spec.content + " " + clip).toBeDefined();
    }
    const general = bakeRig(rigOf("biped", MODEL_SPECS["generals/moss-banner"]!.marks, false)!);
    expect(general.index.cast).toBeDefined();
    expect(general.index.intro).toBeDefined();
    const warden = bakeRig(rigOf("biped", MODEL_SPECS["units/moss-warden"]!.marks, true)!);
    for (const clip of ["block", "down", "rise", "attack"] as const) expect(warden.index[clip]).toBeDefined();
  });

  it("closes every loop (the last baked row is the first) and holds a one-shot at its end", () => {
    const rig = rigOf("biped", MODEL_SPECS["enemies/moss-grunt"]!.marks, false)!;
    const baked = bakeRig(rig);
    const width = baked.bones * 3 * 4;
    for (const clip of baked.clips.filter((item) => item.loop)) {
      const first = baked.data.slice(clip.start * width, (clip.start + 1) * width);
      const last = baked.data.slice((clip.start + clip.frames) * width, (clip.start + clip.frames + 1) * width);
      for (let k = 0; k < first.length; k += 1) expect(last[k]).toBeCloseTo(first[k]!, 5);
    }
    const once = baked.clips[baked.index.death!]!;
    expect(clipRow(once, 99)).toBeLessThan(once.start + once.frames);
    expect(clipRow(once, -1)).toBe(once.start);
    const loop = baked.clips[baked.index.move!]!;
    expect(clipRow(loop, 1.5)).toBeCloseTo(loop.start + loop.frames * 0.5, 5);
  });

  it("walks a biped with its feet in turn and a quadruped with diagonal pairs", () => {
    const grunt = rigOf("biped", MODEL_SPECS["enemies/moss-grunt"]!.marks, false)!;
    const leftAt = (t: number) => tailAt(grunt, "shinL", "move", t)[2];
    const rightAt = (t: number) => tailAt(grunt, "shinR", "move", t)[2];
    // A quarter cycle in, the left foot is forward (+z) and the right one back; half a cycle later the other way.
    expect(leftAt(0.25)).toBeGreaterThan(rightAt(0.25) + 0.1);
    expect(rightAt(0.75)).toBeGreaterThan(leftAt(0.75) + 0.1);
    const boar = rigOf("quadruped", MODEL_SPECS["enemies/tusk-boar"]!.marks, false, "enemies/tusk-boar")!;
    const paw = (name: string) => tailAt(boar, name, "move", 0.25)[2];
    // Trot: front-left with hind-right, front-right with hind-left.
    expect(Math.sign(paw("flL") - paw("frL"))).toBe(Math.sign(paw("brL") - paw("blL")));
  });

  it("raises the weapon on the wind-up and lands it at the strike (05 §6.2: ≥ 0.5 s warning)", () => {
    const grunt = rigOf("biped", MODEL_SPECS["enemies/moss-grunt"]!.marks, false)!;
    const hand = (t: number) => tailAt(grunt, "foreR", "attack", t)[1];
    expect(hand(0.5)).toBeGreaterThan(hand(0) + 0.3);
    expect(hand(0.66)).toBeLessThan(hand(0.5) - 0.2);
  });

  it("lays the wasp's upright wings flat (ART_REPLACE_LATER P1 fix in the rig)", () => {
    const spec = MODEL_SPECS["enemies/thorn-wasp"]!;
    const rig = rigOf("flyer", spec.marks, false)!;
    // A wing's tip stays where the span ends; its chord (span × up) turns from vertical to near flat.
    const m = boneAt(rig, "wingL", "move", 0);
    const up = [m[1]!, m[5]!, m[9]!];
    expect(Math.abs(up[1]!)).toBeLessThan(0.5);
  });

  it("weights every vertex to at most 4 bones summing to 1, inside each bone's region", () => {
    const rig = rigOf("biped", MODEL_SPECS["enemies/moss-grunt"]!.marks, false)!;
    const points = [
      [0.35, 0.28, 0.03], // left hand
      [-0.35, 0.3, 0.03], // right hand
      [0.15, 0.1, 0], // left shin
      [0, 0.85, 0.05], // head
      [0, 0.5, 0], // belly
    ];
    const { index, weight } = skinWeights(points.flat(), rig.bones);
    const main = (v: number) => rig.bones[index[v * 4]!]!.name;
    expect(main(0)).toBe("foreL");
    expect(main(1)).toBe("foreR");
    expect(main(2)).toBe("shinL");
    expect(main(3)).toBe("head");
    expect(["hips", "chest"]).toContain(main(4));
    for (let v = 0; v < points.length; v += 1) {
      const sum = weight[v * 4]! + weight[v * 4 + 1]! + weight[v * 4 + 2]! + weight[v * 4 + 3]!;
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it("skins on the CPU like the shader: a pose with no motion leaves the mesh where it was", () => {
    const bones: BoneDef[] = [
      { name: "base", parent: -1, head: [0, 0, 0], tail: [0, 1, 0], skin: true, reach: 1 },
      { name: "arm", parent: 0, head: [0, 1, 0], tail: [1, 1, 0], skin: true, reach: 1 },
    ];
    const rig: Rig = {
      kind: "biped",
      bones,
      clips: [
        { name: "idle", duration: 1, fps: 4, loop: true, pose: () => {} },
        { name: "attack", duration: 1, fps: 4, loop: false, pose: (t, w) => w.rot("arm", 0, 0, 90 * t) },
      ],
    };
    const baked = bakeRig(rig);
    const points = [0, 0.5, 0, 1, 1, 0];
    const { index, weight } = skinWeights(points, bones);
    const still = skinOnCpu(baked, points, index, weight, clipRow(baked.clips[0]!, 0.3));
    expect([...still].map((n) => Math.round(n * 1000) / 1000)).toEqual(points);
    // The arm's tip turns 90° up about its pivot at the end of Attack.
    const raised = skinOnCpu(baked, points, index, weight, clipRow(baked.clips[1]!, 1));
    expect(raised[3]).toBeCloseTo(0, 2);
    expect(raised[4]).toBeCloseTo(2, 2);
  });
});

describe("M0b clip choice (view/motion.ts)", () => {
  const grunt = bakeRig(rigOf("biped", MODEL_SPECS["enemies/moss-grunt"]!.marks, false)!);
  const setup = { strideM: 3, cadence: [0.7, 1.6] as const, strikeS: 0.5, phase: 0 };
  const read = (motion: Motion): CrowdInstance => {
    const inst: CrowdInstance = { x: 0, y: 0, z: 0, yaw: 0, flash: 0, squash: 1 };
    motion.write(inst);
    return inst;
  };

  it("stands in Idle and walks at a cadence matched to its speed (no sliding feet)", () => {
    const motion = new Motion(grunt, setup);
    motion.update(0.1, 0);
    expect(read(motion).clip).toBe(grunt.index.idle);
    for (let k = 0; k < 30; k += 1) motion.update(1 / 30, 3);
    const walking = read(motion);
    expect(walking.clip).toBe(grunt.index.move);
    // 3 m/s over a 3 m stride: one cycle a second, so the clip time grew by about the seconds walked.
    const before = walking.clipTime!;
    motion.update(0.5, 3);
    expect(read(motion).clipTime! - before).toBeCloseTo(0.5, 1);
  });

  it("holds the wind-up until the strike, puts a Hit over it, and ends in Death", () => {
    const motion = new Motion(grunt, setup);
    motion.attack("windup");
    for (let k = 0; k < 40; k += 1) motion.update(1 / 30, 0);
    let inst = read(motion);
    expect(inst.clip).toBe(grunt.index.attack);
    expect(inst.clipTime).toBeCloseTo(0.5, 5);
    motion.attack("strike");
    motion.update(0.1, 0);
    inst = read(motion);
    expect(inst.clipTime!).toBeGreaterThan(0.5);
    motion.hit();
    motion.update(0.05, 0);
    inst = read(motion);
    expect(inst.clipB).toBe(grunt.index.hit);
    expect(inst.blend!).toBeGreaterThan(0.5);
    motion.die();
    motion.update(0.3, 0);
    inst = read(motion);
    expect(inst.clip).toBe(grunt.index.death);
    expect(motion.deathSeconds).toBeGreaterThan(0.5);
  });
});
