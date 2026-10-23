import { describe, expect, it } from "vitest";
import type { Grade, SimEvent, WordGroup } from "../../src/content/types";
import { WordLog, starHint, summarizeRun, wordStatus } from "../../src/ui/results";
import { fakeWorld } from "./fake-world";

let tick = 0;
const assigned = (word: number, text: string, group: WordGroup): SimEvent => ({
  tick: tick++, type: "word-assigned", word, text, kind: "enemy", group, target: null, firstTier: 1,
});
const complete = (word: number, text: string, grade: Grade, errors: number, hintUsed = false): SimEvent => ({
  tick: tick++, type: "word-complete", word, text, kind: "enemy", grade, errors, keyTicks: 60, responseMs: 800, target: null,
  activity: "typing-enemy", scored: true, hintUsed,
});

describe("ui results and Sổ Từ Ải (01 §5, §6.5)", () => {
  it("logs every word met with finishes, errors and the best grade, in book order", () => {
    const log = new WordLog();
    log.onEvents([
      assigned(0, "river", "due"),
      complete(0, "river", "sloppy", 2),
      assigned(1, "bridge", "new"),
      complete(1, "bridge", "perfect", 0),
      assigned(2, "stone", "known"),
      complete(2, "stone", "flash", 0),
      assigned(3, "banner", "learning"),
      assigned(0, "river", "due"),
      complete(0, "river", "good", 0),
      assigned(4, "arrow", "learning"),
      complete(4, "arrow", "ok", 0, true),
    ]);
    const river = log.words.get("river")!;
    expect(river).toMatchObject({ met: 2, done: 2, errors: 2, sloppy: 1, clean: 1, best: "good", group: "due" });
    expect(log.list().map((record) => [record.text, wordStatus(record)])).toEqual([
      ["bridge", "new"],
      ["river", "miss"],
      ["arrow", "review"],
      ["banner", "review"],
      ["stone", "good"],
    ]);
    log.reset();
    expect(log.list()).toEqual([]);
  });

  it("sums the run: stars only on victory, accuracy from keys, new words learned clean", () => {
    const world = fakeWorld({ wave: 10 });
    world.hero.hp = 742;
    world.hero.hpMax = 1020;
    world.economy.gold = 312;
    world.stats.keys = 400;
    world.stats.wrongKeys = 24;
    world.stats.goldEarned = 1340;
    const log = new WordLog();
    log.onEvents([assigned(0, "honey", "new"), complete(0, "honey", "ok", 1), assigned(1, "valley", "new"), complete(1, "valley", "perfect", 0), assigned(2, "thunder", "new")]);
    const win = summarizeRun(world, log, "victory", 2, 10);
    expect(win).toMatchObject({ stars: 2, hpPct: 73, goldLeft: 312, goldEarned: 1340, accuracyPct: 94, newLearned: 1, newMet: 3, met: 3, mistyped: 1 });
    expect(starHint(win)).toBe("Hỏa Long còn 73 % máu. Giữ từ 80 % để có 3 sao.");
    const loss = summarizeRun(world, log, "defeat", 3, 7);
    expect(loss.stars).toBe(0);
    expect(starHint(loss)).toContain("đợt 7");
    world.stats.keys = 0;
    expect(summarizeRun(world, log, "victory", 3, 10).accuracyPct).toBeNull();
  });
});
