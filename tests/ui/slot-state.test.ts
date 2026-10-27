import { describe, expect, it } from "vitest";
import { MAP_L2_CAU } from "../../src/content/data/maps";
import { place } from "../../src/sim/shop";
import { laneDirection } from "../../src/ui/placement-ui";
import { effectLine } from "../../src/ui/shop-strip";
import { TRAP_CHIP_SIDE_M, chipPoint, firedLabel, slotBadges, slotRuleLine, slotStateLine } from "../../src/ui/slot-state";
import { foeAt, makeWorld, stepOurSide } from "../sim/ourside-fixture";

describe("ui slot state (00 D33 (1))", () => {
  it("reads ready, recharging with seconds left, and a house's energy toward its pulse", () => {
    const world = makeWorld({ phase: "break", gold: 5000 });
    place(world, "pine-bomb", "cau-t2");
    place(world, "spikes", "cau-t1");
    place(world, "herb-hut", "h-ne");
    world.phase = "wave";
    stepOurSide(world, 1);
    const ready = slotBadges(world);
    expect(ready.map((badge) => [badge.item, badge.state, badge.charge])).toEqual([
      ["spikes", "ready", 1],
      ["pine-bomb", "ready", 1],
      ["herb-hut", "ready", 1],
    ]);
    expect(ready[2]).toMatchObject({ kind: "house", energy: 0, energyMax: 3 });
    // Two foes in the bomb's 3 m: it fires and recharges 22 s.
    foeAt(world, "blight-wolf", "cau", 9.5, { hp: 5000 });
    foeAt(world, "blight-wolf", "cau", 10.5, { hp: 5000 });
    stepOurSide(world, 1);
    const bomb = slotBadges(world).find((badge) => badge.item === "pine-bomb")!;
    expect(bomb).toMatchObject({ state: "charging", secondsLeft: 22 });
    expect(bomb.charge).toBeLessThan(0.01);
    expect(slotStateLine(bomb)).toBe("Đang nạp: còn 22 s");
    stepOurSide(world, 660);
    expect(slotBadges(world).find((badge) => badge.item === "pine-bomb")!.charge).toBeCloseTo(0.5, 1);
    world.houses.list[0]!.energy = 2;
    expect(slotStateLine(slotBadges(world).find((badge) => badge.kind === "house")!)).toBe("Đang hồi máu · Năng 2/3");
    world.houses.list[0]!.ruined = true;
    expect(slotBadges(world).find((badge) => badge.kind === "house")).toMatchObject({ state: "down" });
  });

  it("says when each item fires, and the net only shoots flyers, in the slot menu and the shop", () => {
    expect(slotRuleLine("net-launcher")).toBe("Chỉ bắn quái bay");
    expect(slotRuleLine("pine-bomb")).toBe("Tự nổ khi ≥ 2 quái trong 3 m, hoặc khi lính đang chặn quái trong vùng nổ");
    expect(slotRuleLine("herb-hut")).toBe("Đủ 3 lần gõ hạ quái trong 7 m: phát Xung hồi 10 %");
    expect(effectLine("net-launcher")).toBe("Chỉ bắn quái bay: kéo một con xuống đất 3 s, tầm 11 m; nạp 15 s");
    expect(effectLine("pine-bomb")).toBe("Nổ 30 sát thương khi ≥ 2 quái trong 3 m hoặc quái bị lính chặn, đẩy lùi 2 m; nạp 22 s");
    expect(effectLine("herb-hut")).toContain("đủ 3 lần gõ hạ quái gần nhà");
    expect([firedLabel("pine-bomb"), firedLabel("net-launcher"), firedLabel("herb-hut"), firedLabel("spikes")]).toEqual(["Nổ!", "Bắn!", "Xung!", ""]);
  });

  it("puts a trap's chip beside its lane, left of travel, and a house's over its roof", () => {
    const slot = MAP_L2_CAU.slots.find((entry) => entry.id === "cau-t2")!;
    const [ux, uz] = laneDirection(MAP_L2_CAU, "cau", slot.pos);
    const [x, y, z] = chipPoint(MAP_L2_CAU, slot);
    expect(y).toBe(0);
    expect(Math.hypot(x - slot.pos[0], z - slot.pos[1])).toBeCloseTo(TRAP_CHIP_SIDE_M, 5);
    // Left of travel: the cross product of travel and offset is negative (x east, z south).
    expect(ux * (z - slot.pos[1]) - uz * (x - slot.pos[0])).toBeLessThan(0);
    const pad = MAP_L2_CAU.slots.find((entry) => entry.id === "h-nw")!;
    expect(chipPoint(MAP_L2_CAU, pad)).toEqual([pad.pos[0], 2.8, pad.pos[1]]);
  });
});
