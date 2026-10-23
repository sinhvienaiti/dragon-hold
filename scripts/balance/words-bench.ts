/**
 * The typist against the game's own words store (src/sim/words.ts), with no
 * battle: unkillable foes stand still inside the Word Zone of an M0 world, the store
 * deals them words by its rules (lengths by E, first letters, next words
 * soft-locked), and the bot types. Measures words a minute against C(E),
 * grades, wrong keys, lock switches: what the typist really meets in a run.
 * Script side: floats are fine here.
 *   tsx scripts/balance/words-bench.ts [--wpm=35] [--seconds=300]
 * Owner: bot-balance (LANES.md).
 */
import { createRng } from "../../src/kit/platform";
import type { FoeId, Grade, WordGroup } from "../../src/content/types";
import { mToU } from "../../src/sim/fixed";
import { pointAt } from "../../src/sim/lanes";
import { allocEnemy, step, type World } from "../../src/sim/world";
import { BOTS, TICK_MS, createBotWorld, type BotSpec } from "./bot";
import { BASE_LATENCY_MS, Hands, capacity, dOf, type HandsSpec } from "./hands";
import { readTyping } from "./reader";
import { Typist } from "./typist";

export interface WordsBench {
  readonly seconds: number;
  readonly assigned: number;
  readonly words: number;
  readonly wordsPerMin: number;
  /** C(E) at the mixed deck's d and the mean length met (00 §4.3). */
  readonly capacityPerMin: number;
  /** C(E) for the very words typed, each with its length and group's d (as calibrate.ts). */
  readonly formulaPerMin: number;
  readonly meanLetters: number;
  readonly grades: Partial<Record<Grade, number>>;
  readonly keys: number;
  readonly wrongPct: number;
  readonly switches: number;
  readonly strays: number;
}

/**
 * Stands `count` still foes on the ground lanes, 6–14 m in from the lane ends,
 * alternating lanes, with HP no word reaches: medium foes by default, since a
 * small foe always falls to one word (00 §4.6) and would leave the bench.
 */
export function standFoes(world: World, count: number, foe: FoeId = "tusk-boar"): void {
  const ground = world.lanes.filter((lane) => !lane.sky);
  const point = { x: 0, z: 0 };
  for (let k = 0; k < count; k += 1) {
    const lane = ground[k % ground.length]!;
    const enemy = allocEnemy(world, foe);
    const along = Math.max(0, lane.length - mToU(6 + 2 * Math.floor(k / ground.length)));
    pointAt(lane, along, 0, point);
    Object.assign(enemy, { lane: lane.index, along, x: point.x, z: point.z, hp: 90_000, hpMax: 90_000, speed: 0, mode: "hold" });
  }
}

export function typeAgainstWords(hands: HandsSpec, options: { seconds?: number; seed?: number; foes?: number } = {}): WordsBench {
  const seconds = options.seconds ?? 300;
  const spec: BotSpec = { ...BOTS.b35, hands };
  const world = createBotWorld(spec, { seed: options.seed ?? 1 });
  standFoes(world, options.foes ?? 8);
  const typist = new Typist(new Hands(hands, createRng(options.seed ?? 1).ai));
  const grades: Partial<Record<Grade, number>> = {};
  let assigned = 0;
  let words = 0;
  let letters = 0;
  let keys = 0;
  let wrong = 0;
  let switches = 0;
  let strays = 0;
  let pair = -1;
  let formulaS = 0;
  const groups = new Map<number, WordGroup>();
  const ticks = Math.round(seconds * 60);
  while (world.tick < ticks) {
    const command = typist.act(readTyping(world, spec.aim, pair), world.tick * TICK_MS);
    // A bench, not a battle: the foes may strike, the Fire Dragon never falls.
    world.hero.hp = world.hero.hpMax;
    step(world, command ? [command] : []);
    for (const event of world.events.drain()) {
      if (event.type === "word-assigned") {
        assigned += 1;
        groups.set(event.word, event.group);
      }
      else if (event.type === "word-progress") {
        pair = event.key === "pair" ? event.letter : -1;
        if (event.key !== "back") keys += 1;
        if (event.key === "wrong") wrong += 1;
        if (event.key === "switch") switches += 1;
        if (event.key === "stray") strays += 1;
      } else if (event.type === "word-complete") {
        words += 1;
        letters += event.text.length;
        formulaS += BASE_LATENCY_MS / 1000 + (12 * (event.text.length + 1)) / (hands.wpm * dOf(groups.get(event.word) ?? "known"));
        grades[event.grade] = (grades[event.grade] ?? 0) + 1;
      }
    }
  }
  const meanLetters = words === 0 ? 0 : letters / words;
  return {
    seconds,
    assigned,
    words,
    wordsPerMin: words / (seconds / 60),
    capacityPerMin: capacity(hands.wpm, undefined, meanLetters || undefined),
    formulaPerMin: words === 0 ? 0 : 60 / (formulaS / words),
    meanLetters,
    grades,
    keys,
    wrongPct: keys === 0 ? 0 : (wrong * 100) / keys,
    switches,
    strays,
  };
}

if (process.argv[1] && /words-bench\.ts$/.test(process.argv[1])) {
  const arg = (name: string, fallback: number) => Number(process.argv.find((a) => a.startsWith("--" + name + "="))?.split("=")[1] ?? fallback);
  const wpm = arg("wpm", 35);
  console.log(JSON.stringify(typeAgainstWords({ wpm, accuracy: wpm >= 60 ? 0.97 : 0.95, backspace: 0.1, latencyMs: BASE_LATENCY_MS }, { seconds: arg("seconds", 300) }), null, 1));
}
