import { describe, expect, it } from "vitest";
import { PACE_CURRENT_KEY, PACE_PICK_KEY, PACE_PRESETS, PaceMeter, clampWpm, measuredHeader, paceLabel, paceOptions, readPaceMemory, recordStage, rememberPick, sameSpeed, type PaceStorage } from "../../src/app/typing-pace";
import type { SimEvent, WordGroup } from "../../src/content/types";

/** A storage over a Map, as kit/platform's SafeStorage answers. */
function memoryStorage(): PaceStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => (map.set(key, value), true) };
}

/** Events of `words` words typed at `wpm` (known-word speed): each word's first-to-last-key time is (ℓ − 1) keys at 12000 / (E d) ms. */
function typedWords(wpm: number, words: number, groups: readonly WordGroup[] = ["known", "learning", "new"]): SimEvent[] {
  const dOf: Record<WordGroup, number> = { known: 1, learning: 0.85, due: 0.85, new: 0.7 };
  const events: SimEvent[] = [];
  for (let k = 0; k < words; k += 1) {
    const text = ["oak", "river", "stone", "lantern"][k % 4]!;
    const group = groups[k % groups.length]!;
    const ms = ((text.length - 1) * 12000) / (wpm * dOf[group]) * (k % 2 === 0 ? 0.9 : 1.1);
    events.push({ type: "word-assigned", tick: k * 120, word: k % 16, text, kind: "enemy", group, target: null, firstTier: 1 });
    events.push({ type: "word-complete", tick: k * 120 + 60, word: k % 16, text, kind: "enemy", grade: k % 7 === 0 ? "ok" : "perfect", errors: k % 7 === 0 ? 1 : 0, keyTicks: Math.round((ms * 60) / 1000), responseMs: ms, target: null, activity: "typing-enemy", scored: true, hintUsed: false });
  }
  return events;
}

describe("typing pace", () => {
  it("keeps the world's speed a whole WPM in 10–120", () => {
    expect(clampWpm(undefined)).toBeUndefined();
    expect(clampWpm(Number.NaN)).toBeUndefined();
    expect(clampWpm(27.4)).toBe(27);
    expect(clampWpm(0)).toBe(10);
    expect(clampWpm(400)).toBe(120);
  });

  it("asks with 35 preselected on a first visit, and the last pick after", () => {
    const storage = memoryStorage();
    const first = paceOptions(readPaceMemory(storage));
    expect(first.options.map((option) => option.header.typistWpm)).toEqual(PACE_PRESETS.map((preset) => preset.wpm));
    expect(first.options[first.selected]!.header.typistWpm).toBe(35);
    rememberPick(storage, { typistWpm: 25, source: "pick" });
    expect(JSON.parse(storage.map.get(PACE_PICK_KEY)!)).toEqual({ wpm: 25, source: "pick" });
    const again = paceOptions(readPaceMemory(storage));
    expect(again.options[again.selected]!.header).toEqual({ typistWpm: 25, source: "pick" });
  });

  it("measures the known-word speed from first-to-last-key times and their d", () => {
    const meter = new PaceMeter();
    meter.onEvents(typedWords(25, 60));
    expect(meter.words).toBe(60);
    expect(meter.wpm).toBeGreaterThan(24);
    expect(meter.wpm).toBeLessThan(26.5);
    expect(meter.cv).toBeGreaterThan(0.05);
    expect(meter.cv).toBeLessThan(0.2);
  });

  it("keeps nothing from a stage with fewer than 8 words", () => {
    const storage = memoryStorage();
    const meter = new PaceMeter();
    meter.onEvents(typedWords(25, 5));
    expect(meter.sample("lost", { keys: 30, wrongKeys: 2, strayKeys: 0 }, 0)).toBeNull();
    expect(recordStage(storage, null)).toBeNull();
    expect(readPaceMemory(storage).measured).toBeNull();
  });

  it("offers the measured speed first, preselected, with a and CV for the world", () => {
    const storage = memoryStorage();
    const meter = new PaceMeter();
    meter.onEvents(typedWords(25, 160));
    const measured = recordStage(storage, meter.sample("won", { keys: 800, wrongKeys: 48, strayKeys: 8 }, 0.6));
    expect(measured).not.toBeNull();
    expect(measured!.e).toBeGreaterThan(24);
    expect(measured!.e).toBeLessThan(26.5);
    expect(measured!.a).toBeCloseTo(0.93, 2);
    const { options, selected } = paceOptions(readPaceMemory(storage));
    expect(selected).toBe(0);
    const header = options[0]!.header;
    expect(header.source).toBe("measured");
    expect(header).toEqual(measuredHeader(measured!));
    expect(Number.isInteger(header.typistWpm) && Number.isInteger(header.accuracyPm) && Number.isInteger(header.cvPm)).toBe(true);
    expect(header.typistWpm).toBe(Math.round(measured!.e));
    expect(header.typistWpm).toBeGreaterThanOrEqual(24);
    expect(header.typistWpm).toBeLessThanOrEqual(26);
    expect(header.accuracyPm).toBe(930);
    expect(options).toHaveLength(PACE_PRESETS.length + 1);
  });

  it("from the pause menu preselects the speed in use, a row of its own when no preset has it (test pass 27/10)", () => {
    const storage = memoryStorage();
    const url35 = paceOptions(readPaceMemory(storage), { typistWpm: 35, source: "url" });
    expect(url35.options[url35.selected]!.header).toEqual({ typistWpm: 35, source: "pick" });
    expect(sameSpeed(url35.options[url35.selected]!.header, { typistWpm: 35, source: "url" })).toBe(true);
    const url70 = paceOptions(readPaceMemory(storage), { typistWpm: 70, source: "url" });
    const row = url70.options[url70.selected]!;
    expect(row.key).toBe(PACE_CURRENT_KEY);
    expect(row.header).toEqual({ typistWpm: 70, source: "url" });
    expect(row.label).toBe("Đang dùng: 70 WPM");
    expect(url70.options).toHaveLength(PACE_PRESETS.length + 1);
    expect(paceLabel({ typistWpm: 70, source: "url" })).toBe("70 WPM (cổng game đặt)");
    // A 75 WPM row for fast typists (test pass 26/10).
    expect(PACE_PRESETS.map((preset) => preset.wpm)).toContain(75);
  });

  it("keeps the presets on keys 1–8 before and after a measured stage; the measured row is key 0", () => {
    const storage = memoryStorage();
    const presetKeys = PACE_PRESETS.map((_, index) => index + 1);
    const before = paceOptions(readPaceMemory(storage)).options;
    expect(before.map((option) => option.key)).toEqual(presetKeys);
    const meter = new PaceMeter();
    meter.onEvents(typedWords(25, 40));
    recordStage(storage, meter.sample("lost", { keys: 200, wrongKeys: 10, strayKeys: 0 }, 0));
    const after = paceOptions(readPaceMemory(storage)).options;
    expect(after[0]!.header.source).toBe("measured");
    expect(after.map((option) => option.key)).toEqual([0, ...presetKeys]);
    // "35 WPM is key 5" holds either way (B9 steps).
    for (const list of [before, after]) expect(list.find((option) => option.key === 5)!.header).toEqual({ typistWpm: 35, source: "pick" });
  });
});
