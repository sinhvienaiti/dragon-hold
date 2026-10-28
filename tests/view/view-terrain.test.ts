// view-terrain lane: height field, scatter placement, camera rig and projector (no WebGL needed).
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MAP_L2_CAU } from "../../src/content/data/maps";
import { KEYS } from "../../src/content/rules";
import { CAMERA_ACTIONS, CAMERA_LIMITS, createCameraRig } from "../../src/view/camera";
import { planScatter, SCATTER_CLEAR } from "../../src/view/scatter";
import { projectToScreen } from "../../src/view/stage";
import { buildHeightField, Polyline } from "../../src/view/terrain";

const map = MAP_L2_CAU;
const field = buildHeightField(map, 1);

/** Points every `step` metres along a lane, skipping bridge and ford spans. */
function lanePoints(points: readonly (readonly [number, number])[], skip: readonly { fromM: number; toM: number }[], step = 1.5) {
  const line = new Polyline(points);
  const out: { x: number; z: number; dx: number; dz: number }[] = [];
  for (let along = 1; along < line.length - 1; along += step) {
    if (skip.some((span) => along > span.fromM - 2.5 && along < span.toM + 2.5)) continue;
    out.push({ ...line.pointAt(along) });
  }
  return out;
}

describe("view-terrain height field", () => {
  it("is deterministic and finite everywhere, skirt included", () => {
    const again = buildHeightField(map, 1);
    expect(again.heights).toEqual(field.heights);
    for (const h of field.heights) expect(Number.isFinite(h)).toBe(true);
    for (const r of [60, 120, 250]) {
      for (let k = 0; k < 16; k += 1) {
        const a = (k / 16) * Math.PI * 2;
        const h = field.heightAt(Math.cos(a) * r, Math.sin(a) * r);
        expect(h).toBeGreaterThan(-3);
        expect(h).toBeLessThan(15);
      }
    }
  });

  it("raises the Dragon Dais above the meadow round it", () => {
    expect(field.heightAt(0, 0)).toBeCloseTo(field.daisTop, 6);
    expect(field.heightAt(map.dais.guideAt[0], map.dais.guideAt[1])).toBeCloseTo(field.daisTop, 6);
    for (const [x, z] of [[12, 6], [-6, 12], [10, -2]] as const) expect(field.daisTop).toBeGreaterThan(field.heightAt(x, z) + 0.3);
  });

  it("keeps lanes level across their width", () => {
    for (const lane of map.lanes) {
      const spans = lane.features.map((feature) => ({ fromM: feature.fromM, toM: feature.toM }));
      for (const p of lanePoints(lane.points, spans)) {
        const half = (lane.widthM / 2) * 0.8;
        const centre = field.heightAt(p.x, p.z);
        const left = field.heightAt(p.x - p.dz * half, p.z + p.dx * half);
        const right = field.heightAt(p.x + p.dz * half, p.z - p.dx * half);
        expect(Math.abs(left - centre)).toBeLessThan(0.12);
        expect(Math.abs(right - centre)).toBeLessThan(0.12);
      }
    }
  });

  it("carves the river below the water and keeps banks above it", () => {
    const river = map.river!;
    river.points.forEach(([x, z], index) => {
      if (Math.hypot(x, z) > 40) return;
      expect(field.ground(x, z)).toBeLessThan(field.waterLevel - 0.4);
      const half = river.widthsM[index]! / 2;
      // A point well out on the bank, across the flow.
      const next = river.points[Math.min(index + 1, river.points.length - 1)]!;
      const prev = river.points[Math.max(index - 1, 0)]!;
      const dx = next[0] - prev[0];
      const dz = next[1] - prev[1];
      const length = Math.hypot(dx, dz);
      for (const side of [-1, 1]) {
        const bx = x - (dz / length) * (half + 2.5) * side;
        const bz = z + (dx / length) * (half + 2.5) * side;
        if (field.laneAt(bx, bz).dist < 4) continue;
        expect(field.ground(bx, bz)).toBeGreaterThan(field.waterLevel);
      }
    });
  });

  it("makes the ford shallow and the bridge deck dry", () => {
    for (const shallow of map.river!.shallows) {
      const h = field.ground(shallow.center[0], shallow.center[1]);
      expect(h).toBeLessThan(field.waterLevel);
      expect(h).toBeGreaterThan(field.waterLevel - 0.35);
    }
    expect(field.bridges).toHaveLength(1);
    const bridge = field.bridges[0]!;
    const mx = (bridge.ax + bridge.bx) / 2;
    const mz = (bridge.az + bridge.bz) / 2;
    expect(field.ground(mx, mz)).toBeLessThan(field.waterLevel);
    expect(field.heightAt(mx, mz)).toBeCloseTo(bridge.topY, 6);
    expect(bridge.topY).toBeGreaterThan(field.waterLevel + 0.3);
  });
});

describe("view-terrain scatter", () => {
  const plan = planScatter(field, "medium");

  it("is seeded and fills the forest", () => {
    expect(planScatter(field, "medium")).toEqual(plan);
    expect(plan.pines.length).toBeGreaterThan(300);
    expect(plan.crowns.length).toBeGreaterThan(100);
    expect(plan.bushes.length).toBeGreaterThan(100);
    expect(plan.rocks.length).toBeGreaterThan(20);
  });

  it("keeps trees off lanes, water, slots, the dais and the sky lane", () => {
    const sky = map.sky.map((lane) => new Polyline(lane.points));
    for (const tree of [...plan.pines, ...plan.crowns]) {
      const r = Math.hypot(tree.x, tree.z);
      const lane = field.laneAt(tree.x, tree.z);
      expect(lane.dist - lane.half).toBeGreaterThanOrEqual(SCATTER_CLEAR.treeLaneOutside);
      if (r < map.terrain.playRadiusM) {
        expect(lane.dist - lane.half).toBeGreaterThanOrEqual(SCATTER_CLEAR.treeLaneInside);
        for (const line of sky) expect(line.nearest(tree.x, tree.z).dist).toBeGreaterThanOrEqual(SCATTER_CLEAR.skyLane);
      }
      expect(field.riverEdge(tree.x, tree.z)).toBeGreaterThanOrEqual(SCATTER_CLEAR.treeWater);
      expect(r).toBeGreaterThanOrEqual(SCATTER_CLEAR.treeDais);
      for (const slot of map.slots) expect(Math.hypot(tree.x - slot.pos[0], tree.z - slot.pos[1])).toBeGreaterThanOrEqual(SCATTER_CLEAR.treeSlot);
    }
  });

  it("keeps bushes and rocks off the lanes and out of the river", () => {
    for (const bush of plan.bushes) {
      const lane = field.laneAt(bush.x, bush.z);
      expect(lane.dist - lane.half).toBeGreaterThanOrEqual(SCATTER_CLEAR.bushLane);
      // Map pilot A2: reeds stand at the waterline (the pond's far shore, slow river reaches), never out in the water.
      if (bush.proto === "props/pine-river-reed-clump") expect(field.riverEdge(bush.x, bush.z)).toBeGreaterThanOrEqual(-0.3);
      else expect(field.riverEdge(bush.x, bush.z)).toBeGreaterThanOrEqual(SCATTER_CLEAR.bushWater);
      for (const slot of map.slots) expect(Math.hypot(bush.x - slot.pos[0], bush.z - slot.pos[1])).toBeGreaterThanOrEqual(SCATTER_CLEAR.bushSlot);
    }
    for (const rock of plan.rocks) {
      const lane = field.laneAt(rock.x, rock.z);
      expect(lane.dist - lane.half).toBeGreaterThanOrEqual(SCATTER_CLEAR.rockLane);
      expect(field.riverEdge(rock.x, rock.z)).toBeGreaterThanOrEqual(-0.3);
    }
  });
});

/** Enough of an HTMLElement for the rig: no listeners fire in these tests. */
function fakeDom(): HTMLElement {
  return { addEventListener() {}, removeEventListener() {}, clientWidth: 1280, clientHeight: 720 } as unknown as HTMLElement;
}

function rigFor() {
  const camera = new THREE.PerspectiveCamera(30, 1280 / 720, 2, 700);
  const rig = createCameraRig(camera, map, fakeDom());
  const settle = (seconds = 3): void => {
    for (let t = 0; t < seconds; t += 1 / 60) rig.update(1 / 60);
  };
  settle(0.1);
  return { camera, rig, settle };
}

describe("view-terrain camera rig", () => {
  it("takes only camera actions, never letters or game keys", () => {
    const { rig } = rigFor();
    for (const action of CAMERA_ACTIONS) expect(rig.handleAction(action)).toBe(true);
    for (const action of ["a", "KeyQ", "KeyE", "skill-1", "carry-1", "enter", "escape", "replay", "fast-forward", "upgrade", "sell"]) expect(rig.handleAction(action)).toBe(false);
    // Every camera action is bound to an arrow or Alt key in the canon table (00 §6), none to a letter.
    for (const action of CAMERA_ACTIONS) {
      const binding = KEYS.find((entry) => entry.action === action);
      expect(binding).toBeDefined();
      expect(binding!.code.startsWith("Key")).toBe(false);
    }
  });

  it("starts at the map's default view and clamps tilt and zoom", () => {
    const { rig, settle } = rigFor();
    expect(rig.pitchDeg).toBeCloseTo(map.camera.pitchDeg, 3);
    expect(rig.yawDeg).toBeCloseTo(map.camera.yawDeg, 3);
    expect(rig.zoom).toBeCloseTo(1, 3);
    for (let k = 0; k < 30; k += 1) rig.handleAction("tilt-up");
    for (let k = 0; k < 30; k += 1) rig.handleAction("zoom-out");
    settle();
    expect(rig.pitchDeg).toBeCloseTo(CAMERA_LIMITS.pitchMaxDeg, 1);
    expect(rig.zoom).toBeCloseTo(CAMERA_LIMITS.zoomMax, 2);
    for (let k = 0; k < 30; k += 1) rig.handleAction("tilt-down");
    for (let k = 0; k < 30; k += 1) rig.handleAction("zoom-in");
    settle();
    expect(rig.pitchDeg).toBeCloseTo(CAMERA_LIMITS.pitchMinDeg, 1);
    expect(rig.zoom).toBeCloseTo(CAMERA_LIMITS.zoomMin, 2);
  });

  it("keeps held rotate keys from running far ahead of the view", () => {
    const { rig, settle } = rigFor();
    for (let k = 0; k < 20; k += 1) rig.handleAction("rotate-left");
    settle();
    expect(rig.yawDeg).toBeCloseTo(-CAMERA_LIMITS.keyLeadDeg, 1);
  });

  it("Alt + 0 resets, and pressed again shows the 75° overview, then back", () => {
    const { rig, settle } = rigFor();
    rig.handleAction("rotate-right");
    rig.handleAction("tilt-down");
    settle();
    rig.handleAction("camera-reset");
    settle();
    expect(rig.pitchDeg).toBeCloseTo(map.camera.pitchDeg, 1);
    expect(rig.yawDeg).toBeCloseTo(map.camera.yawDeg, 1);
    rig.handleAction("camera-reset");
    settle();
    expect(rig.pitchDeg).toBeCloseTo(CAMERA_LIMITS.overviewPitchDeg, 1);
    expect(rig.zoom).toBeCloseTo(CAMERA_LIMITS.overviewZoom, 2);
    rig.handleAction("camera-reset");
    settle();
    expect(rig.pitchDeg).toBeCloseTo(map.camera.pitchDeg, 1);
  });

  it("never moves by itself, and keeps the look point within the play area + 8 m", () => {
    const { rig, camera, settle } = rigFor();
    settle();
    const before = camera.position.clone();
    settle(5);
    expect(camera.position.distanceTo(before)).toBeLessThan(1e-6);
    rig.setView({ targetX: 200, targetZ: -200 }, true);
    expect(Math.hypot(rig.target.x, rig.target.z)).toBeLessThanOrEqual(map.terrain.playRadiusM + CAMERA_LIMITS.panMarginM + 1e-6);
  });

  it("shakes the picture only: the camera and projected tags stay put", () => {
    const { rig, camera, settle } = rigFor();
    settle();
    const position = camera.position.clone();
    const calm = projectToScreen(camera, 1280, 720, 4, 1, -9, { x: 0, y: 0, visible: false });
    rig.shake(12);
    rig.update(1 / 60);
    expect(camera.position.distanceTo(position)).toBeLessThan(1e-6);
    const e = camera.projectionMatrix.elements;
    expect(Math.abs(e[8]!) + Math.abs(e[9]!)).toBeGreaterThan(0);
    // ≤ 12 px at 1080p, scaled to this 720 px view.
    expect(Math.abs(e[8]!) * 640).toBeLessThanOrEqual(12 * (720 / 1080) + 6 + 1e-6);
    const shaken = projectToScreen(camera, 1280, 720, 4, 1, -9, { x: 0, y: 0, visible: false });
    expect(shaken.x).toBeCloseTo(calm.x, 6);
    expect(shaken.y).toBeCloseTo(calm.y, 6);
    settle(4);
    expect(camera.projectionMatrix.elements[8]).toBe(0);
  });
});

describe("view-terrain projector", () => {
  it("puts the look point at the view centre and hides points behind the camera", () => {
    const camera = new THREE.PerspectiveCamera(30, 1280 / 720, 2, 700);
    camera.position.set(0, 60, 40);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const centre = projectToScreen(camera, 1280, 720, 0, 0, 0, { x: 0, y: 0, visible: false });
    expect(centre.x).toBeCloseTo(640, 3);
    expect(centre.y).toBeCloseTo(360, 3);
    expect(centre.visible).toBe(true);
    const behind = projectToScreen(camera, 1280, 720, 0, 80, 120, { x: 0, y: 0, visible: false });
    expect(behind.visible).toBe(false);
  });
});
