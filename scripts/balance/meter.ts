/**
 * What a bot run measures (00 §7, DESIGN.md §9 M0 gates), read from the
 * events each step drains and from the world itself, never from inside a
 * system: damage by source (typed words, Dragon skills, our side), kills,
 * hard control on every foe (G15: stun, root, freeze), typing work arriving
 * (load.ts), the typist's busy time, locks lost (G11), gold at every wave
 * start and end (G13), live words and foes (G9), ultimates (G16), refused
 * commands. The world's own RunStats are copied at the end beside these.
 * Script side: floats are fine here.
 * Owner: bot-balance (LANES.md).
 */
import type { EntityRef, Grade, KillSource, SimEvent, StatusId } from "../../src/content/types";
import { hasStatus } from "../../src/sim/status";
import type { RunStats, World } from "../../src/sim/world";
import { LoadTrack } from "./load";
import { liveWords } from "./reader";

/** Hard control (03 §2.3). */
export const HARD_CONTROL: readonly StatusId[] = ["stun", "root", "freeze"];
/** Foes shorter-lived than this are left out of the per-foe hard-control share (1 s). */
const MIN_LIFE_TICKS = 60;

export type DamageBucket = "word" | "skill" | "ourSide" | "other";

export interface WaveMeter {
  readonly wave: number;
  startTick: number;
  endTick: number;
  goldAtStart: number;
  goldAtEnd: number;
  heroHpAtEnd: number;
  /** Ticks in the wave phase, and ticks the typist had a word in mind. */
  ticks: number;
  busyTicks: number;
  words: number;
}

export interface RunMetrics {
  damage: Record<DamageBucket, number>;
  kills: Partial<Record<KillSource, number>>;
  heroDamageTaken: number;
  /** G15: foe ticks alive, of them hard-controlled, held by a blocker. */
  hard: { foeTicks: number; hardTicks: number; heldTicks: number; foes: number; worstPct: number; foesOver35: number };
  typing: { keys: number; wrongKeys: number; strays: number; words: number; grades: Partial<Record<Grade, number>>; locks: number; locksLost: number };
  gold: { start: number; earned: number; spent: number; byReason: Record<string, number>; end: number };
  live: { maxFoes: number; maxWords: number };
  waves: WaveMeter[];
  ultimatesAt: number[];
  rejected: Record<string, number>;
  /** Event counts by type (the readiness probe and the report's "what happened"). */
  events: Record<string, number>;
  sim: RunStats | null;
  /** The words store's own counters (letter jams, words outside their length band, tier-2 pairs), when it keeps them. */
  jams: Record<string, number> | null;
}

const bucketOf = (source: EntityRef, damageType: string): DamageBucket => {
  if (source.kind === "hero") return damageType === "word" ? "word" : "skill";
  if (source.kind === "trap" || source.kind === "unit" || source.kind === "house" || source.kind === "guide") return "ourSide";
  return "other";
};

export class Meter {
  readonly load = new LoadTrack();
  readonly metrics: RunMetrics;
  private wave = 0;
  private readonly lives = new Map<number, { life: number; hard: number }>();
  /** Typed letters per word slot, to tell a lost lock from an untouched word. */
  private readonly typed = new Map<number, number>();

  constructor(world: World) {
    this.metrics = {
      damage: { word: 0, skill: 0, ourSide: 0, other: 0 },
      kills: {},
      heroDamageTaken: 0,
      hard: { foeTicks: 0, hardTicks: 0, heldTicks: 0, foes: 0, worstPct: 0, foesOver35: 0 },
      typing: { keys: 0, wrongKeys: 0, strays: 0, words: 0, grades: {}, locks: 0, locksLost: 0 },
      gold: { start: world.economy.gold, earned: 0, spent: 0, byReason: {}, end: world.economy.gold },
      live: { maxFoes: 0, maxWords: 0 },
      waves: [],
      ultimatesAt: [],
      rejected: {},
      events: {},
      sim: null,
      jams: null,
    };
  }

  private waveMeter(world: World): WaveMeter | undefined {
    return this.metrics.waves[this.wave - 1];
  }

  /** One step's drained events. */
  read(world: World, events: readonly SimEvent[]): void {
    const m = this.metrics;
    for (const event of events) {
      m.events[event.type] = (m.events[event.type] ?? 0) + 1;
      switch (event.type) {
        case "wave-start": {
          this.wave = event.wave;
          m.waves[event.wave - 1] = { wave: event.wave, startTick: event.tick, endTick: -1, goldAtStart: world.economy.gold, goldAtEnd: -1, heroHpAtEnd: -1, ticks: 0, busyTicks: 0, words: 0 };
          break;
        }
        case "wave-end": {
          const wave = m.waves[event.wave - 1];
          if (wave) [wave.endTick, wave.goldAtEnd, wave.heroHpAtEnd] = [event.tick, world.economy.gold, world.hero.hp];
          break;
        }
        case "spawn":
          this.load.spawn(event.tick, this.wave, event.foe, event.elite, event.cluster);
          break;
        case "hit":
          if (event.target.kind === "enemy") m.damage[bucketOf(event.source, event.damageType)] += event.amount;
          else if (event.target.kind === "hero") m.heroDamageTaken += event.amount;
          break;
        case "death":
          m.kills[event.by] = (m.kills[event.by] ?? 0) + 1;
          break;
        case "word-progress":
          if (event.key === "back") break;
          m.typing.keys += 1;
          if (event.key === "wrong") m.typing.wrongKeys += 1;
          if (event.key === "stray") m.typing.strays += 1;
          if (event.key === "lock" || event.key === "switch") m.typing.locks += 1;
          if (event.word >= 0) this.typed.set(event.word, event.typed);
          break;
        case "word-complete": {
          // The finishing key comes as word-complete, not word-progress.
          m.typing.keys += 1;
          m.typing.words += 1;
          m.typing.grades[event.grade] = (m.typing.grades[event.grade] ?? 0) + 1;
          const wave = this.waveMeter(world);
          if (wave) wave.words += 1;
          this.typed.delete(event.word);
          break;
        }
        case "word-released":
          if (event.reason === "target-gone" && (this.typed.get(event.word) ?? 0) > 0) m.typing.locksLost += 1;
          this.typed.delete(event.word);
          break;
        case "gold":
          if (event.delta > 0) m.gold.earned += event.delta;
          else m.gold.spent -= event.delta;
          m.gold.byReason[event.reason] = (m.gold.byReason[event.reason] ?? 0) + event.delta;
          break;
        case "skill":
          if (event.skill === "inferno" && event.stage === "cast") m.ultimatesAt.push(event.tick);
          break;
        case "rejected": {
          const key = event.command + ": " + event.reason;
          m.rejected[key] = (m.rejected[key] ?? 0) + 1;
          break;
        }
        default:
          break;
      }
    }
  }

  /** Once a tick after the step: foes' control, live counts, the wave's busy time. */
  scan(world: World, busy: boolean): void {
    const m = this.metrics;
    const tick = world.tick - 1;
    let live = 0;
    for (const enemy of world.enemies.list) {
      if (!enemy.alive) continue;
      live += 1;
      let life = this.lives.get(enemy.serial);
      if (!life) {
        life = { life: 0, hard: 0 };
        this.lives.set(enemy.serial, life);
      }
      life.life += 1;
      m.hard.foeTicks += 1;
      if (HARD_CONTROL.some((id) => hasStatus(enemy.statuses, id, tick))) {
        life.hard += 1;
        m.hard.hardTicks += 1;
      }
      if (enemy.mode === "blocked") m.hard.heldTicks += 1;
    }
    if (live > m.live.maxFoes) m.live.maxFoes = live;
    let words = 0;
    for (const word of liveWords(world)) if (word) words += 1;
    if (words > m.live.maxWords) m.live.maxWords = words;
    const wave = this.waveMeter(world);
    if (wave && world.phase === "wave") {
      wave.ticks += 1;
      if (busy) wave.busyTicks += 1;
    }
  }

  finish(world: World): RunMetrics {
    const m = this.metrics;
    m.gold.end = world.economy.gold;
    m.sim = { ...world.stats, grades: [...world.stats.grades] };
    const jams = (world.words as { jams?: unknown }).jams;
    if (jams !== null && typeof jams === "object") m.jams = { ...(jams as Record<string, number>) };
    let worst = 0;
    let over = 0;
    let foes = 0;
    for (const { life, hard } of this.lives.values()) {
      if (life < MIN_LIFE_TICKS) continue;
      foes += 1;
      const share = (hard * 100) / life;
      if (share > worst) worst = share;
      if (share > 35) over += 1;
    }
    Object.assign(m.hard, { foes, worstPct: worst, foesOver35: over });
    return m;
  }
}
