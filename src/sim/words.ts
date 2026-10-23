/**
 * Words on foes (01 §3, 00 §5): which foes carry words (threat ranking every
 * 0.25 s, lane pass then global pass), unique first letters, soft lock and
 * lock protection 1.2 s, grading (Chớp…Ẩu), the chain, the urgent word, skill
 * words; word groups per foe (01 §6.2); one scored learning event per word
 * per run (00 D14). Built on kit/typing (TD's router, letters, picker, scorer).
 * Wall-clock times (responseMs) live under `wall`, outside hashWorld.
 *
 * A word is dealt when its foe is inside the Word Zone and stays fixed until
 * the foe dies (01 §0 rule 3); words never expire (rule 5). A swarm cluster
 * shares one word: it moves to another member when its holder dies.
 * Owner: typing-learning (LANES.md).
 */
import { GENERALS } from "../content/data/generals";
import { ENEMIES } from "../content/data/enemies";
import { DIFFICULTY, GRADE, HERO_LEVEL, LEARNING, LETTER_BUDGET, RAGE, RINGS, URGENT, WORDS } from "../content/rules";
import type { DeckWord, EnemyRef, EntityRef, EnemyId, GeneralId, WordDeck, WordGroup, WordKeyResult, WordKind, WordReleaseReason } from "../content/types";
import {
  BudgetLedger, KEY, POOL, addWord, compileDeck, createBag, createSession, dropWord, letterBudget, lockNext, pickWord, shieldLeft, shieldLock,
  typeBackspace as kitBackspace, typeLetter, unlock, wordTiming, type Bag, type BudgetSource, type TypingSession,
} from "../kit/typing";
import { DH_RULES, letterKind, type LetterKind } from "../typing/config";
import { isDeckText } from "../typing/deck";
import { GRADES, activityFor, chainAfter, chainTier, gradeOf, mcPmOf, mqPmOf } from "../typing/grading";
import { isFastFoe, lengthSlotFor, wordLengths, type FoeShape } from "../typing/lengths";
import { addRage, castSkill, grantXp, queueWordStrike } from "./combat";
import { sealGeneral } from "./auras";
import { pullBanner } from "./boss";
import { emit } from "./events";
import { U_PER_M, dist, mmToU, msToTicks, pct, ticksToMs, within } from "./fixed";
import type { EnemyState, WorldInit, World } from "./world";

export { chainTier } from "../typing/grading";

/** Live word store capacity; the budget (≤ 16) is the real limit. */
export const WORD_SLOTS = 20;

const ASSIGN_TICKS = msToTicks(WORDS.assignEveryMs);
const NEXT_WORD_TICKS = msToTicks(WORDS.nextWordMs);
/** A foe's next word that cannot be dealt within 1 s goes back to ranking. */
const NEXT_WORD_GIVE_UP_TICKS = 60;
const ZONE_U = mmToU(RINGS.wordZoneMm);
const LANE_PASS_U = mmToU(WORDS.lanePassMm);
const DANGER_U = mmToU(RINGS.dangerMm);
const MELEE_U = mmToU(RINGS.meleeMm);
const NEW_MIN_U = mmToU(WORDS.newWordMinMm);
const FLYER_MIN_U = mmToU(RINGS.flyerMinMm);

/** Budget sources (00 §5): foes, urgent foes (danger ring, casting, generals), then the capped non-foe sources. */
export const SOURCE = { enemy: 0, urgentFoe: 1, urgent: 2, skill: 3, assist: 4, trigger: 5, map: 6 } as const;
export type SourceIndex = (typeof SOURCE)[keyof typeof SOURCE];

export interface LiveWord {
  readonly text: string;
  readonly kind: WordKind;
  readonly group: WordGroup;
  /** Index into WordsState.deck.words (and the kit deck). */
  readonly index: number;
  /** What it stands on; a cluster word moves to another member when its holder dies. */
  target: EntityRef | null;
  /** Swarm cluster id (−1: none). */
  readonly cluster: number;
  /** Budget source (SOURCE). */
  readonly source: SourceIndex;
  /** First-letter tier: 1 own letter, 2 shares it with one word told apart by the second letter (01 §3.3). */
  tier: 1 | 2;
  /** Letters typed so far, wrong keys while locked. */
  typed: number;
  errors: number;
  /** Tick of the first key (−1: untouched). */
  firstKeyTick: number;
  readonly bornTick: number;
  /** Meaning or IPA shows while it is typed (hintUsed, 01 §6.3); also after 3 wrong keys. */
  hint: boolean;
  /** Asleep words take no keys (01 §3.3); none in M0. */
  asleep: boolean;
}

/** Per foe (by serial): words dealt so far (Ấn Phá every Nth) and its next word's tick (−1: none). */
export interface FoeWords {
  readonly slot: number;
  dealt: number;
  nextAt: number;
  /** First letter of its last word: the next one starts differently. */
  lastLetter: number;
}

export interface WordsState {
  /** The stage's word set, a–z words of 3–10 letters in kit deck order (static input; not hashed). */
  readonly deck: WordDeck;
  /** kit/typing: first letters, router, word slots. Its `deck` (letter codes) is static and not hashed. */
  readonly session: TypingSession;
  /** Live words per source (00 §5); `budget` is N_max, K_foes, urgent and others from A. */
  readonly ledger: BudgetLedger;
  /** Live words by word slot; null slots are free. */
  readonly live: (LiveWord | null)[];
  /** Locked word slot (−1: none); mirrors the router. */
  lock: number;
  /** The run's chain (01 §3.8) and its best. */
  chain: number;
  bestChain: number;
  nextAssignAt: number;
  readonly foes: Map<number, FoeWords>;
  /** Shuffled bags per group and length range (kit picker: no repeat until a bag runs out). */
  readonly bags: Map<string, Bag>;
  /** Marked foe (left click, +5 threat, skill target); −1: none. */
  markSlot: number;
  markSerial: number;
  /** Wave the urgent word was dealt in (−1: none yet). */
  urgentWave: number;
  /** New words met: deck index → times dealt (G12: each ≥ 2). */
  readonly newMet: Map<number, number>;
  newWave: number;
  newThisWave: number;
  /** New words typed right the first time (XP and the White Dragon's heal once each). */
  readonly learned: Set<string>;
  /** Words that already sent their scored learning event this run (00 D14). */
  readonly scored: Set<string>;
  /** Bot counters: letter jams, words dealt outside their length band, tier-2 pairs. */
  readonly jams: { letter: number; short: number; tier2: number };
  /** Wall-clock key times for responseMs (learning only; not hashed). */
  readonly wall: { firstKeyMs: number[]; lastKeyMs: number[]; groupMs: number };
}

/** A: letters that start at least 3 valid words of the deck, q x z j left out up to vocab level 10 (00 §5). */
export function availableFirstLetters(words: readonly { readonly text: string }[], vocabLevel: number): number {
  const per = new Array<number>(26).fill(0);
  for (const word of words) per[word.text.charCodeAt(0) - 97]! += 1;
  const avoided = vocabLevel <= WORDS.avoidUpToLevel ? WORDS.avoidLetters : "";
  let count = 0;
  per.forEach((n, code) => {
    if (n >= DH_RULES.letters.minWordsPerLetter && !avoided.includes(String.fromCharCode(97 + code))) count += 1;
  });
  return count;
}

function budgetSources(init: WorldInit): BudgetSource[] {
  const caps = LETTER_BUDGET.sources;
  let trigger = 0;
  for (const row of LETTER_BUDGET.triggerByChapter) if (init.stage.chapter >= row.fromChapter) trigger = row.max;
  return [
    { id: "enemy", pool: POOL.enemy, cap: LETTER_BUDGET.nMaxCap },
    { id: "urgent-foe", pool: POOL.urgent, cap: LETTER_BUDGET.nMaxCap },
    { id: "urgent", pool: POOL.other, cap: init.stage.unlocks.urgentWord ? caps.urgent : 0 },
    { id: "skill", pool: POOL.other, cap: caps.skill },
    { id: "assist", pool: POOL.other, cap: init.stage.unlocks.guideFights ? caps.assist : 0 },
    { id: "trigger", pool: POOL.other, cap: init.stage.unlocks.triggerWords ? trigger : 0 },
    { id: "map", pool: POOL.other, cap: caps.map },
  ];
}

export function createWordsState(init: WorldInit): WordsState {
  const seen = new Set<string>();
  const words = init.deck.words.filter((word) => {
    const ok = isDeckText(word.text) && !seen.has(word.text);
    if (ok) seen.add(word.text);
    return ok;
  });
  const deck: WordDeck = { words, vocabLevel: init.deck.vocabLevel };
  const kitDeck = compileDeck(words.map((word) => ({ id: word.text, text: word.text, level: word.level })), DH_RULES.words);
  const budget = letterBudget(availableFirstLetters(words, deck.vocabLevel), DH_RULES.budget);
  return {
    deck,
    session: createSession(DH_RULES, kitDeck, WORD_SLOTS),
    ledger: new BudgetLedger(budget, budgetSources(init)),
    live: new Array<LiveWord | null>(WORD_SLOTS).fill(null),
    lock: -1,
    chain: 0,
    bestChain: 0,
    nextAssignAt: 0,
    foes: new Map(),
    bags: new Map(),
    markSlot: -1,
    markSerial: -1,
    urgentWave: -1,
    newMet: new Map(),
    newWave: 0,
    newThisWave: 0,
    learned: new Set(),
    scored: new Set(),
    jams: { letter: 0, short: 0, tier2: 0 },
    wall: { firstKeyMs: new Array<number>(WORD_SLOTS).fill(-1), lastKeyMs: new Array<number>(WORD_SLOTS).fill(-1), groupMs: -1 },
  };
}

// ── Reading foes ────────────────────────────────────────────────────────────

/** The live foe `ref` points to, or null (a local enemyAt: world.ts imports this file). */
function foeAt(world: World, ref: { readonly slot: number; readonly serial: number }): EnemyState | null {
  const enemy = world.enemies.list[ref.slot];
  return enemy && enemy.alive && !enemy.freed && enemy.serial === ref.serial ? enemy : null;
}

/** Tier, gait and speed of a foe's species. */
export function foeShape(enemy: Pick<EnemyState, "foe" | "general" | "elite">): FoeShape {
  if (enemy.general) {
    const def = GENERALS[enemy.foe as GeneralId];
    return { tier: "heavy", gait: def.gait, speedMmS: def.speedMmS, general: true, elite: enemy.elite };
  }
  const def = ENEMIES[enemy.foe as EnemyId];
  return { tier: def.tier, gait: def.gait, speedMmS: def.speedMmS, general: false, elite: enemy.elite };
}

/** Threat tier factor × 10 (01 §3.2). */
function tierFactorX10(enemy: EnemyState): number {
  const factors = WORDS.tierFactorX10;
  if (enemy.general) return GENERALS[enemy.foe as GeneralId].rank === "warlord" ? factors.warlord : factors.captain;
  const base = factors[ENEMIES[enemy.foe as EnemyId].tier];
  return enemy.elite ? Math.max(base, factors.elite) : base;
}

/** u left to the dais: along its lane on the ground, to the flyer ring in the sky; at least 1 m. */
function remainingU(world: World, enemy: EnemyState): number {
  const lane = world.lanes[enemy.lane];
  const left = lane && !lane.sky ? lane.length - enemy.along : dist(enemy.x, enemy.z, 0, 0) - FLYER_MIN_U;
  return left > U_PER_M ? left : U_PER_M;
}

const isAttacking = (enemy: EnemyState): boolean => enemy.mode === "attack" || enemy.mode === "blocked";

/** Casting a skill (a general's or a species skill's wind-up): +8 threat, an urgent slot. */
function isCasting(world: World, enemy: EnemyState): boolean {
  if (enemy.windupUntil <= world.tick) return false;
  return enemy.general || ENEMIES[enemy.foe as EnemyId].skills.length > 0;
}

/** Threat × 1000 (01 §3.2): 10 / seconds to the dais × tier factor + 6 attacking + 8 casting + 5 marked. */
export function threatX1000(remaining: number, speedU: number, tierX10: number, attacking: boolean, casting: boolean, marked: boolean): number {
  const base = remaining > 0 ? Math.round((60_000 * speedU * tierX10) / remaining) : 0;
  return base + (attacking ? WORDS.attackingBonus * 1000 : 0) + (casting ? WORDS.castingBonus * 1000 : 0) + (marked ? WORDS.markedBonus * 1000 : 0);
}

function threatOf(world: World, enemy: EnemyState): number {
  const w = world.words;
  const marked = w.markSlot === enemy.slot && w.markSerial === enemy.serial;
  return threatX1000(remainingU(world, enemy), enemy.speed, tierFactorX10(enemy), isAttacking(enemy), isCasting(world, enemy), marked);
}

/** Ground lanes by index; every sky lane counts as one "sky lane" (01 §3.2). */
const laneKey = (world: World, enemy: EnemyState): number => (world.lanes[enemy.lane]?.sky ? -1 : enemy.lane);

// ── Dealing ────────────────────────────────────────────────────────────────

function bagFor(w: WordsState, group: WordGroup, lo: number, hi: number): Bag {
  const key = group + ":" + lo + "-" + hi;
  let bag = w.bags.get(key);
  if (bag === undefined) {
    const indices: number[] = [];
    w.deck.words.forEach((word, index) => {
      if (word.group === group && word.text.length >= lo && word.text.length <= hi) indices.push(index);
    });
    bag = createBag(Int32Array.from(indices));
    w.bags.set(key, bag);
  }
  return bag;
}

/** New words this stage may still bring (01 §6.1: 8 a stage, 6 on a boss stage, 2 a wave). */
function newRoom(world: World): boolean {
  const w = world.words;
  const stageMax = world.stage.type === "boss" ? LEARNING.newPerBossStage : LEARNING.newPerStage;
  return w.newMet.size < stageMax && w.newThisWave < LEARNING.newPerWave;
}

/** word × 4 + tier of a new word for kit kind `kind`: a met one not yet seen twice first, then a fresh one if the quota allows; −1 none. */
function pickNew(world: World, lo: number, hi: number, kind: number, last: number): number {
  const w = world.words;
  const t = w.session;
  const vocab = w.deck.vocabLevel;
  const free = t.letters.free(world.tick, vocab);
  const fits = (index: number) => w.deck.words[index]!.text.length >= lo && w.deck.words[index]!.text.length <= hi;
  for (const [index, met] of w.newMet) {
    if (met >= 2 || !fits(index)) continue;
    const tier = t.letters.claim(t.deck, t.words, index, kind, world.tick, vocab, last, free);
    if (tier > 0) return index * 4 + tier;
  }
  if (!newRoom(world)) return -1;
  for (let index = 0; index < w.deck.words.length; index += 1) {
    if (w.deck.words[index]!.group !== "new" || w.newMet.has(index) || !fits(index)) continue;
    const tier = t.letters.claim(t.deck, t.words, index, kind, world.tick, vocab, last, free);
    if (tier > 0) return index * 4 + tier;
  }
  return -1;
}

/** A word for `groups` in [lo, hi], else one letter shorter, else any length (01 §3.4 "thiếu từ"); word × 4 + tier or −1. */
function pickFor(world: World, groups: readonly WordGroup[], lo: number, hi: number, kind: number, last: number): number {
  const w = world.words;
  const t = w.session;
  const vocab = w.deck.vocabLevel;
  const bands: [number, number][] = [[lo, hi], [Math.max(3, lo - 1), Math.max(3, hi - 1)], [3, 10]];
  for (let band = 0; band < bands.length; band += 1) {
    const [a, b] = bands[band]!;
    for (const group of groups) {
      const pick = group === "new" ? pickNew(world, a, b, kind, last) : pickWord(bagFor(w, group, a, b), t.deck, t.letters, t.words, kind, world.tick, vocab, last, world.rng.words);
      if (pick >= 0) {
        if (band > 0) w.jams.short += 1;
        return pick;
      }
    }
  }
  return -1;
}

/** The meaning or IPA shows while this word is typed (01 §6.3): all but words remembered and known; always on Easy. */
export function hintShown(world: Pick<World, "difficulty">, word: DeckWord): boolean {
  if (DIFFICULTY[world.difficulty].meaning === "always") return true;
  return !(word.recalls >= LEARNING.recallsToHide && word.mastery >= LEARNING.knownMastery);
}

interface DealSpec {
  readonly kind: WordKind;
  readonly target: EntityRef | null;
  readonly source: SourceIndex;
  readonly letter: LetterKind;
  readonly lo: number;
  readonly hi: number;
  readonly groups: readonly WordGroup[];
  readonly last: number;
  readonly cluster: number;
  /** Enemy slot it stands on (−1: none). */
  readonly owner: number;
}

/** Puts a word live within the budget; its slot or −1 (budget full or a letter jam). */
function deal(world: World, spec: DealSpec): number {
  const w = world.words;
  const t = w.session;
  if (!w.ledger.canAdd(spec.source)) return -1;
  const kind = letterKind(spec.letter);
  const pick = pickFor(world, spec.groups, spec.lo, spec.hi, kind, spec.last);
  if (pick < 0) {
    w.jams.letter += 1;
    return -1;
  }
  const index = pick >> 2;
  const tier = (pick & 3) === 2 ? 2 : 1;
  const slot = addWord(t, index, kind, tier, world.tick, spec.owner);
  if (slot < 0) return -1;
  w.ledger.add(spec.source);
  if (tier === 2) w.jams.tier2 += 1;
  const word = w.deck.words[index]!;
  if (word.group === "new") {
    if (!w.newMet.has(index)) w.newThisWave += 1;
    w.newMet.set(index, (w.newMet.get(index) ?? 0) + 1);
  }
  w.live[slot] = {
    text: word.text, kind: spec.kind, group: word.group, index, target: spec.target, cluster: spec.cluster, source: spec.source,
    tier, typed: 0, errors: 0, firstKeyTick: -1, bornTick: world.tick, hint: hintShown(world, word), asleep: false,
  };
  w.wall.firstKeyMs[slot] = w.wall.lastKeyMs[slot] = -1;
  if (spec.owner >= 0) world.enemies.list[spec.owner]!.word = slot;
  emit(world, { type: "word-assigned", word: slot, text: word.text, kind: spec.kind, group: word.group, target: spec.target, firstTier: tier });
  return slot;
}

function foeWords(world: World, enemy: EnemyState): FoeWords {
  let entry = world.words.foes.get(enemy.serial);
  if (entry === undefined) {
    entry = { slot: enemy.slot, dealt: 0, nextAt: -1, lastLetter: -1 };
    world.words.foes.set(enemy.serial, entry);
  }
  return entry;
}

/** Word groups a foe's word may come from, first choice first (01 §6.2). */
function groupsFor(world: World, enemy: EnemyState, kind: WordKind, shape: FoeShape): WordGroup[] {
  switch (kind) {
    case "general":
    case "seal":
    case "elite":
    case "boss-part":
    case "boss-seal":
      return ["due", "learning", "known"];
    case "cluster":
    case "interrupt":
      return ["known", "learning", "due"];
    default:
      break;
  }
  if (isFastFoe(shape)) return ["known", "learning", "due"];
  // Learning and due words share the small and medium foes by their deck shares (30 : 35).
  const mix: WordGroup[] = world.rng.words.int(1, LEARNING.groupPct.learning + LEARNING.groupPct.due) <= LEARNING.groupPct.learning ? ["learning", "due"] : ["due", "learning"];
  const slow = (shape.tier === "small" || shape.tier === "medium") && !isAttacking(enemy) && !within(enemy.x, enemy.z, 0, 0, NEW_MIN_U);
  return slow ? ["new", ...mix, "known"] : [...mix, "known"];
}

/** Deals `enemy` its word (its next one for a foe with more HP): kind by species, seal every Nth for generals. */
function dealFoe(world: World, enemy: EnemyState, kindOverride?: WordKind): number {
  const shape = foeShape(enemy);
  const entry = foeWords(world, enemy);
  let kind: WordKind = kindOverride ?? "enemy";
  if (kindOverride === undefined) {
    if (enemy.general) kind = (entry.dealt + 1) % GENERALS[enemy.foe as GeneralId].seal.everyNthWord === 0 ? "seal" : "general";
    else if (enemy.cluster >= 0) kind = "cluster";
    else if (enemy.elite) kind = "elite";
  }
  const urgent = enemy.general || kind === "seal" || kind === "interrupt" || kind === "boss-part" || isCasting(world, enemy) || within(enemy.x, enemy.z, 0, 0, DANGER_U);
  const letter: LetterKind = kind === "interrupt" ? "interrupt" : kind === "boss-seal" ? "boss-seal" : urgent ? "urgent-foe" : "enemy";
  const [lo, hi] = wordLengths(world.typistWpm, lengthSlotFor(kind, shape), enemy.elite && !enemy.general);
  const slot = deal(world, {
    kind, target: { kind: "enemy", slot: enemy.slot, serial: enemy.serial }, source: urgent ? SOURCE.urgentFoe : SOURCE.enemy, letter, lo, hi,
    groups: groupsFor(world, enemy, kind, shape), last: entry.lastLetter, cluster: enemy.cluster, owner: enemy.slot,
  });
  if (slot >= 0) entry.dealt += 1;
  return slot;
}

/** Non-foe words: the urgent word (on the hero), skill, assist, trigger, map and banner words. */
function dealOther(world: World, kind: WordKind, target: EntityRef | null): number {
  const spec = (source: SourceIndex, letter: LetterKind, groups: WordGroup[]) => {
    const [lo, hi] = wordLengths(world.typistWpm, lengthSlotFor(kind, null));
    return deal(world, { kind, target, source, letter, lo, hi, groups, last: -1, cluster: -1, owner: -1 });
  };
  switch (kind) {
    case "urgent":
      return spec(SOURCE.urgent, "urgent", ["known", "learning", "due"]);
    case "skill":
      return spec(SOURCE.skill, "skill", ["known", "learning", "due"]);
    case "assist":
      return spec(SOURCE.assist, "assist", ["known", "learning", "due"]);
    case "trigger":
      return spec(SOURCE.trigger, "trigger", ["due", "learning", "known"]);
    case "map":
      return spec(SOURCE.map, "map", ["known", "learning", "due"]);
    case "flag":
    case "boss-part":
      return spec(SOURCE.urgentFoe, "urgent-foe", ["due", "learning", "known"]);
    case "boss-seal":
      return spec(SOURCE.urgentFoe, "boss-seal", ["due", "learning", "known"]);
    case "interrupt":
      return spec(SOURCE.urgentFoe, "interrupt", ["known", "learning", "due"]);
    default:
      return spec(SOURCE.enemy, "enemy", ["learning", "due", "known"]);
  }
}

/** Slot of the live urgent word, −1 none. */
function urgentSlot(w: WordsState): number {
  return w.live.findIndex((word) => word !== null && word.kind === "urgent");
}

/**
 * Deals a word of `kind` (banner, urgent, skill…) to `target`; returns its
 * slot or −1 when the budget is full, the target already has a word or (the
 * urgent word) one was dealt this wave. A banner word is dealt with a null
 * target; boss.ts keeps its slot in BannerState.word.
 */
export function dealWord(world: World, kind: WordKind, target: EntityRef | null): number {
  const w = world.words;
  if (kind === "urgent" && (urgentSlot(w) >= 0 || w.urgentWave === world.wave)) return -1;
  let slot: number;
  if (target !== null && target.kind === "enemy") {
    const enemy = foeAt(world, target);
    if (enemy === null || enemy.word >= 0) return -1;
    slot = dealFoe(world, enemy, kind === "enemy" ? undefined : kind);
  } else slot = dealOther(world, kind, target);
  if (kind === "urgent" && slot >= 0) w.urgentWave = world.wave;
  return slot;
}

// ── Releasing ──────────────────────────────────────────────────────────────

/** Copies the session's numbers of `slot` onto its LiveWord (readers read LiveWord only). */
function sync(w: WordsState, slot: number): void {
  const word = w.live[slot];
  if (!word) return;
  const store = w.session.words;
  word.typed = store.typed[slot]!;
  word.errors = store.errors[slot]!;
  word.tier = store.tier[slot] === 2 ? 2 : 1;
  word.firstKeyTick = store.firstTick[slot]!;
}

/** Word `slot` leaves: its letter rests 1 s, a lock on it goes, the budget gets its slot back. */
function release(world: World, slot: number, reason: WordReleaseReason): void {
  const w = world.words;
  const word = w.live[slot];
  if (!word) return;
  dropWord(w.session, slot, world.tick);
  w.ledger.remove(word.source);
  if (word.target !== null && word.target.kind === "enemy") {
    const enemy = world.enemies.list[word.target.slot];
    if (enemy && enemy.serial === word.target.serial && enemy.word === slot) enemy.word = -1;
  }
  w.live[slot] = null;
  w.wall.firstKeyMs[slot] = w.wall.lastKeyMs[slot] = -1;
  // A tier-2 partner left behind now owns its letter alone.
  for (let other = 0; other < w.live.length; other += 1) if (w.live[other]) sync(w, other);
  w.lock = w.session.router.lock;
  emit(world, { type: "word-released", word: slot, reason });
}

/**
 * Takes a word off before it is typed (a banner that expires, a boss part
 * that breaks another way): no learning event, no penalty. A lock with
 * letters in counts as lost and the next stray key is forgiven.
 */
export function releaseWord(world: World, slot: number, reason: WordReleaseReason = "target-gone"): void {
  const w = world.words;
  if (!w.live[slot]) return;
  if (w.session.router.lock === slot && w.session.words.typed[slot]! > 0) world.stats.locksLost += 1;
  release(world, slot, reason);
}

// ── Keys ───────────────────────────────────────────────────────────────────

const KEY_NAME: Readonly<Record<number, WordKeyResult>> = {
  [KEY.lock]: "lock", [KEY.advance]: "advance", [KEY.done]: "done", [KEY.wrong]: "wrong", [KEY.switch]: "switch", [KEY.stray]: "stray", [KEY.group]: "pair",
};

/** A letter key, a–z as 0–25; `ms` is wall time for learning only. Emits `word-progress`, and on completion `word-complete`, `grade`. */
export function typeKey(world: World, letter: number, ms?: number): void {
  if (!Number.isInteger(letter) || letter < 0 || letter > 25) return;
  const w = world.words;
  const t = w.session;
  world.stats.keys += 1;
  const before = t.router.lock;
  const typedBefore = before >= 0 ? t.words.typed[before]! : 0;
  const { result, slot } = typeLetter(t, letter, world.tick);
  const wallMs = ms ?? -1;
  switch (result) {
    case KEY.forgiven:
      break;
    case KEY.stray:
      world.stats.strayKeys += 1;
      emit(world, { type: "word-progress", word: -1, typed: 0, key: "stray", letter });
      break;
    case KEY.group:
      w.wall.groupMs = wallMs;
      emit(world, { type: "word-progress", word: t.letters.owner[letter]!, typed: 0, key: "pair", letter });
      break;
    case KEY.done:
      if (wallMs >= 0) w.wall.lastKeyMs[slot] = wallMs;
      sync(w, slot);
      complete(world, slot);
      break;
    default: {
      if (result === KEY.switch && before >= 0) {
        sync(w, before);
        w.wall.firstKeyMs[before] = w.wall.lastKeyMs[before] = -1;
        emit(world, { type: "word-progress", word: before, typed: 0, key: "switch", letter });
      }
      const word = w.live[slot];
      if (!word) break;
      const fresh = slot !== before || typedBefore === 0;
      sync(w, slot);
      if (result === KEY.wrong) {
        world.stats.wrongKeys += 1;
        if (word.errors >= GRADE.hintErrors) word.hint = true;
      } else if (wallMs >= 0) {
        if (fresh) w.wall.firstKeyMs[slot] = word.typed === 2 && w.wall.groupMs >= 0 ? w.wall.groupMs : wallMs;
        w.wall.lastKeyMs[slot] = wallMs;
      }
      if (fresh && word.typed > 0) world.stats.locks += 1;
      emit(world, { type: "word-progress", word: slot, typed: word.typed, key: KEY_NAME[result] ?? "advance", letter });
    }
  }
  if (result !== KEY.group) w.wall.groupMs = -1;
  w.lock = t.router.lock;
}

/** A finished word: grade, chain, its hit or effect, learning flags, then its foe's next word in 0.25 s. */
function complete(world: World, slot: number): void {
  const w = world.words;
  const word = w.live[slot]!;
  const timing = wordTiming(w.session, slot, world.tick);
  const grade = gradeOf(timing.len, timing.errors, timing.typing, world.typistWpm, word.group, word.kind);
  const mcPm = mcPmOf(w.chain);
  const mqPm = mqPmOf(grade);
  w.chain = chainAfter(w.chain, grade, word.kind);
  if (w.chain > w.bestChain) w.bestChain = w.chain;
  world.stats.words += 1;
  world.stats.grades[GRADES.indexOf(grade)]! += 1;
  const scored = !w.scored.has(word.text);
  if (scored) w.scored.add(word.text);
  const first = w.wall.firstKeyMs[slot]!;
  const last = w.wall.lastKeyMs[slot]!;
  const responseMs = first >= 0 && last >= first ? last - first : ticksToMs(timing.typing);
  emit(world, { type: "grade", word: slot, grade, mqPm, chain: w.chain, chainTier: chainTier(w.chain) });
  emit(world, {
    type: "word-complete", word: slot, text: word.text, kind: word.kind, grade, errors: timing.errors, keyTicks: timing.typing, responseMs,
    target: word.target, activity: activityFor(word.kind), scored, hintUsed: word.hint,
  });
  const enemy = word.target !== null && word.target.kind === "enemy" ? foeAt(world, word.target) : null;
  switch (word.kind) {
    case "urgent":
      castSkill(world, "roar");
      break;
    case "flag": {
      const banner = world.boss.banners.findIndex((b) => b.word === slot);
      if (banner >= 0) pullBanner(world, banner);
      break;
    }
    case "skill":
    case "assist":
    case "trigger":
    case "map":
      break;
    default:
      if (enemy !== null) {
        if (word.kind === "seal") sealGeneral(world, enemy);
        queueWordStrike(world, { slot: enemy.slot, serial: enemy.serial, word: slot, kind: word.kind, grade, mqPm, mcPm, bonusPm: 0 });
      }
  }
  addRage(world, RAGE.gradeX10[grade]);
  // Thầy Rồng (01 §6.7): a new word typed right the first time gives XP and heals the Fire Dragon 2 %.
  if (word.group === "new" && timing.errors === 0 && !w.learned.has(word.text)) {
    w.learned.add(word.text);
    grantXp(world, HERO_LEVEL.xp.newWord);
    const hero = world.hero;
    if (hero.hp > 0) hero.hp = Math.min(hero.hpMax, hero.hp + pct(hero.hpMax, HERO_LEVEL.newWordHealPct));
  }
  if (enemy !== null) {
    const entry = foeWords(world, enemy);
    entry.nextAt = world.tick + NEXT_WORD_TICKS;
    entry.lastLetter = word.text.charCodeAt(0) - 97;
  }
  release(world, slot, "done");
}

export function typeBackspace(world: World): void {
  const w = world.words;
  const t = w.session;
  const before = t.router.lock;
  if (!kitBackspace(t) || before < 0) return;
  sync(w, before);
  w.lock = t.router.lock;
  emit(world, { type: "word-progress", word: before, typed: w.live[before]?.typed ?? 0, key: "back", letter: -1 });
}

/** Esc, first step: let go of the locked word (no penalty; what was typed is dropped, its errors uncounted). */
export function releaseLock(world: World): void {
  const w = world.words;
  const before = w.session.router.lock;
  if (!unlock(w.session)) return;
  w.lock = -1;
  if (before < 0) return;
  sync(w, before);
  w.wall.firstKeyMs[before] = w.wall.lastKeyMs[before] = -1;
  emit(world, { type: "word-progress", word: before, typed: 0, key: "back", letter: -1 });
}

/** Left click on a foe: +5 threat for word priority (01 §3.2) and skill target. */
export function markEnemy(world: World, enemy: EnemyRef): void {
  const foe = foeAt(world, enemy);
  if (foe === null) return;
  world.words.markSlot = foe.slot;
  world.words.markSerial = foe.serial;
}

/** The marked foe, or null. */
export function markedEnemy(world: World): EnemyState | null {
  const w = world.words;
  return w.markSlot < 0 ? null : foeAt(world, { slot: w.markSlot, serial: w.markSerial });
}

// ── The step ───────────────────────────────────────────────────────────────

/** Foes' next words, 0.25 s after the last one, soft-locked when the player is free (01 §3.5). */
function stepNextWords(world: World): number {
  const w = world.words;
  let pending = 0;
  for (const [serial, entry] of w.foes) {
    if (entry.nextAt < 0) continue;
    if (world.tick < entry.nextAt) {
      pending += 1;
      continue;
    }
    const enemy = foeAt(world, { slot: entry.slot, serial });
    if (enemy === null || enemy.word >= 0 || world.tick - entry.nextAt > NEXT_WORD_GIVE_UP_TICKS) {
      entry.nextAt = -1;
      continue;
    }
    const slot = dealFoe(world, enemy);
    if (slot < 0) {
      pending += 1;
      continue;
    }
    entry.nextAt = -1;
    const t = w.session;
    if (t.router.lock < 0 && t.router.group < 0) {
      lockNext(t, slot);
      w.lock = slot;
    }
  }
  return pending;
}

/** The urgent word (01 §3.6): once a wave, ≥ 3 foes in the melee ring or the Fire Dragon under 35 %; it stays until the wave ends. */
function stepUrgent(world: World): void {
  const w = world.words;
  const live = urgentSlot(w);
  if (live >= 0) {
    if (world.phase !== "wave") release(world, live, "phase");
    return;
  }
  if (!world.stage.unlocks.urgentWord || world.phase !== "wave" || w.urgentWave === world.wave) return;
  let near = 0;
  for (const enemy of world.enemies.list) if (enemy.alive && !enemy.freed && within(enemy.x, enemy.z, 0, 0, MELEE_U)) near += 1;
  const hero = world.hero;
  if (near >= URGENT.meleeFoes || hero.hp * 100 < hero.hpMax * URGENT.heroHpPct) dealWord(world, "urgent", { kind: "hero" });
}

interface Candidate {
  readonly enemy: EnemyState;
  readonly threat: number;
  readonly lane: number;
}

/** Ranking pass (01 §3.2): each lane with a foe within 20 m gets a word first, then the rest by threat. */
function assign(world: World, pending: number): void {
  const w = world.words;
  const clusters = new Set<number>();
  for (const word of w.live) if (word !== null && word.cluster >= 0) clusters.add(word.cluster);
  const lanesWithWord = new Set<number>();
  const lanesNear = new Set<number>();
  const candidates: Candidate[] = [];
  for (const enemy of world.enemies.list) {
    if (!enemy.alive || enemy.freed) continue;
    const lane = laneKey(world, enemy);
    if (within(enemy.x, enemy.z, 0, 0, LANE_PASS_U)) lanesNear.add(lane);
    if (enemy.word >= 0) {
      lanesWithWord.add(lane);
      continue;
    }
    if (!within(enemy.x, enemy.z, 0, 0, ZONE_U)) continue;
    if ((w.foes.get(enemy.serial)?.nextAt ?? -1) >= 0) continue;
    // A cluster shares one word: its first member in slot order stands for it.
    if (enemy.cluster >= 0) {
      if (clusters.has(enemy.cluster)) continue;
      clusters.add(enemy.cluster);
    }
    candidates.push({ enemy, threat: threatOf(world, enemy), lane });
  }
  if (candidates.length === 0) return;
  candidates.sort((a, b) => b.threat - a.threat || a.enemy.slot - b.enemy.slot);
  const room = () => w.ledger.total + pending < w.ledger.budget.total;
  const done = new Set<number>();
  for (const candidate of candidates) {
    if (!room()) return;
    if (lanesWithWord.has(candidate.lane) || !lanesNear.has(candidate.lane)) continue;
    lanesWithWord.add(candidate.lane);
    if (dealFoe(world, candidate.enemy) >= 0) done.add(candidate.enemy.slot);
  }
  for (const candidate of candidates) {
    if (!room()) return;
    if (!done.has(candidate.enemy.slot) && candidate.enemy.word < 0) dealFoe(world, candidate.enemy);
  }
}

/** Assignment every 0.25 s within the letter budget; urgent word; next chain words after 0.25 s. */
export function stepWords(world: World): void {
  const w = world.words;
  if (world.wave !== w.newWave) {
    w.newWave = world.wave;
    w.newThisWave = 0;
  }
  const pending = stepNextWords(world);
  if (world.tick < w.nextAssignAt) return;
  w.nextAssignAt = world.tick + ASSIGN_TICKS;
  stepUrgent(world);
  assign(world, pending);
}

/** A foe died or left: free its word and letter (cleanup calls it once). A lock lost to another source counts in stats.locksLost. */
export function onEnemyGone(world: World, enemy: EnemyState): void {
  const w = world.words;
  w.foes.delete(enemy.serial);
  if (w.markSerial === enemy.serial) w.markSlot = w.markSerial = -1;
  const slot = enemy.word;
  const word = slot >= 0 ? w.live[slot] : null;
  if (!word || word.target === null || word.target.kind !== "enemy" || word.target.serial !== enemy.serial) return;
  if (word.cluster >= 0) {
    // The cluster's word stays with the cluster (01 §0 rule 3): the next member in slot order carries it.
    const heir = world.enemies.list.find((other) => other.alive && !other.freed && other.cluster === word.cluster && other !== enemy && other.word < 0);
    if (heir) {
      word.target = { kind: "enemy", slot: heir.slot, serial: heir.serial };
      heir.word = slot;
      enemy.word = -1;
      w.session.words.owner[slot] = heir.slot;
      return;
    }
  }
  if (w.session.router.lock === slot && w.session.words.typed[slot]! > 0) world.stats.locksLost += 1;
  release(world, slot, "target-gone");
}

/**
 * True while lock protection keeps `enemy` at ≥ 1 HP against other sources
 * (01 §3.3): it is locked with ≥ 1 letter in, for 1.2 s from the first
 * lethal blow. Combat calls this only for a blow that would kill (the first
 * call opens the window); it sets `enemy.protectedUntil` for readers.
 */
export function isLockProtected(world: World, enemy: EnemyState): boolean {
  const slot = enemy.word;
  if (slot < 0) return false;
  const t = world.words.session;
  if (!shieldLock(t, slot, world.tick)) return false;
  enemy.protectedUntil = t.guardAt + t.rules.protectTicks;
  return true;
}

/** Ticks of lock protection `enemy` has left without opening a window: the view's "being typed" rim. */
export function lockShieldTicks(world: World, enemy: EnemyState): number {
  return enemy.word < 0 ? 0 : shieldLeft(world.words.session, enemy.word, world.tick);
}

/** Movement slows a foe carrying a new word by this % (01 §6.2). */
export function wordSlowPct(world: World, enemy: EnemyState): number {
  const word = enemy.word >= 0 ? world.words.live[enemy.word] : null;
  return word && word.group === "new" ? WORDS.newWordSlowPct : 0;
}

/** For a general's tag: whether its next two words are Ấn Phá (01 §3.5). */
export function upcomingSeals(world: World, enemy: EnemyState): [boolean, boolean] {
  if (!enemy.general) return [false, false];
  const every = GENERALS[enemy.foe as GeneralId].seal.everyNthWord;
  const dealt = world.words.foes.get(enemy.serial)?.dealt ?? 0;
  return [(dealt + 1) % every === 0, (dealt + 2) % every === 0];
}

/** Live words' slots in slot order. */
export function liveSlots(world: World): number[] {
  const out: number[] = [];
  world.words.live.forEach((word, slot) => {
    if (word !== null) out.push(slot);
  });
  return out;
}
