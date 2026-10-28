import { describe, expect, it } from "vitest";
import { MAP_L2_CAU } from "../../src/content/data/maps";
import {
  BLOCK_MARKER_SIDE_M,
  areaOutline,
  buildPhase,
  isPlaceable,
  laneDirection,
  markerPoint,
  placeReason,
  sellRefund,
  stepByDirection,
  upgradeCost,
} from "../../src/ui/placement-ui";
import { fakeWorld } from "./fake-world";

const slot = (id: string) => MAP_L2_CAU.slots.find((entry) => entry.id === id)!;

describe("ui placement helpers (00 §6, 03 §0.2)", () => {
  it("knows what can be placed and when", () => {
    expect(isPlaceable("spikes")).toBe(true);
    expect(isPlaceable("herb-hut")).toBe(true);
    expect(isPlaceable("moss-warden")).toBe(true);
    expect(isPlaceable("small-potion")).toBe(false);
    expect(buildPhase("prep")).toBe(true);
    expect(buildPhase("break")).toBe(true);
    expect(buildPhase("warning")).toBe(false);
    expect(buildPhase("wave")).toBe(false);
  });

  it("prices upgrades at 70 % then 100 % of the base and refunds 70 %, 100 % in the same break", () => {
    expect(upgradeCost("spikes", 1)).toBe(35);
    expect(upgradeCost("spikes", 2)).toBe(50);
    expect(upgradeCost("spikes", 3)).toBeNull();
    expect(upgradeCost("herb-hut", 1)).toBe(84);
    const world = fakeWorld({ phase: "break" });
    const spikes = world.slots[1]!;
    spikes.item = "spikes";
    spikes.level = 2;
    spikes.spent = 85;
    spikes.boughtInBreak = 3;
    expect(sellRefund(world, 1)).toBe(85);
    spikes.boughtInBreak = 2;
    expect(sellRefund(world, 1)).toBe(60);
    expect(sellRefund(world, 0)).toBe(0);
  });

  it("explains a failed place check in Vietnamese, with the gold missing", () => {
    expect(placeReason({ ok: true }, 10, 50)).toBeNull();
    expect(placeReason({ ok: false, reason: "gold" }, 30, 50)).toBe("Need 20 Gold");
    expect(placeReason({ ok: false, reason: "occupied" }, 300, 50)).toBe("Slot full");
    expect(placeReason({ ok: false, reason: "phase" }, 300, 50)).toBe("Place during breaks");
  });

  it("moves the cursor to the nearest slot in the arrow's direction, else wraps in keyboard order", () => {
    const points = new Map([
      [0, { x: 100, y: 100 }],
      [1, { x: 200, y: 110 }],
      [2, { x: 400, y: 100 }],
      [3, { x: 120, y: 300 }],
    ]);
    const all = [0, 1, 2, 3];
    expect(stepByDirection(points, all, 0, "right")).toBe(1);
    expect(stepByDirection(points, all, 1, "right")).toBe(2);
    expect(stepByDirection(points, all, 0, "down")).toBe(3);
    expect(stepByDirection(points, all, 3, "up")).toBe(0);
    // Nothing further left of slot 0: previous in order, wrapping to the last.
    expect(stepByDirection(points, all, 0, "left")).toBe(3);
    expect(stepByDirection(points, [], 0, "left")).toBe(-1);
    expect(stepByDirection(new Map(), [5, 6], -1, "right")).toBe(5);
  });

  it("draws the area a strip trap covers along its lane, and circles for others", () => {
    const at = slot("cau-t2");
    const [ux, uz] = laneDirection(MAP_L2_CAU, "cau", at.pos);
    expect(Math.hypot(ux, uz)).toBeCloseTo(1, 6);
    // Gate to dais: the direction points at the origin side.
    expect(ux * -at.pos[0] + uz * -at.pos[1]).toBeGreaterThan(0);
    const strip = areaOutline(MAP_L2_CAU, at, "spikes");
    expect(strip).toHaveLength(4);
    const side = (a: number, b: number) => Math.hypot(strip[a]![0] - strip[b]![0], strip[a]![1] - strip[b]![1]);
    expect(side(0, 1)).toBeCloseTo(4, 6); // Gai Chông strip: 4 m long…
    expect(side(1, 2)).toBeCloseTo(3, 6); // …and 2 × 1.5 m wide.
    const ring = areaOutline(MAP_L2_CAU, slot("h-ne"), "herb-hut");
    expect(ring).toHaveLength(32);
    expect(Math.hypot(ring[0]![0] - 6.5, ring[0]![1] + 5)).toBeCloseTo(7, 6);
  });

  it("moves block-point markers beside the path and leaves other slots on their point", () => {
    const block = slot("suoi-b1");
    const [x, z] = markerPoint(MAP_L2_CAU, block);
    expect(Math.hypot(x - block.pos[0], z - block.pos[1])).toBeCloseTo(BLOCK_MARKER_SIDE_M, 6);
    expect(markerPoint(MAP_L2_CAU, slot("suoi-t2"))).toEqual(slot("suoi-t2").pos);
    expect(markerPoint(MAP_L2_CAU, slot("h-sw"))).toEqual(slot("h-sw").pos);
  });
});
