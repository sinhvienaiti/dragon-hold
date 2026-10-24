/**
 * The pace director inside the sim (BALANCE.md §4.2, §9.1; D23). Every wave
 * tick the kit's FlowMeter reads the world (a foe in Vòng Nguy, a pounce,
 * charge or blow winding up, HP, live words, foes waiting for a word, the
 * lock, kills by the share of path walked, dropped locks, damage by typing
 * and by the rest); every 5 s from wave 2 the kit's PaceDirector may step one
 * notch, at most 2 a wave: spawn gaps ± 7 % (stage cap ± 15 %), or near
 * defeat one Bình Máu dropped on the dais (heal over 2 s), once a wave. It
 * steers to the difficulty's mode (Dễ: Thư giãn, Thường: Cân bằng, Khó: Thử
 * thách) with the idle target raised by the plan's own idle
 * (DIRECTOR_IDLE_SLACK) and reads a hardly-hurt Dragon as calm (withMargin).
 * Shorter gaps never lift a wave's short peak over the 1.40 hard cap (00
 * §4.4, G9): each wave's floor is the smallest scale whose squeezed plan
 * still reads ≤ 1.35 over 6, 8 and 10 s (0.05 kept for gate jitter). M0 has
 * no elites, and moving the peak or the lull would bunch groups past that
 * cap, so neither is a step here. It never changes a live foe's HP, the
 * typing rules or grading.
 * Integer state in the world: replays and hashes hold. Off with
 * WorldOptions.paceDirector false (oaths, crowns, ranked and duel later).
 * Owner: sim-battle (LANES.md); tuned by the balance lane.
 */
import { CONSUMABLES } from "../content/data/our-side";
import { LOAD, RINGS } from "../content/rules";
import type { Difficulty, StageDef, WaveDef } from "../content/types";
import { BANDS, FlowMeter, PaceDirector, type Band, type BandMode, type FlowWindow, type PaceDecision, type PaceTable } from "../kit/balance";
import { emit } from "./events";
import { mmToU, pct, within } from "./fixed";
import { applyStatus } from "./status";
import { peakLoad100 } from "./waves";
import { inWordZone } from "./words";
import type { World } from "./world";

/**
 * The director's patience in M0 (BALANCE.md §4.2 "nhẹ tay", B7): a window
 * must sit 5 % outside the band to count, and it takes 4 hot windows in a
 * row (20 s) to ease: a peak's own heat passes without a step.
 */
export const DH_PACE_RULES = { slack: 50, downAfter: 4 } as const;

/** Levers of a step in M0 (BALANCE.md §9.1): spawn ± 7 %, a dropped potion near defeat. */
export const DH_PACE_TABLE: PaceTable = { up: ["spawn"], down: ["support", "spawn"], spawnStep: 70, eliteCost: 30, peakTicks: 180, lullTicks: 180 };

export interface DirectorState {
  readonly meter: FlowMeter;
  readonly director: PaceDirector;
  /** Kills this tick, as the share of its path each foe walked (0–1). */
  readonly kills: number[];
  /** Locks the player let go with letters in this tick (Esc). */
  abandons: number;
  /** Damage counters at the last feed (typed and the rest). */
  lastTyped: number;
  lastOther: number;
  /** Words typed at the last feed, and the tick a word was last typed (−1: never). */
  lastWords: number;
  typedAt: number;
  /** Per wave: the smallest spawn scale (‰) its plan stands without a short peak over 1.35. */
  readonly floors: readonly number[];
  /** The last 5 s boundary the director judged (its own cadence, PaceDirector.step's). */
  judgedAt: number;
}

/** Short peaks the director keeps under (00 §4.4 hard cap 1.40 less 0.05 for gate jitter), × 100. */
const SQUEEZE_PEAK_MAX = LOAD.hardCap - 5;

/** `wave` with every gap × scale ‰ (what the spawner does with the director's scale). */
function squeezed(wave: WaveDef, scale: number): WaveDef {
  const at = (ms: number) => Math.round((ms * scale) / 1000);
  return { ...wave, groups: wave.groups.map((group) => ({ ...group, atMs: at(group.atMs), ...(group.gapMs !== undefined ? { gapMs: at(group.gapMs) } : {}) })) };
}

/** The smallest scale in 850…1000 (steps of 10) that keeps `wave`'s short peaks ≤ 1.35; 1000 when even its plan does not. */
function floorOf(wave: WaveDef): number {
  let floor = 1000;
  for (let scale = 990; scale >= 850; scale -= 10) {
    const plan = squeezed(wave, scale);
    if (Math.max(peakLoad100(plan, 6000), peakLoad100(plan, 8000), peakLoad100(plan, 10_000)) > SQUEEZE_PEAK_MAX) break;
    floor = scale;
  }
  return floor;
}

/**
 * Idle the M0 plan leaves even at the 00 §4.4 load caps (‰): words come up
 * only once a foe nears (the word zone), at most 1.00 of the reference
 * typist's pace in middle waves with short peaks ≤ 1.15, while our side takes
 * a fifth of the work. The director aims its idle target this much above the
 * kit band (BALANCE.md §3), so it does not press every run to its −15 % cap
 * chasing idle the plan cannot remove (B7 "nhẹ tay"); P, O and HP keep the
 * band's own numbers. In Cân bằng that target (30 %) sits 10 points above
 * the game's own I band (DH_BANDS, 20 %).
 */
export const DIRECTOR_IDLE_SLACK = 200;

/**
 * Rồng Giữ Ải's target bands (BALANCE.md §3 with the game's own I, 00 §7):
 * Cân bằng's I is ≤ 20 %, not the shared ≤ 10 % (round 3 decision 1, the
 * round 2 gate's option b; đã chọn theo đề xuất). In a lane defence the words
 * come up only in the last seconds of each foe's walk (the word zone), so
 * time with nothing to type while foes walk in is part of the game's rhythm;
 * measured on the bots, a 15 % heavier load (option c) took the standard bot
 * to 15.6 % idle but its wins from 100 % to 40 % (10 seeds), half the support
 * damage (option d) moved idle by 1 point, and counting only idle stretches
 * ≥ 1 s (option a) by 3. The bot report and B1–B9 read these bands; the
 * director keeps steering by the kit band and DIRECTOR_IDLE_SLACK.
 */
export const DH_BANDS: { readonly [M in BandMode]: Band } = {
  ...BANDS,
  balanced: { ...BANDS.balanced, i: { max: 200 } },
};

/** The band the director steers to: the mode's (BALANCE.md §3) with the idle target raised by DIRECTOR_IDLE_SLACK. */
export function directorBand(mode: BandMode): Band {
  const band = BANDS[mode];
  return { ...band, i: { max: (band.i.max ?? 0) + DIRECTOR_IDLE_SLACK } };
}

/** The BALANCE.md §3 mode of each difficulty (00 §4.10): Dễ plays as Thư giãn, Thường as Cân bằng, Khó as Thử thách. */
export const BAND_MODE: Readonly<Record<Difficulty, BandMode>> = { easy: "relax", normal: "balanced", hard: "challenge" };

export function createDirector(on: boolean, stage: StageDef, difficulty: Difficulty = "normal"): DirectorState {
  return {
    meter: new FlowMeter(),
    director: new PaceDirector({ band: directorBand(BAND_MODE[difficulty]), table: DH_PACE_TABLE, off: on ? null : "setting", rules: DH_PACE_RULES }),
    kills: [],
    abandons: 0,
    lastTyped: 0,
    lastOther: 0,
    lastWords: 0,
    typedAt: -1,
    floors: on ? stage.waves.map(floorOf) : stage.waves.map(() => 1000),
    judgedAt: 0,
  };
}

/**
 * The director's spawn scale for the running wave, permille (1000 base):
 * spawn gaps × it, never so short that the wave's planned short peak
 * passes the 1.40 hard cap (00 §4.4).
 */
export function directorSpawnPm(world: World): number {
  return clampScale(world, world.director.director.summary().spawnScale);
}

/** A new wave: the window and the wave's step budget start over (waves.ts calls it). */
export function directorWaveStart(world: World, wave: number): void {
  world.director.director.beginWave(wave);
  world.director.meter.resetWindow();
}

/** Cleanup reports each dead foe: the share of its path it walked. */
export function directorKill(world: World, along: number, stopAt: number): void {
  world.director.kills.push(stopAt > 0 ? (along >= stopAt ? 1 : along / stopAt) : 1);
}

const DANGER_U = mmToU(RINGS.dangerMm);
/** At or above this HP (‰), having lost at most COMFORT_LOSS_PM in the window, the director reads it as too calm (withMargin). */
const COMFORT_HP_PM = 750;
const COMFORT_LOSS_PM = 40;
/** Waves the director watches but never steps in (wave 1 is light by design). */
const WARM_UP_WAVES = 1;
/** The dropped potion needs a word typed within this many ticks (20 s, the director's window). */
const SUPPORT_TYPED_TICKS = 1200;

/** One wave tick into the meter, then a judgement every 300 ticks; applies a step. Called after cleanup. */
export function stepDirector(world: World): void {
  const state = world.director;
  const stats = world.stats;
  const typed = stats.damageWord;
  const other = stats.damageSkill + stats.damageOurSide;
  if (stats.words !== state.lastWords) {
    state.lastWords = stats.words;
    state.typedAt = world.tick;
  }
  if (world.phase !== "wave") {
    state.kills.length = 0;
    state.abandons = 0;
    state.lastTyped = typed;
    state.lastOther = other;
    return;
  }
  let danger = false;
  let backlog = 0;
  const clusters: number[] = [];
  const tick = world.tick;
  for (const enemy of world.enemies.list) {
    if (!enemy.alive) continue;
    const zone = inWordZone(world, enemy);
    // A real threat (BALANCE.md §3 P): a foe in Vòng Nguy, a pounce or charge winding up, a blow winding up at our side.
    if (!danger && (within(enemy.x, enemy.z, 0, 0, DANGER_U) || enemy.action === 1 || enemy.action === 3 || enemy.windupUntil > tick)) danger = true;
    if (enemy.word >= 0 || !zone) continue;
    if (enemy.cluster >= 0) {
      if (clusters.includes(enemy.cluster)) continue;
      clusters.push(enemy.cluster);
    }
    backlog += 1;
  }
  let live = 0;
  for (const word of world.words.live) if (word !== null) live += 1;
  const hero = world.hero;
  state.meter.feed({
    danger,
    hp: hero.hpMax > 0 ? hero.hp / hero.hpMax : 0,
    live,
    capped: live >= world.words.ledger.budget.total,
    backlog,
    busy: world.words.lock >= 0,
    kills: state.kills,
    abandons: state.abandons,
    damage: { typed: typed - state.lastTyped, other: other - state.lastOther },
  });
  state.kills.length = 0;
  state.abandons = 0;
  state.lastTyped = typed;
  state.lastOther = other;
  // Wave 1 opens light by design (00 §4.4: 0.55–0.65): its calm is no reason to press the next waves.
  if (world.wave <= WARM_UP_WAVES) return;
  // The kit director's own cadence (PaceDirector.step), on a window that also reads the HP margin's calm side.
  const boundary = Math.floor(state.meter.ticks / state.director.rules.everyTicks);
  if (boundary <= state.judgedAt) return;
  state.judgedAt = boundary;
  const decision = state.director.evaluate(withMargin(state.meter.window(), state.director.band), state.meter.ticks);
  if (decision !== null) apply(world, decision);
}

/**
 * BALANCE.md §4.2 judges the window by P, I, O and the HP margin ("biên
 * máu"); the kit reads the margin only when it is too low. A window whose
 * Fire Dragon sits at or above COMFORT_HP_PM having lost at most
 * COMFORT_LOSS_PM is also too calm: it reads as idle past the target, so a
 * steady player who is hardly hurt gets the next step up like one who waits
 * for words.
 */
function withMargin(last: FlowWindow, band: Band): FlowWindow {
  if (last.hpLoss > COMFORT_LOSS_PM || last.hp < COMFORT_HP_PM) return last;
  const calm = (band.i.max ?? 0) + DH_PACE_RULES.slack + 1;
  return last.i >= calm ? last : { ...last, i: calm };
}

/** A raw director scale with the running wave's floor applied (directorSpawnPm for a past scale). */
function clampScale(world: World, scale: number): number {
  if (scale >= 1000) return scale;
  const floor = world.director.floors[world.wave - 1] ?? 1000;
  return scale < floor ? floor : scale;
}

/** Queued groups of the running wave that have not left their gate. */
function waiting(world: World): { at: number }[] {
  return world.spawn.queue.filter((group) => group.startedAt < 0 && group.wave === world.wave);
}

function apply(world: World, decision: PaceDecision): void {
  const tick = world.tick;
  switch (decision.lever) {
    case "spawn": {
      // The gaps to every group still waiting shrink or grow with the new scale (floored for the wave's peak).
      const before = clampScale(world, decision.spawnScale - decision.amount);
      const after = directorSpawnPm(world);
      if (after !== before) for (const group of waiting(world)) if (group.at > tick) group.at = tick + Math.round(((group.at - tick) * after) / before);
      break;
    }
    case "support": {
      // A Bình Máu falls on the dais (BALANCE.md §4.2) for a player who is playing: someone typed within the
      // last 20 s. Nobody at the keys gets nothing (B5, G6: typing is the main power).
      if (world.director.typedAt < 0 || tick - world.director.typedAt > SUPPORT_TYPED_TICKS) break;
      const potion = CONSUMABLES["small-potion"].effect;
      if (potion.kind === "heal-over-time") {
        const heal = pct(world.hero.hpMax, potion.healPct);
        applyStatus(world, { kind: "hero" }, world.hero.statuses, { id: "regen", durationMs: potion.durationMs, value: heal, self: true });
      }
      emit(world, { type: "consumable", item: "small-potion", x: 0, z: 0 });
      break;
    }
    default:
      break;
  }
  emit(world, { type: "pace", lever: decision.lever, dir: decision.dir, amount: decision.amount, spawnPm: decision.spawnScale, level: decision.level });
}
