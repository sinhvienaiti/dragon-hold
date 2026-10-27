import { describe, expect, it } from "vitest";
import { BOTS, createBotWorld, runBot } from "../../scripts/balance/bot";
import { bestShopAction, densest, shopActions, upgradeCost, waveCard } from "../../scripts/balance/policy";
import { STAGE_M0 } from "../../src/content/data/stages";
import { TRAPS, UNITS } from "../../src/content/data/our-side";
import type { StageDef } from "../../src/content/types";

const KIND: Record<string, string> = { spikes: "trap", "pine-bomb": "trap", "net-launcher": "trap", "moss-warden": "block", "herb-hut": "house" };

/** The bots' buying and skill choices (03 §13.1). */
describe("bot policy", () => {
  it("prices upgrades by 03 §0.2", () => {
    expect(upgradeCost("spikes", 1)).toBe(Math.round(TRAPS.spikes.cost * 0.7));
    expect(upgradeCost("moss-warden", 2)).toBe(UNITS["moss-warden"].cost);
  });

  it("reads a wave card from the groups, by lane", () => {
    const stage: StageDef = {
      ...STAGE_M0,
      waves: [
        {
          ...STAGE_M0.waves[0]!,
          groups: [
            { atMs: 0, lane: "cau", shape: "line", foe: "moss-grunt", count: 4 },
            { atMs: 5000, lane: "suoi", shape: "cluster", foe: "thorn-ant", count: 8 },
            { atMs: 9000, lane: "troi", shape: "flight", foe: "thorn-wasp", count: 3 },
            { atMs: 12_000, lane: "suoi", shape: "single", foe: "moss-archer", count: 1 },
          ],
        },
      ],
    };
    const world = createBotWorld(BOTS.b35, { seed: 1, stage });
    const card = waveCard(world, 0);
    expect(card.planned).toBe(true);
    expect(card.flyers).toBe(3);
    expect(card.lanes[0]).toMatchObject({ groundW: 4, meleeW: 4, clusters: 0 });
    expect(card.lanes[1]).toMatchObject({ clusters: 1, rangedW: 1.2 });
  });

  it("guesses a card while the wave has no groups", () => {
    const world = createBotWorld(BOTS.b35, { seed: 1 });
    const card = waveCard(world, 0);
    if (STAGE_M0.waves[0]!.groups.length > 0) return void expect(card.planned).toBe(true);
    expect(card.planned).toBe(false);
    expect(card.lanes.filter((lane) => lane.groundW > 0)).toHaveLength(2);
  });

  it("offers only fitting slots and buys within gold and the 10 % reserve", () => {
    const world = createBotWorld(BOTS.b35, { seed: 1 });
    const actions = shopActions(world, waveCard(world, 0), "balanced");
    expect(actions.length).toBeGreaterThan(5);
    for (const action of actions) {
      if (action.command.type !== "place") continue;
      const slot = world.slots.find((s) => s.def.id === (action.command as { slot: string }).slot)!;
      expect(slot.def.kind).toBe(KIND[action.command.item]);
      expect(slot.item).toBeNull();
    }
    const gold = world.economy.gold;
    const pick = bestShopAction(actions, gold, Math.ceil(gold * 0.1), 0.4, new Set());
    expect(pick).not.toBeNull();
    expect(pick!.cost).toBeLessThanOrEqual(gold - Math.ceil(gold * 0.1));
    expect(bestShopAction(actions, gold, Math.ceil(gold * 0.1), 0.4, new Set(actions.map((a) => a.key)))).toBeNull();
  });

  it("values a net post only where it reaches the flyers", () => {
    const world = createBotWorld(BOTS.b35, { seed: 1 });
    const card = { ...waveCard(world, 3), flyers: 4 };
    const nets = shopActions(world, card, "balanced").filter((a) => a.command.type === "place" && a.command.item === "net-launcher");
    expect(nets.map((a) => (a.command as { slot: string }).slot)).toContain("cau-t4");
    expect(nets.map((a) => (a.command as { slot: string }).slot)).not.toContain("suoi-t1");
  });

  it("buys a net post in reach when a flyer wave is next and none stands yet (00 D33 (1))", () => {
    const world = createBotWorld(BOTS.b35, { seed: 1 });
    const card = waveCard(world, 1);
    expect(card.flyers).toBe(1);
    const gold = 200;
    const places = (flyers: number) => shopActions(world, { ...card, flyers }, "balanced").filter((a) => a.command.type === "place");
    // Above every other trap, unit or house (the potion is a buy, not a slot).
    const pick = bestShopAction(places(1), gold, Math.ceil(gold * 0.1), 0.4, new Set());
    expect(pick?.command).toEqual({ type: "place", item: "net-launcher", slot: "cau-t4" });
    // No flyers next: no rush for the net.
    const calm = bestShopAction(places(0), gold, Math.ceil(gold * 0.1), 0.4, new Set());
    expect(calm?.command).not.toMatchObject({ item: "net-launcher" });
  });

  it("aims Thiên Hỏa at the densest group inside the word zone", () => {
    const m = 60_000;
    const foes = [
      { x: 10 * m, z: 0 },
      { x: 11 * m, z: 0 },
      { x: 10 * m, z: 1 * m },
      { x: -5 * m, z: -5 * m },
      { x: 40 * m, z: 0 },
      { x: 40.5 * m, z: 0 },
      { x: 41 * m, z: 0 },
      { x: 41.5 * m, z: 0 },
    ];
    const spot = densest(foes, 4, 26)!;
    expect(spot.count).toBe(3);
    expect(spot.at[0]).toBeGreaterThanOrEqual(10);
    expect(spot.at[0]).toBeLessThanOrEqual(11);
  });
});

/** BALANCE.md §6 tactics levels and the modes' flow (B6, B3). */
describe("bot tactics", () => {
  it("gives each standard bot a buying style by its tactics: poor, balanced (fair), good", () => {
    expect(BOTS.b35poor.policy.buy).toBe("poor");
    expect(BOTS.b35.policy.buy).toBe("balanced");
    expect(BOTS.b35good.policy.buy).toBe("good");
    expect(BOTS.child.policy.buy).toBe("poor");
    expect(BOTS.noTyping.policy.buy).toBe("best");
    expect(BOTS.typingOnly.policy.buy).toBe("none");
  });

  it("the weak buyer places by the dais, never upgrades, never buys Tim Rồng; the others fill and upgrade", () => {
    const poor = runBot(BOTS.b35poor, { seed: 3, keepLog: true, maxTicks: 6 * 60 * 60 });
    const fair = runBot(BOTS.b35, { seed: 3, keepLog: true, maxTicks: 6 * 60 * 60 });
    const commands = (run: typeof poor) => run.log.map((entry) => entry.command);
    expect(commands(poor).some((c) => c.type === "upgrade")).toBe(false);
    expect(commands(poor).some((c) => c.type === "buy" && c.item !== "small-potion")).toBe(false);
    const world = createBotWorld(BOTS.b35poor, { seed: 3 });
    const dist = (id: string) => {
      const slot = world.slots.find((s) => s.def.id === id)!;
      return Math.hypot(slot.x, slot.z);
    };
    const firstTrap = commands(poor).find((c) => c.type === "place" && KIND[c.item] === "trap");
    const traps = world.slots.filter((s) => s.def.kind === "trap").map((s) => dist(s.def.id));
    expect(firstTrap && firstTrap.type === "place" ? dist(firstTrap.slot) : 0).toBe(Math.min(...traps));
    expect(commands(fair).filter((c) => c.type === "place").length).toBeGreaterThan(3);
  });

  it("presses Enter in an Easy break (00 §4.5) once the shop is done", () => {
    const run = runBot(BOTS.b35, { seed: 5, difficulty: "easy", keepLog: true, maxTicks: 6 * 60 * 60 });
    expect(run.log.some((entry) => entry.command.type === "continue")).toBe(true);
    expect(run.result === "stalled").toBe(false);
    expect(run.wavesEnded).toBeGreaterThanOrEqual(2);
  });
});
