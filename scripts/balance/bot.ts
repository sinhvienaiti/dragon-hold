/**
 * Headless bots on a stage (DESIGN.md §9 M0 bots, 00 §7, 03 §13.1, BALANCE.md
 * §6): a typist (typist.ts, hands.ts) and a plan (policy.ts) play a world tick by tick
 * through the same SimCommands the keyboard and mouse send. Every command is
 * logged with its tick, so a run replays exactly (runLog); the bot's dice are
 * its own stream seeded from the run seed and the bot's name, never the
 * world's. A run stops at victory or defeat, at `maxTicks`, or when it stalls
 * (a system that does nothing yet: the report says which).
 * Owner: bot-balance (LANES.md).
 */
import { createRng, type RngStream } from "../../src/kit/platform";
import { RECOGNIZE, STANDARD_BOTS, TARGET_MIX, type BotSpec as KitBotSpec, type PaceSummary } from "../../src/kit/balance";
import { STAGE_M0 } from "../../src/content/data/stages";
import { FLOW } from "../../src/content/rules";
import type { Difficulty, SimCommand, SimEvent, StageDef, WordDeck } from "../../src/content/types";
import { createWorld, hashWorldHex, runLog, step, type World } from "../../src/sim/world";
import { botDeck } from "./deck";
import { BASE_LATENCY_MS, Hands, type HandsSpec } from "./hands";
import type { Arrival } from "./load";
import { Meter, type RunMetrics } from "./meter";
import { Plan, type PolicySpec } from "./policy";
import { readTyping, type Aim, type TypingView } from "./reader";
import { Typist, type TargetMix, type TypistStats } from "./typist";

export const TICK_MS = 1000 / 60;

export interface BotTypist {
  readonly busy: boolean;
  readonly stats: TypistStats;
  hold(nowMs: number, ms: number): void;
  act(view: TypingView, nowMs: number, world: World, commands: readonly SimCommand[]): SimCommand | null;
  observe?(world: World, events: readonly SimEvent[], commands: readonly SimCommand[]): void;
}

export interface BotSpec {
  readonly name: string;
  readonly label: string;
  /** null: never types (0 WPM). */
  readonly hands: HandsSpec | null;
  readonly aim: Aim;
  readonly policy: PolicySpec;
  /** Target mix of a human-like typist (BALANCE.md §6); unset: always the highest priority. */
  readonly mix?: TargetMix;
  /** Plays with the pace director off (B7's control run); default on. */
  readonly directorOff?: boolean;
  /** BALANCE.md §6 id this bot stands for in the B gates (with "@good", "@poor", "@off" variants). */
  readonly standard?: string;
  /** Opt-in typist; absent preserves the original dice and typing path. */
  readonly typist?: (rng: RngStream) => BotTypist;
}

/** A human-like typist (BALANCE.md §6): raw E (slips cost key time), a, CV, recognition by familiarity, crowd drop, drops a lock now and then. */
function humanHands(spec: Pick<KitBotSpec, "wpm" | "accuracy" | "cv" | "crowdDrop" | "abandon">): HandsSpec {
  // backspace 0.1: here a wrong key never enters the word, so a Backspace undoes a right letter; only a habit.
  return { wpm: spec.wpm, accuracy: spec.accuracy, backspace: 0.1, latencyMs: BASE_LATENCY_MS, cv: spec.cv, recognize: RECOGNIZE, crowdAt: 6, crowdDrop: spec.crowdDrop, abandon: spec.abandon, raw: true };
}

const KIT_BOT = (id: KitBotSpec["id"]): KitBotSpec => STANDARD_BOTS.find((bot) => bot.id === id)!;

/** A bot of the standard set (BALANCE.md §6): tactics pick the buying style, skill timing and target mix. */
function standardBot(name: string, label: string, kit: KitBotSpec, standard?: string): BotSpec {
  const typing = kit.wpm > 0;
  const buy = kit.tactics === "none" ? "none" : !typing ? "best" : kit.tactics === "poor" ? "poor" : kit.tactics === "good" ? "good" : "balanced";
  const recall = kit.accuracy >= 0.95 ? 0.85 : kit.accuracy >= 0.9 ? 0.75 : 0.6;
  return {
    name,
    label,
    ...(standard ? { standard } : {}),
    hands: typing ? humanHands(kit) : null,
    aim: "threat",
    mix: TARGET_MIX[kit.tactics],
    policy: {
      buy,
      typing,
      skills: true,
      learnAhead: typing ? recall : 0,
      reviewCards: typing ? recall - 0.05 : 0,
      tactics: kit.tactics === "none" ? "fair" : kit.tactics,
    },
  };
}

/** 00 §7's M0 bots as people: 35 WPM 95 % is BALANCE.md §6's standard player (CV 0.25, fair). */
const ref = KIT_BOT("standard");

/**
 * The M0 bots (DESIGN.md §9, 00 §7: 25 WPM 95 %, 35 WPM 95 %, 60 WPM 97 %, "đồ trung bình")
 * and BALANCE.md §6's standard set. `b35` is the standard player, `typingOnly`
 * the type-only bot and `noTyping` the no-type bot of both lists.
 */
export const BOTS = {
  b0: { name: "b0", label: "0 WPM, đồ trung bình", hands: null, aim: "threat", policy: { buy: "balanced", typing: false, skills: true, learnAhead: 0, reviewCards: 0 } },
  b25: standardBot("b25", "25 WPM 95 %, đồ trung bình", { ...ref, id: "standard", wpm: 25 }),
  b35: standardBot("b35", "Chuẩn: 35 WPM 95 %, CV 0,25, đồ trung bình", ref, "standard"),
  b60: standardBot("b60", "60 WPM 97 %, CV 0,15, đồ trung bình", { ...KIT_BOT("fast"), wpm: 60 }),
  typingOnly: standardBot("typingOnly", "Chỉ gõ: 35 WPM 95 %, không mua", KIT_BOT("type-only"), "type-only"),
  noTyping: standardBot("noTyping", "Không gõ, mua tốt nhất", KIT_BOT("no-type"), "no-type"),
  child: standardBot("child", "Trẻ em: 15 WPM 88 %, CV 0,40, kém", KIT_BOT("child"), "child"),
  novice: standardBot("novice", "Mới: 25 WPM 92 %, CV 0,35, vừa", KIT_BOT("novice"), "novice"),
  steady: standardBot("steady", "Chậm chắc: 25 WPM 99 %, CV 0,20, vừa", KIT_BOT("steady"), "steady"),
  skilled: standardBot("skilled", "Khá: 50 WPM 96 %, CV 0,20, tốt", KIT_BOT("skilled"), "skilled"),
  sloppy: standardBot("sloppy", "Ẩu: 50 WPM 85 %, CV 0,35, vừa", KIT_BOT("sloppy"), "sloppy"),
  fast: standardBot("fast", "Nhanh: 70 WPM 97 %, CV 0,15, tốt", KIT_BOT("fast"), "fast"),
  b35good: standardBot("b35good", "Chuẩn, chiến thuật tốt", { ...ref, tactics: "good" }, "standard@good"),
  b35poor: standardBot("b35poor", "Chuẩn, chiến thuật kém", { ...ref, tactics: "poor" }, "standard@poor"),
  b35off: { ...standardBot("b35off", "Chuẩn, tắt bộ điều nhịp", ref, "standard"), directorOff: true },
} as const satisfies Record<string, BotSpec>;

/** The M0 gate bots (00 §7, DESIGN.md §9) run by default; `--set=full` adds BALANCE.md §6's set and the B6, B7 variants. */
export const M0_BOTS: readonly BotName[] = ["b0", "b25", "b35", "b60", "typingOnly", "noTyping"];

export type BotName = keyof typeof BOTS;
export const BOT_NAMES = Object.keys(BOTS) as BotName[];

export interface RunOptions {
  readonly seed: number;
  readonly stage?: StageDef;
  readonly deck?: WordDeck;
  readonly difficulty?: Difficulty;
  /** Stop here (default: 60 sim minutes). */
  readonly maxTicks?: number;
  /** Hash the world every this many ticks (golden runs). */
  readonly hashEvery?: number;
  /** Keep the command log (replays, golden). */
  readonly keepLog?: boolean;
  /** Time every step with performance.now. */
  readonly timeSteps?: boolean;
  /** Stalls end a run: no phase change after start, or nothing happening in a wave (default true). */
  readonly stallStop?: boolean;
  /** The in-run pace director (default on; B7 also runs the standard bot without it). */
  readonly paceDirector?: boolean;
  /** Called after every step with that step's events and whether the typist had a word in mind (anatomy.ts). */
  readonly onTick?: (world: World, events: readonly SimEvent[], busy: boolean) => void;
}

export type RunResult = "victory" | "defeat" | "timeout" | "stalled";

export interface StepTiming {
  meanMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  totalMs: number;
}

export interface BotRun {
  readonly bot: string;
  readonly seed: number;
  result: RunResult;
  stalled: string;
  /** Current or last wave when the run ended; waves whose end event came. */
  wave: number;
  wavesEnded: number;
  stars: number;
  ticks: number;
  heroHpPct: number;
  kEPm: number;
  log: { tick: number; command: SimCommand }[];
  hashes: string[];
  finalHash: string;
  metrics: RunMetrics;
  /** Typing work as it spawned (load.ts), by wave. */
  arrivals: (Arrival & { readonly wave: number })[];
  typist: TypistStats | null;
  /** The pace director's steps over the run (BALANCE.md §4.2, B7). */
  pace: PaceSummary;
  /** G12 / B8: new words dealt and how many of them were met at least twice. */
  learn: { newWords: number; metTwice: number };
  sent: Record<string, number>;
  steps: StepTiming | null;
}

/** FNV-1a of a name, to give each bot its own dice on the same run seed. */
function nameSeed(name: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) hash = Math.imul(hash ^ name.charCodeAt(index), 0x01000193);
  return hash >>> 0;
}

export const DEFAULT_MAX_TICKS = 60 * 60 * 60;
/** A wave where nothing spawns, moves, hits or dies for this long is stalled. */
const STALL_WAVE_TICKS = 120 * 60;

function stepTiming(times: number[]): StepTiming | null {
  if (times.length === 0) return null;
  const total = times.reduce((sum, t) => sum + t, 0);
  const sorted = [...times].sort((a, b) => a - b);
  return { meanMs: total / times.length, p95Ms: sorted[Math.floor(sorted.length * 0.95)]!, p99Ms: sorted[Math.floor(sorted.length * 0.99)]!, maxMs: sorted[sorted.length - 1]!, totalMs: total };
}

const ACTIVITY: ReadonlySet<SimEvent["type"]> = new Set(["spawn", "move", "hit", "death", "attack", "word-assigned", "word-complete", "phase", "wave-end", "trap-trigger"]);

/** The bot's world: its E, a and CV are its profile, so the pace k and the word zone follow it (BALANCE.md §4.1). */
export function createBotWorld(spec: BotSpec, options: RunOptions): World {
  const hands = spec.hands;
  return createWorld(options.stage ?? STAGE_M0, options.seed, {
    deck: options.deck ?? botDeck(),
    typistWpm: hands?.wpm ?? 0,
    ...(hands ? { accuracyPm: Math.round(hands.accuracy * 1000), cvPm: Math.round((hands.cv ?? 0.25) * 1000) } : {}),
    difficulty: options.difficulty ?? "normal",
    paceDirector: options.paceDirector ?? spec.directorOff !== true,
  });
}

export function runBot(spec: BotSpec, options: RunOptions): BotRun {
  const world = createBotWorld(spec, options);
  const dice = createRng((options.seed ^ nameSeed(spec.name)) >>> 0);
  const typist: BotTypist | null = spec.typist ? spec.typist(dice.ai) : spec.hands === null ? null : new Typist(new Hands(spec.hands, dice.ai), spec.mix ?? null);
  const plan = new Plan(spec.policy);
  const meter = new Meter(world);
  const maxTicks = options.maxTicks ?? DEFAULT_MAX_TICKS;
  const stallStop = options.stallStop ?? true;
  const log: { tick: number; command: SimCommand }[] = [];
  const hashes: string[] = [];
  const times: number[] = [];
  const queue: SimCommand[] = [];
  let pair = -1;
  let lastActivity = 0;
  let phaseAt = 0;
  let phase = world.phase;
  let stalled = "";
  let wavesEnded = 0;
  let stars = 0;
  const view = {
    world,
    nowMs: 0,
    rng: dice.props,
    send: (command: SimCommand) => void queue.push(command),
    hold: (ms: number) => typist?.hold(view.nowMs, ms),
  };
  while (world.tick < maxTicks) {
    view.nowMs = world.tick * TICK_MS;
    plan.tick(view);
    if (typist && world.phase !== "prep") {
      const key = typist.act(readTyping(world, spec.aim, pair), view.nowMs, world, queue);
      if (key) queue.push(key);
    }
    const commands = queue.splice(0);
    if (options.keepLog === true) for (const command of commands) log.push({ tick: world.tick, command });
    const started = options.timeSteps === true ? performance.now() : 0;
    step(world, commands);
    if (options.timeSteps === true) times.push(performance.now() - started);
    const events = world.events.drain();
    for (const event of events) {
      if (event.type === "word-progress") pair = event.key === "pair" ? event.letter : -1;
      else if (event.type === "word-released" || event.type === "word-complete") pair = -1;
      if (ACTIVITY.has(event.type)) lastActivity = world.tick;
      if (event.type === "wave-end") wavesEnded += 1;
      if (event.type === "victory") stars = event.stars;
    }
    typist?.observe?.(world, events, commands);
    meter.read(world, events);
    meter.scan(world, typist?.busy ?? false, typist?.stats.releases ?? 0);
    options.onTick?.(world, events, typist?.busy ?? false);
    if (options.hashEvery !== undefined && world.tick % options.hashEvery === 0) hashes.push(hashWorldHex(world));
    if (world.phase === "victory" || world.phase === "defeat") break;
    if (world.phase !== phase) [phase, phaseAt] = [world.phase, world.tick];
    if (!stallStop) continue;
    const startedTick = plan.startedAtMs < 0 ? -1 : Math.round(plan.startedAtMs / TICK_MS);
    if (world.phase === "prep" && startedTick >= 0 && world.tick - startedTick > 5 * 60) stalled = "start: the run stays in prep (waves.startRun)";
    else if (world.phase === "warning" && world.tick - phaseAt > (FLOW.warningMs * 60) / 1000 + 10 * 60) stalled = "warning: no wave after the warning (waves.stepWaves)";
    else if (world.phase === "break" && world.tick - phaseAt > ((FLOW.breakMs.normal ?? 20_000) * 60) / 1000 + 30 * 60) stalled = "break: the next wave never comes (waves.stepWaves)";
    else if (world.phase === "wave" && world.tick - Math.max(lastActivity, phaseAt) > STALL_WAVE_TICKS) {
      stalled = "wave " + world.wave + ": nothing spawns, moves, hits or dies for 120 s (" + (world.enemies.live > 0 ? world.enemies.live + " foes alive" : "no foe alive") + ")";
    }
    if (stalled !== "") break;
  }
  const result: RunResult = world.phase === "victory" ? "victory" : world.phase === "defeat" ? "defeat" : stalled !== "" ? "stalled" : "timeout";
  return {
    bot: spec.name,
    seed: options.seed,
    result,
    stalled,
    wave: world.wave,
    wavesEnded,
    stars,
    ticks: world.tick,
    heroHpPct: world.hero.hpMax > 0 ? (world.hero.hp * 100) / world.hero.hpMax : 0,
    kEPm: world.pace.kPm,
    log,
    hashes,
    finalHash: hashWorldHex(world),
    metrics: meter.finish(world),
    arrivals: meter.load.arrivals,
    typist: typist ? { ...typist.stats } : null,
    pace: world.director.director.summary(),
    learn: { newWords: world.words.newMet.size, metTwice: [...world.words.newMet.values()].filter((met) => met >= 2).length },
    sent: { ...plan.sent },
    steps: stepTiming(times),
  };
}

/** Steps a fresh world through a run's log, hashing every `every` ticks: a replay must give the run's hashes. */
export function replayHashes(spec: BotSpec, options: RunOptions, log: readonly { tick: number; command: SimCommand }[], ticks: number, every: number): string[] {
  const world = createBotWorld(spec, options);
  const hashes: string[] = [];
  let at = 0;
  while (world.tick < ticks) {
    const next = Math.min(ticks, world.tick + every - (world.tick % every));
    runLog(world, log.slice(at), next);
    while (at < log.length && log[at]!.tick < next) at += 1;
    world.events.drain();
    if (world.tick % every === 0) hashes.push(hashWorldHex(world));
  }
  return hashes;
}
