import { describe, expect, it } from "vitest";
import type { PlacementRules } from "../../src/ui/placement-ui";
import { effectLine, stripCells } from "../../src/ui/shop-strip";
import { fakeWorld } from "./fake-world";

/** Every free slot of the right kind, in map order (the sim's real order may differ). */
const RULES: PlacementRules = {
  canPlace: () => ({ ok: true }),
  suggestedSlots: (world, item) => {
    const kind = item === "herb-hut" ? "house" : item === "moss-warden" ? "block" : "trap";
    return world.slots.filter((slot) => slot.def.kind === kind && slot.item === null).map((slot) => slot.index);
  },
};

describe("ui carry strip (03 §4.2, §6)", () => {
  it("lists the carry items on keys 1…6, then Tim Rồng and Vảy Cứng on 7 and 8", () => {
    const cells = stripCells(fakeWorld({ phase: "prep", gold: 200 }), RULES);
    expect(cells.map((cell) => [cell.key, cell.id, cell.kind, cell.price])).toEqual([
      [1, "spikes", "place", 50],
      [2, "pine-bomb", "place", 90],
      [3, "net-launcher", "place", 80],
      [4, "moss-warden", "place", 70],
      [5, "herb-hut", "place", 120],
      [6, "small-potion", "consumable", 30],
      [7, "dragon-heart", "hero", 80],
      [8, "hard-scale", "hero", 70],
    ]);
    expect(cells.every((cell) => cell.enabled && cell.reason === null)).toBe(true);
  });

  it("says why a cell is off: gold short (never red), phase, no free slot, full bag, run limit", () => {
    const poor = stripCells(fakeWorld({ phase: "break", gold: 60 }), RULES);
    expect(poor.find((cell) => cell.id === "spikes")).toMatchObject({ enabled: true });
    expect(poor.find((cell) => cell.id === "pine-bomb")).toMatchObject({ enabled: false, reason: "Thiếu 30 vàng", short: "Thiếu 30" });

    const inWave = stripCells(fakeWorld({ phase: "wave", gold: 500 }), RULES);
    expect(inWave.find((cell) => cell.id === "spikes")).toMatchObject({ reason: "Chỉ đặt lúc nghỉ", short: "Lúc nghỉ" });
    expect(inWave.find((cell) => cell.id === "small-potion")).toMatchObject({ reason: "Mua lúc nghỉ" });

    const world = fakeWorld({ phase: "break", gold: 500 });
    for (const slot of world.slots) if (slot.def.kind === "house") slot.item = "herb-hut";
    world.shop.held["small-potion"] = 6;
    world.shop.heroBuys["dragon-heart"] = 3;
    world.shop.heroBuys["hard-scale"] = 1;
    const cells = stripCells(world, RULES);
    expect(cells.find((cell) => cell.id === "herb-hut")).toMatchObject({ reason: "Hết ô trống", short: "Hết ô", badge: "6" });
    expect(cells.find((cell) => cell.id === "small-potion")).toMatchObject({ reason: "Túi đã đầy", badge: "6" });
    expect(cells.find((cell) => cell.id === "dragon-heart")).toMatchObject({ price: null, reason: "Đủ 3 lần", badge: "3/3" });
    expect(cells.find((cell) => cell.id === "hard-scale")).toMatchObject({ price: 105, enabled: true, note: "Đã mua 1/3" });
  });

  it("describes each item from its data", () => {
    expect(effectLine("spikes")).toBe("Chậm 25 %, 8 sát thương mỗi giây trên đường");
    expect(effectLine("small-potion")).toBe("Hồi 25 % máu Hỏa Long trong 2 s; dùng trong đợt");
    expect(effectLine("hard-scale")).toBe("+15 Giáp Hỏa Long");
    expect(effectLine("dragon-heart")).toBe("+10 % máu tối đa Hỏa Long, hồi luôn phần tăng");
    expect(effectLine("herb-hut")).toContain("1,5 % máu mỗi giây");
  });
});
