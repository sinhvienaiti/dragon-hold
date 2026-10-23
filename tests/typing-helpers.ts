/**
 * Shared fixtures for the typing-learning tests: a deck of common words, a
 * world with foes placed by hand (spawn and movement are other lanes'), and
 * key helpers. Owner: typing-learning (LANES.md).
 */
import { STAGE_M0 } from "../src/content/data/stages";
import type { DeckWord, EnemyId, WordDeck, WordGroup } from "../src/content/types";
import { mToU } from "../src/sim/fixed";
import { stepWords, typeKey } from "../src/sim/words";
import { allocEnemy, createWorld, type EnemyState, type World, type WorldOptions } from "../src/sim/world";

/** 100 everyday words, 3–10 letters, spread over many first letters. */
export const WORDS_100 = (
  "apple about animal answer bread black bottle brother camera candle circle castle dance doctor dinner danger " +
  "early engine evening empty family farmer finger forest garden glass golden guitar happy heavy hollow honey " +
  "island insect idea iron jacket jelly jungle journey kettle kitchen kingdom knife lemon letter little lucky " +
  "market middle monkey mirror number needle nature narrow orange office ocean oven pencil pocket purple planet " +
  "quiet queen quick question rabbit river rocket ribbon summer silver simple shadow table tiger tomato travel " +
  "umbrella uncle under useful valley velvet violin visit window winter wonder yellow young zebra zero water beach cloud earth fruit"
).split(" ");

/** Groups by position: 8 new, then due, learning, known in turn. */
export function makeDeck(words: readonly string[] = WORDS_100, newCount = 8): WordDeck {
  const order: WordGroup[] = ["due", "learning", "known"];
  const list: DeckWord[] = words.map((text, index) => {
    const group: WordGroup = index < newCount ? "new" : order[index % 3]!;
    const mastery = group === "new" ? 0 : group === "due" ? 30 : group === "learning" ? 55 : 85;
    return { text, group, level: 1, mastery, recalls: group === "known" ? 3 : 0 };
  });
  return { words: list, vocabLevel: 2 };
}

export function makeWorld(options: WorldOptions = {}, seed = 7): World {
  const world = createWorld(STAGE_M0, seed, { deck: makeDeck(), typistWpm: 35, ...options });
  world.phase = "wave";
  world.wave = 1;
  return world;
}

/** A foe at (xM, zM) on lane `lane`, standing (other lanes move foes; these tests do not). */
export function placeFoe(world: World, foe: EnemyId, xM: number, zM: number, lane = 0, cluster = -1): EnemyState {
  const enemy = allocEnemy(world, foe);
  enemy.lane = lane;
  enemy.x = mToU(xM);
  enemy.z = mToU(zM);
  const laneLength = world.lanes[lane]!.length;
  enemy.along = Math.max(0, laneLength - Math.round(Math.hypot(enemy.x, enemy.z)));
  enemy.speed = 2000;
  enemy.hp = enemy.hpMax = 100;
  enemy.cluster = cluster;
  return enemy;
}

/** Runs the words system only for `ticks` ticks. */
export function advance(world: World, ticks: number): void {
  for (let k = 0; k < ticks; k += 1) {
    stepWords(world);
    world.tick += 1;
  }
}

export const code = (letter: string): number => letter.charCodeAt(0) - 97;

/** Types `text` one key per tick, wall time 150 ms a key. */
export function typeText(world: World, text: string, startMs = 0): void {
  [...text].forEach((letter, k) => {
    typeKey(world, code(letter), startMs + k * 150);
    world.tick += 1;
  });
}
