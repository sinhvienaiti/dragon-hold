import { describe, expect, it } from "vitest";
import { FIRE_DRAGON } from "../../src/content/rules";
import { STAGE_M0 } from "../../src/content/data/stages";
import type { StageDef } from "../../src/content/types";
import { damageHouse } from "../../src/sim/houses";
import { canPlace, editableSlots, keyboardOrder, sellRefund, slotIndex, suggestedSlots, upgradePrice, visibleSlots } from "../../src/sim/placement";
import { buy, heroMaxHpBonus, place, sell, upgrade, useConsumable } from "../../src/sim/shop";
import { buildUnit } from "../../src/sim/units";
import { hashWorld, type World } from "../../src/sim/world";
import { eventsOf, makeWorld, stepOurSide } from "./ourside-fixture";

const slot = (world: World, id: string) => world.slots[slotIndex(world, id)]!;
const rejects = (world: World) => eventsOf(world, "rejected").map((event) => event.command + ":" + event.reason);

describe("placement and shop (03 §0.1, §0.2, §4)", () => {
  it("places into matching free slots in prep and breaks, and emits built", () => {
    const world = makeWorld({ phase: "prep", gold: 1000 });
    place(world, "spikes", "cau-t1");
    place(world, "moss-warden", "cau-b1");
    place(world, "herb-hut", "h-ne");
    const events = world.events.drain();
    expect(events.filter((event) => event.type === "built")).toMatchObject([
      { slot: slotIndex(world, "cau-t1"), item: "spikes", level: 1 },
      { slot: slotIndex(world, "cau-b1"), item: "moss-warden", level: 1 },
      { slot: slotIndex(world, "h-ne"), item: "herb-hut", level: 1 },
    ]);
    expect(world.economy.gold).toBe(1000 - 50 - 70 - 120);
    expect(world.traps.list).toMatchObject([{ trap: "spikes", level: 1 }]);
    expect(world.units.list).toMatchObject([{ unit: "moss-warden", index: 0, hp: 459, downUntil: -1 }]);
    expect(world.houses.list).toMatchObject([{ house: "herb-hut", hp: 612 }]);
  });

  it("refuses wrong kinds, taken slots, short gold, unknown slots and items off the carry strip", () => {
    const world = makeWorld({ phase: "break", gold: 60 });
    place(world, "spikes", "h-ne");
    place(world, "spikes", "nowhere");
    place(world, "pine-bomb", "cau-t1");
    place(world, "spikes", "cau-t1");
    place(world, "spikes", "cau-t1");
    expect(rejects(world)).toEqual(["place:slot-kind", "place:unknown-slot", "place:gold", "place:occupied"]);
    const locked: StageDef = { ...STAGE_M0, carry: ["spikes"] };
    const other = makeWorld({ stage: locked, phase: "break", gold: 500 });
    expect(canPlace(other, "pine-bomb", slotIndex(other, "cau-t2"))).toEqual({ ok: false, reason: "locked" });
  });

  it("keeps C1–C5 waves to consumables: no place, upgrade or sell in a wave", () => {
    const world = makeWorld({ phase: "break", gold: 500 });
    place(world, "spikes", "cau-t1");
    world.phase = "wave";
    world.events.drain();
    place(world, "pine-bomb", "cau-t2");
    upgrade(world, "cau-t1");
    sell(world, "cau-t1");
    buy(world, "small-potion");
    expect(rejects(world)).toEqual(["place:phase", "upgrade:phase", "sell:phase", "buy:phase"]);
    expect(visibleSlots(world, null)).toEqual([]);
    expect(visibleSlots(world, "spikes")).toEqual([]);
  });

  it("allows one quick place a wave from C6, built in 2 s", () => {
    const c6: StageDef = { ...STAGE_M0, chapter: 6 };
    const world = makeWorld({ stage: c6, phase: "wave", gold: 500 });
    place(world, "moss-warden", "cau-b1");
    place(world, "spikes", "cau-t1");
    expect(rejects(world)).toEqual(["place:phase"]);
    const warden = world.units.list[0]!;
    expect(warden.downUntil).toBe(120);
    expect(slot(world, "cau-b1").boughtInBreak).toBe(-1);
    stepOurSide(world, 121);
    expect(warden.downUntil).toBe(-1);
    // The next wave allows another one.
    world.phase = "break";
    stepOurSide(world, 1);
    world.phase = "wave";
    stepOurSide(world, 1);
    place(world, "spikes", "cau-t1");
    expect(world.traps.list).toHaveLength(1);
  });

  it("upgrades at 70 % then 100 % of the base price up to level 3", () => {
    const world = makeWorld({ phase: "break", gold: 1000 });
    place(world, "pine-bomb", "cau-t2");
    expect(upgradePrice("pine-bomb", 1)).toBe(63);
    expect(upgradePrice("pine-bomb", 2)).toBe(90);
    upgrade(world, "cau-t2");
    upgrade(world, "cau-t2");
    world.events.drain();
    upgrade(world, "cau-t2");
    expect(rejects(world)).toEqual(["upgrade:max-level"]);
    expect(slot(world, "cau-t2")).toMatchObject({ level: 3, spent: 243 });
    expect(world.traps.list[0]!.level).toBe(3);
    expect(world.economy.gold).toBe(1000 - 243);
  });

  it("refunds 100 % in the break it was bought, 70 % afterwards", () => {
    const world = makeWorld({ phase: "prep", gold: 1000 });
    place(world, "moss-warden", "cau-b1");
    upgrade(world, "cau-b1");
    expect(sellRefund(world, slotIndex(world, "cau-b1"))).toBe(119);
    place(world, "net-launcher", "cau-t4");
    // A wave passes: the next break is a new break.
    world.phase = "wave";
    stepOurSide(world, 1);
    world.phase = "break";
    stepOurSide(world, 1);
    expect(world.shop.breakNo).toBe(1);
    world.events.drain();
    sell(world, "cau-t4");
    expect(eventsOf(world, "sold")).toMatchObject([{ item: "net-launcher", refund: 56 }]);
    expect(slot(world, "cau-t4")).toMatchObject({ item: null, level: 0, spent: 0 });
    expect(world.traps.list).toHaveLength(0);
    sell(world, "cau-b1");
    expect(world.units.list).toHaveLength(0);
    expect(world.economy.gold).toBe(1000 - 70 - 49 - 80 + 56 + 83);
  });

  it("re-indexes units when one is sold", () => {
    const world = makeWorld({ phase: "break", gold: 1000 });
    place(world, "moss-warden", "cau-b1");
    place(world, "moss-warden", "suoi-b1");
    place(world, "moss-warden", "cau-b2");
    sell(world, "suoi-b1");
    expect(world.units.list.map((unit) => [unit.index, unit.slot])).toEqual([
      [0, slotIndex(world, "cau-b1")],
      [1, slotIndex(world, "cau-b2")],
    ]);
  });

  it("caps units at 6 (03 §9.1)", () => {
    const world = makeWorld({ phase: "break", gold: 5000 });
    place(world, "moss-warden", "cau-b1");
    // Five more stand on the map (a later map has more block points).
    for (let k = 0; k < 5; k += 1) buildUnit(world, slotIndex(world, "cau-b1"), "moss-warden");
    expect(world.units.list).toHaveLength(6);
    expect(canPlace(world, "moss-warden", slotIndex(world, "suoi-b2"))).toEqual({ ok: false, reason: "limit" });
  });

  it("buys potions up to 3, Tim Rồng and Vảy Cứng at rising prices up to 3", () => {
    const world = makeWorld({ phase: "break", gold: 2000 });
    for (let k = 0; k < 4; k += 1) buy(world, "small-potion");
    expect(world.shop.held["small-potion"]).toBe(3);
    const hp = world.hero.hpMax;
    // Tim Rồng: +10 % of the base HP (FIRE_DRAGON.hp × g(c)) each.
    const step = Math.round((Math.round((FIRE_DRAGON.hp * world.gPm) / 1000) * 10) / 100);
    for (let k = 0; k < 4; k += 1) buy(world, "dragon-heart");
    for (let k = 0; k < 4; k += 1) buy(world, "hard-scale");
    expect(world.hero.hpMax).toBe(hp + 3 * step);
    expect(world.hero.hp).toBe(world.hero.hpMax);
    expect(heroMaxHpBonus(world)).toBe(3 * step);
    expect(world.hero.armour).toBe(20 + 45);
    expect(world.economy.gold).toBe(2000 - 90 - (80 + 120 + 160) - (70 + 105 + 140));
    expect(rejects(world)).toEqual(["buy:limit", "buy:limit", "buy:limit"]);
  });

  it("uses a potion in a wave with a shared 8 s cooldown", () => {
    const world = makeWorld({ phase: "break", gold: 500 });
    buy(world, "small-potion");
    buy(world, "small-potion");
    world.phase = "wave";
    world.hero.hp = 100;
    world.events.drain();
    useConsumable(world, "small-potion");
    useConsumable(world, "small-potion");
    expect(world.events.drain().filter((event) => event.type === "consumable" || event.type === "rejected")).toMatchObject([
      { type: "consumable", item: "small-potion", x: 0, z: 0 },
      { type: "rejected", command: "consumable", reason: "cooldown" },
    ]);
    stepOurSide(world, 479);
    useConsumable(world, "small-potion");
    expect(rejects(world)).toEqual(["consumable:cooldown"]);
    stepOurSide(world, 1);
    useConsumable(world, "small-potion");
    useConsumable(world, "small-potion");
    expect(rejects(world)).toEqual(["consumable:none"]);
    stepOurSide(world, 120);
    // Two potions, 25 % of max HP each.
    expect(world.hero.hp).toBe(100 + 2 * Math.round((world.hero.hpMax * 25) / 100));
  });

  it("repairs a ruined house with `=` for 30 % of its price, in a wave too", () => {
    const world = makeWorld({ phase: "break", gold: 500 });
    place(world, "herb-hut", "h-sw");
    world.phase = "wave";
    damageHouse(world, slotIndex(world, "h-sw"), 5000, "physical", { kind: "hero" });
    expect(world.houses.list[0]!.ruined).toBe(true);
    upgrade(world, "h-sw");
    expect(world.houses.list[0]).toMatchObject({ ruined: false, hp: 612 });
    expect(world.economy.gold).toBe(500 - 120 - 36);
  });

  it("shows slots only while placing or between waves, in keyboard order", () => {
    const world = makeWorld({ phase: "prep", gold: 500 });
    const all = visibleSlots(world, null);
    expect(all).toHaveLength(world.slots.length);
    expect(keyboardOrder(world, all)).toEqual(all);
    const traps = visibleSlots(world, "spikes");
    expect(traps.map((index) => world.slots[index]!.def.kind).every((kind) => kind === "trap")).toBe(true);
    expect(traps).toHaveLength(7);
    // The net goes first to the trap slot nearest the flyers' ring.
    expect(world.slots[suggestedSlots(world, "net-launcher")[0]!]!.def.id).toBe("cau-t4");
    expect(world.slots[suggestedSlots(world, "herb-hut")[0]!]!.def.ring).toBe("inner");
    // A bomb goes where foes bunch (test pass 27/10): the outermost slot of the next wave's swarm lane, or just
    // before a Vệ Binh's hold point once one stands.
    expect(world.slots[suggestedSlots(world, "pine-bomb")[0]!]!.def.id).toBe("cau-t1");
    place(world, "moss-warden", "cau-b2");
    expect(world.slots[suggestedSlots(world, "pine-bomb")[0]!]!.def.id).toBe("cau-t3");
    sell(world, "cau-b2");
    place(world, "spikes", world.slots[traps[0]!]!.def.id);
    expect(visibleSlots(world, "spikes")).toHaveLength(6);
    expect(editableSlots(world)).toEqual([traps[0]]);
  });

  it("replays the same commands to the same hash", () => {
    const run = () => {
      const world = makeWorld({ phase: "prep", gold: 900 });
      place(world, "spikes", "cau-t1");
      place(world, "moss-warden", "suoi-b2");
      buy(world, "dragon-heart");
      upgrade(world, "cau-t1");
      stepOurSide(world, 30);
      sell(world, "suoi-b2");
      return hashWorld(world);
    };
    expect(run()).toBe(run());
  });
});
