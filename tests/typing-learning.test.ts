import { describe, expect, it } from "vitest";
import { STAGE_M0 } from "../src/content/data/stages";
import { LEARNING } from "../src/content/rules";
import type { SimEvent } from "../src/content/types";
import { Pronouncer, candidatesFrom, createLearningClient, isRightRecall, localRecord, parseLookup, typedWordEvent, type LearningClient } from "../src/app/learning";
import { createLearningBridge, type LearningBridge, type LearningEvent } from "../src/kit/learning";
import type { VocabularyEntry } from "../src/kit/vocab";
import { buildWordDeck, newWordsOf, type DeckCandidate } from "../src/typing/deck";
import { FrameQueue, frameVisible, shortMeaning, wordLevel, type FrameWord } from "../src/ui/learning-frame";
import { WORDS_100 } from "./typing-helpers";

type Complete = Extract<SimEvent, { type: "word-complete" }>;
const complete = (text: string, errors: number, scored: boolean, extra: Partial<Complete> = {}): Complete => ({
  type: "word-complete", tick: 1, word: 0, text, kind: "enemy", grade: errors === 0 ? "perfect" : errors === 1 ? "ok" : "sloppy", errors, keyTicks: 40,
  responseMs: 640, target: null, activity: "typing-enemy", scored, hintUsed: false, ...extra,
});

function memoryStorage() {
  const data = new Map<string, unknown>();
  return { data, readJson: (key: string) => (data.has(key) ? structuredClone(data.get(key)) : null), writeJson: (key: string, value: unknown) => (data.set(key, structuredClone(value)), true) };
}

function fakeBridge(lookup: (ids: readonly string[]) => Promise<unknown> = () => Promise.reject(new Error("no-portal"))) {
  const sent: LearningEvent[] = [];
  const bridge = { sendAttempt: (event: LearningEvent) => sent.push(event), lookup, dispose: () => {} } as unknown as LearningBridge;
  return { bridge, sent };
}

function client(options: Partial<Parameters<typeof createLearningClient>[0]> = {}): { client: LearningClient; sent: LearningEvent[]; spoken: string[]; clock: { t: number } } {
  const { bridge, sent } = fakeBridge();
  const spoken: string[] = [];
  const clock = { t: 1_000_000 };
  return {
    client: createLearningClient({ bridge, storage: memoryStorage(), now: () => clock.t, speak: (text) => spoken.push(text), every: () => () => {}, ...options }),
    sent,
    spoken,
    clock,
  };
}

describe("learning events (01 §6.6, 00 D14)", () => {
  it("builds a dragon-hold event: correct only with no wrong key", () => {
    const right = typedWordEvent(complete("river", 0, true), false, "2026-10-23T00:00:00.000Z");
    expect(right).toMatchObject({ version: 1, gameId: "dragon-hold", entityType: "vocabulary", entityId: "river", activityType: "typing-enemy", result: "correct", responseMs: 640, hintUsed: false, replayUsed: false, expectedAnswer: "river" });
    expect(right.errorType).toBeUndefined();
    const wrong = typedWordEvent(complete("river", 1, true, { hintUsed: true }), true, "2026-10-23T00:00:00.000Z");
    expect(wrong).toMatchObject({ result: "wrong", errorType: "spelling", hintUsed: true, replayUsed: true });
  });

  it("sends exactly one scored event per word per stage, in batches", () => {
    const { client: learning, sent } = client();
    learning.onEvents([complete("river", 0, true), complete("tiger", 2, true), complete("river", 0, false), complete("river", 1, false)]);
    expect(sent).toHaveLength(0);
    expect(learning.pending).toBe(2);
    learning.flush();
    expect(sent.map((event) => [event.entityId, event.result])).toEqual([["river", "correct"], ["tiger", "wrong"]]);
    learning.onEvents([complete("tiger", 0, false), { type: "wave-end", tick: 2, wave: 1, bonusGold: 0 }]);
    expect(sent).toHaveLength(2);
  });

  it("sends at wave end, run end and on its 5 s timer", () => {
    let tick: () => void = () => {};
    const { bridge, sent } = fakeBridge();
    const learning = createLearningClient({ bridge, storage: memoryStorage(), every: (ms, run) => (expect(ms).toBe(LEARNING.batchMs), (tick = run), () => {}) });
    learning.onEvents([complete("apple", 0, true)]);
    tick();
    expect(sent).toHaveLength(1);
    learning.onEvents([complete("bread", 0, true), { type: "victory", tick: 3, stars: 3 }]);
    expect(sent).toHaveLength(2);
  });

  it("always sends recall answers (Học trước, Thẻ Ôn)", () => {
    const { client: learning, sent } = client();
    learning.recordRecall("river", true, { responseMs: 900 });
    learning.recordRecall("river", false, { userAnswer: "rivre" });
    learning.flush();
    expect(sent.map((event) => [event.activityType, event.result])).toEqual([["review-card", "correct"], ["review-card", "wrong"]]);
    expect(sent[1]!.userAnswer).toBe("rivre");
  });

  it("never counts a Học trước copy as a recall (00 D14, G12): copy + one Thẻ Ôn + two kills stay under 70", () => {
    const storage = memoryStorage();
    const { bridge, sent } = fakeBridge();
    const learning = createLearningClient({ bridge, storage, every: () => () => {} });
    // Học trước shows the word: the app sends its answers with hintUsed.
    learning.recordRecall("place", true, { responseMs: 900, hintUsed: true });
    learning.recordRecall("place", true, { responseMs: 1200 });
    learning.onEvents([complete("place", 0, true), complete("place", 0, false)]);
    learning.flush();
    expect(sent.map((event) => [event.activityType, event.result, event.hintUsed])).toEqual([
      ["review-card", "correct", true],
      ["review-card", "correct", false],
      ["typing-enemy", "correct", false],
    ]);
    const record = (storage.readJson("dragon-hold:words:v1") as Record<string, { typedRight: number; typedWrong: number; recalls: number; lastSeen: number }>)["place"]!;
    expect(record.recalls).toBe(1);
    const view = localRecord(record, record.lastSeen);
    expect(view.recalls).toBeLessThanOrEqual(1);
    expect(view.mastery).toBeLessThan(LEARNING.knownMastery);
  });

  it("sends Học trước as review-card with hintUsed (01 §6.6: its meaning and IPA show while typed) and never counts it as a recall, here or from the portal", () => {
    const storage = memoryStorage();
    const { bridge, sent } = fakeBridge();
    const learning = createLearningClient({ bridge, storage, every: () => () => {} });
    // As app.ts wires Học trước: no activity given, hintUsed set.
    learning.recordRecall("place", true, { responseMs: 900, userAnswer: "place", hintUsed: true });
    learning.recordRecall("place", false, { responseMs: 1500, userAnswer: "plase", hintUsed: true });
    learning.flush();
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ gameId: "dragon-hold", entityType: "vocabulary", entityId: "place", activityType: "review-card", result: "correct", hintUsed: true, responseMs: 900, userAnswer: "place", expectedAnswer: "place" });
    expect(sent[1]).toMatchObject({ activityType: "review-card", result: "wrong", errorType: "spelling", hintUsed: true, userAnswer: "plase" });
    expect((storage.readJson("dragon-hold:words:v1") as Record<string, { recalls: number }>)["place"]!.recalls).toBe(0);
    // The same events read back from the portal's samples: only the Thẻ Ôn answer without a hint is a recall.
    const samples = [
      { activityType: "review-card", result: "correct", hintUsed: true },
      { activityType: "review-card", result: "correct", hintUsed: false },
      { activityType: "review-card", result: "correct" },
      { activityType: "review-card", result: "wrong", hintUsed: false },
    ];
    expect(parseLookup([{ entityId: "place", mastery: 50, recentSamples: samples }], 0).get("place")!.recalls).toBe(2);
    expect([isRightRecall("review-card", "correct", true), isRightRecall("meaning-recall", "correct", false), isRightRecall("typing-enemy", "correct", false)]).toEqual([false, true, false]);
  });

  it("queues events locally when there is no portal parent", () => {
    const storage = memoryStorage();
    const bridge = createLearningBridge({ gameId: "dragon-hold", storage });
    expect(bridge.embedded).toBe(false);
    const learning = createLearningClient({ bridge, storage, every: () => () => {} });
    learning.onEvents([complete("river", 0, true)]);
    learning.flush();
    expect(bridge.queued().map((event) => event.entityId)).toEqual(["river"]);
    learning.dispose();
  });
});

describe("the stage deck (01 §6.1, 00 D15)", () => {
  const entry = (en: string, level = 1): VocabularyEntry & { level: number } => ({ id: en, en, vi: "nghĩa của " + en, ipa: "/" + en + "/", level });

  it("keeps sensitive words, phrases and non a–z words out", () => {
    const entries = ["river", "damn", "sex", "ice cream", "café", "a", "hippopotamus", "kill", "River", "tiger"].map((en) => entry(en));
    expect(candidatesFrom(entries, new Map()).map((c) => c.text)).toEqual(["river", "kill", "tiger"]);
    expect(candidatesFrom(entries, new Map(), true).map((c) => c.text)).toEqual(["river", "tiger"]);
  });

  it("builds 90 words: ≤ 8 new and the group shares of 01 §6.1", () => {
    const candidates: DeckCandidate[] = WORDS_100.map((text, index) => {
      const kind = index % 5;
      return { text, level: 1, isNew: kind === 0, mastery: kind === 1 ? 20 : kind === 2 ? 55 : 85, due: kind === 1, recalls: kind === 4 ? 2 : 0 };
    });
    let seed = 1;
    const pick = (min: number, max: number) => min + ((seed = (seed * 48271) % 2147483647) % (max - min + 1));
    const deck = buildWordDeck(candidates, 2, pick);
    expect(deck.words).toHaveLength(90);
    const count = (group: string) => deck.words.filter((word) => word.group === group).length;
    expect(count("new")).toBe(8);
    expect(newWordsOf(deck)).toHaveLength(8);
    expect(count("due")).toBeGreaterThanOrEqual(20);
    expect(new Set(deck.words.map((word) => word.text)).size).toBe(90);
    seed = 1;
    expect(buildWordDeck(candidates, 2, pick)).toEqual(deck);
  });

  it("cold start: the first 50 words stand in as known, still 8 new", () => {
    const candidates: DeckCandidate[] = WORDS_100.map((text) => ({ text, level: 1, isNew: true, mastery: 0, due: false, recalls: 0 }));
    const deck = buildWordDeck(candidates, 1, (min) => min);
    expect(deck.words.filter((word) => word.group === "known")).toHaveLength(50);
    expect(deck.words.filter((word) => word.group === "new")).toHaveLength(8);
  });

  it("asks the portal, falls back to this device's records, and keeps sensitive words out", async () => {
    const entries = [...WORDS_100, "damn", "shit"].map((en) => entry(en));
    const looked: string[][] = [];
    const { bridge } = fakeBridge(async (ids) => {
      looked.push([...ids]);
      return { items: [{ entityId: "river", mastery: 80, recentAnswers: [{ activityType: "review-card", result: "correct" }, { activityType: "listening", result: "correct" }] }] };
    });
    const learning = createLearningClient({ bridge, storage: memoryStorage(), loadEntries: async () => entries, every: () => () => {} });
    const deck = await learning.buildDeck(STAGE_M0);
    expect(looked[0]!.length).toBeLessThanOrEqual(200);
    expect(deck.words.some((word) => word.text === "damn" || word.text === "shit")).toBe(false);
    const river = deck.words.find((word) => word.text === "river");
    if (river) expect(river).toMatchObject({ group: "known", mastery: 80, recalls: 2 });
    expect(deck.words.filter((word) => word.group === "new").length).toBeLessThanOrEqual(8);
    expect(learning.gloss("river")).toEqual({ vi: "nghĩa của river", ipa: "/river/" });

    const offline = createLearningClient({ bridge: fakeBridge().bridge, storage: memoryStorage(), loadEntries: async () => entries, every: () => () => {} });
    const coldDeck = await offline.buildDeck(STAGE_M0);
    expect(coldDeck.words.length).toBeGreaterThanOrEqual(70);
  });

  it("counts recalls from recent answers, never copy typing", () => {
    const records = parseLookup([{ entityId: "Tiger", mastery: 92, recentAnswers: [{ activityType: "typing-enemy", result: "correct" }, { activityType: "meaning-recall", result: "correct" }] }], 0);
    expect(records.get("tiger")).toEqual({ mastery: 92, due: false, recalls: 1 });
    expect(localRecord({ typedRight: 9, typedWrong: 0, recalls: 0, lastSeen: 0 }, 0).mastery).toBe(60);
  });
});

describe("learning frame (01 §6.3)", () => {
  const word = (text: string, level: FrameWord["level"], mastery = 50): FrameWord => ({ text, level, mastery, vi: "nghĩa " + text, ipa: "/" + text + "/" });

  it("hides the meaning by right recalls, not by raw mastery", () => {
    expect(wordLevel({ group: "known", recalls: 0, mastery: 95 })).toBe("unremembered");
    expect(wordLevel({ group: "learning", recalls: 2, mastery: 60 })).toBe("remembered");
    expect(wordLevel({ group: "known", recalls: 2, mastery: 70 })).toBe("known");
    expect(wordLevel({ group: "new", recalls: 5, mastery: 90 })).toBe("new");
    const q = new FrameQueue("recalls");
    q.lock(word("river", "unremembered", 95), 1, false);
    expect(q.view(0)).toMatchObject({ meaning: "nghĩa river", ipa: "/river/", typed: 1, done: false });
    q.lock(word("tiger", "remembered"), 0, false);
    expect(q.view(0)).toMatchObject({ meaning: "", ipa: "/tiger/" });
    q.progress("tiger", 3, true);
    expect(q.view(0)!.meaning).toBe("nghĩa tiger");
    q.lock(word("zebra", "known"), 0, false);
    expect(q.view(0)).toBeNull();
  });

  it("clears the pinned card at a wave's end and hides while a learning panel asks (no Thẻ Ôn answer on screen)", () => {
    const q = new FrameQueue("recalls");
    q.done(word("place", "new", 0), 0);
    expect(q.view(100)).toMatchObject({ text: "place", done: true });
    q.clearCard();
    expect(q.view(100)).toBeNull();
    // The Vừa học line keeps the word for later, but the frame is covered while a panel is open.
    expect(q.recent.map((item) => item.text)).toEqual(["place"]);
    expect(frameVisible(true)).toBe(false);
    expect(frameVisible(false)).toBe(true);
  });

  it("pins new and weak words 2.5 s, others 0.8 s; keeps the last 3 new words", () => {
    const q = new FrameQueue("recalls");
    q.done(word("apple", "new", 0), 0);
    q.lock(word("bread", "unremembered", 60), 1, false);
    expect(q.view(2000)).toMatchObject({ text: "apple", done: true, meaning: "nghĩa apple" });
    expect(q.view(LEARNING.pinNewMs)).toMatchObject({ text: "bread", done: false });
    q.done(word("bread", "unremembered", 60), 3000);
    expect(q.view(3000 + LEARNING.holdOtherMs - 1)).toMatchObject({ text: "bread", done: true });
    expect(q.view(3000 + LEARNING.holdOtherMs)).toBeNull();
    for (const text of ["cat", "dog", "egg", "fig"]) q.done(word(text, "new", 0), 9000);
    expect(q.recent.map((item) => item.text)).toEqual(["fig", "egg", "dog"]);
    expect(shortMeaning("tốt; hay")).toBe("tốt");
    expect(shortMeaning("một cái tên rất dài hơn hai mươi hai ký tự")).toHaveLength(LEARNING.meaningMaxChars);
    // Whole senses, never a cut word (test pass 26/10: "yêu, thương, yêu thươ…").
    expect(shortMeaning("yêu, thương, yêu thương")).toBe("yêu, thương");
  });

  it("speaks on one channel: ≥ 2.5 s apart, drops what waited 2 s, new words first", () => {
    const spoken: string[] = [];
    let t = 0;
    const p = new Pronouncer((text) => spoken.push(text), () => t);
    p.request("weak", 2);
    p.request("other", 3);
    expect(spoken).toEqual(["weak"]);
    t = 1000;
    p.request("fresh", 1);
    t = 2500;
    p.tick();
    expect(spoken).toEqual(["weak", "fresh"]);
    t = 6000;
    p.tick();
    expect(spoken).toEqual(["weak", "fresh"]);
    expect(p.waiting).toBe(0);
  });

  it("picks Thẻ Ôn questions: sloppy words, then hinted, then new, at most 3", () => {
    const { client: learning } = client();
    learning.onEvents([
      { type: "wave-start", tick: 0, wave: 2, waves: 10, lanes: ["cau"], generals: [] },
      complete("apple", 0, true),
      complete("bread", 0, true, { hintUsed: true }),
      complete("candle", 3, true, { grade: "sloppy" }),
      complete("dance", 0, true, { hintUsed: true }),
    ]);
    expect(learning.reviewItems(2).map((item) => item.text)).toEqual(["candle", "bread", "dance"]);
    expect(learning.reviewItems(1)).toEqual([]);
  });
});
