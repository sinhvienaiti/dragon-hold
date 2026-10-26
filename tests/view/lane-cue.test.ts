// Lit lanes of the wave warning (26/10 review: the card said "Quái sắp vào từ các đường sáng" and no lane lit,
// and the sky lane's arrows ran under "Đường Trời: Yên").
import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MAP_L2_CAU } from "../../src/content/data/maps";
import { STAGE_M0 } from "../../src/content/data/stages";
import type { Phase } from "../../src/content/types";
import { createLaneCue, laneCue, waveLanes } from "../../src/view/lane-cue";
import { buildPaths } from "../../src/view/paths";
import { buildTerrain } from "../../src/view/terrain";

const at = (phase: Phase, wave: number) => ({ stage: STAGE_M0, phase, wave });

describe("lane cue", () => {
  it("names the lanes a wave sends foes along, in the stage's order", () => {
    expect(waveLanes(at("prep", 0), 1)).toEqual(["cau", "suoi"]);
    expect(waveLanes(at("prep", 0), 2)).toEqual(["cau", "suoi", "troi"]);
    expect(waveLanes(at("prep", 0), 11)).toEqual([]);
  });

  it("cues the coming wave before it starts and this one during it; lights the ground lanes only in the warning", () => {
    expect(laneCue(at("prep", 0))).toEqual({ ids: ["cau", "suoi"], warning: false });
    expect(laneCue(at("warning", 0))).toEqual({ ids: ["cau", "suoi"], warning: true });
    expect(laneCue(at("wave", 1))).toEqual({ ids: ["cau", "suoi"], warning: false });
    expect(laneCue(at("break", 1))).toEqual({ ids: ["cau", "suoi", "troi"], warning: false });
    expect(laneCue(at("warning", 1))).toEqual({ ids: ["cau", "suoi", "troi"], warning: true });
    expect(laneCue(at("victory", 10))).toEqual({ ids: [], warning: false });
  });

  it("tells the paths only when the cue changes", () => {
    const calls: [string[], boolean][] = [];
    const cue = createLaneCue({ cueLanes: (ids, warning) => calls.push([[...ids], warning]) });
    const info = { now: 0, dt: 1 / 60 } as Parameters<typeof cue.frame>[1];
    for (const world of [at("prep", 0), at("prep", 0), at("warning", 0), at("warning", 0), at("wave", 1)]) cue.frame(world as never, info);
    expect(calls).toEqual([
      [["cau", "suoi"], false],
      [["cau", "suoi"], true],
      [["cau", "suoi"], false],
    ]);
  });

  it("fades a cued dirt lane in over a quarter second and out again; a quiet sky lane dims and its chevrons stop", () => {
    const paths = buildPaths(MAP_L2_CAU, buildTerrain(MAP_L2_CAU, "low"));
    const mesh = (name: string) => paths.group.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const cau = mesh("dh-lane-cue-cau");
    const suoi = mesh("dh-lane-cue-suoi");
    const sky = mesh("dh-sky-troi");
    expect(cau.visible).toBe(false);
    // Before any cue the sky lane looks as it always did (terrain preview, bench).
    expect(sky.material.uniforms.uOpacity!.value).toBeCloseTo(0.55, 6);
    paths.cueLanes(["cau"], true);
    for (let k = 0; k < 15; k += 1) paths.update(1 / 60);
    expect(cau.visible).toBe(true);
    expect(cau.material.uniforms.uOpacity!.value).toBeCloseTo(1, 6);
    expect(suoi.visible).toBe(false);
    // Wave 1 has no flyer: the sky lane dims to its quiet look and its chevrons hold still.
    const flow = sky.material.uniforms.uFlow!.value as number;
    expect(sky.material.uniforms.uOpacity!.value).toBeCloseTo(0.2, 6);
    paths.update(1 / 60);
    expect(sky.material.uniforms.uFlow!.value).toBe(flow);
    paths.cueLanes(["cau", "troi"], false);
    for (let k = 0; k < 15; k += 1) paths.update(1 / 60);
    expect(cau.visible).toBe(false);
    expect(sky.material.uniforms.uOpacity!.value).toBeCloseTo(0.55, 6);
    expect(sky.material.uniforms.uFlow!.value).toBeGreaterThan(flow);
    paths.dispose();
  });
});
