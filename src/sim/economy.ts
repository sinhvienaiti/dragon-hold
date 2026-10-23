/**
 * Gold in a run (00 §4.9, 03 §3): 200 at start plus a budget of
 * 900 × f_lanes × f_type split 60 % kills (by threat share; a cluster pays
 * once), 25 % wave ends (each +10 % on the last), 15 % call-early,
 * learn-ahead and events. Integers; gold never goes below 0. Kill and
 * wave-end gold use running totals, so a cleared stage pays its pools exactly.
 * Owner: sim-ourside (LANES.md).
 */
import { ENEMIES } from "../content/data/enemies";
import { GENERALS } from "../content/data/generals";
import { ECONOMY, ELITE_PM, HERO_LEVEL, stageGoldBudget } from "../content/rules";
import type { EnemyDef, FoeId, GeneralDef, GoldReason, StageDef } from "../content/types";
import { grantXp } from "./combat";
import { emit } from "./events";
import { trackPhase } from "./shop";
import { groupMembers } from "./waves";
import type { EnemyState, WorldInit, World } from "./world";

export interface EconomyState {
  gold: number;
  /** The stage budget besides the start gold, and what each pool has paid so far. */
  readonly budget: number;
  killPaid: number;
  waveEndPaid: number;
  otherPaid: number;
  /** Pools: kills 60 %, wave ends 25 % of the budget (00 §4.9); the rest is "other". */
  readonly killPool: number;
  readonly waveEndPool: number;
  /** Planned threat × 10 of the whole stage, and the threat killed so far (capped at the plan). */
  readonly threatTotal: number;
  threatDone: number;
  /** Wave-end weights (+10 % a wave) and which waves have been paid. */
  readonly waveWeights: number[];
  readonly wavePaid: number[];
  /** Swarm clusters: threat × 10 of members killed, paid when the cluster is gone. */
  readonly clusters: Map<number, number>;
  /** Learn-ahead gold so far (≤ 40) and review-card answers in this break (≤ 3). */
  learnAheadPaid: number;
  reviewAnswers: number;
}

type FoeDef = EnemyDef | GeneralDef;
const defOf = (foe: FoeId): FoeDef | undefined => (ENEMIES as Record<string, FoeDef>)[foe] ?? (GENERALS as Record<string, FoeDef>)[foe];

/** Gold threat × 10 of one foe: ĐĐ × 10, elites × 1.6 (00 §4.6). */
export function foeThreat10(foe: FoeId, elite: boolean): number {
  const def = defOf(foe);
  if (!def) return 0;
  return elite ? Math.round((def.threat10 * ELITE_PM) / 1000) : def.threat10;
}

/**
 * Planned threat × 10 of a stage, the denominator of kill gold: every member
 * the wave plan spawns (sim-battle's groupMembers: a cluster group is one
 * cluster of `count` heads, escort clusters their minimum), elites × 1.6.
 */
export function stageThreat10(stage: StageDef): number {
  let total = 0;
  for (const wave of stage.waves) {
    for (const group of wave.groups) {
      for (const member of groupMembers(group)) total += member.heads * foeThreat10(member.foe, !member.escort && group.elite === true);
    }
  }
  return total;
}

/** Wave-end weights: wave 1 = 1000, each next one +10 % (00 §4.9), integers. */
function waveWeights(count: number): number[] {
  const out: number[] = [];
  let weight = 1000;
  for (let index = 0; index < count; index += 1) {
    out.push(weight);
    weight = Math.round((weight * (100 + ECONOMY.waveEndGrowthPct)) / 100);
  }
  return out;
}

export function createEconomyState(init: WorldInit): EconomyState {
  const groundLanes = init.lanes.filter((lane) => !lane.sky).length;
  const budget = stageGoldBudget(groundLanes, init.stage.type);
  const weights = waveWeights(init.stage.waves.length);
  return {
    gold: ECONOMY.startGold,
    budget,
    killPaid: 0,
    waveEndPaid: 0,
    otherPaid: 0,
    killPool: Math.round((budget * ECONOMY.killSharePct) / 100),
    waveEndPool: Math.round((budget * ECONOMY.waveEndSharePct) / 100),
    threatTotal: stageThreat10(init.stage),
    threatDone: 0,
    waveWeights: weights,
    wavePaid: weights.map(() => 0),
    clusters: new Map(),
    learnAheadPaid: 0,
    reviewAnswers: 0,
  };
}

/**
 * Gold call-early may still pay: the 15 % "other" pool (00 §4.9) less what
 * learn-ahead, review cards and earlier calls took. Learning rewards keep
 * their own caps (01 §6.5) and are never cut; calling early only gets the rest.
 */
export function callEarlyRoom(world: World): number {
  const economy = world.economy;
  const pool = economy.budget - economy.killPool - economy.waveEndPool;
  return pool > economy.otherPaid ? pool - economy.otherPaid : 0;
}

/** The whole stage's gold by the formula (G13 compares a run's earnings with it): start + budget. */
export const stageGoldTarget = (world: World): number => ECONOMY.startGold + world.economy.budget;

/** Leftover gold at the end turns into Vảy Rồng: min(3, floor(left / 100)) (00 §4.9). */
export const leftoverScales = (gold: number): number => {
  const scales = Math.floor(gold / ECONOMY.leftoverPerScale);
  return scales > ECONOMY.leftoverScalesMax ? ECONOMY.leftoverScalesMax : scales;
};

/** Adds gold and emits `gold`. Refunds ("sell") are not earnings. */
export function earn(world: World, amount: number, reason: GoldReason): void {
  if (amount <= 0) return;
  const economy = world.economy;
  economy.gold += amount;
  if (reason === "sell") world.stats.goldSpent -= amount;
  else {
    world.stats.goldEarned += amount;
    if (reason === "call-early" || reason === "learn-ahead" || reason === "review-card") economy.otherPaid += amount;
  }
  emit(world, { type: "gold", delta: amount, total: economy.gold, reason });
}

/** Takes gold if there is enough; emits `gold` and returns true. */
export function spend(world: World, amount: number, reason: GoldReason): boolean {
  const economy = world.economy;
  if (amount < 0 || economy.gold < amount) return false;
  if (amount === 0) return true;
  economy.gold -= amount;
  world.stats.goldSpent += amount;
  emit(world, { type: "gold", delta: -amount, total: economy.gold, reason });
  return true;
}

/** Pays the kill pool's share for `threat10` more killed threat (running total, capped at the plan). */
function payThreat(world: World, threat10: number): void {
  const economy = world.economy;
  if (threat10 <= 0 || economy.threatTotal <= 0) return;
  const before = economy.threatDone;
  const after = before + threat10 > economy.threatTotal ? economy.threatTotal : before + threat10;
  economy.threatDone = after;
  const gold = Math.floor((economy.killPool * after) / economy.threatTotal) - Math.floor((economy.killPool * before) / economy.threatTotal);
  if (gold <= 0) return;
  economy.killPaid += gold;
  earn(world, gold, "kill");
}

/** True when no other member of `enemy`'s cluster is still alive or waiting for cleanup. */
function lastOfCluster(world: World, enemy: EnemyState): boolean {
  for (const other of world.enemies.list) {
    if (other === enemy || other.cluster !== enemy.cluster) continue;
    if (other.alive || !other.freed) return false;
  }
  return true;
}

/** Kill gold by threat share (cleanup calls it once per dead foe); a swarm cluster pays once, when its last member falls. */
export function onEnemyKilled(world: World, enemy: EnemyState): void {
  const threat = foeThreat10(enemy.foe, enemy.elite);
  if (enemy.cluster < 0) {
    payThreat(world, threat);
    return;
  }
  const clusters = world.economy.clusters;
  const pending = (clusters.get(enemy.cluster) ?? 0) + threat;
  if (!lastOfCluster(world, enemy)) {
    clusters.set(enemy.cluster, pending);
    return;
  }
  clusters.delete(enemy.cluster);
  payThreat(world, pending);
}

/** Wave-end gold of wave `wave` (1-based) by the running weights; 0 when paid or out of range. */
export function waveEndGold(world: World, wave: number): number {
  const economy = world.economy;
  const index = wave - 1;
  if (index < 0 || index >= economy.waveWeights.length || economy.wavePaid[index] === 1) return 0;
  let total = 0;
  let before = 0;
  for (let k = 0; k < economy.waveWeights.length; k += 1) {
    if (k < index) before += economy.waveWeights[k]!;
    total += economy.waveWeights[k]!;
  }
  const upTo = before + economy.waveWeights[index]!;
  return Math.floor((economy.waveEndPool * upTo) / total) - Math.floor((economy.waveEndPool * before) / total);
}

/** Wave-end gold (waves calls it when a wave ends; read `waveEndGold` first for the `wave-end` event). Returns the gold paid. */
export function payWaveEnd(world: World, wave: number): number {
  const gold = waveEndGold(world, wave);
  const index = wave - 1;
  if (index < 0 || index >= world.economy.wavePaid.length || world.economy.wavePaid[index] === 1) return 0;
  world.economy.wavePaid[index] = 1;
  world.economy.waveEndPaid += gold;
  earn(world, gold, "wave-end");
  return gold;
}

/** "learn-ahead" in prep: +5 per word, at most +40 (00 §4.9). */
export function learnAhead(world: World, correct: number): void {
  if (world.phase !== "prep" || !world.stage.unlocks.learnAhead) {
    emit(world, { type: "rejected", command: "learn-ahead", reason: "phase" });
    return;
  }
  const economy = world.economy;
  const left = ECONOMY.learnAheadMax - economy.learnAheadPaid;
  const want = (correct > 0 ? Math.floor(correct) : 0) * ECONOMY.learnAheadPerWord;
  const gold = want < left ? want : left;
  if (gold <= 0) return;
  economy.learnAheadPaid += gold;
  earn(world, gold, "learn-ahead");
}

/** "review-card" in a break: right answers +10 gold, +2 XP (01 §6.5); at most 3 answers a break. */
export function reviewCard(world: World, correct: boolean): void {
  const economy = world.economy;
  if (world.phase !== "break" || !world.stage.unlocks.reviewCard) {
    emit(world, { type: "rejected", command: "review-card", reason: "phase" });
    return;
  }
  if (economy.reviewAnswers >= ECONOMY.reviewCardQuestions) {
    emit(world, { type: "rejected", command: "review-card", reason: "limit" });
    return;
  }
  economy.reviewAnswers += 1;
  if (!correct) return;
  earn(world, ECONOMY.reviewCardGold, "review-card");
  grantXp(world, HERO_LEVEL.xp.reviewCard);
}

/** Per-tick economy: phase hooks of our side (break starts: units rise, houses mend); Giếng Vàng comes later. */
export function stepEconomy(world: World): void {
  trackPhase(world);
}
