/**
 * Rồng Giữ Ải rule numbers for M0. Source: docs/games/dragon-lane/00-canon.md
 * (the single source; "00 §x" below), and 01–03 only where 00 points to them.
 * 00 names a rules.json; this typed module takes its place (LANES.md).
 * Every number is a starting value the bots tune (00 header); rules never
 * change when numbers do. Integers only, by suffix: …Ms milliseconds, …Mm
 * millimetres, …Pct percent, …Pm permille, …X10 tenths, w100 W × 100.
 * Owner: architect for M0a setup, sim-battle afterwards (LANES.md).
 */
import type { Difficulty, Grade, StageType, WordBand, WordGroup } from "./types";

// ── Units (00 §4.1) ────────────────────────────────────────────────────────

export const STRENGTH = {
  /** g(c) = 1 + 0.02 (c − 1), permille (00 §4.1). */
  gBasePm: 1000,
  gPerChapterPm: 20,
  /** P_ref(c) = 100 g(c): Fire Dragon power at C1 (00 §4.1, 01 §2.2). */
  power: 100,
  /** 1 W = 0.9 P_ref = 90 g(c) HP (00 §4.1, D04). */
  wHp: 90,
} as const;

/** g(c) in permille (00 §4.1): C1 1000, C10 1180, C26 1500. */
export const gPm = (chapter: number): number => STRENGTH.gBasePm + STRENGTH.gPerChapterPm * (chapter - 1);

/** Enemy HP = W × 90 × g(c) × difficulty, rounded (00 §4.1); `wPm` is the difficulty W factor (1000 for swarm and small, 00 §4.6). */
export const enemyHp = (w100: number, chapter: number, wPm: number): number =>
  Math.round((w100 * STRENGTH.wHp * gPm(chapter) * wPm) / 100_000_000);

// ── Typed hits (00 §4.2, 01 §3.7–3.8) ──────────────────────────────────────

export const GRADE = {
  /** M_q (00 §4.2). */
  mqPm: { flash: 1250, perfect: 1100, good: 1000, ok: 900, sloppy: 600 } satisfies Record<Grade, number>,
  /** Chớp: e = 0 and t_k ≤ 0.85 × t_exp (00 §4.2). */
  flashTimePm: 850,
  /** e = 1 gives Tốt on words of ≥ 6 letters, Vừa on ≤ 5 (00 §4.2). */
  goodMinLetters: 6,
  /** Ẩu from this many errors; Cụm Ấn from 3 (00 §4.2). */
  sloppyErrors: 2,
  sealClusterSloppyErrors: 3,
  /** t_exp = 12 (letters − 1) / (E d) seconds (01 §3.7). */
  tExpSecondsPerLetterX: 12,
  /** d by word group (01 §3.7; 00 §4.3 puts due with learning). */
  dPm: { known: 1000, learning: 850, due: 850, new: 700 } satisfies Record<WordGroup, number>,
  /** d for meaning-recall and listening words (01 §3.7). */
  dRecallPm: 600,
  /** Chain change per grade; Ẩu halves it (01 §3.7). */
  chainStep: { flash: 1, perfect: 1, good: 1, ok: 0, sloppy: 0 } satisfies Record<Grade, number>,
  sloppyChainDivisor: 2,
  /** Special words (Ấn Phá, Từ Ngắt, Cụm Ấn, Từ Khẩn) typed well: +2 (01 §3.8). */
  specialChainStep: 2,
  /** Three wrong keys in one word light the next letter and show the meaning again (01 §3.7). */
  hintErrors: 3,
} as const;

/** Chain tiers (00 §4.2, 01 §3.8). */
export const CHAIN = {
  /** Lowest chain of tiers 0–4. */
  thresholds: [0, 5, 10, 20, 40],
  /** M_c per tier. */
  mcPm: [1000, 1040, 1080, 1120, 1160],
  /** Extra rage gain per tier, % (01 §3.8). */
  rageBonusPct: [0, 5, 10, 15, 20],
  /** Our side +x % damage and healing from chain 5 / 10 / 20 / 40 (03 §10.4). */
  ourSideBonusPct: [0, 5, 10, 15, 20],
  /** Chain 10+: units regen +1 %/s; 20+: traps recharge 10 % faster; 40+: every 10 s a 50 shield on every unit (03 §10.4). */
  unitRegenPctPerSAt10: 1,
  trapRechargePctAt20: 10,
  shieldEveryMsAt40: 10_000,
  shieldAt40: 50,
} as const;

/** Damage and armour (00 §4.2, 03 §2.2). */
export const DAMAGE = {
  /** Armour G of tiers G0–G3 (resist K0–K3 uses the same scale): 0 / 30 / 55 / 75 % (00 §4.2). */
  tierG: [0, 43, 122, 300],
  /** reduction = G / (G + 100), capped (00 §4.2). */
  reductionCapPct: 75,
  /** Sunder halves armour (00 §4.2). */
  sunderPm: 500,
  /** A finished word's hit lands 12 ticks (0.2 s) after the last key (00 §4.2). */
  strikeDelayTicks: 12,
  /** Target died first: the hit turns to the nearest foe with a word within 4 m at 50 % (00 §4.2). */
  redirectRadiusMm: 4000,
  redirectPct: 50,
  /** Vulnerable bonuses; different sources multiply, the same source keeps the strongest (00 §4.2). */
  vulnerablePct: { mark: 15, cage: 20, bossBreak: 50 },
  /** Every damage instance deals at least 1 (03 §2.2). */
  minDamage: 1,
  /** Stunned Fire Dragon queues word hits up to 0.8 s, 3 hits (03 §2.2). */
  stunQueueMs: 800,
  stunQueueMax: 3,
} as const;

// ── Typing capacity, load and tempo (00 §4.3–4.4) ──────────────────────────

export const TEMPO = {
  /** C(E) = 60 / (0.45 + 12 (ℓ̄ + 1) / (E d)) words a minute (00 §4.3). */
  baseSecondsX100: 45,
  /** d of the mixed deck (00 §4.3). */
  dMixPm: 860,
  /** ℓ̄ × 10 by E: < 45 WPM 4.5, 45–64 5.5, ≥ 65 6.0 (00 §4.3). */
  meanLengthX10: [
    { minWpm: 0, x10: 45 },
    { minWpm: 45, x10: 55 },
    { minWpm: 65, x10: 60 },
  ],
  /** Reference capacity at 35 WPM: 22.7 words a minute (00 §4.3). */
  refWordsPerMinX10: 227,
  refWpm: 35,
  /** k_E = clamp(C(E) / 22.7; 0.75; 1.00): spawn gaps × 1 / k_E (00 §4.4, D06). */
  kEMinPm: 750,
  kEMaxPm: 1000,
} as const;

/** Wave load L × 100 bands (00 §4.4). */
export const LOAD = {
  wave1: [55, 65],
  middle: [75, 100],
  middlePeakMax: 115,
  final: [105, 125],
  /** Hard ceiling of any short peak (00 §4.4, G9). */
  hardCap: 140,
  sealWindowMax: 90,
  reviewStage: [0, 75],
  reviewStagePeakMax: 85,
  /** Peaks last 6–10 s (00 §4.4, 02 §5.3). */
  peakMs: [6000, 10_000],
} as const;

/** Typing-load W_gõ: swarm clusters and word-shield layers count 1 each (00 §4.4). */
export const LOAD_W100 = { cluster: 100, shieldLayer: 100 } as const;

// ── Stages, waves, breaks (00 §4.5, 01 §1.2) ───────────────────────────────

export const STAGE_TYPES: Readonly<Record<StageType, { readonly waves: number; readonly waveMs: readonly [number, number] }>> = {
  teach: { waves: 4, waveMs: [40_000, 50_000] },
  normal: { waves: 5, waveMs: [50_000, 65_000] }, // C1–C5; 6 waves 50–70 s from C6
  general: { waves: 5, waveMs: [50_000, 70_000] },
  review: { waves: 4, waveMs: [40_000, 50_000] },
  "mini-boss": { waves: 4, waveMs: [50_000, 60_000] },
  boss: { waves: 5, waveMs: [50_000, 65_000] },
};

export const FLOW = {
  /** Fire Dragon intro, Esc skips (01 §1.2). */
  introMs: 3000,
  /** Wave warning card (01 §1.2). */
  warningMs: 6000,
  /** Break between waves by difficulty; Easy waits for Enter (00 §4.5). */
  breakMs: { easy: null, normal: 20_000, hard: 15_000 } satisfies Record<Difficulty, number | null>,
  /** No new groups before a boss (00 §4.5). */
  preBossLullMs: 12_000,
  /** Both Dragons heal 10 % max HP between waves; at most 20 % with Library and Tổ Ấm (00 §4.5). */
  breakHealPct: 10,
  breakHealMaxPct: 20,
  /** Shift + Enter: 2 gold per second left, at most 40; +5 rage (00 §4.5). */
  callEarlyGoldPerS: 2,
  callEarlyGoldMax: 40,
  callEarlyRageX10: 50,
  /** Flyer share of a wave's threat by chapter: C1–3 15 %, C4–8 25 %, C9+ 30 %; no stage above 35 % of heads (00 §4.5). */
  flyerCapPct: [
    { fromChapter: 1, pct: 15 },
    { fromChapter: 4, pct: 25 },
    { fromChapter: 9, pct: 30 },
  ],
  flyerHeadsMaxPct: 35,
  /** General W ≤ 35 % of the wave's W_gõ (40 % in a general stage's last wave) (00 §4.5). */
  generalSharePct: 35,
  generalShareFinalPct: 40,
  /** Spawn groups on different lanes start ≥ 0.6 s apart (01 §1.4). */
  laneStaggerMs: 600,
  /** One group per gate every 1.5 s at most (02 §5.3). */
  gateGapMs: 1500,
  /** Lulls between peaks ≥ 8 s at rate × 0.4; peaks run at rate × 1.6 (02 §5.3). */
  lullMinMs: 8000,
  lullRatePct: 40,
  peakRatePct: 160,
} as const;

/** Stars (01 §5): 1 win, 2 with ≥ 50 % HP, 3 with ≥ 80 % and no Lông Phượng. */
export const STARS = { twoStarHpPct: 50, threeStarHpPct: 80 } as const;

// ── Enemy tiers and chapter curve (00 §4.6, §4.8) ──────────────────────────

/** W × 100 and threat × 10 ranges per tier (00 §4.6). */
export const TIERS = {
  swarm: { w100: [30, 50], threat10: [6, 7] },
  small: { w100: [80, 120], threat10: [30, 110] },
  medium: { w100: [200, 300], threat10: [90, 190] },
  heavy: { w100: [400, 600], threat10: [130, 170] },
  giant: { w100: [800, 1000], threat10: [210, 210] },
  captain: { w100: [500, 700], threat10: [300, 300] },
  warlord: { w100: [1000, 1200], threat10: [600, 600] },
} as const;

/** Elites: W and threat × 1.6 (00 §4.6). */
export const ELITE_PM = 1600;

/** Cluster word: 1 W of word damage to every member within 3 m (02 §1.4). */
export const CLUSTER = { hitRadiusMm: 3000, hitW100: 100 } as const;

export interface ChapterRow {
  readonly chapter: number;
  readonly bc: number;
  readonly peakLoad100: number;
  readonly maxLanes: number;
  readonly foes: readonly [number, number];
  readonly liveCap: number;
  readonly swarmPct: number;
  readonly elitePct: number;
}

/** The 26-chapter curve (00 §4.8); g(c) comes from gPm. Live cap is a sim rule on every machine (D10). */
export const CHAPTERS: readonly ChapterRow[] = (
  [
    [1, 18, 115, 1, 100, 140, 20, 40, 0],
    [2, 21, 115, 2, 110, 150, 20, 40, 0],
    [3, 25, 120, 2, 120, 160, 25, 45, 3],
    [4, 28, 120, 2, 130, 170, 35, 45, 5],
    [5, 32, 125, 3, 140, 190, 50, 50, 5],
    [6, 37, 125, 3, 150, 200, 50, 50, 6],
    [7, 41, 125, 3, 160, 210, 60, 55, 7],
    [8, 46, 130, 4, 170, 230, 70, 55, 8],
    [9, 50, 130, 4, 180, 240, 80, 60, 9],
    [10, 55, 130, 4, 190, 260, 100, 60, 10],
    [11, 60, 130, 4, 200, 270, 100, 60, 10],
    [12, 65, 130, 4, 210, 280, 100, 65, 11],
    [13, 70, 135, 4, 220, 300, 110, 65, 11],
    [14, 75, 135, 4, 230, 310, 120, 65, 12],
    [15, 80, 135, 4, 250, 330, 160, 70, 12],
    [16, 85, 135, 4, 260, 350, 160, 70, 13],
    [17, 90, 135, 4, 270, 360, 160, 70, 13],
    [18, 95, 140, 4, 280, 380, 160, 75, 14],
    [19, 100, 140, 4, 290, 390, 160, 75, 14],
    [20, 105, 140, 4, 330, 430, 220, 80, 15],
    [21, 111, 140, 4, 330, 440, 220, 80, 15],
    [22, 117, 140, 4, 340, 450, 220, 80, 15],
    [23, 122, 140, 4, 340, 460, 220, 80, 15],
    [24, 128, 140, 4, 350, 470, 220, 80, 15],
    [25, 134, 140, 4, 350, 480, 220, 80, 15],
    [26, 140, 140, 4, 350, 500, 220, 80, 15],
  ] as const
).map(([chapter, bc, peakLoad100, maxLanes, foesMin, foesMax, liveCap, swarmPct, elitePct]) => ({
  chapter, bc, peakLoad100, maxLanes, foes: [foesMin, foesMax] as const, liveCap, swarmPct, elitePct,
}));

export function chapterRow(chapter: number): ChapterRow {
  const row = CHAPTERS[Math.min(Math.max(chapter, 1), CHAPTERS.length) - 1];
  if (!row) throw new Error("rules: no chapter " + chapter);
  return row;
}

// ── Difficulty (00 §4.10) ───────────────────────────────────────────────────

export const DIFFICULTY: Readonly<Record<Difficulty, {
  /** W of every tier but swarm and small. */
  readonly wPm: number;
  readonly enemyDamagePm: number;
  readonly enemySpeedPm: number;
  readonly spawnGapPm: number;
  readonly telegraphPm: number;
  /** Scales reward. */
  readonly scalesPm: number;
  /** Meaning on tags: always, by recalls (01 §6.3), first meeting only. */
  readonly meaning: "always" | "recalls" | "first";
}>> = {
  easy: { wPm: 850, enemyDamagePm: 700, enemySpeedPm: 900, spawnGapPm: 1150, telegraphPm: 1500, scalesPm: 800, meaning: "always" },
  normal: { wPm: 1000, enemyDamagePm: 1000, enemySpeedPm: 1000, spawnGapPm: 1000, telegraphPm: 1000, scalesPm: 1000, meaning: "recalls" },
  hard: { wPm: 1150, enemyDamagePm: 1200, enemySpeedPm: 1050, spawnGapPm: 1000, telegraphPm: 850, scalesPm: 1250, meaning: "first" },
};

// ── Economy (00 §4.9, 03 §0.2, §3) ─────────────────────────────────────────

export const ECONOMY = {
  /** Gold at stage start (00 §4.9). */
  startGold: 200,
  /** Gold budget = 200 + 900 × f_lanes × f_type (00 §4.9). */
  budget: 900,
  laneFactorPct: [100, 125, 145, 160],
  typeFactorPct: { teach: 60, normal: 100, general: 110, review: 60, "mini-boss": 110, boss: 120 } satisfies Record<StageType, number>,
  /** Budget split: kills by threat share (a cluster pays once) / wave ends (each +10 % on the last) / call-early, learn-ahead, events (00 §4.9). */
  killSharePct: 60,
  waveEndSharePct: 25,
  waveEndGrowthPct: 10,
  otherSharePct: 15,
  /** Learn-ahead: +5 per correct word, at most +40 (00 §4.9, 01 §6.5). */
  learnAheadPerWord: 5,
  learnAheadMax: 40,
  /** Review card: +10 gold per right answer, max 3 questions (01 §6.5). */
  reviewCardGold: 10,
  reviewCardQuestions: 3,
  /** Leftover gold to scales: min(3, floor(left / 100)) (00 §4.9). */
  leftoverPerScale: 100,
  leftoverScalesMax: 3,
  /** Upgrade prices: level 2 = 70 %, level 3 = 100 % of the base price, branch 120 % (03 §0.2). */
  upgradeCostPct: [70, 100],
  branchCostPct: 120,
  /** Sell refunds 70 % of the total spent; 100 % in the same break it was bought (03 §0.2). */
  sellRefundPct: 70,
  sellSameBreakPct: 100,
  /** Moving a placed item loses 10 % (03 §4.1). */
  moveLossPct: 10,
  /** House repair: 30 % of the spent price; half heals by itself at wave end (03 §8.1). */
  repairCostPct: 30,
  waveEndAutoRepairPct: 50,
} as const;

/** The stage's gold budget besides the start gold (00 §4.9). */
export function stageGoldBudget(lanes: number, type: StageType, typePctOverride?: number): number {
  const lanePct = ECONOMY.laneFactorPct[Math.min(Math.max(lanes, 1), 4) - 1]!;
  const typePct = typePctOverride ?? ECONOMY.typeFactorPct[type];
  return Math.round((ECONOMY.budget * lanePct * typePct) / 10_000);
}

// ── The two Dragons (01 §2) ─────────────────────────────────────────────────

/** Fire Dragon at Dragon level 1, chapter 1 (01 §2.2, 00 §4.2 raw armour). */
export const FIRE_DRAGON = {
  hp: 1000,
  armour: 20,
  resist: 20,
  power: 100,
  /** Hovers 2.5 m over the dais (01 §2.1). */
  hoverMm: 2500,
  /** No passive regeneration in a wave (01 §4.3). */
  regen: 0,
} as const;

/** White Dragon (01 §2.2): guide only in M0 (00 D21). */
export const WHITE_DRAGON = {
  hp: 700,
  armour: 40,
  resist: 30,
  blockSlots: 2,
  counterDamage: 15,
  counterPeriodMs: 1500,
  /** Down: exhausted 15 s, up with 40 % HP; never a defeat (00 §4.5). */
  downMs: 15_000,
  risePct: 40,
} as const;

/** Rings around the dais, from the centre (01 §2.1). */
export const RINGS = {
  daisMm: 4000,
  meleeMm: 6000,
  dangerMm: 10_000,
  shootMinMm: 10_000,
  shootMaxMm: 16_000,
  /** Word zone along the lane: foes inside it may get words (01 §2.1, §3.2). */
  wordZoneMm: 26_000,
  playMinMm: 28_000,
  playMaxMm: 32_000,
  /** Flyers circle at 6–8 m, 3 m up (01 §4.1). */
  flyerMinMm: 6000,
  flyerMaxMm: 8000,
  flyerAltitudeMm: 3000,
  /** Generals stop at 8 m (01 §4.1). */
  generalStopMm: 8000,
} as const;

/** Fire Dragon skills, tier 1 → tier 2 (01 §2.4). Power in permille of P. */
export const HERO_SKILLS = {
  /** Lửa Chữ: a Chớp word burns 0.2 P a second for 3 s. */
  wordFire: { burnPerSecondPm: 200, burnMs: 3000 },
  /** Phun Lửa (Alt + 1): 60° cone, 12 m, 1.5 P → 2.0 P, burn 3 s; default target: the lane with the most foe HP within 12 m. */
  breath: { cooldownMs: 14_000, halfAngleCosPm: 866, lengthMm: 12_000, powerPm: [1500, 2000], burnMs: 3000, damageType: "magic", tier2Level: 5 },
  /** Thiên Hỏa (Alt + 2): lands after 0.8 s, radius 4 m, 2.5 P → 3.2 P, stun 1 s; default: the densest group in the word zone. */
  skyfire: { cooldownMs: 24_000, delayMs: 800, radiusMm: 4000, powerPm: [2500, 3200], stunMs: 1000, damageType: "magic", tier2Level: 8 },
  /** Long Hống from the urgent word: 3 P word damage within 10 m, knockback 6 m, interrupts every cast (01 §3.6). */
  roar: { powerPm: 3000, radiusMm: 10_000, knockMm: 6000, damageType: "word" },
  /** Viêm Đế (Alt + 5): 10 s; each word fires a 2 × 22 m beam along the lane at 1.2 P (word); at the end Spit_Big 7 m, 4 P (magic). */
  inferno: { durationMs: 10_000, beamWidthMm: 2000, beamLengthMm: 22_000, beamPowerPm: 1200, finaleRadiusMm: 7000, finalePowerPm: 4000 },
  /** Chữ Chiêu typed: +10 % power, +1 chain (01 §2.4). */
  skillWordPowerPct: 10,
  skillWordChain: 1,
} as const;

/**
 * Battle values the design leaves open (sim-battle starting values; bots tune
 * them like the rest): E18's leap, E19's run, crowding on the path, G01's
 * planting. Speeds in mm/s equal u per tick (src/sim/fixed.ts).
 */
export const BATTLE = {
  /** E18 leaps 3 m past its blocker in 0.3 s, 1 m high (02 §2.2 sets the 0.5 s warning). */
  pounceMm: 3000,
  pounceMs: 300,
  pounceHeightMm: 1000,
  /** E19 runs its 8 m charge at 12 m/s. */
  chargeMmS: 12_000,
  /** E11 steps back at most once in 4 s; E18 waits as long after landing before another pounce. */
  retreatCooldownMs: 4000,
  /** A knockback reads as a short slide. */
  knockSlideMs: 250,
  /** Foes closer than 0.8 m along and 0.7 m across slide apart at 1.5 m/s. */
  separateAlongMm: 800,
  separateAcrossMm: 700,
  separateMmS: 1500,
  /** Room across: 3.5 m either side on the melee ring, 2 m on a sky lane, 0.25 m kept from the path edge. */
  ringRoomMm: 3500,
  skyRoomMm: 2000,
  edgeMm: 250,
  /** E25 zigzags ±0.25 m every 1.2 s (02 §2.2 "dòng zigzag"). */
  zigzagMm: 250,
  zigzagMs: 1200,
  /** A shooter takes a unit within 3 m as its target even when that unit holds nobody (E11 after stepping back). */
  shooterCloseMm: 3000,
  /** G01 plants no sooner than 4 s after it appears, with ≥ 2 allies within the banner radius or once at its stop. */
  firstPlantMs: 4000,
  plantAllies: 2,
} as const;

/** Urgent word, Từ Khẩn (01 §3.6): once a wave, when ≥ 3 foes are in the melee ring or the Fire Dragon is under 35 % HP. */
export const URGENT = { perWave: 1, meleeFoes: 3, heroHpPct: 35 } as const;

/** Long Nộ, 0–100 shared by both ultimates (01 §2.4), in tenths. */
export const RAGE = {
  maxX10: 1000,
  gradeX10: { flash: 24, perfect: 20, good: 16, ok: 12, sloppy: 4 } satisfies Record<Grade, number>,
  killMediumPlusX10: 20,
  killGeneralX10: 80,
  bossPartX10: 50,
  /** +1 per 4 % of max HP the Fire Dragon loses. */
  hpLossStepPct: 4,
  hpLossX10: 10,
  perSecondInWaveX10: 2,
  callEarlyX10: 50,
  /** At least 45 s between ultimates; target 90–110 s at 35 WPM (G16). */
  minIntervalMs: 45_000,
} as const;

/** In-stage Dragon level 1–10 (01 §2.5). */
export const HERO_LEVEL = {
  /** Cumulative XP to reach levels 2…10. */
  xpToLevel: [20, 50, 90, 140, 200, 270, 350, 440, 540],
  xp: { cluster: 2, small: 2, medium: 6, heavy: 6, elite: 10, captain: 30, warlord: 50, newWord: 3, reviewCard: 2, bossPhase: 20 },
  /** Each level: both Dragons +5 % max HP (heals the gain); never more P (D04). */
  hpPerLevelPct: 5,
  /** White Dragon passive: each new word typed right heals the Fire Dragon 2 % (01 §2.4, §6.7). */
  newWordHealPct: 2,
} as const;

// ── Words on foes (00 §5, 01 §3) ────────────────────────────────────────────

/** Letter budget (00 §5): N_max = min(16, A − 3); K_foes ≥ max(6, 0.6 N_max) with 2 urgent; others ≤ 4. */
export const LETTER_BUDGET = {
  nMaxCap: 16,
  aOffset: 3,
  foesMin: 6,
  foesPm: 600,
  urgentSlots: 2,
  othersMax: 4,
  /** Caps per non-foe source; trigger words by chapter: C1–3 0, C4–5 1, C6+ 2. */
  sources: { skill: 2, urgent: 1, assist: 2, flare: 1, map: 1 },
  triggerByChapter: [
    { fromChapter: 1, max: 0 },
    { fromChapter: 4, max: 1 },
    { fromChapter: 6, max: 2 },
  ],
  /** No new trigger word while ≥ 12 foe words live. */
  triggerHideAtFoeWords: 12,
  /** Seal windows and word rain: at most 4 boss words at once. */
  bossWordsMax: 4,
} as const;

/** Word assignment, first letters and locks (01 §3.2–3.5). */
export const WORDS = {
  /** Rank foes without words every 0.25 s. */
  assignEveryMs: 250,
  /** First pass: each lane with a foe within 20 m gets a word; flyers count as one sky lane. */
  lanePassMm: 20_000,
  /** Threat = 10 / seconds to the dais × tier factor + 6 attacking + 8 casting + 5 marked. */
  threatNumerator: 10,
  tierFactorX10: { swarm: 10, small: 10, medium: 15, heavy: 15, giant: 15, elite: 20, captain: 30, warlord: 40, boss: 50 },
  attackingBonus: 6,
  castingBonus: 8,
  markedBonus: 5,
  /** First letters: freed letters rest 1 s; 3 kept in reserve for high-priority words; q x z j avoided up to vocab level 10. */
  letterRestMs: 1000,
  reserveLetters: 3,
  avoidLetters: "qxzj",
  avoidUpToLevel: 10,
  /** Tier 2 (two-letter pairs) when no letter is free; vocab ≤ 3: when ≤ 5 are left. */
  tier2LowVocabLevel: 3,
  tier2LowVocabFree: 5,
  /** No two live words within one edit ("form", "from"). */
  minEditDistance: 2,
  /** A locked foe with ≥ 1 typed letter keeps 1 HP against other sources for 1.2 s (G11). */
  lockProtectMs: 1200,
  /** A many-word foe shows its next word 0.25 s later, soft-locked. */
  nextWordMs: 250,
  /** A hidden word revealed gets 0.5 s of grace before urgent ranking. */
  revealGraceMs: 500,
  /** New words only on slow small and medium foes ≥ 14 m from the dais, who then walk 15 % slower (01 §6.2). */
  newWordMinMm: 14_000,
  newWordSlowPct: 15,
  /** Priority for holding first letters (01 §3.3), first wins. */
  letterPriority: ["boss-seal", "interrupt", "urgent-foe", "urgent", "enemy", "skill", "assist", "trigger", "map"],
} as const;

/** Letters per word by E and slot (01 §3.4, the only length table). */
export interface LengthRow {
  readonly minWpm: number;
  readonly small: readonly [number, number];
  readonly fast: readonly [number, number];
  readonly medium: readonly [number, number];
  readonly general: readonly [number, number];
  readonly special: readonly [number, number];
  readonly urgent: readonly [number, number];
  readonly bossPart: readonly [number, number];
}

export const WORD_LENGTHS: readonly LengthRow[] = [
  { minWpm: 0, small: [3, 5], fast: [3, 4], medium: [4, 6], general: [4, 6], special: [3, 4], urgent: [6, 7], bossPart: [4, 6] },
  { minWpm: 25, small: [3, 6], fast: [3, 5], medium: [4, 7], general: [5, 7], special: [3, 5], urgent: [7, 8], bossPart: [5, 7] },
  { minWpm: 45, small: [4, 7], fast: [3, 5], medium: [5, 8], general: [5, 8], special: [3, 5], urgent: [7, 9], bossPart: [5, 8] },
  { minWpm: 65, small: [4, 8], fast: [4, 6], medium: [6, 9], general: [6, 9], special: [4, 5], urgent: [8, 10], bossPart: [6, 9] },
];

/** D1–D5 bands at E 25–44 (02 §1.4); real lengths follow WORD_LENGTHS. D5 is a 3–5 word topic chain (D19). */
export const WORD_BANDS: Readonly<Record<WordBand, readonly [number, number]>> = {
  D1: [3, 4],
  D2: [4, 6],
  D3: [5, 7],
  D4: [7, 8],
  D5: [3, 5],
};

/** In-run learning (01 §6). */
export const LEARNING = {
  gameId: "dragon-hold",
  /** Deck of 70–100 words: new 12–15 % (8 a stage, boss 6, 2 a wave), due 35 %, learning 30 %, known 20 %. */
  deckSize: [70, 100],
  newPerStage: 8,
  newPerBossStage: 6,
  newPerWave: 2,
  groupPct: { new: 15, due: 35, learning: 30, known: 20 } satisfies Record<WordGroup, number>,
  /** Mastery bands from shared/learning. */
  weakMastery: 40,
  knownMastery: 70,
  /** Meaning hides after 2 right recalls (meaning-recall, listening, review-card), never by raw mastery (D14). */
  recallsToHide: 2,
  /** Tags with meaning: at most 4; first meaning cut at ";", ≤ 22 characters (01 §3.1). */
  meaningTagsMax: 4,
  meaningMaxChars: 22,
  /** Learning frame holds: 2.5 s for new and weak words, 0.8 s for others (01 §6.3). */
  pinNewMs: 2500,
  holdOtherMs: 800,
  recentNewWords: 3,
  /** One pronunciation channel: ≥ 2.5 s apart; a queued word older than 2 s is dropped (01 §6.4). */
  pronounceGapMs: 2500,
  pronounceDropMs: 2000,
  /** Learning events go out in batches every 5 s (01 §6.6). */
  batchMs: 5000,
} as const;

// ── Our side (03) ───────────────────────────────────────────────────────────

/** Statuses (03 §2.3). */
export const STATUS = {
  /** Slow keeps the strongest; caps for foes, generals, bosses. */
  slowCapPct: { foe: 60, general: 45, boss: 30 },
  /** Hard control (stun, root, freeze): 2nd within 10 s × 0.6, 3rd × 0.3, then Vững 4 s. */
  hardWindowMs: 10_000,
  hardFactorPm: [1000, 600, 300],
  steadfastMs: 4000,
  /** Tenacity base: small and medium 0, big 15, elite +15, general 35, boss 60; cap 80. */
  tenacityPct: { small: 0, medium: 0, big: 15, eliteBonus: 15, general: 35, boss: 60 },
  tenacityCapPct: 80,
  burn: { perSecond: 5, ms: 4000, stacks: 3 },
  poison: { perSecond: 6, ms: 4000, healCutPct: 50 },
  /** Wading a river leaves Wet for 4 s after the bank (03 §2.4). */
  wetMs: 4000,
  oiledSlowPct: 15,
  markPct: 15,
  grounded: { ms: 3000, generalPm: 500 },
  /** Knockback distance ÷ weight; giants × 0.25 (03 §2.3). */
  giantKnockPm: 250,
  /** Shield is capped at 50 % max HP and never regenerates (03 §2.1). */
  shieldCapPct: 50,
  maxIcons: 5,
} as const;

/** Foe weight for blocking (03 §2.1): small 1, medium 1, big 2, giant 3; swarm ¼. In quarters, like EnemyDef.blockQuarters. */
export const BLOCK = {
  weightQuarters: { swarm: 1, small: 4, medium: 4, heavy: 8, giant: 12 },
  /** Units hold within 4 m of their block point (03 §9.1). */
  leashMm: 4000,
  /** Not enough block slots: the foe pushes on at 50 % speed. */
  passSpeedPct: 50,
  maxAttackersPerUnit: 3,
  /** Units regen 4 %/s after 3 s without a hit; all fallen units rise at wave end. */
  unitRegenPctPerS: 4,
  unitRegenDelayMs: 3000,
  maxUnits: 6,
} as const;

/** Traps, houses, resonance (03 §7–§10). */
export const OUR_SIDE = {
  trapSlotsPerLane: [3, 5],
  trapSpacingMm: [5000, 7000],
  /** No trap slot within 8 m of the centre (03 §7.1). */
  trapMinCenterMm: 8000,
  /** Upgrade effects: level 2 +45 %, level 3 +35 % more and −15 % recharge (03 §7.3). */
  upgradeMainPct: [45, 35],
  upgradeRechargePctAt3: -15,
  /** Houses: HP 600 at level 1, +40 % a level; pads 7–10 m (4–6) and 14–20 m (2–4) (03 §8.1). */
  houseHp: 600,
  houseHpPerLevelPct: 40,
  innerPadMm: [7000, 10_000],
  outerPadMm: [14_000, 20_000],
  /** Units: +40 % HP, +25 % attack a level (03 §9.2). */
  unitHpPerLevelPct: 40,
  unitAttackPerLevelPct: 25,
  /** Resonance: a word hit on a foe inside a recharging trap's area cuts 0.8 s (Chớp, Hoàn hảo 1.2 s), at most 50 % a cycle (03 §10.2). */
  resonanceMs: 800,
  resonanceBestMs: 1200,
  resonanceCapPct: 50,
  /** A word kill inside a house's area: +1 energy; 5 fires its pulse (03 §10.2). */
  houseEnergyMax: 5,
  /** In a wave, C1–C5 only consumables and repairs (03 §0.1 rule 6). */
  quickPlaceFromChapter: 6,
  /** Carry strip: 6 items, 8 from stage 21, at most 10 (03 §0.1 rule 5). */
  carryItems: 6,
  /** Two consumable slots, 3 each, shared 8 s cooldown (03 §6.3). */
  consumableSlots: 2,
  consumableStack: 3,
  consumableCooldownMs: 8000,
} as const;

// ── Keys (00 §6, read by event.code; Alt is Option on Mac) ─────────────────

export type KeyMod = "none" | "alt" | "shift";
export interface KeyBinding {
  readonly action: string;
  readonly code: string;
  readonly mod: KeyMod;
}

const digit = (n: number): string => "Digit" + n;

/** Command keys (00 §6). Letters a–z are typing only; Linux uses Shift in place of Alt for digits. */
export const KEYS: readonly KeyBinding[] = [
  { action: "backspace", code: "Backspace", mod: "none" },
  { action: "escape", code: "Escape", mod: "none" },
  { action: "replay", code: "Tab", mod: "none" },
  { action: "enter", code: "Enter", mod: "none" },
  { action: "call-early", code: "Enter", mod: "shift" },
  { action: "skill-1", code: digit(1), mod: "alt" },
  { action: "skill-2", code: digit(2), mod: "alt" },
  { action: "skill-3", code: digit(3), mod: "alt" },
  { action: "skill-4", code: digit(4), mod: "alt" },
  { action: "ult-fire", code: digit(5), mod: "alt" },
  { action: "ult-white", code: digit(6), mod: "alt" },
  { action: "consumable-1", code: digit(7), mod: "alt" },
  { action: "consumable-2", code: digit(8), mod: "alt" },
  { action: "consumable-3", code: digit(9), mod: "alt" },
  { action: "camera-reset", code: digit(0), mod: "alt" },
  { action: "rotate-left", code: "ArrowLeft", mod: "none" },
  { action: "rotate-right", code: "ArrowRight", mod: "none" },
  { action: "tilt-up", code: "ArrowUp", mod: "none" },
  { action: "tilt-down", code: "ArrowDown", mod: "none" },
  { action: "zoom-in", code: "ArrowUp", mod: "alt" },
  { action: "zoom-out", code: "ArrowDown", mod: "alt" },
  { action: "fast-forward", code: "ArrowRight", mod: "alt" },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ action: "carry-" + n, code: digit(n), mod: "none" as const })),
  { action: "edit-mode", code: "Backquote", mod: "none" },
  { action: "upgrade", code: "Equal", mod: "none" },
  { action: "sell", code: "Minus", mod: "none" },
];

/** Keys the game never binds (00 §6). */
export const KEYS_UNUSED = ["Insert", "Delete", "PageUp", "PageDown", "Pause", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"] as const;

// ── Gates and budgets ───────────────────────────────────────────────────────

/** M0 gates (DESIGN.md §9 M0 table; full list 00 §7). Win rates in %. */
export const M0_GATES = {
  win35: [75, 90],
  win25Min: 70,
  typingOnlyWinMax: 40,
  /** 0 WPM with the best buys loses before the end of wave 3 (G6). */
  noTypingLoseByWave: 3,
  peakLoadMax100: 140,
  seeds: 20,
} as const;

/** Sim speed (00 §8): one 60 Hz step at the peak ≤ 0.3 ms headless; a whole stage ≥ 200× real time. */
export const SIM_BUDGET = { stepMicros: 300, realtimeFactor: 200 } as const;
