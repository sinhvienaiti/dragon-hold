/**
 * What a bot sees, read from the world the way a player reads the screen:
 * the live words (text, letters typed, the foe under each), the lock, and
 * each foe's threat (01 §3.2: 10 / seconds to the dais × tier factor, +6
 * attacking). The words store is read through the LANES.md contract
 * (`world.words.live` of LiveWord, `world.words.lock`); this file is the only
 * place that knows it. Script side: floats are fine here.
 * Owner: bot-balance (LANES.md).
 */
import { ENEMIES } from "../../src/content/data/enemies";
import { GENERALS } from "../../src/content/data/generals";
import { WORDS } from "../../src/content/rules";
import type { FoeId, WordGroup, WordKind } from "../../src/content/types";
import { U_PER_M } from "../../src/sim/fixed";
import type { LiveWord } from "../../src/sim/words";
import { enemyAt, type EnemyState, type World } from "../../src/sim/world";

/** A live word as the typist sees it. */
export interface SeenWord {
  readonly slot: number;
  readonly text: string;
  readonly kind: WordKind;
  readonly group: WordGroup;
  /** Letters typed on it (the lock's progress). */
  readonly typed: number;
  readonly asleep: boolean;
  /** Higher first. */
  readonly priority: number;
  /** A special word (urgent, seal, banner flag…) that a typist answers before any foe word. */
  readonly special: boolean;
  /** Metres of its foe from the dais (Infinity for words without a foe). */
  readonly distance: number;
  /** Tick it was dealt. */
  readonly born: number;
}

/** The typist's whole input: what is live, which word is locked, an open tier-2 pair (its letter, −1 none). */
export interface TypingView {
  readonly words: readonly SeenWord[];
  readonly lock: number;
  readonly pair: number;
}

export type Aim = "threat" | "nearest";

/** Tier factor of 01 §3.2. */
export function tierFactor(foe: FoeId, elite: boolean, general: boolean): number {
  const x10 = WORDS.tierFactorX10;
  if (general) return (GENERALS[foe as keyof typeof GENERALS]?.rank === "warlord" ? x10.warlord : x10.captain) / 10;
  if (elite) return x10.elite / 10;
  const tier = ENEMIES[foe as keyof typeof ENEMIES]?.tier ?? "small";
  return x10[tier] / 10;
}

/** Metres from the dais centre. */
export const metresFromDais = (enemy: EnemyState): number => Math.sqrt(enemy.x * enemy.x + enemy.z * enemy.z) / U_PER_M;

/** Seconds until `enemy` reaches the end of its lane at its base speed; 0 once it is there or fighting. */
export function secondsToDais(world: World, enemy: EnemyState): number {
  if (enemy.mode === "attack" || enemy.mode === "hold") return 0;
  const lane = world.lanes[enemy.lane];
  if (!lane) return 0;
  const left = Math.max(0, lane.length - enemy.along);
  return enemy.speed > 0 ? left / (enemy.speed * 60) : 99;
}

/** Threat of 01 §3.2 (no casting term in M0: G01's banner has its own word). */
export function threat(world: World, enemy: EnemyState): number {
  const attacking = enemy.mode === "attack" || (enemy.target !== null && enemy.target.kind !== "enemy" && enemy.windupUntil >= world.tick);
  return (WORDS.threatNumerator / Math.max(0.5, secondsToDais(world, enemy))) * tierFactor(enemy.foe, enemy.elite, enemy.general) + (attacking ? WORDS.attackingBonus : 0);
}

/** Priority of special words: the urgent word (Long Hống) first, then seals and banners, skill words last. */
const KIND_PRIORITY: Partial<Record<WordKind, number>> = { urgent: 10_000, interrupt: 5_000, seal: 60, flag: 40, skill: 0.5, assist: 0.2, trigger: 0.2, map: 0.1 };

function priorityOf(world: World, word: LiveWord, aim: Aim): number {
  const special = KIND_PRIORITY[word.kind];
  if (special !== undefined) return special;
  const target = word.target;
  if (target === null || target.kind !== "enemy") return 1;
  const enemy = enemyAt(world, target);
  if (!enemy) return 0;
  if (aim === "nearest") return 1000 - metresFromDais(enemy) + (enemy.mode === "attack" ? 50 : 0);
  return threat(world, enemy);
}

/** The live words through the contract; an empty list when the store is not built yet. */
export function liveWords(world: World): readonly (LiveWord | null)[] {
  const live = (world.words as { live?: unknown }).live;
  return Array.isArray(live) ? (live as (LiveWord | null)[]) : [];
}

/** The open tier-2 pair's letter from the words store's kit session (router.group), else `fallback` (from events). */
function openPair(world: World, fallback: number): number {
  const group = (world.words as { session?: { router?: { group?: unknown } } }).session?.router?.group;
  return typeof group === "number" ? group : fallback;
}

/** Metres from the dais of the foe under `word`, Infinity without one. */
function distanceOf(world: World, word: LiveWord): number {
  const target = word.target;
  if (target === null || target.kind !== "enemy") return Number.POSITIVE_INFINITY;
  const enemy = enemyAt(world, target);
  return enemy ? metresFromDais(enemy) : Number.POSITIVE_INFINITY;
}

export function readTyping(world: World, aim: Aim, pair: number): TypingView {
  const words: SeenWord[] = [];
  liveWords(world).forEach((word, slot) => {
    if (!word || typeof word.text !== "string" || word.text.length === 0) return;
    const special = (KIND_PRIORITY[word.kind] ?? 0) >= 40;
    words.push({
      slot, text: word.text, kind: word.kind, group: word.group, typed: word.typed, asleep: word.asleep, priority: priorityOf(world, word, aim),
      special, distance: distanceOf(world, word), born: word.bornTick,
    });
  });
  return { words, lock: typeof world.words.lock === "number" ? world.words.lock : -1, pair: openPair(world, pair) };
}

/** Live foes, alive only. */
export function liveFoes(world: World): EnemyState[] {
  return world.enemies.list.filter((enemy) => enemy.alive);
}
