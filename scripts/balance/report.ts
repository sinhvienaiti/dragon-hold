/**
 * Sums bot runs per bot, checks the M0 gates (DESIGN.md §9 "Cổng M0 Bot",
 * rules.ts M0_GATES) and the wave plan (00 §4.4–4.5), says which systems do
 * nothing yet, and prints it all as Markdown in Vietnamese for the owner.
 * Script side: floats are fine here.
 * Owner: bot-balance (LANES.md).
 */
import { MAPS } from "../../src/content/data/maps";
import { HOUSES, TRAPS } from "../../src/content/data/our-side";
import { STAGE_M0 } from "../../src/content/data/stages";
import { ECONOMY, FLOW, LETTER_BUDGET, LOAD, M0_GATES, SIM_BUDGET, stageGoldBudget } from "../../src/content/rules";
import type { StageDef, Vec2 } from "../../src/content/types";
import { U_PER_M } from "../../src/sim/fixed";
import type { SlotState } from "../../src/sim/placement";
import type { World } from "../../src/sim/world";
import { BOTS, TICK_MS, type BotName, type BotRun } from "./bot";
import { capacity } from "./hands";
import { GATE_WINDOW_S, PEAK_WINDOWS_S, REF_WPM_WORDS, foeW, peakLoad, planArrivals, planLoad, planW, type Arrival } from "./load";

const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length);
const max = (values: readonly number[]): number => (values.length === 0 ? 0 : Math.max(...values));
const pct = (part: number, whole: number): number => (whole > 0 ? (part * 100) / whole : 0);
const f1 = (value: number): string => value.toFixed(1);
const f2 = (value: number): string => value.toFixed(2);

export interface WaveSummary {
  readonly wave: number;
  /** Runs that reached this wave. */
  readonly runs: number;
  readonly w: number;
  readonly load: number;
  readonly peak: number;
  readonly busyPct: number;
  readonly wordsPerMin: number;
  readonly goldAtEnd: number;
  readonly heroHpAtEndPct: number;
}

export interface BotSummary {
  readonly bot: string;
  readonly label: string;
  readonly runs: number;
  readonly results: Record<string, number>;
  readonly winPct: number;
  readonly meanWave: number;
  readonly defeatWaves: number[];
  readonly stalled: string[];
  readonly stars: Record<string, number>;
  readonly heroHpPct: number;
  readonly peaks: Record<string, number>;
  readonly waves: WaveSummary[];
  readonly damage: { word: number; skill: number; ourSide: number; other: number };
  readonly kills: Record<string, number>;
  readonly hard: { sharePct: number; worstPct: number; over35Pct: number; heldPct: number };
  readonly typing: { keys: number; accuracyPct: number; words: number; locks: number; locksLostPct: number; capacityWpm: number; measuredWpm: number };
  /** `beforeLast`: gold at the last wave's start, the last chance to spend it (G13 leftover). */
  readonly gold: { start: number; earned: number; spent: number; end: number; beforeLast: number; formula: number; byReason: Record<string, number> };
  readonly live: { maxFoes: number; maxWords: number };
  /** The words store's counters per minute of wave (G10: tier-2 pairs < 1 a minute). */
  readonly jamsPerMin: Record<string, number>;
  readonly ultimateGapS: number;
  readonly rejected: Record<string, number>;
  readonly sent: Record<string, number>;
  readonly events: Record<string, number>;
  readonly steps: { meanMs: number; p95Ms: number; p99Ms: number; maxMs: number; realtime: number } | null;
}

function jamsPerMinute(runs: readonly BotRun[], waveTicks: number): Record<string, number> {
  const out: Record<string, number> = {};
  const minutes = (waveTicks * TICK_MS) / 60_000;
  for (const run of runs) for (const [key, n] of Object.entries(run.metrics.jams ?? {})) out[key] = (out[key] ?? 0) + n;
  for (const key of Object.keys(out)) out[key] = minutes > 0 ? out[key]! / minutes : 0;
  return out;
}

const arrivalsOf = (run: BotRun, wave?: number): Arrival[] => (wave === undefined ? run.arrivals : run.arrivals.filter((a) => a.wave === wave));

/** Folds the runs of one bot. */
export function summarize(bot: string, runs: readonly BotRun[], stage: StageDef = STAGE_M0): BotSummary {
  const spec = (BOTS as Record<string, (typeof BOTS)[BotName]>)[bot];
  const results: Record<string, number> = {};
  const stars: Record<string, number> = {};
  for (const run of runs) {
    results[run.result] = (results[run.result] ?? 0) + 1;
    if (run.result === "victory") stars[run.stars] = (stars[run.stars] ?? 0) + 1;
  }
  const peaks: Record<string, number> = {};
  for (const window of PEAK_WINDOWS_S) peaks[window + "s"] = max(runs.map((run) => peakLoad(arrivalsOf(run), window, run.kEPm / 1000)));
  const waves: WaveSummary[] = stage.waves.map((plan) => {
    const reached = runs.filter((run) => run.metrics.waves[plan.n - 1] !== undefined);
    const per = reached.map((run) => {
      const wave = run.metrics.waves[plan.n - 1]!;
      const arrivals = arrivalsOf(run, plan.n);
      const kE = run.kEPm / 1000;
      const w = arrivals.reduce((sum, a) => sum + a.w, 0);
      return {
        w,
        load: w / (REF_WPM_WORDS * kE * (plan.durationMs / kE / 60_000)),
        peak: peakLoad(arrivals, GATE_WINDOW_S, kE),
        busy: pct(wave.busyTicks, wave.ticks),
        wpm: wave.ticks > 0 ? wave.words / ((wave.ticks * TICK_MS) / 60_000) : 0,
        gold: wave.goldAtEnd,
        hp: wave.heroHpAtEnd,
      };
    });
    return {
      wave: plan.n,
      runs: reached.length,
      w: mean(per.map((p) => p.w)),
      load: mean(per.map((p) => p.load)),
      peak: max(per.map((p) => p.peak)),
      busyPct: mean(per.map((p) => p.busy)),
      wordsPerMin: mean(per.map((p) => p.wpm)),
      goldAtEnd: mean(per.filter((p) => p.gold >= 0).map((p) => p.gold)),
      heroHpAtEndPct: mean(per.filter((p) => p.hp >= 0).map((p) => p.hp)),
    };
  });
  const shares = runs.map((run) => {
    const d = run.metrics.damage;
    const total = d.word + d.skill + d.ourSide + d.other;
    return { word: pct(d.word, total), skill: pct(d.skill, total), ourSide: pct(d.ourSide, total), other: pct(d.other, total) };
  });
  const kills: Record<string, number> = {};
  for (const run of runs) for (const [by, n] of Object.entries(run.metrics.kills)) kills[by] = (kills[by] ?? 0) + (n ?? 0) / runs.length;
  const sum = (pick: (run: BotRun) => number) => runs.reduce((total, run) => total + pick(run), 0);
  const keys = sum((run) => run.metrics.typing.keys);
  const waveTicks = sum((run) => run.metrics.waves.reduce((total, wave) => total + (wave?.ticks ?? 0), 0));
  const waveWords = sum((run) => run.metrics.waves.reduce((total, wave) => total + (wave?.words ?? 0), 0));
  const gaps = runs.flatMap((run) => run.metrics.ultimatesAt.slice(1).map((at, k) => (at - run.metrics.ultimatesAt[k]!) / 60));
  const rejected: Record<string, number> = {};
  const sent: Record<string, number> = {};
  const events: Record<string, number> = {};
  for (const run of runs) {
    for (const [key, n] of Object.entries(run.metrics.rejected)) rejected[key] = (rejected[key] ?? 0) + n;
    for (const [key, n] of Object.entries(run.sent)) sent[key] = (sent[key] ?? 0) + n;
    for (const [key, n] of Object.entries(run.metrics.events)) events[key] = (events[key] ?? 0) + n;
  }
  const byReason: Record<string, number> = {};
  for (const run of runs) for (const [key, n] of Object.entries(run.metrics.gold.byReason)) byReason[key] = (byReason[key] ?? 0) + n / runs.length;
  const timed = runs.filter((run) => run.steps !== null);
  const sky = new Set(MAPS[stage.mapId]?.sky.map((lane) => lane.id) ?? []);
  const groundLanes = stage.lanes.filter((id) => !sky.has(id)).length;
  return {
    bot,
    label: spec?.label ?? bot,
    runs: runs.length,
    results,
    winPct: pct(results.victory ?? 0, runs.length),
    meanWave: mean(runs.map((run) => run.wave)),
    defeatWaves: runs.filter((run) => run.result === "defeat").map((run) => run.wave),
    stalled: [...new Set(runs.filter((run) => run.stalled !== "").map((run) => run.stalled))],
    stars,
    heroHpPct: mean(runs.map((run) => run.heroHpPct)),
    peaks,
    waves,
    damage: { word: mean(shares.map((s) => s.word)), skill: mean(shares.map((s) => s.skill)), ourSide: mean(shares.map((s) => s.ourSide)), other: mean(shares.map((s) => s.other)) },
    kills,
    hard: {
      sharePct: pct(sum((run) => run.metrics.hard.hardTicks), sum((run) => run.metrics.hard.foeTicks)),
      worstPct: max(runs.map((run) => run.metrics.hard.worstPct)),
      over35Pct: pct(sum((run) => run.metrics.hard.foesOver35), sum((run) => run.metrics.hard.foes)),
      heldPct: pct(sum((run) => run.metrics.hard.heldTicks), sum((run) => run.metrics.hard.foeTicks)),
    },
    typing: {
      keys: keys / Math.max(1, runs.length),
      accuracyPct: 100 - pct(sum((run) => run.metrics.typing.wrongKeys), keys),
      words: sum((run) => run.metrics.typing.words) / Math.max(1, runs.length),
      locks: sum((run) => run.metrics.typing.locks) / Math.max(1, runs.length),
      locksLostPct: pct(sum((run) => run.metrics.typing.locksLost), sum((run) => run.metrics.typing.locks)),
      capacityWpm: spec?.hands ? capacity(spec.hands.wpm) : 0,
      measuredWpm: waveTicks > 0 ? waveWords / ((waveTicks * TICK_MS) / 60_000) : 0,
    },
    gold: {
      start: mean(runs.map((run) => run.metrics.gold.start)),
      earned: mean(runs.map((run) => run.metrics.gold.earned)),
      spent: mean(runs.map((run) => run.metrics.gold.spent)),
      end: mean(runs.map((run) => run.metrics.gold.end)),
      beforeLast: mean(runs.map((run) => run.metrics.waves[stage.waves.length - 1]?.goldAtStart ?? run.metrics.gold.end)),
      formula: ECONOMY.startGold + stageGoldBudget(groundLanes, stage.type, stage.goldTypePct),
      byReason,
    },
    live: { maxFoes: max(runs.map((run) => run.metrics.live.maxFoes)), maxWords: max(runs.map((run) => run.metrics.live.maxWords)) },
    jamsPerMin: jamsPerMinute(runs, waveTicks),
    ultimateGapS: mean(gaps),
    rejected,
    sent,
    events,
    steps: timed.length === 0 ? null : {
      meanMs: mean(timed.map((run) => run.steps!.meanMs)),
      p95Ms: max(timed.map((run) => run.steps!.p95Ms)),
      p99Ms: max(timed.map((run) => run.steps!.p99Ms)),
      maxMs: max(timed.map((run) => run.steps!.maxMs)),
      realtime: (sum((run) => run.ticks) * TICK_MS) / Math.max(1e-9, sum((run) => run.steps?.totalMs ?? 0)),
    },
  };
}

// ── Gates ──────────────────────────────────────────────────────────────────

export type GateStatus = "đạt" | "trượt" | "bị chặn";

export interface Gate {
  readonly id: string;
  readonly name: string;
  readonly want: string;
  readonly got: string;
  readonly status: GateStatus;
}

/** A bot's runs say nothing yet when any of them stalled or timed out, or nothing ever spawned. */
const blocked = (summary: BotSummary | undefined): boolean =>
  summary === undefined || summary.runs === 0 || (summary.results.stalled ?? 0) + (summary.results.timeout ?? 0) > 0 || (summary.events.spawn ?? 0) === 0;

export function m0Gates(summaries: Readonly<Record<string, BotSummary>>): Gate[] {
  const gates: Gate[] = [];
  const win = (bot: string, id: string, name: string, want: string, ok: (winPct: number) => boolean) => {
    const s = summaries[bot];
    gates.push({ id, name, want, got: s ? f1(s.winPct) + " % thắng (" + s.runs + " seed)" : "chưa chạy", status: s === undefined || blocked(s) ? "bị chặn" : ok(s.winPct) ? "đạt" : "trượt" });
  };
  win("b35", "G1", "35 WPM, đồ trung bình", M0_GATES.win35[0] + "–" + M0_GATES.win35[1] + " %", (w) => w >= M0_GATES.win35[0] && w <= M0_GATES.win35[1]);
  win("b25", "G3", "25 WPM, đồ trung bình", "≥ " + M0_GATES.win25Min + " %", (w) => w >= M0_GATES.win25Min);
  // DESIGN.md §9 asks ≤ 40 %, 00 §7 G5 asks ≥ 70 % for stages 1–10: the canon wins (00-canon.md is the single source).
  win("typingOnly", "G5", "Chỉ gõ, không mua (10 đợt)", "≥ " + M0_GATES.typingOnlyWinMin + " % (00 §7; DESIGN §9 ghi ≤ " + M0_GATES.typingOnlyWinMax + " %, canon thắng)", (w) => w >= M0_GATES.typingOnlyWinMin);
  const none = summaries.noTyping;
  const lostEarly = none ? none.defeatWaves.filter((wave) => wave <= M0_GATES.noTypingLoseByWave).length : 0;
  gates.push({
    id: "G6",
    name: "Không gõ, mua tốt nhất",
    want: "thua 100 %, trước hết đợt " + M0_GATES.noTypingLoseByWave,
    got: none ? lostEarly + "/" + none.runs + " thua sớm; đợt thua " + (none.defeatWaves.join(", ") || "—") : "chưa chạy",
    status: none === undefined || blocked(none) ? "bị chặn" : lostEarly === none.runs ? "đạt" : "trượt",
  });
  const typists = ["b25", "b35", "b60"].map((bot) => summaries[bot]).filter((s): s is BotSummary => s !== undefined);
  const peak = max(typists.map((s) => s.peaks[GATE_WINDOW_S + "s"] ?? 0));
  gates.push({
    id: "G9",
    name: "Tải đỉnh (cửa sổ " + GATE_WINDOW_S + " s)",
    want: "≤ " + f2(M0_GATES.peakLoadMax100 / 100),
    got: typists.length === 0 ? "chưa chạy" : f2(peak),
    status: typists.length === 0 || typists.every(blocked) ? "bị chặn" : peak <= M0_GATES.peakLoadMax100 / 100 ? "đạt" : "trượt",
  });
  return gates;
}

/** The rest of 00 §7 a single M0 stage can already say something about (not M0 gates; for tuning). */
export function extraGates(summaries: Readonly<Record<string, BotSummary>>): Gate[] {
  const s = summaries.b35;
  if (!s) return [];
  const status = (ok: boolean): GateStatus => (blocked(s) ? "bị chặn" : ok ? "đạt" : "trượt");
  const earned = s.gold.start + s.gold.earned;
  const tier2 = s.jamsPerMin.tier2;
  return [
    { id: "G8", name: "Phần phe ta (b35)", want: "20–35 %, trần 40 %", got: f1(s.damage.ourSide) + " %", status: status(s.damage.ourSide >= 20 && s.damage.ourSide <= 35) },
    { id: "G9b", name: "Chữ sống ≤ N_max", want: "≤ " + LETTER_BUDGET.nMaxCap, got: String(max(Object.values(summaries).map((x) => x.live.maxWords))), status: status(max(Object.values(summaries).map((x) => x.live.maxWords)) <= LETTER_BUDGET.nMaxCap) },
    {
      id: "G9c",
      name: "Tải đỉnh cửa sổ 6 s và 10 s (b35)",
      want: "≤ " + f2(M0_GATES.peakLoadMax100 / 100) + " (00 §4.4: đỉnh 6–10 s)",
      got: f2(s.peaks["6s"] ?? 0) + " / " + f2(s.peaks["10s"] ?? 0),
      status: status(Math.max(s.peaks["6s"] ?? 0, s.peaks["10s"] ?? 0) <= M0_GATES.peakLoadMax100 / 100),
    },
    { id: "G10", name: "Tầng 2 chữ đầu (b35)", want: "< 1 lần mỗi phút", got: tier2 === undefined ? "không đếm" : f2(tier2) + " /phút", status: tier2 === undefined ? "bị chặn" : status(tier2 < 1) },
    { id: "G11", name: "Mất khóa vì nguồn khác (b35)", want: "≤ 5 % số khóa", got: f1(s.typing.locksLostPct) + " % của " + f1(s.typing.locks) + " khóa", status: status(s.typing.locksLostPct <= 5) },
    {
      id: "G13",
      name: "Vàng ải (b35)",
      want: "±15 % của " + s.gold.formula + "; dư ≤ 15 %",
      got: f1(earned) + "; dư lúc vào đợt cuối " + f1(pct(s.gold.beforeLast, earned)) + " %, cuối ải " + f1(pct(s.gold.end, earned)) + " %",
      status: status(Math.abs(earned - s.gold.formula) <= s.gold.formula * 0.15 && s.gold.beforeLast <= earned * 0.15),
    },
    { id: "G15", name: "Khống chế cứng mỗi quái (b35)", want: "≤ 35 % thời gian sống", got: "tệ nhất " + f1(s.hard.worstPct) + " %, " + f1(s.hard.over35Pct) + " % quái vượt", status: status(s.hard.worstPct <= 35) },
    { id: "G16", name: "Tối Thượng (b35, cổng từ ải 15)", want: "mỗi 90–110 s", got: s.ultimateGapS > 0 ? f1(s.ultimateGapS) + " s" : "chưa đủ 2 lần", status: s.ultimateGapS > 0 ? status(s.ultimateGapS >= 90 && s.ultimateGapS <= 110) : "bị chặn" },
  ];
}

// ── The wave plan, without the sim (00 §4.4–4.5) ───────────────────────────

export interface PlanRow {
  readonly wave: number;
  readonly groups: number;
  readonly w: number;
  readonly target: number;
  readonly load: number;
  readonly band: string;
  readonly peak: number;
  readonly peakCap: number;
  readonly generalPct: number;
  readonly problems: string[];
}

export function planRows(stage: StageDef = STAGE_M0): PlanRow[] {
  const last = stage.waves.length;
  return stage.waves.map((wave) => {
    const band: readonly number[] = wave.n === 1 ? LOAD.wave1 : wave.n === last ? LOAD.final : LOAD.middle;
    const load = planLoad(wave);
    const w = planW(wave);
    const peak = peakLoad(planArrivals(wave), GATE_WINDOW_S);
    const generalW = wave.groups.filter((group) => wave.generals.includes(group.foe as never)).reduce((sum, group) => sum + foeW(group.foe) * group.count, 0);
    const generalPct = pct(generalW, w);
    const problems: string[] = [];
    if (wave.load100 < band[0]! || wave.load100 > band[1]!) problems.push("đích ngoài dải 00 §4.4");
    if (wave.groups.length === 0) problems.push("chưa có toán");
    else {
      if (Math.abs(load * 100 - wave.load100) > wave.load100 * 0.1) problems.push("tải lệch đích > 10 %");
      if (peak * 100 > Math.min(wave.peakLoad100, LOAD.hardCap) + 0.5) problems.push("đỉnh quá trần");
      if (generalPct > (wave.n === last ? FLOW.generalShareFinalPct : FLOW.generalSharePct)) problems.push("tướng quá phần W");
      if (wave.generals.length > 0 && generalW === 0) problems.push("thiếu tướng trong toán");
    }
    return { wave: wave.n, groups: wave.groups.length, w, target: wave.load100 / 100, load, band: band.map((v) => f2(v / 100)).join("–"), peak, peakCap: wave.peakLoad100 / 100, generalPct, problems };
  });
}

/** Static checks of the map against the M0 items: what each house pad and net post can reach. */
export function mapNotes(world: World): string[] {
  const notes: string[] = [];
  const at = (slot: SlotState): Vec2 => [slot.x / U_PER_M, slot.z / U_PER_M];
  const dist = (a: Vec2, b: Vec2) => Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));
  const hut = HOUSES["herb-hut"].radiusMm / 1000;
  const dais = world.map.dais.radiusM;
  const pads = world.slots.filter((slot) => slot.def.kind === "house");
  const blocks = world.slots.filter((slot) => slot.def.kind === "block");
  const heroFar = pads.filter((pad) => dist(at(pad), [0, 0]) > hut);
  if (heroFar.length > 0) {
    const nearest = Math.min(...pads.map((pad) => dist(at(pad), [0, 0])));
    notes.push(
      "Nhà Thuốc Lá (bán kính " + hut + " m): " + heroFar.length + "/" + pads.length + " bệ nhà cách tâm Rồng xa hơn bán kính (gần nhất " + nearest.toFixed(1) +
        " m). Nếu sim đo tới tâm, nhà không hồi được Hỏa Long; đo tới mép Bệ Rồng (" + dais + " m) thì " +
        pads.filter((pad) => dist(at(pad), [0, 0]) <= hut + dais).length + " bệ với tới. Bot coi như đo tới mép bệ.",
    );
  }
  for (const pad of pads) {
    const reach = blocks.filter((block) => dist(at(pad), at(block)) <= hut).map((block) => block.def.id);
    if (reach.length > 0) notes.push("Bệ " + pad.def.id + " hồi được lính ở " + reach.join(", ") + ".");
  }
  const net = TRAPS["net-launcher"].area.radiusMm / 1000;
  const ends = world.lanes.filter((lane) => lane.sky).map((lane): Vec2 => [lane.xs[lane.xs.length - 1]! / U_PER_M, lane.zs[lane.zs.length - 1]! / U_PER_M]);
  const netSlots = world.slots.filter((slot) => slot.def.kind === "trap" && ends.some((end) => dist(at(slot), end) <= net)).map((slot) => slot.def.id);
  notes.push("Lưới Phóng (tầm " + net + " m) với tới cuối đường trời từ: " + (netSlots.join(", ") || "không ô nào") + ".");
  return notes;
}

// ── Readiness: what each lane's systems did in a run ───────────────────────

export interface Readiness {
  readonly what: string;
  readonly lane: string;
  readonly ok: boolean;
}

export function readiness(summaries: Readonly<Record<string, BotSummary>>): Readiness[] {
  const all: Record<string, number> = {};
  const sent: Record<string, number> = {};
  let ourSide = 0;
  let word = 0;
  let skill = 0;
  let kills = 0;
  for (const s of Object.values(summaries)) {
    for (const [key, n] of Object.entries(s.events)) all[key] = (all[key] ?? 0) + n;
    for (const [key, n] of Object.entries(s.sent)) sent[key] = (sent[key] ?? 0) + n;
    ourSide += s.damage.ourSide;
    word += s.damage.word;
    skill += s.damage.skill;
    kills += Object.values(s.kills).reduce((a, b) => a + b, 0);
  }
  const has = (type: string) => (all[type] ?? 0) > 0;
  return [
    { what: "Enter bắt đầu, báo đợt, đợt chạy", lane: "sim-battle (waves)", ok: has("wave-start") },
    { what: "Quái sinh ở cổng", lane: "sim-battle (spawn)", ok: has("spawn") },
    { what: "Quái đi theo đường", lane: "sim-battle (movement)", ok: has("move") },
    { what: "Quái đánh Rồng, lính, nhà", lane: "sim-battle (combat)", ok: has("attack") },
    { what: "Gán chữ lên quái", lane: "typing-learning (words)", ok: has("word-assigned") },
    { what: "Gõ xong từ", lane: "typing-learning (words)", ok: has("word-complete") },
    { what: "Đòn gõ trúng quái", lane: "sim-battle (combat)", ok: word > 0 },
    { what: "Kỹ năng Rồng gây sát thương", lane: "sim-battle (combat)", ok: skill > 0 },
    { what: "Quái chết", lane: "sim-battle (combat)", ok: kills > 0 },
    { what: "Vàng chảy (hạ quái, hết đợt)", lane: "sim-ourside (economy)", ok: has("gold") },
    { what: "Đặt món trong cửa hàng", lane: "sim-ourside (shop)", ok: has("built") || (sent.place ?? 0) === 0 },
    { what: "Bẫy, lính, nhà gây sát thương", lane: "sim-ourside (traps, units)", ok: ourSide > 0 },
    { what: "Hết đợt, sang nghỉ", lane: "sim-battle (waves)", ok: has("wave-end") },
  ];
}

// ── Markdown ───────────────────────────────────────────────────────────────

export interface ReportInput {
  readonly seeds: number;
  readonly summaries: Readonly<Record<string, BotSummary>>;
  readonly plan: readonly PlanRow[];
  readonly notes: readonly string[];
  readonly wallS: number;
}

const table = (head: readonly string[], rows: readonly (readonly (string | number)[])[]): string =>
  ["| " + head.join(" | ") + " |", "|" + head.map(() => "---").join("|") + "|", ...rows.map((row) => "| " + row.join(" | ") + " |")].join("\n");

export function markdown(input: ReportInput): string {
  const { summaries } = input;
  const out: string[] = [];
  out.push("# Rồng Giữ Ải — báo cáo bot M0 (" + STAGE_M0.id + ", " + input.seeds + " seed mỗi bot)");
  out.push("");
  out.push("## Cổng M0 (DESIGN.md §9)");
  out.push(table(["Cổng", "Bot", "Cần", "Đo được", "Kết quả"], m0Gates(summaries).map((g) => [g.id, g.name, g.want, g.got, g.status])));
  const extra = extraGates(summaries);
  if (extra.length > 0) {
    out.push("");
    out.push("## Cổng khác của 00 §7 (để chỉnh số, chưa là cổng M0)");
    out.push(table(["Cổng", "Đo", "Cần", "Đo được", "Kết quả"], extra.map((g) => [g.id, g.name, g.want, g.got, g.status])));
  }
  const ready = readiness(summaries);
  const missing = ready.filter((r) => !r.ok);
  out.push("");
  out.push("## Hệ nào đã chạy");
  out.push(missing.length === 0 ? "Mọi hệ bot cần đều đã có tác dụng." : table(["Việc", "Làn", "Có tác dụng"], ready.map((r) => [r.what, r.lane, r.ok ? "có" : "**chưa**"])));
  out.push("");
  out.push("## Kết quả từng bot");
  out.push(
    table(
      ["Bot", "Thắng %", "Kết quả", "Sao", "Đợt TB", "Thua ở đợt", "Máu Rồng cuối %", "Bị kẹt"],
      Object.values(summaries).map((s) => [
        s.bot + " (" + s.label + ")",
        f1(s.winPct),
        Object.entries(s.results).map(([k, n]) => k + " " + n).join(", "),
        Object.entries(s.stars).map(([k, n]) => k + "★ " + n).join(", ") || "—",
        f1(s.meanWave),
        s.defeatWaves.length === 0 ? "—" : s.defeatWaves.join(" "),
        f1(s.heroHpPct),
        s.stalled.join("; ") || "—",
      ]),
    ),
  );
  out.push("");
  out.push("## Tải gõ theo đợt (W_gõ / (22,7 × k_E × phút); đỉnh cửa sổ " + GATE_WINDOW_S + " s)");
  for (const s of Object.values(summaries)) {
    if (!s.waves.some((w) => w.runs > 0)) continue;
    out.push("");
    out.push("**" + s.bot + "** — đỉnh 6/8/10 s: " + PEAK_WINDOWS_S.map((w) => f2(s.peaks[w + "s"] ?? 0)).join(" / "));
    out.push(
      table(
        ["Đợt", "Lượt tới", "W_gõ", "Tải", "Đỉnh", "Bận gõ %", "Từ/phút", "Vàng cuối đợt", "Máu Rồng cuối đợt"],
        s.waves.filter((w) => w.runs > 0).map((w) => [w.wave, w.runs, f1(w.w), f2(w.load), f2(w.peak), f1(w.busyPct), f1(w.wordsPerMin), f1(w.goldAtEnd), f1(w.heroHpAtEndPct)]),
      ),
    );
  }
  out.push("");
  out.push("## Sát thương, khống chế, khóa, vàng");
  out.push(
    table(
      ["Bot", "Gõ %", "Kỹ năng %", "Phe ta %", "Khống chế cứng % (tệ nhất 1 con)", "Bị chặn %", "Mất khóa %", "Gõ: từ/phút (C(E))", "Chính xác %", "Vàng có / công thức", "Tiêu", "Dư vào đợt cuối", "Dư cuối ải"],
      Object.values(summaries).map((s) => [
        s.bot,
        f1(s.damage.word),
        f1(s.damage.skill),
        f1(s.damage.ourSide),
        f1(s.hard.sharePct) + " (" + f1(s.hard.worstPct) + ")",
        f1(s.hard.heldPct),
        f1(s.typing.locksLostPct),
        f1(s.typing.measuredWpm) + " (" + f1(s.typing.capacityWpm) + ")",
        f1(s.typing.accuracyPct),
        f1(s.gold.start + s.gold.earned) + " / " + s.gold.formula,
        f1(s.gold.spent),
        f1(s.gold.beforeLast),
        f1(s.gold.end),
      ]),
    ),
  );
  out.push("");
  out.push("## Sức chạy sim (00 §8: ≤ " + SIM_BUDGET.stepMicros / 1000 + " ms một bước, ≥ " + SIM_BUDGET.realtimeFactor + "× thời gian thực)");
  out.push(
    table(
      ["Bot", "ms TB", "ms p95", "ms p99", "ms tối đa (gồm JIT, GC)", "× thời gian thực", "Quái sống tối đa", "Chữ sống tối đa", "Lệnh bị từ chối"],
      Object.values(summaries).map((s) => [
        s.bot,
        s.steps ? s.steps.meanMs.toFixed(4) : "—",
        s.steps ? s.steps.p95Ms.toFixed(4) : "—",
        s.steps ? s.steps.p99Ms.toFixed(4) : "—",
        s.steps ? s.steps.maxMs.toFixed(3) : "—",
        s.steps ? f1(s.steps.realtime) : "—",
        s.live.maxFoes,
        s.live.maxWords,
        Object.entries(s.rejected).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => k + " ×" + n).join("; ") || "—",
      ]),
    ),
  );
  out.push("");
  out.push("## Kế hoạch đợt, tính tay (không cần sim)");
  out.push(
    table(
      ["Đợt", "Toán", "W_gõ", "Đích", "Tải", "Dải", "Đỉnh 8 s", "Trần đỉnh", "Tướng % W", "Vấn đề"],
      input.plan.map((r) => [r.wave, r.groups, f1(r.w), f2(r.target), f2(r.load), r.band, f2(r.peak), f2(r.peakCap), f1(r.generalPct), r.problems.join("; ") || "—"]),
    ),
  );
  if (input.notes.length > 0) {
    out.push("");
    out.push("## Ghi chú");
    for (const note of input.notes) out.push("- " + note);
  }
  out.push("");
  out.push("_" + f1(input.wallS) + " s, Node " + process.version + "._");
  return out.join("\n");
}
