/**
 * Words on foes (01 §3, 00 §5): which foes carry words (threat ranking every
 * 0.25 s, lane pass then global pass), unique first letters, soft lock and
 * lock protection 1.2 s, grading (Chớp…Ẩu), the chain, the urgent word, skill
 * words; word groups per foe (01 §6.2); one scored learning event per word
 * per run (00 D14). Built on kit/typing (TD's router, letters, picker, scorer).
 * Wall-clock times (responseMs) live under `wall`, outside hashWorld.
 * Owner: typing-learning (LANES.md). Stub: signatures fixed, bodies TODO.
 */
import { CHAIN } from "../content/rules";
import type { EnemyRef, EntityRef, WordDeck, WordGroup, WordKind } from "../content/types";
import type { EnemyState, WorldInit, World } from "./world";

export interface LiveWord {
  readonly text: string;
  readonly kind: WordKind;
  readonly group: WordGroup;
  readonly target: EntityRef | null;
  /** Letters typed so far, wrong keys while locked. */
  typed: number;
  errors: number;
  /** Tick of the first key (−1: untouched). */
  firstKeyTick: number;
  /** Asleep words take no keys (01 §3.3). */
  asleep: boolean;
}

export interface WordsState {
  /** The stage's word set (static input; not hashed). */
  readonly deck: WordDeck;
  /** Live words by word slot; null slots are free. */
  readonly live: (LiveWord | null)[];
  /** Locked word slot (−1: none). */
  lock: number;
  /** The run's chain (01 §3.8). */
  chain: number;
  nextAssignAt: number;
  /** Words that already sent their scored learning event this run (00 D14). */
  readonly scored: Set<string>;
  /** Wall-clock key times for responseMs (learning only; not hashed). */
  readonly wall: { firstKeyMs: number[]; lastKeyMs: number[] };
}

export function createWordsState(init: WorldInit): WordsState {
  return { deck: init.deck, live: [], lock: -1, chain: 0, nextAssignAt: 0, scored: new Set(), wall: { firstKeyMs: [], lastKeyMs: [] } };
}

/** A letter key, a–z as 0–25; `ms` is wall time for learning only. Emits `word-progress`, and on completion `word-complete`, `grade`. */
export function typeKey(world: World, letter: number, ms?: number): void {
  // TODO(typing-learning): kit/typing router; finished words call combat.queueWordStrike.
}

export function typeBackspace(world: World): void {
  // TODO(typing-learning)
}

/** Esc, first step: let go of the locked word (no penalty). */
export function releaseLock(world: World): void {
  // TODO(typing-learning)
}

/** Left click on a foe: +5 threat for word priority (01 §3.2) and skill target. */
export function markEnemy(world: World, enemy: EnemyRef): void {
  // TODO(typing-learning)
}

/** Assignment every 0.25 s within the letter budget; urgent word; skill words; next chain words after 0.25 s. */
export function stepWords(world: World): void {
  // TODO(typing-learning)
}

/** Deals a word of `kind` (banner, urgent, skill…) to `target`; returns its slot or −1 when the budget is full. */
export function dealWord(world: World, kind: WordKind, target: EntityRef | null): number {
  // TODO(typing-learning)
  return -1;
}

/** A foe died or left: free its word and letter (cleanup calls it once). A lock lost to another source counts in stats.locksLost. */
export function onEnemyGone(world: World, enemy: EnemyState): void {
  // TODO(typing-learning)
}

/** True while lock protection keeps `enemy` at ≥ 1 HP against other sources (01 §3.3). */
export function isLockProtected(world: World, enemy: EnemyState): boolean {
  return enemy.protectedUntil > world.tick;
}

/** Chain tier 0–4 (00 §4.2). */
export function chainTier(chain: number): number {
  let tier = 0;
  CHAIN.thresholds.forEach((min, index) => {
    if (chain >= min) tier = index;
  });
  return tier;
}
