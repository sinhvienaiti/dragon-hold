/**
 * Headless bots on a stage (DESIGN.md §9 M0 bots, 00 §7, 03 §13.1): a typist
 * (typist.ts, hands.ts) and a plan (policy.ts) play a world tick by tick
 * through the same SimCommands the keyboard and mouse send. Every command is
 * logged with its tick, so a run replays exactly (runLog); the bot's dice are
 * its own stream seeded from the run seed and the bot's name, never the
 * world's. A run stops at victory or defeat, at `maxTicks`, or when it stalls
 * (a system that does nothing yet: the report says which).
 * Owner: bot-balance (LANES.md).
 */
import { createRng } from "../../src/kit/platform";
import { STAGE_M0 } from "../../src/content/data/stages";
import { FLOW } from "../../src/content/rules";
import type { Difficulty, SimCommand, SimEvent, StageDef, WordDeck } from "../../src/content/types";
import { createWorld, hashWorldHex, runLog, step, type World } from "../../src/sim/world";
import { botDeck } from "./deck";
import { BASE_LATENCY_MS, Hands, type HandsSpec } from "./hands";
import type { Arrival } from "./load";
import { Meter, type RunMetrics } from "./meter";
import { Plan, type PolicySpec } from "./policy";
import { readTyping, type Aim } from "./reader";
import { Typist, type TypistStats } from "./typist";

export const TICK_MS = 1000 / 60;

export interface BotSpec {
  readonly name: string;
  readonly label: string;
  /** null: never types (0 WPM). */
  readonly hands: HandsSpec | null;
  readonly aim: Aim;
  readonly policy: PolicySpec;
}

const hands = (wpm: number, accuracy: number): HandsSpec => ({ wpm, accuracy, backspace: 0.1, latencyMs: BASE_LATENCY_MS });

/** The M0 bots (DESIGN.md §9, 00 §7 accuracies, 03 §13.1 aims). */
export const BOTS = {
  b0: { name: "b0", label: "0 WPM, đồ trung bình", hands: null, aim: "threat", policy: { buy: "balanced", typing: false, skills: true, learnAhead: 0, reviewCards: 0 } },
  b25: { name: "b25", label: "25 WPM 95 %, đồ trung bình", hands: hands(25, 0.95), aim: "nearest", policy: { buy: "balanced", typing: true, skills: true, learnAhead: 0.85, reviewCards: 0.8 } },
  b35: { name: "b35", label: "35 WPM 95 %, đồ trung bình", hands: hands(35, 0.95), aim: "threat", policy: { buy: "balanced", typing: true, skills: true, learnAhead: 0.85, reviewCards: 0.8 } },
  b60: { name: "b60", label: "60 WPM 97 %, đồ trung bình", hands: hands(60, 0.97), aim: "threat", policy: { buy: "balanced", typing: true, skills: true, learnAhead: 0.9, reviewCards: 0.85 } },
  typingOnly: { name: "typingOnly", label: "35 WPM 95 %, không mua", hands: hands(35, 0.95), aim: "threat", policy: { buy: "none", typing: true, skills: true, learnAhead: 0.85, reviewCards: 0.8 } },
  noTyping: { name: "noTyping", label: "0 WPM, mua tốt nhất", hands: null, aim: "threat", policy: { buy: "best", typing: false, skills: true, learnAhead: 0, reviewCards: 0 } },
} as const satisfies Record<string, BotSpec>;

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

export function createBotWorld(spec: BotSpec, options: RunOptions): World {
  return createWorld(options.stage ?? STAGE_M0, options.seed, { deck: options.deck ?? botDeck(), typistWpm: spec.hands?.wpm ?? 0, difficulty: options.difficulty ?? "normal" });
}

export function runBot(spec: BotSpec, options: RunOptions): BotRun {
  const world = createBotWorld(spec, options);
  const dice = createRng((options.seed ^ nameSeed(spec.name)) >>> 0);
  const typist = spec.hands === null ? null : new Typist(new Hands(spec.hands, dice.ai));
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
      const key = typist.act(readTyping(world, spec.aim, pair), view.nowMs);
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
    meter.read(world, events);
    meter.scan(world, typist?.busy ?? false);
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
    kEPm: world.kEPm,
    log,
    hashes,
    finalHash: hashWorldHex(world),
    metrics: meter.finish(world),
    arrivals: meter.load.arrivals,
    typist: typist ? { ...typist.stats } : null,
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
