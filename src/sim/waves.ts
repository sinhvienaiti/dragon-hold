/**
 * Run flow (01 §1.2, 00 §4.5): prep (Bày binh) → Enter → warning 6 s → wave
 * → break (20 s Normal, 15 s Hard, Easy waits for Enter) → … → victory.
 * A wave ends when every foe of it is gone; the last one wins the stage
 * with stars by Fire Dragon HP (01 §5). Shift + Enter calls the next wave early.
 *
 * The plan analysis below is the analytic filter of 00 §8: typing load
 * (00 §4.4) and group pace (02 §5.3) from the data alone. The spawner uses
 * the same member timing (groupMembers), so a run spawns what the plan says.
 * Owner: sim-battle (LANES.md).
 */
import { ENEMIES } from "../content/data/enemies";
import { GENERALS } from "../content/data/generals";
import { ELITE_PM, FLOW, LOAD_W100, STARS, TEMPO } from "../content/rules";
import type { EnemyDef, FoeId, GeneralDef, SpawnGroupDef, SpawnShape, WaveDef } from "../content/types";
import { addRage } from "./combat";
import { earn, payWaveEnd } from "./economy";
import { emit } from "./events";
import { msToTicks, pct, ticksToMs } from "./fixed";
import { scheduleWave } from "./spawn";
import type { EnemyState, WorldInit, World } from "./world";

export interface WaveState {
  /** Next wave to warn about, 1-based. */
  next: number;
  /** Per wave (index n − 1): groups still to spawn, foes alive, ended (1). */
  readonly pending: number[];
  readonly alive: number[];
  readonly ended: number[];
  /** Tick the running wave started (−1: none). */
  startedAt: number;
}

export function createWaveState(init: WorldInit): WaveState {
  const count = init.stage.waves.length;
  return { next: 1, pending: new Array<number>(count).fill(0), alive: new Array<number>(count).fill(0), ended: new Array<number>(count).fill(0), startedAt: -1 };
}

function setPhase(world: World, phase: World["phase"], endsAt: number): void {
  world.phase = phase;
  world.phaseEndsAt = endsAt;
  emit(world, { type: "phase", phase, wave: phase === "warning" ? world.waves.next : world.wave, endsAtTick: endsAt });
}

const warn = (world: World): void => setPhase(world, "warning", world.tick + msToTicks(FLOW.warningMs));

/** "start": prep ends, the first warning begins. */
export function startRun(world: World): void {
  if (world.phase !== "prep") {
    emit(world, { type: "rejected", command: "start", reason: "phase" });
    return;
  }
  if (world.stage.waves.length === 0) {
    emit(world, { type: "rejected", command: "start", reason: "no-waves" });
    return;
  }
  warn(world);
}

/** "call-early" in a break: gold 2 per second left (max 40) and +5 rage (00 §4.5). */
export function callEarly(world: World): void {
  if (world.phase !== "break") {
    emit(world, { type: "rejected", command: "call-early", reason: "phase" });
    return;
  }
  if (world.phaseEndsAt >= 0) {
    const seconds = Math.floor((world.phaseEndsAt - world.tick) / 60);
    const gold = Math.min(FLOW.callEarlyGoldMax, seconds * FLOW.callEarlyGoldPerS);
    if (gold > 0) earn(world, gold, "call-early");
  }
  addRage(world, FLOW.callEarlyRageX10);
  warn(world);
}

/** "continue": ends an Easy break that waits for Enter. */
export function continueBreak(world: World): void {
  if (world.phase !== "break" || world.phaseEndsAt >= 0) {
    emit(world, { type: "rejected", command: "continue", reason: "phase" });
    return;
  }
  warn(world);
}

/** Cleanup calls it once per foe that is gone: the wave's alive count. */
export function onEnemyGone(world: World, enemy: EnemyState): void {
  const index = enemy.wave - 1;
  const alive = world.waves.alive;
  if (index >= 0 && index < alive.length && alive[index]! > 0) alive[index] = alive[index]! - 1;
}

/** Stars by Fire Dragon HP at the end (01 §5); no Lông Phượng in M0. */
export function starsFor(world: World): 1 | 2 | 3 {
  const hpPct = Math.floor((world.hero.hp * 100) / world.hero.hpMax);
  return hpPct >= STARS.threeStarHpPct ? 3 : hpPct >= STARS.twoStarHpPct ? 2 : 1;
}

function beginWave(world: World): void {
  const waves = world.waves;
  const def = world.stage.waves[waves.next - 1]!;
  world.wave = def.n;
  waves.next += 1;
  waves.startedAt = world.tick;
  world.combat.urgentUsed = false;
  setPhase(world, "wave", -1);
  emit(world, { type: "wave-start", wave: def.n, waves: world.stage.waves.length, lanes: wavesLanes(def), generals: def.generals });
  scheduleWave(world, def);
}

function endWave(world: World): void {
  const n = world.wave;
  const waves = world.waves;
  waves.ended[n - 1] = 1;
  waves.startedAt = -1;
  const bonusGold = payWaveEnd(world, n);
  emit(world, { type: "wave-end", wave: n, bonusGold });
  if (n >= world.stage.waves.length) {
    world.phase = "victory";
    world.phaseEndsAt = -1;
    emit(world, { type: "phase", phase: "victory", wave: n, endsAtTick: -1 });
    emit(world, { type: "victory", stars: starsFor(world) });
    return;
  }
  // Both Dragons heal 10 % of max HP between waves (00 §4.5).
  const hero = world.hero;
  if (hero.hp > 0) hero.hp = Math.min(hero.hpMax, hero.hp + pct(hero.hpMax, FLOW.breakHealPct));
  const guide = world.guide;
  if (guide.downUntil < 0) guide.hp = Math.min(guide.hpMax, guide.hp + pct(guide.hpMax, FLOW.breakHealPct));
  const breakMs = FLOW.breakMs[world.difficulty];
  setPhase(world, "break", breakMs === null ? -1 : world.tick + msToTicks(breakMs));
}

/** Phase timers, wave start (schedules the wave's groups with spawn), wave end, victory and stars. */
export function stepWaves(world: World): void {
  switch (world.phase) {
    case "warning":
      if (world.tick >= world.phaseEndsAt) beginWave(world);
      return;
    case "wave": {
      const index = world.wave - 1;
      if (world.waves.pending[index] === 0 && world.waves.alive[index] === 0 && world.tick > world.waves.startedAt) endWave(world);
      return;
    }
    case "break":
      if (world.phaseEndsAt >= 0 && world.tick >= world.phaseEndsAt) warn(world);
      return;
    default:
      return;
  }
}

/** Seconds of break left, for the HUD (−1: Easy waits for Enter). */
export const breakSecondsLeft = (world: World): number =>
  world.phase !== "break" ? 0 : world.phaseEndsAt < 0 ? -1 : Math.ceil(ticksToMs(world.phaseEndsAt - world.tick) / 1000);

// ── Plan analysis: members, typing load, group pace ─────────────────────────

/** Default gaps inside a group (02 §5.2); escorts walk 1 s ahead and behind. */
export const SHAPE_GAP_MS: Readonly<Record<SpawnShape, number>> = { single: 0, pair: 800, line: 600, cluster: 0, escort: 1000, pincer: 0, flight: 500 };

export const foeDefOf = (foe: FoeId): EnemyDef | GeneralDef =>
  (ENEMIES as Record<string, EnemyDef | undefined>)[foe] ?? (GENERALS as Record<string, GeneralDef>)[foe]!;

/** True for swarm foes that share one cluster word (02 §1.4). */
export const isClusterFoe = (foe: FoeId): boolean => foeDefOf(foe).word.cluster === true;

/** One spawn of a group: ms after the group's time; a cluster member set spawns as one entry with `count` heads. */
export interface GroupMember {
  readonly offsetMs: number;
  readonly foe: FoeId;
  /** Heads that leave together (cluster size; 1 otherwise). */
  readonly heads: number;
  readonly escort: boolean;
}

/**
 * Members of a group in spawn order (02 §5.2): a cluster leaves at once; an
 * escort sends floor(n / 2) guards first, 1 s apart, then the leader(s),
 * then the rest 1 s after the last leader. Matches scripts/balance/load.ts.
 */
export function groupMembers(group: SpawnGroupDef): GroupMember[] {
  if (group.shape === "cluster" || isClusterFoe(group.foe)) return [{ offsetMs: 0, foe: group.foe, heads: group.count, escort: false }];
  const gap = group.gapMs ?? SHAPE_GAP_MS[group.shape];
  const escort = group.escort;
  const ahead = escort ? Math.floor(escort.count / 2) : 0;
  const escortHeads = (foe: FoeId): number => {
    const def = foeDefOf(foe);
    return "cluster" in def && def.cluster ? def.cluster.min : 1;
  };
  const out: GroupMember[] = [];
  if (escort) for (let k = 0; k < ahead; k += 1) out.push({ offsetMs: k * 1000, foe: escort.foe, heads: escortHeads(escort.foe), escort: true });
  const lead = ahead * 1000;
  for (let k = 0; k < group.count; k += 1) out.push({ offsetMs: lead + k * gap, foe: group.foe, heads: 1, escort: false });
  if (escort) {
    const after = lead + (group.count - 1) * gap + 1000;
    for (let k = 0; k < escort.count - ahead; k += 1) out.push({ offsetMs: after + k * 1000, foe: escort.foe, heads: escortHeads(escort.foe), escort: true });
  }
  return out;
}

/** Last member's offset, ms (how long the group holds its gate). */
export const groupSpanMs = (group: SpawnGroupDef): number => groupMembers(group).reduce((max, member) => (member.offsetMs > max ? member.offsetMs : max), 0);

/** Typing work W_gõ × 100 of one member (00 §4.4): a cluster counts 1 W, elites × 1.6. */
export function memberW100(member: GroupMember, elite = false): number {
  if (isClusterFoe(member.foe)) return LOAD_W100.cluster;
  const w100 = foeDefOf(member.foe).w100;
  return elite && !member.escort ? Math.round((w100 * ELITE_PM) / 1000) : w100;
}

/** One arrival of typing work: ms from the wave start, W × 100, lane, foe and heads. */
export interface PlanArrival {
  readonly ms: number;
  readonly w100: number;
  readonly lane: string;
  readonly foe: FoeId;
  readonly heads: number;
}

export function planArrivals(wave: WaveDef): PlanArrival[] {
  const out: PlanArrival[] = [];
  for (const group of wave.groups) {
    for (const member of groupMembers(group)) {
      out.push({ ms: group.atMs + member.offsetMs, w100: memberW100(member, group.elite === true), lane: group.lane, foe: member.foe, heads: member.heads });
    }
  }
  return out.sort((a, b) => a.ms - b.ms);
}

/** W_gõ × 100 of a wave (00 §4.4). */
export const waveW100 = (wave: WaveDef): number => planArrivals(wave).reduce((sum, arrival) => sum + arrival.w100, 0);

/** Reference capacity: 22.7 words a minute (00 §4.3), as W × 100 per second. */
const CAPACITY_W100_PER_S = TEMPO.refWordsPerMinX10 / 6;

/** Average load × 100 of a wave: W_gõ / (22.7 × minutes) (00 §4.4). */
export const waveLoad100 = (wave: WaveDef): number => Math.round((waveW100(wave) * 100 * 1000) / (CAPACITY_W100_PER_S * wave.durationMs));

/** The busiest-window gate of bot-balance (scripts/balance/load.ts): 8 s, inside the 6–10 s peaks of 02 §5.3. */
export const PEAK_WINDOW_MS = 8000;

/**
 * Peak load × 100 of a plan: each arrival's work is typed at the reference
 * rate from its time on (W × 60 / 22.7 s, so one foe alone never reads
 * above 1.0), and the peak is the most work in any `windowMs` window over
 * the capacity of that window. Exact: the maximum sits on a breakpoint.
 */
export function peakLoad100(wave: WaveDef, windowMs: number = PEAK_WINDOW_MS): number {
  const spans = planArrivals(wave).map((arrival) => {
    const typingMs = (arrival.w100 * 1000) / CAPACITY_W100_PER_S;
    return { from: arrival.ms, to: arrival.ms + typingMs, w100: arrival.w100, typingMs };
  });
  if (spans.length === 0) return 0;
  const starts: number[] = [];
  for (const span of spans) starts.push(span.from, span.to, span.from - windowMs, span.to - windowMs);
  let best = 0;
  for (const start of starts) {
    const end = start + windowMs;
    let work = 0;
    for (const span of spans) {
      const lo = span.from > start ? span.from : start;
      const hi = span.to < end ? span.to : end;
      if (hi > lo) work += (span.w100 * (hi - lo)) / span.typingMs;
    }
    if (work > best) best = work;
  }
  return Math.round((best * 100 * 1000) / (CAPACITY_W100_PER_S * windowMs));
}

/** Group starts (one per SpawnGroupDef) inside [fromMs, toMs). */
export const groupsIn = (wave: WaveDef, fromMs: number, toMs: number): number => wave.groups.filter((group) => group.atMs >= fromMs && group.atMs < toMs).length;

/** Heads (foes) spawned by groups starting inside [fromMs, toMs). */
export function headsIn(wave: WaveDef, fromMs: number, toMs: number): number {
  let heads = 0;
  for (const group of wave.groups) if (group.atMs >= fromMs && group.atMs < toMs) for (const member of groupMembers(group)) heads += member.heads;
  return heads;
}

/** Lulls between consecutive peaks (02 §5.3): [from, to) in ms. */
export function lullsOf(wave: WaveDef): { readonly fromMs: number; readonly toMs: number }[] {
  const out: { fromMs: number; toMs: number }[] = [];
  for (let k = 1; k < wave.peaks.length; k += 1) out.push({ fromMs: wave.peaks[k - 1]!.atMs + wave.peaks[k - 1]!.lengthMs, toMs: wave.peaks[k]!.atMs });
  return out;
}

/** Threat × 10 (02 §1.2) of a wave by lane id; a swarm head counts its own threat. */
export function threatByLane10(wave: WaveDef): Map<string, number> {
  const out = new Map<string, number>();
  for (const arrival of planArrivals(wave)) out.set(arrival.lane, (out.get(arrival.lane) ?? 0) + foeDefOf(arrival.foe).threat10 * arrival.heads);
  return out;
}

/** Lane ids that groups of a wave use, in stage order where known. */
function wavesLanes(wave: WaveDef): string[] {
  const out: string[] = [];
  for (const group of wave.groups) if (!out.includes(group.lane)) out.push(group.lane);
  return out;
}
