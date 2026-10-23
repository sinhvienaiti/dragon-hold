/**
 * The Rồng Giữ Ải world and its fixed 60 Hz step. Pure TypeScript: no clock,
 * no DOM, no three; randomness only from the named seeded streams of
 * kit/platform. The same stage, seed, options and command log give the same
 * hashWorld on Node and in every browser (05 §9.1 rule 7, M0 golden gate).
 *
 * Step order (fixed; every system owns its file, LANES.md):
 *   1 input → words   2 flow, spawn, auras   3 movement   4 word hits, skills
 *   5 traps   6 units, houses   7 enemy attacks, general skills   8 status
 *   9 economy   10 cleanup (kill consequences, defeat), tick + 1
 *
 * State is integers: ticks, u (1 m = 60 000 u), HP. Readers (view, audio, UI,
 * learning) read the world and drain `events`; they never write.
 * Owner: architect for M0a setup, sim-battle from now on (LANES.md).
 */
import { createRng, type Rng } from "../kit/platform";
import { MAPS } from "../content/data/maps";
import { FIRE_DRAGON, TEMPO, WHITE_DRAGON, chapterRow, gPm } from "../content/rules";
import type { Difficulty, EntityRef, FoeId, KillSource, MapDef, MoveMode, Phase, SimCommand, StageDef, WordDeck } from "../content/types";
import { createAuraState, stepAuras, type AuraState } from "./auras";
import { createBossState, stepBoss, type BossState } from "./boss";
import { castSkill, createCombatState, onEnemyKilled as combatOnKill, stepEnemyAttacks, stepWordHits, type CombatState } from "./combat";
import { createEconomyState, learnAhead, onEnemyKilled as economyOnKill, reviewCard, stepEconomy, type EconomyState } from "./economy";
import { EventQueue, emit } from "./events";
import { hashValue, hex32 } from "./hash";
import { createHousesState, onEnemyKilled as housesOnKill, stepHouses, type HousesState } from "./houses";
import { compileLanes, type LaneRuntime } from "./lanes";
import { stepMovement } from "./movement";
import { createSlots, type SlotState } from "./placement";
import { buy, createShopState, place, sell, upgrade, useConsumable, type ShopState } from "./shop";
import { createSpawnState, stepSpawn, type SpawnState } from "./spawn";
import { createStatusSet, stepStatus, type StatusSet } from "./status";
import { createTrapsState, stepTraps, type TrapsState } from "./traps";
import { createUnitsState, stepUnits, type UnitsState } from "./units";
import { callEarly, continueBreak, createWaveState, onEnemyGone as wavesOnGone, startRun, stepWaves, type WaveState } from "./waves";
import { createWordsState, markEnemy, onEnemyGone, releaseLock, stepWords, typeBackspace, typeKey, type WordsState } from "./words";

export interface WorldOptions {
  /** Difficulty of the run (00 §4.10); default normal. */
  readonly difficulty?: Difficulty;
  /** The stage's word set, built by the app before the run (01 §6.1); default empty (no words dealt). */
  readonly deck?: WordDeck;
  /** Typist speed E in WPM: word lengths (01 §3.4) and k_E (00 §4.4) follow it; default 35. */
  readonly typistWpm?: number;
  /** k_E override in permille for bots (G7 runs at 1000); default from typistWpm. */
  readonly kEPm?: number;
}

/** What the per-system create functions get; the world does not exist yet. */
export interface WorldInit {
  readonly stage: StageDef;
  readonly map: MapDef;
  readonly lanes: readonly LaneRuntime[];
  readonly seed: number;
  readonly difficulty: Difficulty;
  readonly deck: WordDeck;
  readonly typistWpm: number;
  readonly gPm: number;
  readonly rng: Rng;
}

/** The Fire Dragon (01 §2.2): its HP is the run. */
export interface HeroState {
  hp: number;
  hpMax: number;
  shield: number;
  armour: number;
  resist: number;
  /** In-stage Dragon level 1–10 and XP (01 §2.5). */
  level: number;
  xp: number;
  statuses: StatusSet;
}

/** Bạch Long: stands beside the hero as a guide in M0 (00 D21); fights from M1. */
export interface GuideState {
  hp: number;
  hpMax: number;
  /** Tick it rises again after going down (−1: standing). */
  downUntil: number;
}

/** One foe (enemy or general). `slot` is reused after cleanup; `serial` never is. */
export interface EnemyState {
  readonly slot: number;
  serial: number;
  alive: boolean;
  foe: FoeId;
  general: boolean;
  elite: boolean;
  /** Wave it belongs to (a wave ends when all of its foes are gone, 01 §1.2). */
  wave: number;
  /** Index into world.lanes. */
  lane: number;
  /** u from the lane's gate, and signed offset to the right of travel. */
  along: number;
  lateral: number;
  /** Cached position (u) and height above ground (u), updated by movement. */
  x: number;
  z: number;
  y: number;
  hp: number;
  hpMax: number;
  /** Armour and resist G after tier lookup (00 §4.2). */
  armour: number;
  resist: number;
  /** Base speed after difficulty, mm/s (= u per tick). */
  speed: number;
  mode: MoveMode;
  modeUntil: number;
  /** Swarm cluster id (−1: none); the cluster leader carries the word. */
  cluster: number;
  /** Live word slot (−1: none) and chain words still to come (generals, many-W foes). */
  word: number;
  wordsLeft: number;
  /** Next strike tick and the wind-up end (−1: none). */
  attackAt: number;
  windupUntil: number;
  /** What it attacks now (movement picks it each tick). */
  target: EntityRef | null;
  /** What the strike in wind-up will hit (locked when the wind-up starts). */
  aim: EntityRef | null;
  /** Unit index blocking it (−1: free). */
  blockedBy: number;
  statuses: StatusSet;
  /** Lock protection ends (01 §3.3); set by words. */
  protectedUntil: number;
  /** Who dealt the killing blow, set on death; cleanup reads it. */
  killedBy: KillSource | null;
  /** Cleanup has handled the death and freed the slot. */
  freed: boolean;
  // Battle fields (sim-battle: spawn, movement, combat, boss).
  /** Tick it left the gate. */
  bornAt: number;
  /** u from the gate where it stops: the melee ring (lane end), its shooting band, a general's 8 m. */
  stopAt: number;
  /** Its own side of the path (u right of travel) before separation and the swarm zigzag. */
  homeLateral: number;
  /** Special action (ACTION in movement.ts): pounce, charge, retreat, banner wind-up; 0 none. */
  action: number;
  /** The action's end; with no action, the earliest tick of the next retreat or pounce. */
  actionUntil: number;
  /** Lane point (u from the gate) the action started from or aims at. */
  actionAlong: number;
  /** Tick its species skill or charge may fire again. */
  skillAt: number;
  /** Pounces over a blocker left (E18). */
  pounces: number;
  /** Was in a ford last tick: Wet when it leaves the water (03 §2.4). */
  wading: boolean;
  /** Elite trait bits (ELITE_TRAITS order in spawn.ts) and chapter variant; none in M0. */
  traits: number;
  variant: string | null;
}

export interface EnemyStore {
  readonly list: EnemyState[];
  readonly free: number[];
  nextSerial: number;
  live: number;
}

/** Counters the bots read (00 §7): G8 damage shares, G11 lost locks, G13 gold, G15 hard control. */
export interface RunStats {
  keys: number;
  wrongKeys: number;
  strayKeys: number;
  words: number;
  /** Words by grade: flash, perfect, good, ok, sloppy. */
  grades: number[];
  locks: number;
  locksLost: number;
  damageWord: number;
  damageSkill: number;
  damageOurSide: number;
  heroDamageTaken: number;
  kills: number;
  maxLive: number;
  /** Ticks a ready group waited at its gate because of the live cap. */
  capWaitTicks: number;
  /** Sum over live foes of ticks alive and ticks under hard control (G15). */
  foeTicks: number;
  hardControlTicks: number;
  goldEarned: number;
  goldSpent: number;
  ultimates: number;
}

export interface World {
  // Static inputs: never hashed.
  readonly stage: StageDef;
  readonly map: MapDef;
  readonly lanes: readonly LaneRuntime[];
  // Run constants.
  readonly seed: number;
  readonly difficulty: Difficulty;
  readonly typistWpm: number;
  /** k_E (00 §4.4): spawn gaps × 1000 / kEPm. */
  readonly kEPm: number;
  /** g(c) of the stage's chapter (00 §4.1). */
  readonly gPm: number;
  /** Live foes cap, a sim rule on every machine (00 §4.8, D10). */
  readonly liveCap: number;
  readonly rng: Rng;
  // Clock and flow.
  tick: number;
  phase: Phase;
  /** Tick the current phase ends (−1: waits for a command). */
  phaseEndsAt: number;
  /** Current or last wave, 1-based (0 before the first). */
  wave: number;
  // Actors.
  readonly hero: HeroState;
  readonly guide: GuideState;
  readonly enemies: EnemyStore;
  // System state, one per lane-owned file.
  readonly waves: WaveState;
  readonly spawn: SpawnState;
  readonly auras: AuraState;
  readonly combat: CombatState;
  readonly boss: BossState;
  readonly words: WordsState;
  readonly slots: SlotState[];
  readonly traps: TrapsState;
  readonly houses: HousesState;
  readonly units: UnitsState;
  readonly shop: ShopState;
  readonly economy: EconomyState;
  readonly stats: RunStats;
  // Output.
  readonly events: EventQueue;
}

/** Typing capacity C(E) over the 35 WPM reference, clamped to k_E (00 §4.3–4.4). */
export function kEFor(wpm: number): number {
  if (wpm <= 0) return TEMPO.kEMinPm;
  const lengthX10 = [...TEMPO.meanLengthX10].reverse().find((row) => wpm >= row.minWpm)!.x10;
  // C(E) = 60 / (0.45 + 12 (ℓ̄ + 1) / (E d)), in words a minute × 10.
  const secondsX1e6 = TEMPO.baseSecondsX100 * 10_000 + Math.round((12 * (lengthX10 + 10) * 100_000_000) / (wpm * TEMPO.dMixPm));
  const capacityX10 = Math.round(600_000_000 / secondsX1e6);
  const kE = Math.round((capacityX10 * 1000) / TEMPO.refWordsPerMinX10);
  return kE < TEMPO.kEMinPm ? TEMPO.kEMinPm : kE > TEMPO.kEMaxPm ? TEMPO.kEMaxPm : kE;
}

export function createWorld(stage: StageDef, seed: number = stage.seed, options: WorldOptions = {}): World {
  const map = MAPS[stage.mapId];
  if (!map) throw new Error("world: stage " + stage.id + " names unknown map " + stage.mapId);
  const difficulty = options.difficulty ?? "normal";
  const typistWpm = options.typistWpm ?? TEMPO.refWpm;
  const init: WorldInit = {
    stage,
    map,
    lanes: compileLanes(map, stage.lanes),
    seed: seed >>> 0,
    difficulty,
    deck: options.deck ?? { words: [], vocabLevel: 1 },
    typistWpm,
    gPm: gPm(stage.chapter),
    rng: createRng(seed >>> 0),
  };
  const heroHp = Math.round((FIRE_DRAGON.hp * init.gPm) / 1000);
  return {
    stage,
    map,
    lanes: init.lanes,
    seed: init.seed,
    difficulty,
    typistWpm,
    kEPm: options.kEPm ?? kEFor(typistWpm),
    gPm: init.gPm,
    liveCap: stage.liveCap ?? chapterRow(stage.chapter).liveCap,
    rng: init.rng,
    tick: 0,
    phase: "prep",
    phaseEndsAt: -1,
    wave: 0,
    hero: { hp: heroHp, hpMax: heroHp, shield: 0, armour: FIRE_DRAGON.armour, resist: FIRE_DRAGON.resist, level: 1, xp: 0, statuses: createStatusSet() },
    guide: { hp: WHITE_DRAGON.hp, hpMax: WHITE_DRAGON.hp, downUntil: -1 },
    enemies: { list: [], free: [], nextSerial: 1, live: 0 },
    waves: createWaveState(init),
    spawn: createSpawnState(init),
    auras: createAuraState(init),
    combat: createCombatState(init),
    boss: createBossState(init),
    words: createWordsState(init),
    slots: createSlots(init),
    traps: createTrapsState(init),
    houses: createHousesState(init),
    units: createUnitsState(init),
    shop: createShopState(init),
    economy: createEconomyState(init),
    stats: {
      keys: 0, wrongKeys: 0, strayKeys: 0, words: 0, grades: [0, 0, 0, 0, 0], locks: 0, locksLost: 0,
      damageWord: 0, damageSkill: 0, damageOurSide: 0, heroDamageTaken: 0, kills: 0, maxLive: 0, capWaitTicks: 0,
      foeTicks: 0, hardControlTicks: 0, goldEarned: 0, goldSpent: 0, ultimates: 0,
    },
    events: new EventQueue(),
  };
}

/** Routes one command to the system that owns it; systems reject what their phase forbids with a `rejected` event. */
export function applyCommand(world: World, command: SimCommand): void {
  switch (command.type) {
    case "key":
      return typeKey(world, command.letter, command.ms);
    case "backspace":
      return typeBackspace(world);
    case "release":
      return releaseLock(world);
    case "mark":
      return markEnemy(world, command.enemy);
    case "skill":
      return castSkill(world, command.skill, command.at);
    case "consumable":
      return useConsumable(world, command.item, command.at);
    case "buy":
      return buy(world, command.item);
    case "place":
      return place(world, command.item, command.slot);
    case "upgrade":
      return upgrade(world, command.slot);
    case "sell":
      return sell(world, command.slot);
    case "start":
      return startRun(world);
    case "call-early":
      return callEarly(world);
    case "continue":
      return continueBreak(world);
    case "learn-ahead":
      return learnAhead(world, command.correct);
    case "review-card":
      return reviewCard(world, command.correct);
  }
}

/** One tick. `input`: this tick's commands, in the order they came. */
export function step(world: World, input: readonly SimCommand[] = []): void {
  if (world.phase === "victory" || world.phase === "defeat") {
    world.tick += 1;
    return;
  }
  for (const command of input) applyCommand(world, command); // 1 input
  stepWords(world); // 1 word assignment, locks, urgent word
  stepWaves(world); // 2 flow: prep → warning → wave → break
  stepSpawn(world); // 2 spawn
  stepAuras(world); // 2 auras, before movement and attacks read them
  stepMovement(world); // 3
  stepWordHits(world); // 4 word hits and Dragon skills land
  stepTraps(world); // 5
  stepUnits(world); // 6
  stepHouses(world); // 6
  stepEnemyAttacks(world); // 7 foes strike units, houses, Dragons
  stepBoss(world); // 7 general skills (Cắm Cờ), boss phases later
  stepStatus(world); // 8
  stepEconomy(world); // 9
  cleanup(world); // 10
  world.tick += 1;
}

/** Kill consequences in a fixed order, frees slots, then the defeat check. */
function cleanup(world: World): void {
  const store = world.enemies;
  for (const enemy of store.list) {
    if (enemy.alive || enemy.freed) continue;
    onEnemyGone(world, enemy);
    wavesOnGone(world, enemy);
    if (enemy.killedBy !== null) {
      combatOnKill(world, enemy);
      economyOnKill(world, enemy);
      housesOnKill(world, enemy);
      world.stats.kills += 1;
    }
    enemy.freed = true;
    enemy.word = -1;
    store.free.push(enemy.slot);
    store.live -= 1;
  }
  if (store.live > world.stats.maxLive) world.stats.maxLive = store.live;
  if (world.hero.hp <= 0) {
    world.hero.hp = 0;
    world.phase = "defeat";
    world.phaseEndsAt = -1;
    emit(world, { type: "defeat", wave: world.wave });
  }
}

/** A fresh or recycled foe slot, alive, with its serial; spawn fills the rest. */
export function allocEnemy(world: World, foe: FoeId): EnemyState {
  const store = world.enemies;
  const reuse = store.free.pop();
  const slot = reuse ?? store.list.length;
  const enemy: EnemyState = {
    slot, serial: store.nextSerial, alive: true, foe, general: false, elite: false, wave: world.wave, lane: 0, along: 0, lateral: 0,
    x: 0, z: 0, y: 0, hp: 1, hpMax: 1, armour: 0, resist: 0, speed: 0, mode: "walk", modeUntil: -1, cluster: -1, word: -1, wordsLeft: 0,
    attackAt: -1, windupUntil: -1, target: null, aim: null, blockedBy: -1, statuses: createStatusSet(), protectedUntil: -1, killedBy: null, freed: false,
    bornAt: world.tick, stopAt: 0, homeLateral: 0, action: 0, actionUntil: -1, actionAlong: 0, skillAt: 0, pounces: 0, wading: false,
    traits: 0, variant: null,
  };
  store.nextSerial += 1;
  store.live += 1;
  if (reuse === undefined) store.list.push(enemy);
  else store.list[slot] = enemy;
  return enemy;
}

/** The live foe a reference points to, or null when it died or the slot was reused. */
export function enemyAt(world: World, ref: { readonly slot: number; readonly serial: number }): EnemyState | null {
  const enemy = world.enemies.list[ref.slot];
  return enemy && enemy.alive && enemy.serial === ref.serial ? enemy : null;
}

/** Everything a step reads back is state; these keys are static input or output and stay out of the hash. */
const HASH_SKIP: ReadonlySet<string> = new Set(["stage", "map", "lanes", "events", "deck", "wall"]);

/** The world folded into 32 bits (golden tests, 05 §10). */
export function hashWorld(world: World): number {
  return hashValue(world, HASH_SKIP);
}

export const hashWorldHex = (world: World): string => hex32(hashWorld(world));

/** Steps until `tick`, feeding each tick the logged commands stamped with it (replays, bots). */
export function runLog(world: World, log: readonly { readonly tick: number; readonly command: SimCommand }[], untilTick: number): void {
  let next = 0;
  const batch: SimCommand[] = [];
  while (world.tick < untilTick) {
    batch.length = 0;
    while (next < log.length && log[next]!.tick <= world.tick) batch.push(log[next++]!.command);
    step(world, batch);
  }
}
