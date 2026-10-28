/**
 * Golden runs (05 §10, DESIGN.md §9 M0 test gate "cùng seed ra cùng mã băm"):
 * fixed seeds and fixed command logs give fixed hashWorld values every
 * `every` ticks. Each case keeps its whole command log and deck in
 * tests/golden/m0.json, so a replay checks the rules alone; running the bot
 * again checks the bots make the same log. Rewrite the file only after a
 * deliberate rule change (scripts/balance/golden-update.ts) and say why in
 * the changelog.
 * Owner: bot-balance (LANES.md).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STAGE_M0 } from "../../src/content/data/stages";
import type { DeckWord, Difficulty, SimCommand } from "../../src/content/types";
import { createWorld, hashWorldHex, step, type World } from "../../src/sim/world";
import { BOTS, createBotWorld, runBot, type BotName } from "./bot";
import { BOT_WORDS, botDeck } from "./deck";

export const GOLDEN_URL = new URL("../../tests/golden/m0.json", import.meta.url);
export const GOLDEN_PATH = fileURLToPath(GOLDEN_URL);

export interface GoldenCase {
  readonly name: string;
  /** null: no commands at all (the world alone). */
  readonly bot: BotName | null;
  readonly seed: number;
  readonly ticks: number;
  readonly every: number;
  /** Difficulty (default normal) and the pace director (default the bot's own, on). */
  readonly difficulty?: Difficulty;
  readonly director?: boolean;
}

/**
 * Three minutes of the idle world, the 35 WPM bot and the no-typing bot at
 * Thường with the director on; and (round 3) seven minutes of the Ẩu bot at Khó
 * with the director off, whose slips let go of locks with Esc (`release`), so
 * the Esc rule (01 §3.3, wrong keys kept) and both other modes are in a replay.
 */
export const GOLDEN_CASES: readonly GoldenCase[] = [
  { name: "idle", bot: null, seed: STAGE_M0.seed, ticks: 600, every: 60 },
  { name: "b35-seed1", bot: "b35", seed: 1, ticks: 3 * 60 * 60, every: 300 },
  { name: "noTyping-seed2", bot: "noTyping", seed: 2, ticks: 3 * 60 * 60, every: 300 },
  { name: "sloppy-hard-off-seed3", bot: "sloppy", seed: 3, ticks: 7 * 60 * 60, every: 600, difficulty: "hard", director: false },
];

export type LogEntry = readonly [tick: number, command: SimCommand];

export interface GoldenResult {
  readonly name: string;
  readonly bot: BotName | null;
  readonly seed: number;
  readonly ticks: number;
  readonly every: number;
  readonly difficulty?: Difficulty;
  readonly director?: boolean;
  readonly hashes: readonly string[];
  readonly final: string;
  readonly log: readonly LogEntry[];
}

export interface GoldenFile {
  readonly stage: string;
  readonly deck: readonly DeckWord[];
  readonly cases: readonly GoldenResult[];
}

/** A case's difficulty and director, as run options (left out when the case keeps the defaults). */
const modeOf = (spec: Pick<GoldenCase, "difficulty" | "director">) => ({
  ...(spec.difficulty === undefined ? {} : { difficulty: spec.difficulty }),
  ...(spec.director === undefined ? {} : { paceDirector: spec.director }),
});

/** The world a case runs on: the bot's own options (bot.ts createBotWorld), or the stage defaults for the idle case. */
function caseWorld(spec: Pick<GoldenCase, "bot" | "seed" | "difficulty" | "director">, words: readonly DeckWord[]): World {
  const deck = botDeck(words);
  return spec.bot === null ? createWorld(STAGE_M0, spec.seed, { deck, ...modeOf(spec) }) : createBotWorld(BOTS[spec.bot], { seed: spec.seed, deck, ...modeOf(spec) });
}

/** Runs one case now: the bot (or nothing) for `ticks`, hashing every `every`. */
export function runGoldenCase(spec: GoldenCase, words: readonly DeckWord[] = BOT_WORDS): GoldenResult {
  if (spec.bot === null) {
    const replayed = replayGoldenCase({ ...spec, hashes: [], final: "", log: [] }, words);
    return { ...spec, ...replayed, log: [] };
  }
  const run = runBot(BOTS[spec.bot], { seed: spec.seed, deck: botDeck(words), maxTicks: spec.ticks, hashEvery: spec.every, keepLog: true, stallStop: false, ...modeOf(spec) });
  return { ...spec, ticks: run.ticks, hashes: run.hashes, final: run.finalHash, log: run.log.map((entry) => [entry.tick, entry.command] as const) };
}

/** Replays a stored case's log on a fresh world: its hashes and final hash, which must match the stored ones. */
export function replayGoldenCase(stored: GoldenResult, words: readonly DeckWord[]): { hashes: string[]; final: string } {
  const world = caseWorld(stored, words);
  const hashes: string[] = [];
  let at = 0;
  const batch: SimCommand[] = [];
  while (world.tick < stored.ticks) {
    batch.length = 0;
    while (at < stored.log.length && stored.log[at]![0] <= world.tick) batch.push(stored.log[at++]![1]);
    step(world, batch);
    world.events.drain();
    if (world.tick % stored.every === 0) hashes.push(hashWorldHex(world));
  }
  return { hashes, final: hashWorldHex(world) };
}

export function readGolden(): GoldenFile {
  return JSON.parse(readFileSync(GOLDEN_URL, "utf8")) as GoldenFile;
}

export function buildGolden(words: readonly DeckWord[] = BOT_WORDS): GoldenFile {
  return { stage: STAGE_M0.id, deck: words, cases: GOLDEN_CASES.map((spec) => runGoldenCase(spec, words)) };
}

/** The golden file as text: one case field per line, the log one command per line (diffs stay readable). */
export function goldenText(file: GoldenFile): string {
  const cases = file.cases.map((result) =>
    [
      "  {",
      '   "name": ' + JSON.stringify(result.name) + ",",
      '   "bot": ' + JSON.stringify(result.bot) + ",",
      '   "seed": ' + result.seed + ",",
      '   "ticks": ' + result.ticks + ",",
      '   "every": ' + result.every + ",",
      ...(result.difficulty === undefined ? [] : ['   "difficulty": ' + JSON.stringify(result.difficulty) + ","]),
      ...(result.director === undefined ? [] : ['   "director": ' + JSON.stringify(result.director) + ","]),
      '   "final": ' + JSON.stringify(result.final) + ",",
      '   "hashes": ' + JSON.stringify(result.hashes) + ",",
      '   "log": [' + (result.log.length === 0 ? "]" : "\n" + result.log.map((entry) => "    " + JSON.stringify(entry)).join(",\n") + "\n   ]"),
      "  }",
    ].join("\n"),
  );
  return '{\n "stage": ' + JSON.stringify(file.stage) + ',\n "deck": ' + JSON.stringify(file.deck) + ',\n "cases": [\n' + cases.join(",\n") + "\n ]\n}\n";
}
