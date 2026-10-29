import { describe, expect, it } from "vitest";
import { BOTS, replayHashes, runBot, type BotRun } from "../../scripts/balance/bot";
import { botDeck } from "../../scripts/balance/deck";
import { bandGates, m0Gates, markdown, planRows, readiness, summarize } from "../../scripts/balance/report";

const TWO_MIN = 2 * 60 * 60;

/** Bots play the M0 world through SimCommands, deterministically (00 §7, 05 §10). */
describe("bot runs", () => {
  const first = runBot(BOTS.b35, { seed: 1, maxTicks: TWO_MIN, keepLog: true, hashEvery: 300, stallStop: false });

  it("sends the commands of a player: places, learn-ahead, start", () => {
    expect(first.log.length).toBeGreaterThan(0);
    const types = new Set(first.log.map((entry) => entry.command.type));
    expect(types.has("start")).toBe(true);
    expect(types.has("learn-ahead")).toBe(true);
    expect(types.has("place")).toBe(true);
    // Every logged command is stamped with the tick it went in on, in order.
    for (let k = 1; k < first.log.length; k += 1) expect(first.log[k]!.tick).toBeGreaterThanOrEqual(first.log[k - 1]!.tick);
  });

  it("plays the same seed the same way", () => {
    const again = runBot(BOTS.b35, { seed: 1, maxTicks: TWO_MIN, keepLog: true, hashEvery: 300, stallStop: false });
    expect(again.log).toEqual(first.log);
    expect(again.hashes).toEqual(first.hashes);
    expect(again.finalHash).toBe(first.finalHash);
  });

  it("replays from its log to the same hashes", () => {
    expect(replayHashes(BOTS.b35, { seed: 1 }, first.log, first.ticks, 300)).toEqual(first.hashes);
  });

  it("gives each bot its own dice on one seed", () => {
    const other = runBot({ ...BOTS.b35, name: "b35-twin" }, { seed: 1, maxTicks: TWO_MIN, keepLog: true, stallStop: false });
    const keys = (run: BotRun) => run.log.filter((entry) => entry.command.type === "key" || entry.command.type === "learn-ahead");
    if (keys(first).length > 0) expect(keys(other)).not.toEqual(keys(first));
  });

  it("types the words the world deals, at the bot's accuracy", ({ skip }) => {
    const words = first.metrics.events["word-assigned"] ?? 0;
    if (words === 0) return skip();
    expect(first.metrics.typing.words).toBeGreaterThan(0);
    expect(first.metrics.typing.wrongKeys / Math.max(1, first.metrics.typing.keys)).toBeLessThan(0.1);
  });

  it("never types or buys when its plan says so", () => {
    const none = runBot(BOTS.noTyping, { seed: 3, maxTicks: TWO_MIN, keepLog: true, stallStop: false });
    expect(none.log.some((entry) => entry.command.type === "key")).toBe(false);
    const only = runBot(BOTS.typingOnly, { seed: 3, maxTicks: TWO_MIN, keepLog: true, stallStop: false });
    expect(only.log.some((entry) => ["place", "buy", "upgrade"].includes(entry.command.type))).toBe(false);
  });

  it("stops a run that stalls and says where", () => {
    const run = runBot(BOTS.b35, { seed: 4, maxTicks: 30 * 60 * 60 });
    expect(["victory", "defeat", "stalled", "timeout"]).toContain(run.result);
    if (run.result === "stalled") expect(run.stalled).not.toBe("");
  });

  it("sums runs into a report with the M0 gates", () => {
    const deck = botDeck();
    const runs = [1, 2].map((seed) => runBot(BOTS.b35, { seed, deck, maxTicks: TWO_MIN, timeSteps: true }));
    const summary = summarize("b35", runs);
    expect(summary.runs).toBe(2);
    expect(summary.steps).not.toBeNull();
    const gates = m0Gates({ b35: summary });
    expect(gates.map((gate) => gate.id)).toEqual(["G1", "G3", "G5", "G6", "G9"]);
    // Bots that never ran, or a world where nothing spawns, block their gates instead of passing them.
    expect(gates.find((gate) => gate.id === "G3")!.status).toBe("bị chặn");
    if ((summary.events.spawn ?? 0) === 0) expect(gates.find((gate) => gate.id === "G1")!.status).toBe("bị chặn");
    expect(readiness({ b35: summary }).length).toBeGreaterThan(5);
    const text = markdown({ seeds: 2, summaries: { b35: summary }, byMode: { balanced: { b35: summary } }, sets: [], plan: planRows(), notes: [], wallS: 0 });
    expect(text).toContain("Cổng M0");
    expect(text).toContain("b35");
    expect(text).toContain("Vùng cuốn: Balanced");
    expect(text).toContain("B1–B9");
    // B1 and B7 are printed against the shared band (BALANCE.md §3, I ≤ 10 %) and D27's proposed one, never D27 alone.
    expect(text).toContain("≤ 10 % (D27 đề xuất: ≤ 20 %)");
    expect(text).toContain("## Cổng B1–B9 (BALANCE.md §7, dải chung §3)");
    expect(text).toContain("## B1, B7 theo dải đề xuất D27");
  });

  it("judges B1 and B7 against the shared band and D27's proposal", () => {
    const row = (bot: string, i: number, director = true) => ({
      bot, mode: "balanced" as const, director, runs: 20, win: 800, s: 500, p: 250, i, o: 0, n: 0.5, q: 600,
      support: null, killSeconds: null, stepsPerWave: 1, maxWaveSteps: 2, spawnMin: 900, spawnMax: 1000, learnOk: true,
    });
    const rows = ["novice", "steady", "standard", "skilled", "sloppy", "fast"].map((bot) => row(bot, 150)).concat(row("standard", 150, false));
    const both = bandGates(rows);
    // I 15 %: out of the shared ≤ 10 %, in D27's ≤ 20 %.
    expect(both.shared.find((g) => g.id === "B1")!.status).toBe("fail");
    expect(both.shared.find((g) => g.id === "B7")!.status).toBe("fail");
    expect(both.d27.map((g) => [g.id, g.status])).toEqual([["B1", "pass"], ["B7", "pass"]]);
  });
});
