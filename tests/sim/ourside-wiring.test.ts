import { describe, expect, it } from "vitest";
import { STAGE_M0 } from "../../src/content/data/stages";
import type { SimCommand } from "../../src/content/types";
import { createWorld, hashWorld, runLog, step } from "../../src/sim/world";

/** Our side through the real world: SimCommands in prep go through applyCommand and the fixed step. */
describe("our side wiring (world.step)", () => {
  const log: { tick: number; command: SimCommand }[] = [
    { tick: 0, command: { type: "learn-ahead", correct: 3 } },
    { tick: 0, command: { type: "place", item: "spikes", slot: "cau-t1" } },
    { tick: 1, command: { type: "buy", item: "small-potion" } },
    { tick: 2, command: { type: "upgrade", slot: "cau-t1" } },
    { tick: 3, command: { type: "place", item: "moss-warden", slot: "suoi-b2" } },
    { tick: 4, command: { type: "sell", slot: "cau-t1" } },
    { tick: 5, command: { type: "consumable", item: "small-potion" } },
    { tick: 6, command: { type: "place", item: "herb-hut", slot: "cau-t2" } },
  ];

  it("places, buys, upgrades and sells with gold events and a 100 % refund in prep", () => {
    const world = createWorld(STAGE_M0);
    runLog(world, log, 10);
    const events = world.events.drain();
    const types = events.filter((event) => ["built", "upgraded", "sold", "bought", "consumable", "rejected"].includes(event.type)).map((event) => event.type);
    expect(types).toEqual(["built", "bought", "upgraded", "built", "sold", "consumable", "rejected"]);
    expect(events.find((event) => event.type === "rejected")).toMatchObject({ command: "place", reason: "slot-kind" });
    // 200 + 15 − 50 − 30 − 35 − 70 + 85.
    expect(world.economy.gold).toBe(115);
    expect(world.traps.list).toHaveLength(0);
    expect(world.units.list).toHaveLength(1);
    expect(world.shop.held["small-potion"]).toBe(0);
  });

  it("replays to the same hash", () => {
    const a = createWorld(STAGE_M0);
    const b = createWorld(STAGE_M0);
    runLog(a, log, 30);
    for (let tick = 0; tick < 30; tick += 1) step(b, log.filter((entry) => entry.tick === tick).map((entry) => entry.command));
    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});
