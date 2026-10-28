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
    expect(poor.find((cell) => cell.id === "pine-bomb")).toMatchObject({ enabled: false, reason: "Need 30 Gold", short: "−30" });

    const inWave = stripCells(fakeWorld({ phase: "wave", gold: 500 }), RULES);
    expect(inWave.find((cell) => cell.id === "spikes")).toMatchObject({ reason: "Place in breaks", short: "Break" });
    expect(inWave.find((cell) => cell.id === "small-potion")).toMatchObject({ reason: "Buy in breaks" });

    const world = fakeWorld({ phase: "break", gold: 500 });
    for (const slot of world.slots) if (slot.def.kind === "house") slot.item = "herb-hut";
    world.shop.held["small-potion"] = 6;
    world.shop.heroBuys["dragon-heart"] = 3;
    world.shop.heroBuys["hard-scale"] = 1;
    const cells = stripCells(world, RULES);
    expect(cells.find((cell) => cell.id === "herb-hut")).toMatchObject({ reason: "No free slots", short: "Full", badge: "6" });
    expect(cells.find((cell) => cell.id === "small-potion")).toMatchObject({ reason: "Bag full", badge: "6" });
    expect(cells.find((cell) => cell.id === "dragon-heart")).toMatchObject({ price: null, reason: "Max 3 buys", short: "Max", badge: "3/3" });
    expect(cells.find((cell) => cell.id === "hard-scale")).toMatchObject({ price: 105, enabled: true, note: "Bought 1/3" });
  });

  it("describes each item from its data", () => {
    expect(effectLine("spikes")).toBe("Slows 25%, 8 damage per second on its lane");
    expect(effectLine("small-potion")).toBe("Restores 25% of Hỏa Long's HP over 2 s; use during waves");
    expect(effectLine("hard-scale")).toBe("+15 Armor for Hỏa Long");
    expect(effectLine("dragon-heart")).toBe("+10% max HP for Hỏa Long; heals the added HP");
    expect(effectLine("herb-hut")).toContain("0.3% HP per second");
    expect(effectLine("net-launcher")).toBe("Grounds one low flyer for 3 s, range 11 m; recharge 15 s");
  });

  it("names every item so it reads as what it is (owner, 26/10: the herb hut is Lều Thuốc Nam, never Nhà Thuốc Lá)", () => {
    const names = stripCells(fakeWorld({ phase: "prep", gold: 200 }), RULES).map((cell) => cell.nameVi);
    expect(names).toContain("Herb Hut");
    for (const name of names) expect(name.toLowerCase()).not.toContain("thuốc lá");
  });
});
