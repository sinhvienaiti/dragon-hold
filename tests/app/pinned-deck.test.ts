import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createLearningClient } from "../../src/app/learning";
import { STAGE_M0 } from "../../src/content/data/stages";
import { clearVocabularyRuntimeCache } from "../../src/kit/vocab";
import type { LearningBridge } from "../../src/kit/learning";

afterEach(() => { vi.unstubAllGlobals(); clearVocabularyRuntimeCache(); });
it("builds cold decks of at least 70 from pinned vocabulary at levels 1–100, with both mature filters", async () => {
  vi.stubGlobal("fetch", async (url: string) => ({ ok: true, json: async () => JSON.parse(readFileSync(resolve("public", url.replace(/^\//, "")), "utf8")) }));
  const counts: { level: number; excludeMature: boolean; count: number }[] = [];
  for (const excludeMature of [false, true]) for (let level = 1; level <= 100; level += 1) {
    clearVocabularyRuntimeCache();
    const client = createLearningClient({ vocabLevel: level, excludeMature,
      bridge: { dispose: () => {}, lookup: async () => { throw Error("offline"); } } as unknown as LearningBridge,
      storage: { readJson: () => null, writeJson: () => true }, every: () => () => {},
    });
    try { counts.push({ level, excludeMature, count: (await client.buildDeck(STAGE_M0)).words.length }); }
    finally { client.dispose(); }
  }
  console.log("Pinned cold deck counts: " + JSON.stringify(counts));
  expect(counts.filter(({ count }) => count < 70)).toEqual([]);
});
