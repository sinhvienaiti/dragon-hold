import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { estimateIdle } from "../../scripts/balance/idle-estimate.mjs";
it("keeps short gaps and reserves the last lookahead seconds in a long gap", () => {
  // One-second idle, one-second word, four-second idle, one-second word.
  const samples = [[0, 2, 1, 0, 0], [1000, 2, 1, 1, 1], [2000, 2, 1, 0, 0], [6000, 2, 1, 1, 1], [7000, 0, 1, 0, 0]];
  // Source intervals are capped at 500 ms, just like the original audit.
  const result = estimateIdle(samples);
  expect(result.before.waveSeconds).toBe(2);
  expect(result.before.noWordPct).toBe(50);
  expect(result.sensitivity.find(r => r.lookaheadSeconds === 1.5 && r.speed === 1.75)).toMatchObject({ noWordPct: 50 });
});
it("reproduces the audit before figure through the offline command-line entrypoint", () => {
  const path = resolve("../dragon-hold/tmp/map1-audit/feel-35-1280/samples.json");
  const before = readFileSync(path);
  const result = JSON.parse(execFileSync(process.execPath, ["scripts/balance/idle-estimate.mjs", path], { encoding: "utf8" }));
  expect(result.before.noWordPct).toBe(52.4);
  expect(result.after.noWordPct).toBe(47.8);
  expect(result.sensitivity).toHaveLength(8);
  expect(result.sensitivity.find((r: { lookaheadSeconds: number; speed: number }) => r.lookaheadSeconds === 0 && r.speed === 1.75).noWordPct).toBe(38.6);
  expect(readFileSync(path)).toEqual(before);
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
