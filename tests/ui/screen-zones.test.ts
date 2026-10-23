// UI round 2: floating cards (wave card, Thẻ Ôn) pick a spot clear of lanes and build slots.
import { describe, expect, it } from "vitest";
import type { ScreenPoint } from "../../src/app/contracts";
import { MAP_L2_CAU } from "../../src/content/data/maps";
import { chooseSpot, overlapArea, publishZones, segmentInside, spotCost, zonesFor, type Rect, type ScreenZones } from "../../src/ui/screen-zones";

const view = { w: 1280, h: 720 };

describe("screen zones", () => {
  it("measures how much of a lane runs inside a rect, widened by the lane's half-width", () => {
    const rect: Rect = { x: 100, y: 100, w: 100, h: 100 };
    expect(segmentInside(rect, { ax: 0, ay: 150, bx: 400, by: 150, half: 0 })).toBeCloseTo(100, 5);
    expect(segmentInside(rect, { ax: 0, ay: 50, bx: 400, by: 50, half: 0 })).toBe(0);
    // 40 px above the rect but 50 px wide: it touches.
    expect(segmentInside(rect, { ax: 0, ay: 60, bx: 400, by: 60, half: 50 })).toBeGreaterThan(0);
    expect(overlapArea(rect, { x: 150, y: 150, w: 100, h: 100 })).toBe(2500);
  });

  it("keeps a clear spot, leaves one over a lane or a slot for the next clear one", () => {
    const zones: ScreenZones = { lanes: [{ ax: 640, ay: 0, bx: 640, by: 720, half: 20 }], slots: [{ x: 1100, y: 80, w: 60, h: 60 }], stamp: 1 };
    const spots: Rect[] = [
      { x: 540, y: 10, w: 200, h: 100 }, // over the lane
      { x: 1050, y: 60, w: 200, h: 100 }, // over the slot
      { x: 20, y: 80, w: 200, h: 100 }, // clear
    ];
    expect(spotCost(spots[0]!, zones, [], view).lanes).toBeGreaterThan(0);
    expect(spotCost(spots[1]!, zones, [], view).slots).toBeGreaterThan(0);
    expect(chooseSpot(spots, zones, [], view)).toBe(2);
    // A panel there: the cheapest of the rest wins (a lane costs less than a slot).
    expect(chooseSpot(spots, zones, [{ x: 0, y: 60, w: 300, h: 200 }], view)).toBe(0);
    // Hysteresis: a clear current spot stays.
    expect(chooseSpot([spots[2]!, { x: 300, y: 300, w: 10, h: 10 }], zones, [], view, 1)).toBe(1);
  });

  it("publishes L2-cau's lanes and every slot for an overlay root", () => {
    const root = { tagName: "DIV" } as unknown as HTMLElement;
    expect(zonesFor(root)).toBeNull();
    // A flat top-down projector: 10 px a metre, origin at the view centre.
    const project = (x: number, _y: number, z: number, out: ScreenPoint): ScreenPoint => {
      out.x = 640 + x * 10;
      out.y = 360 + z * 10;
      out.visible = true;
      return out;
    };
    const zones = publishZones(root, MAP_L2_CAU, project);
    const segments = MAP_L2_CAU.lanes.reduce((n, lane) => n + lane.points.length - 1, 0) + MAP_L2_CAU.sky.reduce((n, sky) => n + sky.points.length - 1, 0);
    expect(zones.lanes.length).toBe(segments);
    expect(zones.slots.length).toBe(MAP_L2_CAU.slots.length);
    expect(zonesFor(root)).toBe(zones);
    // A house pad (4.6 m + margins) is wider than a trap slot.
    const house = MAP_L2_CAU.slots.findIndex((slot) => slot.kind === "house");
    const trap = MAP_L2_CAU.slots.findIndex((slot) => slot.kind === "trap");
    expect(zones.slots[house]!.w).toBeGreaterThan(zones.slots[trap]!.w);
    // The dais is no slot and no lane runs through a far corner.
    expect(spotCost({ x: 0, y: 0, w: 60, h: 40 }, zones, [], view).total).toBe(0);
  });
});
