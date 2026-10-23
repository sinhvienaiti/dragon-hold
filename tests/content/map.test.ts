import { describe, expect, it } from "vitest";
import { ENEMIES } from "../../src/content/data/enemies";
import { GENERALS } from "../../src/content/data/generals";
import { MAP_L2_CAU } from "../../src/content/data/maps";
import { CONSUMABLES, HOUSES, TRAPS, UNITS } from "../../src/content/data/our-side";
import { STAGE_M0 } from "../../src/content/data/stages";
import { OUR_SIDE, RINGS } from "../../src/content/rules";
import type { Vec2 } from "../../src/content/types";

/** Geometry rules of 01 §2.1, 03 §7.1, §8.1, §9.1 on map L2-cau, and M0 content wiring. Metres. */
const d = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const length = (points: readonly Vec2[]) => points.slice(1).reduce((sum, p, i) => sum + d(points[i]!, p), 0);

function pointAt(points: readonly Vec2[], atM: number): Vec2 {
  let left = atM;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = d(a, b);
    if (left <= seg) return [a[0] + ((b[0] - a[0]) * left) / seg, a[1] + ((b[1] - a[1]) * left) / seg];
    left -= seg;
  }
  return points[points.length - 1]!;
}

function distToPolyline(p: Vec2, points: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, d(p, [a[0] + dx * t, a[1] + dz * t]));
  }
  return best;
}

/** Distance from `p` to the water's edge (negative inside the water). */
function waterEdge(p: Vec2): number {
  const river = MAP_L2_CAU.river!;
  let best = Infinity;
  for (let i = 1; i < river.points.length; i += 1) {
    const a = river.points[i - 1]!;
    const b = river.points[i]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
    const width = river.widthsM[i - 1]! + (river.widthsM[i]! - river.widthsM[i - 1]!) * t;
    best = Math.min(best, d(p, [a[0] + dx * t, a[1] + dz * t]) - width / 2);
  }
  return best;
}

const play = RINGS.playMaxMm / 1000;

describe("map L2-cau", () => {
  const map = MAP_L2_CAU;

  it("has two ground lanes and one sky lane, gates at the play edge, ends on the rings", () => {
    expect(map.lanes.map((lane) => lane.id)).toEqual(["cau", "suoi"]);
    expect(map.sky.map((lane) => lane.id)).toEqual(["troi"]);
    for (const lane of map.lanes) {
      const gate = d(lane.points[0]!, map.dais.center);
      expect(gate).toBeGreaterThanOrEqual(RINGS.playMinMm / 1000);
      expect(gate).toBeLessThanOrEqual(play);
      expect(d(lane.points[lane.points.length - 1]!, map.dais.center)).toBeCloseTo(RINGS.meleeMm / 1000, 1);
      expect(length(lane.points)).toBeGreaterThanOrEqual(24);
      expect(length(lane.points)).toBeLessThanOrEqual(36);
    }
    const sky = map.sky[0]!;
    const end = d(sky.points[sky.points.length - 1]!, map.dais.center);
    expect(end).toBeGreaterThanOrEqual(RINGS.flyerMinMm / 1000);
    expect(end).toBeLessThanOrEqual(RINGS.flyerMaxMm / 1000);
  });

  it("crosses water only on the bridge (Đường Cầu) and at the ford (Đường Suối)", () => {
    for (const lane of map.lanes) {
      const total = length(lane.points);
      for (let at = 0; at <= total; at += 0.1) {
        if (waterEdge(pointAt(lane.points, at)) >= 0) continue;
        const covered = lane.features.some((f) => at >= f.fromM && at <= f.toM);
        expect(covered, lane.id + " is in the water at " + at.toFixed(1) + " m without a bridge or ford").toBe(true);
      }
    }
    expect(map.lanes[0]!.features.map((f) => f.kind)).toEqual(["bridge"]);
    expect(map.lanes[1]!.features.map((f) => f.kind)).toEqual(["ford"]);
  });

  it("keeps the river off the dais and the inner ring", () => {
    expect(waterEdge(map.dais.center)).toBeGreaterThan(OUR_SIDE.innerPadMm[1] / 1000);
  });

  it("places lane slots on their lanes at atM", () => {
    for (const slot of map.slots.filter((s) => s.kind !== "house")) {
      const lane = map.lanes.find((l) => l.id === slot.lane);
      expect(lane, slot.id).toBeDefined();
      expect(d(pointAt(lane!.points, slot.atM!), slot.pos), slot.id).toBeLessThan(0.02);
    }
  });

  it("follows 03 §7.1 for trap slots: 3–5 a lane, 5–7 m apart unless water lies between, none within 8 m, none in the ford", () => {
    for (const lane of map.lanes) {
      const traps = map.slots.filter((s) => s.kind === "trap" && s.lane === lane.id).map((s) => s.atM!).sort((a, b) => a - b);
      expect(traps.length).toBeGreaterThanOrEqual(OUR_SIDE.trapSlotsPerLane[0]);
      expect(traps.length).toBeLessThanOrEqual(OUR_SIDE.trapSlotsPerLane[1]);
      for (let i = 1; i < traps.length; i += 1) {
        const gap = traps[i]! - traps[i - 1]!;
        const featureBetween = lane.features.some((f) => f.fromM > traps[i - 1]! && f.toM < traps[i]!);
        expect(gap).toBeGreaterThanOrEqual(OUR_SIDE.trapSpacingMm[0] / 1000);
        if (!featureBetween) expect(gap).toBeLessThanOrEqual(OUR_SIDE.trapSpacingMm[1] / 1000);
      }
      for (const at of traps) {
        expect(d(pointAt(lane.points, at), map.dais.center)).toBeGreaterThanOrEqual(OUR_SIDE.trapMinCenterMm / 1000);
        expect(lane.features.some((f) => f.kind === "ford" && at >= f.fromM && at <= f.toM)).toBe(false);
      }
    }
  });

  it("follows 03 §9.1 for block points (2–3 a lane) and 03 §8.1 for house pads", () => {
    for (const lane of map.lanes) {
      const blocks = map.slots.filter((s) => s.kind === "block" && s.lane === lane.id);
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      expect(blocks.length).toBeLessThanOrEqual(3);
    }
    const pads = map.slots.filter((s) => s.kind === "house");
    const inner = pads.filter((p) => p.ring === "inner");
    const outer = pads.filter((p) => p.ring === "outer");
    expect(inner.length).toBeGreaterThanOrEqual(4);
    expect(inner.length).toBeLessThanOrEqual(6);
    expect(outer.length).toBeGreaterThanOrEqual(2);
    expect(outer.length).toBeLessThanOrEqual(4);
    for (const pad of inner) {
      expect(d(pad.pos, map.dais.center)).toBeGreaterThanOrEqual(OUR_SIDE.innerPadMm[0] / 1000);
      expect(d(pad.pos, map.dais.center)).toBeLessThanOrEqual(OUR_SIDE.innerPadMm[1] / 1000);
    }
    for (const pad of outer) {
      expect(d(pad.pos, map.dais.center)).toBeGreaterThanOrEqual(OUR_SIDE.outerPadMm[0] / 1000);
      expect(d(pad.pos, map.dais.center)).toBeLessThanOrEqual(OUR_SIDE.outerPadMm[1] / 1000);
    }
    const padRadius = HOUSES["herb-hut"].footprint.radiusMm / 1000;
    for (const pad of pads) {
      expect(waterEdge(pad.pos), pad.id + " is in the water").toBeGreaterThan(padRadius);
      for (const lane of map.lanes) expect(distToPolyline(pad.pos, lane.points), pad.id + " sits on " + lane.id).toBeGreaterThan(lane.widthM / 2 + padRadius);
    }
  });

  it("has unique slot ids", () => {
    const ids = map.slots.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("M0 content", () => {
  it("keys every record by its own id", () => {
    for (const [id, def] of Object.entries({ ...ENEMIES, ...GENERALS, ...TRAPS, ...HOUSES, ...UNITS, ...CONSUMABLES })) expect(def.id).toBe(id);
  });

  it("has the six M0 foes and G01 (DESIGN.md §9)", () => {
    expect(Object.values(ENEMIES).map((e) => e.code).sort()).toEqual(["E01", "E09", "E11", "E18", "E19", "E25"]);
    expect(GENERALS["moss-banner"].code).toBe("G01");
    expect(new Set(Object.values(ENEMIES).map((e) => e.gait))).toEqual(new Set(["biped", "quadruped", "flyer", "swarm"]));
  });

  it("never paints a placeholder in a semantic colour (05 §2.2)", () => {
    const semantic = ["#ff4a4a", "#ffb020", "#ffc83a", "#7ff5e0"];
    const colours = [...Object.values(ENEMIES), ...Object.values(GENERALS), ...Object.values(TRAPS), ...Object.values(HOUSES), ...Object.values(UNITS)].map((def) => def.show.placeholder.color.toLowerCase());
    for (const colour of colours) expect(semantic).not.toContain(colour);
  });

  it("wires the M0 stage to the map, the carry strip and 10 waves with G01 in waves 5 and 10", () => {
    expect(STAGE_M0.mapId).toBe(MAP_L2_CAU.id);
    for (const id of STAGE_M0.lanes) expect([...MAP_L2_CAU.lanes, ...MAP_L2_CAU.sky].some((lane) => lane.id === id)).toBe(true);
    const items: Record<string, unknown> = { ...TRAPS, ...HOUSES, ...UNITS, ...CONSUMABLES };
    for (const item of STAGE_M0.carry) expect(items[item], item).toBeDefined();
    expect(STAGE_M0.waves.map((w) => w.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(STAGE_M0.waves.filter((w) => w.generals.length > 0).map((w) => w.n)).toEqual([5, 10]);
    // Wave 1 sits in 00 §4.4's 0.55–0.65 band.
    expect(STAGE_M0.waves[0]!.load100).toBeGreaterThanOrEqual(55);
    expect(STAGE_M0.waves[0]!.load100).toBeLessThanOrEqual(65);
    // The last wave sits in 00 §4.4's 1.05–1.25 band.
    expect(STAGE_M0.waves[9]!.load100).toBeGreaterThanOrEqual(105);
    expect(STAGE_M0.waves[9]!.load100).toBeLessThanOrEqual(125);
  });
});
