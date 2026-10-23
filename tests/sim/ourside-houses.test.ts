import { describe, expect, it } from "vitest";
import { damageHouse } from "../../src/sim/houses";
import { slotIndex } from "../../src/sim/placement";
import { place, upgrade } from "../../src/sim/shop";
import type { World } from "../../src/sim/world";
import { eventsOf, foeAt, makeWorld, stepOurSide, sweepDead } from "./ourside-fixture";

function built(items: [Parameters<typeof place>[1], string][]): World {
  const world = makeWorld({ phase: "break", gold: 5000 });
  for (const [item, slot] of items) place(world, item, slot);
  world.phase = "wave";
  world.events.drain();
  return world;
}

describe("houses (03 §8, §10.2)", () => {
  it("Nhà Thuốc Lá heals the Dragons (up to the dais edge) 1.5 % max HP a second", () => {
    const world = built([["herb-hut", "h-ne"]]);
    world.hero.hp = 500;
    world.guide.hp = 300;
    stepOurSide(world, 60);
    expect(world.hero.hp).toBe(500);
    stepOurSide(world, 1);
    expect(world.hero.hp).toBe(515);
    // Bạch Long: 1.5 % of 700.
    expect(world.guide.hp).toBe(311);
    stepOurSide(world, 60);
    expect(world.hero.hp).toBe(530);
  });

  it("heals units only within its 7 m, and more at level 2", () => {
    const world = makeWorld({ phase: "break", gold: 5000 });
    place(world, "moss-warden", "suoi-b1");
    place(world, "moss-warden", "cau-b2");
    place(world, "herb-hut", "h-w");
    upgrade(world, "h-w");
    world.phase = "wave";
    const [near, far] = world.units.list;
    near!.hp = 100;
    near!.lastHitAt = 0;
    far!.hp = 100;
    far!.lastHitAt = 0;
    stepOurSide(world, 61);
    // 459 × 1.5 % × 1.45.
    expect(near!.hp).toBe(110);
    expect(far!.hp).toBe(100);
    expect(world.houses.list[0]).toMatchObject({ level: 2, hpMax: 857, hp: 857 });
  });

  it("charges energy from word kills in its area and pulses at 5, healing 10 %", () => {
    const world = built([["herb-hut", "h-ne"]]);
    world.hero.hp = 500;
    const kill = (by: "word" | "trap") => {
      const enemy = foeAt(world, "moss-grunt", "cau", 22);
      enemy.alive = false;
      enemy.killedBy = by;
      sweepDead(world);
    };
    kill("trap");
    for (let k = 0; k < 4; k += 1) kill("word");
    expect(world.houses.list[0]!.energy).toBe(4);
    expect(world.hero.hp).toBe(500);
    // A kill far from the house does not count.
    const far = foeAt(world, "moss-grunt", "suoi", 2);
    far.alive = false;
    far.killedBy = "word";
    sweepDead(world);
    expect(world.houses.list[0]!.energy).toBe(4);
    world.events.drain();
    kill("word");
    expect(world.houses.list[0]!.energy).toBe(0);
    expect(world.hero.hp).toBe(602);
    expect(eventsOf(world, "house-pulse")).toMatchObject([{ slot: slotIndex(world, "h-ne"), house: "herb-hut" }]);
  });

  it("goes Đổ Nát at 0 HP: no healing until the wave ends and half its HP comes back", () => {
    const world = built([["herb-hut", "h-ne"]]);
    world.hero.hp = 500;
    expect(damageHouse(world, slotIndex(world, "h-ne"), 700, "physical", { kind: "hero" })).toBe(612);
    expect(eventsOf(world, "hit")).toMatchObject([{ target: { kind: "house" }, amount: 612, hpLeft: 0 }]);
    stepOurSide(world, 120);
    expect(world.hero.hp).toBe(500);
    world.phase = "break";
    stepOurSide(world, 1);
    expect(world.houses.list[0]).toMatchObject({ ruined: false, hp: 306 });
    stepOurSide(world, 60);
    expect(world.hero.hp).toBe(515);
  });
});
