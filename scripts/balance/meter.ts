/**
 * What a bot run measures (00 §7, DESIGN.md §9 M0 gates), read from the
 * events each step drains and from the world itself, never from inside a
 * system: damage by source (typed words, Dragon skills, our side), kills,
 * hard control on every foe (G15: stun, root, freeze), typing work arriving
 * (load.ts), the typist's busy time, locks lost (G11), gold at every wave
 * start and end (G13), live words and foes (G9), ultimates (G16), refused
 * commands. The world's own RunStats are copied at the end beside these.
 * The kit's FlowMeter (BALANCE.md §3) reads every wave tick: P (a foe within
 * 10 m, an enemy telegraph up, or the Fire Dragon losing HP), I (no word live
 * and the typist idle), O (live words at N_max, > 4 foes in the zone waiting
 * for a word, or locks dropped in a row), S, N and Q (the median share of its
 * path from the gate to its stop that a foe had walked when it died).
 * Script side: floats are fine here.
 * Owner: bot-balance (LANES.md).
 */
import { RINGS } from "../../src/content/rules";
import type { EntityRef, Grade, KillSource, SimEvent, StatusId } from "../../src/content/types";
import { FlowMeter, type FlowOutcome, type FlowSummary } from "../../src/kit/balance";
import { mmToU, within } from "../../src/sim/fixed";
import { hasStatus } from "../../src/sim/status";
import { inWordZone } from "../../src/sim/words";
import type { RunStats, World } from "../../src/sim/world";
import { LoadTrack } from "./load";
import { liveWords } from "./reader";

/** Hard control (03 §2.3). */
export const HARD_CONTROL: readonly StatusId[] = ["stun", "root", "freeze"];
/** Foes shorter-lived than this are left out of the per-foe hard-control share (1 s). */
const MIN_LIFE_TICKS = 60;
/** G15 reads hard control over max(life, 10 s): a 1 s stun on a foe typed down 3 s later is not 33 % of a life held. */
const G15_LIFE_TICKS = 600;

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
  /** HP the Fire Dragon lost in this wave. */
  heroDamage: number;
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
  /** BALANCE.md §3 over the run's wave time (kit FlowMeter); null until finish. */
  flow: FlowSummary | null;
  /** Damage to foes by attack (hit.by): word, breath, skyfire, roar, inferno, trap, unit, house, status. */
  bySkill: Record<string, number>;
  /** Damage the Fire Dragon took, by foe species. */
  heroBy: Record<string, number>;
  /** Seconds from a foe's first word to its death (once it could be typed), summed with their count (B4). */
  killSeconds: number;
  killCount: number;
}

const bucketOf = (source: EntityRef, damageType: string): DamageBucket => {
  if (source.kind === "hero") return damageType === "word" ? "word" : "skill";
  if (source.kind === "trap" || source.kind === "unit" || source.kind === "house" || source.kind === "guide") return "ourSide";
  return "other";
};

const DANGER_U = mmToU(RINGS.dangerMm);

export class Meter {
  readonly load = new LoadTrack();
  readonly metrics: RunMetrics;
  readonly flow = new FlowMeter();
  private wave = 0;
  /** This tick's kills (path fractions), damage by typing and by the rest, for the flow meter. */
  private kills: number[] = [];
  private typedDamage = 0;
  private otherDamage = 0;
  /** Enemy telegraphs on screen until these ticks. */
  private telegraphs: number[] = [];
  private releases = 0;
  private readonly lives = new Map<number, { life: number; hard: number }>();
  /** Tick each foe (by serial) got its first word. */
  private readonly firstWord = new Map<number, number>();
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
      flow: null,
      bySkill: {},
      heroBy: {},
      killSeconds: 0,
      killCount: 0,
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
          m.waves[event.wave - 1] = { wave: event.wave, startTick: event.tick, endTick: -1, goldAtStart: world.economy.gold, goldAtEnd: -1, heroHpAtEnd: -1, ticks: 0, busyTicks: 0, words: 0, heroDamage: 0 };
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
          if (event.target.kind === "enemy") {
            m.damage[bucketOf(event.source, event.damageType)] += event.amount;
            const by = event.by ?? "other";
            m.bySkill[by] = (m.bySkill[by] ?? 0) + event.amount;
            if (by === "word") this.typedDamage += event.amount;
            else this.otherDamage += event.amount;
          } else if (event.target.kind === "hero") {
            m.heroDamageTaken += event.amount;
            const wave = this.waveMeter(world);
            if (wave) wave.heroDamage += event.amount;
            const foe = event.source.kind === "enemy" ? (world.enemies.list[event.source.slot]?.foe ?? "enemy") : event.source.kind;
            m.heroBy[foe] = (m.heroBy[foe] ?? 0) + event.amount;
          }
          break;
        case "death": {
          m.kills[event.by] = (m.kills[event.by] ?? 0) + 1;
          // Cleanup has run, but the dead foe still sits in its slot until a spawn reuses it.
          const dead = world.enemies.list[event.enemy.slot];
          if (dead && dead.serial === event.enemy.serial) {
            this.kills.push(dead.stopAt > 0 ? Math.min(1, Math.max(0, dead.along / dead.stopAt)) : 1);
            // B4 "hạ quái nhanh hơn": time from its first word, so the word zone's own length (T_a, the slip margin) does not count.
            const shown = this.firstWord.get(dead.serial);
            if (shown !== undefined) {
              m.killSeconds += (event.tick - shown) / 60;
              m.killCount += 1;
            }
          }
          this.firstWord.delete(event.enemy.serial);
          break;
        }
        case "telegraph":
          if (event.owner === "enemy") this.telegraphs.push(event.tick + Math.round((event.durationMs * 60) / 1000));
          break;
        case "word-assigned":
          if (event.target?.kind === "enemy" && !this.firstWord.has(event.target.serial)) this.firstWord.set(event.target.serial, event.tick);
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

  /** Once a tick after the step: foes' control, live counts, the wave's busy time, the flow meter. `releases`: locks the typist dropped so far. */
  scan(world: World, busy: boolean, releases = 0): void {
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
    this.feedFlow(world, busy, words, releases);
  }

  /** One wave tick into the kit FlowMeter (BALANCE.md §3); breaks and prep are not wave time. */
  private feedFlow(world: World, busy: boolean, words: number, releases: number): void {
    const tick = world.tick - 1;
    const kills = this.kills;
    const typed = this.typedDamage;
    const other = this.otherDamage;
    const abandons = Math.max(0, releases - this.releases);
    this.kills = [];
    this.typedDamage = this.otherDamage = 0;
    this.releases = releases;
    const fighting = world.phase === "wave" || world.phase === "victory" || world.phase === "defeat";
    if (!fighting || (world.phase !== "wave" && kills.length === 0 && typed + other === 0)) return;
    this.telegraphs = this.telegraphs.filter((until) => until > tick);
    let danger = this.telegraphs.length > 0;
    let backlog = 0;
    const clusters = new Set<number>();
    for (const enemy of world.enemies.list) {
      if (!enemy.alive) continue;
      if (!danger && within(enemy.x, enemy.z, 0, 0, DANGER_U)) danger = true;
      if (enemy.word >= 0 || !inWordZone(world, enemy)) continue;
      if (enemy.cluster >= 0) {
        if (clusters.has(enemy.cluster)) continue;
        clusters.add(enemy.cluster);
      }
      backlog += 1;
    }
    const hero = world.hero;
    this.flow.feed({
      danger,
      hp: hero.hpMax > 0 ? hero.hp / hero.hpMax : 0,
      live: words,
      capped: words >= world.words.ledger.budget.total,
      backlog,
      busy,
      kills,
      abandons,
      damage: { typed, other },
    });
  }

  finish(world: World): RunMetrics {
    const m = this.metrics;
    const outcome: FlowOutcome = world.phase === "victory" ? "won" : world.phase === "defeat" ? "lost" : "quit";
    m.flow = this.flow.summary(outcome);
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
      const share = (hard * 100) / (life > G15_LIFE_TICKS ? life : G15_LIFE_TICKS);
      if (share > worst) worst = share;
      if (share > 35) over += 1;
    }
    Object.assign(m.hard, { foes, worstPct: worst, foesOver35: over });
    return m;
  }
}
