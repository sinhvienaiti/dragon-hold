import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { estimateIdle } from "../../scripts/balance/idle-estimate.mjs";

const ROOT = resolve(__dirname, "../..");
const CLI = join(ROOT, "scripts/balance/idle-estimate.mjs");
// Hand-checked audit-format rows [ms, phase, wave, words, visibleWords, liveFoes, hp], kept in this repo (222 F4).
const FIXTURE = join(ROOT, "tests/fixtures/idle-samples.json");
// Optional check against a real audit, skipped when unset or missing:
// DH_IDLE_AUDIT_SAMPLES=/abs/path/samples.json pnpm exec vitest run tests/app/idle-estimate.test.ts
const AUDIT = process.env.DH_IDLE_AUDIT_SAMPLES ?? "";
const cli = (path: string) => JSON.parse(execFileSync(process.execPath, [CLI, path], { encoding: "utf8" }));
type Row = { lookaheadSeconds: number; speed: number; noWordPct: number };
const row = (rows: Row[], lookahead: number, speed: number) => rows.find(r => r.lookaheadSeconds === lookahead && r.speed === speed)!;
it("keeps short gaps and reserves the last lookahead seconds in a long gap", () => {
  // One-second idle, one-second word, four-second idle, one-second word.
  const samples = [[0, 2, 1, 0, 0], [1000, 2, 1, 1, 1], [2000, 2, 1, 0, 0], [6000, 2, 1, 1, 1], [7000, 0, 1, 0, 0]];
  // Source intervals are capped at 500 ms, just like the original audit.
  const result = estimateIdle(samples);
  expect(result.before.waveSeconds).toBe(2);
  expect(result.before.noWordPct).toBe(50);
  expect(result.sensitivity.find(r => r.lookaheadSeconds === 1.5 && r.speed === 1.75)).toMatchObject({ noWordPct: 50 });
});
it("runs the offline command-line entrypoint on the in-repo fixture and leaves it untouched", () => {
  const before = readFileSync(FIXTURE);
  const result = cli(FIXTURE);
  // 9 s of wave; idle gaps 1.0, 3.0 (a 2 s interval capped at 0.5 s), 0.5 (wave end), 2.0 (before a break), 1.0 (trailing).
  expect(result.before).toEqual({ waveSeconds: 9, idleSeconds: 7.5, noWordPct: 83.3, gaps: 5 });
  // 1.5 s at ×1, the rest at ×1.75: 1 + (1.5 + 1.5 / 1.75) + 0.5 + (1.5 + 0.5 / 1.75) + 1 = 6.64 s of 8.14 s.
  expect(result.after).toMatchObject({ waveSeconds: 8.1, idleSeconds: 6.6, noWordPct: 81.6 });
  expect(result.sensitivity).toHaveLength(8);
  expect([row(result.sensitivity, 0, 1.75).noWordPct, row(result.sensitivity, 0, 2).noWordPct]).toEqual([74.1, 71.4]);
  expect(result).toEqual(estimateIdle(JSON.parse(before.toString("utf8"))));
  expect(readFileSync(FIXTURE)).toEqual(before);
});
it("keeps the normal suite inside the game repo: small fixture, no cwd-relative path climbing out", () => {
  expect(FIXTURE.startsWith(ROOT + "/")).toBe(true);
  expect(statSync(FIXTURE).size).toBeLessThan(50_000);
  const climbing: string[] = [];
  const scan = (dir: string): void => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, name.name);
      if (name.isDirectory()) scan(path);
      else if (/\.(ts|mjs)$/.test(name.name) && /\b(?:resolve|join|readFileSync|existsSync)\(\s*["'`]\.\.\//.test(readFileSync(path, "utf8"))) climbing.push(path.slice(ROOT.length + 1));
    }
  };
  scan(join(ROOT, "tests"));
  expect(climbing).toEqual([]);
});
it.skipIf(!AUDIT || !existsSync(AUDIT))("optional: reproduces the map1 audit figures from DH_IDLE_AUDIT_SAMPLES", () => {
  const before = readFileSync(AUDIT);
  const result = cli(AUDIT);
  expect(result.before.noWordPct).toBe(52.4);
  expect(result.after.noWordPct).toBe(47.8);
  expect(result.sensitivity).toHaveLength(8);
  expect(row(result.sensitivity, 0, 1.75).noWordPct).toBe(38.6);
  expect(readFileSync(AUDIT)).toEqual(before);
});
it("reserves 1.5 seconds only in long gaps and shrinks the wave denominator too", () => {
  const samples = Array.from({ length: 71 }, (_, i) => [i * 100, i < 70 ? 2 : 0, 1, 0, i < 10 || (i >= 20 && i < 60) ? 0 : 1]);
  const result = estimateIdle(samples);
  // Five idle seconds: 1 + (1.5 + 2.5 / 1.75). Two word seconds remain unchanged.
  expect(result.before.noWordPct).toBe(71.4);
  expect(result.after.noWordPct).toBe(66.3);
  expect(result.after.waveSeconds).toBeCloseTo(5.9, 1);
});
it("keeps idle gaps separate at wave boundaries and includes a trailing gap", () => {
  const samples = Array.from({ length: 21 }, (_, i) => [i * 100, 2, i < 10 ? 1 : 2, 0, 0]);
  expect(estimateIdle(samples).after.waveSeconds).toBe(2);
  expect(estimateIdle(samples).before.gaps).toBe(2);
});
