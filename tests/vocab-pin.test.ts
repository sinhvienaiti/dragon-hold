import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { candidatesFrom, createLearningClient, saveVocabLevel } from "../src/app/learning";
import { STAGE_M0 } from "../src/content/data/stages";
import type { LearningBridge } from "../src/kit/learning";
import { clearVocabularyRuntimeCache, filterVocabularyEntries, parseVocabularyIndex, type VocabularyEntry } from "../src/kit/vocab";

const root = fileURLToPath(new URL("..", import.meta.url));
const vocabulary = join(root, "public/vocabulary");
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const config = readJson(join(root, "vocab.config.json")) as { pin: string; files: string[] };
const manifest = readJson(join(vocabulary, "vocab-manifest.json")) as { pin: string; version: number; files: Record<string, string> };
const index = parseVocabularyIndex(readJson(join(vocabulary, "index.json")));

function kitLevelLimit(): number {
  // The kit has no exported limit: read its curriculum guards, never duplicate their number.
  const source = readFileSync(join(root, "src/kit/vocab/vocabulary.ts"), "utf8");
  const limits = [...source.matchAll(/\b(?:level|item\.level)\s*<=\s*(\d+)/g)].map((match) => Number(match[1]));
  expect(limits.length, "kit curriculum level guards must be explicit").toBeGreaterThan(0);
  expect(new Set(limits).size, "kit curriculum guards must agree").toBe(1);
  return limits[0]!;
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe("pinned vocabulary (G7)", () => {
  it("includes the complete ordered inventory and every configured file", () => {
    const expected = ["index.json", ...Array.from({ length: kitLevelLimit() }, (_, i) => `levels/${String(i + 1).padStart(3, "0")}.json`), "ATTRIBUTION.md"];
    expect(config.files).toEqual(expected);
    expect(filesUnder(vocabulary).map((path) => path.slice(vocabulary.length + 1)).sort()).toEqual([...expected, "vocab-manifest.json"].sort());
    for (const file of config.files) expect(existsSync(join(vocabulary, file)), file).toBe(true);
  });

  it("agrees on the full commit pin and index version", () => {
    expect(config.pin).toMatch(/^[a-f0-9]{40}$/);
    expect(manifest.pin).toBe(config.pin);
    expect(manifest.version).toBe(index.version);
  });

  it("matches every SHA-256 and keeps a sorted, formatted manifest", () => {
    expect(Object.keys(manifest)).toEqual(["pin", "version", "files"]);
    expect(Object.keys(manifest.files)).toEqual([...config.files].sort());
    expect(readFileSync(join(vocabulary, "vocab-manifest.json"), "utf8")).toBe(JSON.stringify(manifest, null, 2) + "\n");
    for (const file of config.files) {
      const hash = createHash("sha256").update(readFileSync(join(vocabulary, file))).digest("hex");
      expect(manifest.files[file], file).toBe(hash);
    }
  });

  it("covers the kit's entire curriculum using each index file field", () => {
    const limit = kitLevelLimit();
    expect(index.plannedLevels).toBe(limit);
    expect(index.availableLevels).toBe(limit);
    expect(index.levels.map((level) => level.level)).toEqual(Array.from({ length: limit }, (_, i) => i + 1));
    for (const level of index.levels) {
      expect(config.files, level.file).toContain(level.file);
      expect(existsSync(join(vocabulary, level.file)), level.file).toBe(true);
    }
  });

  it("keeps each level nonempty after adult and child filtering and deck selection", () => {
    for (const level of index.levels) {
      const document = readJson(join(vocabulary, level.file)) as { entries: VocabularyEntry[] };
      for (const excludeMature of [false, true]) {
        expect(filterVocabularyEntries(document.entries, { excludeMature }).length, level.file).toBeGreaterThan(0);
        expect(candidatesFrom(document.entries, new Map(), excludeMature).length, level.file).toBeGreaterThan(0);
      }
    }
  });

  it("loads only pinned files for every supported saved level and its next-level candidate", async () => {
    const requests: string[] = [];
    const bridge = { lookup: async () => [], sendAttempt: () => {}, dispose: () => {} } as unknown as LearningBridge;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url.startsWith("/vocabulary/")).toBe(true);
      const file = url.slice("/vocabulary/".length);
      requests.push(file);
      expect(config.files, url).toContain(file);
      return new Response(readFileSync(join(vocabulary, file), "utf8"));
    }));
    try {
      for (let level = 1; level <= kitLevelLimit(); level += 1) {
        requests.length = 0;
        clearVocabularyRuntimeCache();
        const saved = new Map<string, unknown>();
        const storage = {
          readJson: (key: string) => saved.get(key),
          writeJson: (key: string, value: unknown) => (saved.set(key, value), true),
        };
        saveVocabLevel(level, storage);
        const client = createLearningClient({ storage, bridge, speak: () => {}, every: () => () => {} });
        try {
          const deck = await client.buildDeck(STAGE_M0);
          expect(deck.words.length, `saved level ${level}`).toBeGreaterThan(0);
          // defaultEntries filters [L, L+1] through the index before requesting a file.
          const loaded = index.levels.filter((item) => item.level === level || item.level === level + 1);
          expect(requests).toEqual(["index.json", ...loaded.map((item) => item.file)]);
        } finally {
          client.dispose();
        }
      }
    } finally {
      vi.unstubAllGlobals();
      clearVocabularyRuntimeCache();
    }
  });

  it("contains no parent vocabulary path outside the copied kit", () => {
    const needle = "shared" + "/vocabulary";
    const files = [
      ...filesUnder(join(root, "src")).filter((path) => !path.startsWith(join(root, "src/kit") + "/")),
      ...filesUnder(join(root, "tests")),
      ...filesUnder(join(root, "scripts")),
      join(root, "vite.config.ts"),
    ];
    const matches = files.filter((path) => readFileSync(path, "utf8").includes(needle));
    expect(matches.map((path) => path.slice(root.length))).toEqual([]);
  });
});
