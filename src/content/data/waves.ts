/**
 * M0 waves: 10 waves on L2-cau, load 0.6 → 1.15 over each wave's real length
 * (00 §4.4), G01 in waves 5 and 10, 3 peaks and their lulls (02 §5.3), groups
 * by 02 §5.2, lane mix by 02 §5.5 (main lane 60–70 % of ground threat; Đường
 * Cầu leads waves 1–3 and 7–8, Đường Suối waves 4–6 and 9–10).
 * Owner: sim-battle (LANES.md); the balance lane retuned it (BALANCE.md §4–§5).
 *
 * How the numbers meet (src/sim/waves.ts measures them; tests/sim/battle-waves):
 * - Typing work comes at a steady rate (BALANCE.md §3, I): a wave is cycles of
 *   a peak of light singles (02 §5.3: ≥ 1.5 × the mean group pace, slowest to
 *   reach the word zone first, so their words come up together) and a lull held
 *   by one heavy (a boar, a wolf line, the general) that keeps the typist on one
 *   target while the next peak walks in. Each group leaves when the reference
 *   typist (22.7 words a minute, 00 §4.3) would be done with the one before it
 *   at the wave's `rate`, and later while a short peak (6, 8, 10 s, the same
 *   measure as src/sim/waves.ts peakLoad100) would pass `fit100`.
 * - A wave runs until the reference typist has typed its last word: its
 *   `durationMs` (and so its load) counts the walk to the word zone and that
 *   typing, not only the gate times.
 * - Heads swing, typing work does not: the peaks are where traps, units and
 *   skills decide (02 §5.3 "chết bằng từ cụm, PHUN và bẫy").
 * - Swarm clusters are ~40 % of heads (00 §4.8, C2); flyers stay under 15 % of
 *   a wave's threat (00 §4.5, C1–3); a gate sends one group per 1.5 s and
 *   lanes start ≥ 0.6 s apart (02 §5.3, 01 §1.4); the live cap is C2's 20.
 */
import { LOAD_W100, PACE, RINGS, TEMPO } from "../rules";
import type { FoeId, SpawnGroupDef, Vec2, WaveDef } from "../types";
import { ENEMIES } from "./enemies";
import { GENERALS } from "./generals";
import { MAP_L2_CAU } from "./maps";

type Lane = "cau" | "suoi" | "troi";

const one = (lane: Lane, foe: FoeId): SpawnGroupDef => ({ atMs: 0, lane, shape: "single", foe, count: 1 });
const grunt = (lane: Lane): SpawnGroupDef => one(lane, "moss-grunt");
const grunts = (lane: Lane): SpawnGroupDef => ({ atMs: 0, lane, shape: "pair", foe: "moss-grunt", count: 2 });
/** A line of `count` grunts, 0.6 s apart (02 §5.2 "Hàng"). */
const line = (lane: Lane, count: number): SpawnGroupDef => ({ atMs: 0, lane, shape: "line", foe: "moss-grunt", count });
const archer = (lane: Lane): SpawnGroupDef => one(lane, "moss-archer");
const boar = (lane: Lane): SpawnGroupDef => one(lane, "tusk-boar");
const banner = (lane: Lane): SpawnGroupDef => one(lane, "moss-banner");
/** A swarm cluster of `count` ants under one word (02 §5.2: 4–10, together, 0.5 m apart). */
const ants = (lane: Lane, count: number): SpawnGroupDef => ({ atMs: 0, lane, shape: "cluster", foe: "thorn-ant", count });
/**
 * A wolf pack (02 §2.2: 3–5) runs in a line, 3 s apart (2.2 s in the last wave):
 * 3 × 1.2 W at once reads 1.59 in a 6 s window, over the 1.15 cap of middle
 * waves and the 1.40 hard cap (00 §4.4 short peaks are 6–10 s).
 */
const wolves = (lane: Lane, count: number, gapMs = 3000): SpawnGroupDef => ({ atMs: 0, lane, shape: "line", foe: "blight-wolf", count, gapMs });
const wasp = (): SpawnGroupDef => one("troi", "thorn-wasp");

/** W × 100 of a group's typing work (00 §4.4): a cluster is 1 W, the rest W × heads. */
function groupW100(group: SpawnGroupDef): number {
  const def = (ENEMIES as Record<string, { w100: number; word: { cluster?: boolean } } | undefined>)[group.foe] ?? GENERALS[group.foe as keyof typeof GENERALS];
  if (def.word.cluster === true) return LOAD_W100.cluster;
  return def.w100 * group.count;
}

/** Members of a group as (ms after its start, W × 100), as the spawner sends them (02 §5.2 gaps; a cluster is one arrival). */
function members(group: SpawnGroupDef): { readonly offsetMs: number; readonly w100: number }[] {
  if (group.shape === "cluster") return [{ offsetMs: 0, w100: groupW100(group) }];
  const gap = group.gapMs ?? (group.shape === "pair" ? 800 : group.shape === "single" ? 0 : 600);
  const w100 = groupW100(group) / group.count;
  return Array.from({ length: group.count }, (_, k) => ({ offsetMs: k * gap, w100 }));
}

/** How long a group holds its gate (its last member's offset). */
const spanMs = (group: SpawnGroupDef): number => members(group).reduce((max, member) => (member.offsetMs > max ? member.offsetMs : max), 0);

/** Short-peak windows of 00 §4.4 (6, 8, 10 s). */
const WINDOWS_MS: readonly number[] = [6000, 8000, 10_000];

/**
 * The busiest 6, 8 or 10 s window × 100 of `arrivals` that touches [from, to]:
 * each arrival's W is typed at the reference rate from its time on (the same
 * measure as src/sim/waves.ts peakLoad100).
 */
function peakNear(all: readonly { ms: number; w100: number }[], from: number, to: number): number {
  let best = 0;
  // Only arrivals whose typing can overlap a window touching [from, to] (a general's 6 W types for 16 s).
  const arrivals = all.filter((arrival) => arrival.ms + (arrival.w100 * MS_PER_W) / 100 > from - WINDOWS_MS[WINDOWS_MS.length - 1]! && arrival.ms < to + 1);
  for (const span of WINDOWS_MS) {
    for (let start = from - span; start <= to; start += 100) {
      const end = start + span;
      let work = 0;
      for (const arrival of arrivals) {
        const typing = (arrival.w100 * MS_PER_W) / 100;
        const lo = arrival.ms > start ? arrival.ms : start;
        const hi = arrival.ms + typing < end ? arrival.ms + typing : end;
        if (hi > lo) work += (arrival.w100 * (hi - lo)) / typing;
      }
      const load = (work * MS_PER_W) / span;
      if (load > best) best = load;
    }
  }
  return best;
}

/** Gate rules (02 §5.3, 01 §1.4): one group per gate every 1.5 s after the last one has left; lanes ≥ 0.6 s apart. */
const GATE_GAP_MS = 1500;
const LANE_STAGGER_MS = 600;
const LANE_LEAVE_MS = 600;
/** A lull is ≥ 8 s (02 §5.3); peaks last 6–10 s. */
const LULL_MIN_MS = 8000;
const PEAK_MS: readonly [number, number] = [6000, 10_000];
/** The reference typist's ms per W (00 §4.3: 22.7 words a minute). */
const MS_PER_W = 600_000 / TEMPO.refWordsPerMinX10;

type Segment = { readonly peak: boolean; readonly groups: readonly SpawnGroupDef[] };
const P = (...groups: SpawnGroupDef[]): Segment => ({ peak: true, groups });
const L = (...groups: SpawnGroupDef[]): Segment => ({ peak: false, groups });

interface Plan {
  readonly n: number;
  /** Work pace × 100 of the reference typist (≈ the wave's load × 100). */
  readonly rate: number;
  readonly peak100: number;
  /** The layout keeps every short peak at or under this × 100 (the cap less a margin for the director's squeeze). */
  readonly fit100: number;
  readonly breather?: boolean;
  readonly segments: readonly Segment[];
}

// ── When a group's typing work shows: the word zone (01 §2.1, BALANCE.md §9.1) ──

interface PathStep {
  readonly lengthM: number;
  readonly radiusM: number;
  readonly slowPct: number;
}

/** A lane cut into 0.1 m steps: distance to the dais at each step and the ford's slow (planning only). */
function pathSteps(points: readonly Vec2[], fords: readonly { fromM: number; toM: number; slowPct: number }[]): PathStep[] {
  const out: PathStep[] = [];
  let along = 0;
  for (let k = 1; k < points.length; k += 1) {
    const [ax, az] = points[k - 1]!;
    const [bx, bz] = points[k]!;
    const length = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
    const steps = Math.ceil(length / 0.1);
    for (let i = 0; i < steps; i += 1) {
      const f = (i + 0.5) / steps;
      const x = ax + (bx - ax) * f;
      const z = az + (bz - az) * f;
      const ford = fords.find((span) => along >= span.fromM && along < span.toM);
      out.push({ lengthM: length / steps, radiusM: Math.sqrt(x * x + z * z), slowPct: ford ? ford.slowPct : 0 });
      along += length / steps;
    }
  }
  return out;
}

const PATHS: Readonly<Record<Lane, PathStep[]>> = {
  cau: pathSteps(MAP_L2_CAU.lanes[0]!.points, []),
  suoi: pathSteps(MAP_L2_CAU.lanes[1]!.points, MAP_L2_CAU.lanes[1]!.features.flatMap((f) => (f.kind === "ford" ? [f] : []))),
  troi: pathSteps(MAP_L2_CAU.sky[0]!.points, []),
};

/** A word time of the reference player (00 §4.3, C_ref 19.6 words a minute). */
const REF_WORD_MS = 600_000 / PACE.refWordsPerMinX10;

/**
 * Ms from a foe leaving its gate to its first word (planning only, k = 1,
 * base speed): it walks to its stop (shooters at their hold distance, a
 * general at 8 m, the rest at the lane's end) and is in the word zone once
 * within T_a (+ a word time per extra word, src/sim/words.ts inWordZone).
 */
export function zoneDelayMs(lane: Lane, foe: FoeId): number {
  const general = foe in GENERALS;
  const def = general ? GENERALS[foe as keyof typeof GENERALS] : ENEMIES[foe as keyof typeof ENEMIES];
  const enemy = general ? null : ENEMIES[foe as keyof typeof ENEMIES];
  const stopM = general ? RINGS.generalStopMm / 1000 : enemy && enemy.role === "ranged" ? (enemy.attack.holdMm ?? enemy.attack.rangeMm) / 1000 : 0;
  let walkMs = 0;
  let ringMs = -1;
  for (const step of PATHS[lane]) {
    if (step.radiusM <= stopM) break;
    if (ringMs < 0 && step.radiusM <= RINGS.wordZoneMm / 1000) ringMs = walkMs;
    walkMs += (step.lengthM * 1000 * 100) / ((def.speedMmS / 1000) * (100 - step.slowPct));
  }
  // A small foe falls to one word (00 §4.6); bigger ones carry W rounded up.
  const words = def.word.cluster === true || (enemy !== null && enemy.tier === "small") ? 1 : def.w100 > 100 ? Math.ceil(def.w100 / 100) : 1;
  const zoneMs = PACE.approachMs + (words - 1) * REF_WORD_MS;
  return Math.round(Math.max(ringMs < 0 ? 0 : ringMs, walkMs - zoneMs));
}

/** Spawn-time gate rules between two groups (02 §5.3, 01 §1.4), `a` leaving first. */
function gatesOk(a: SpawnGroupDef, b: SpawnGroupDef): boolean {
  const gap = b.atMs - a.atMs;
  return a.lane === b.lane ? gap >= Math.max(GATE_GAP_MS, spanMs(a) + LANE_LEAVE_MS) : gap >= LANE_STAGGER_MS;
}

/**
 * Lays a wave out: each group leaves when the reference typist would be done
 * with the one before it at `rate`, never sooner than the gates allow, and
 * later while a short peak would pass `fit100`. A peak's window covers its
 * groups (6–10 s) and opens ≥ 8 s after the last one closed (02 §5.3).
 */
function layOut(plan: Plan): WaveDef {
  const groups: SpawnGroupDef[] = [];
  const peaks: { atMs: number; lengthMs: number }[] = [];
  const arrivals: { ms: number; w100: number }[] = [];
  let at = 0;
  let peakEnd = -1;
  /** A lull holding a second group lasts 2 s longer (02 §5.3: ≤ 0.4 × the mean pace; ~0.25 groups a second here). */
  let lullMs = LULL_MIN_MS;
  for (const segment of plan.segments) {
    let first = -1;
    let lastAt = 0;
    if (!segment.peak) lullMs = LULL_MIN_MS + Math.max(0, segment.groups.length - 1) * 2000;
    for (const group of segment.groups) {
      let t = Math.ceil(at / 100) * 100;
      if (segment.peak && peakEnd >= 0 && t < peakEnd + lullMs) t = peakEnd + lullMs;
      const parts = members(group);
      const reach = spanMs(group) + 10_000;
      const latest = t + 120_000;
      for (;;) {
        if (t > latest) throw new Error("waves: wave " + plan.n + " cannot fit " + group.foe + " under " + plan.fit100);
        const candidate = { ...group, atMs: t };
        const gates = groups.every((other) => (other.atMs <= t ? gatesOk(other, candidate) : gatesOk(candidate, other)));
        if (gates && peakNear([...arrivals, ...parts.map((part) => ({ ms: t + part.offsetMs, w100: part.w100 }))], t, t + reach) <= plan.fit100) break;
        t += 100;
      }
      for (const part of parts) arrivals.push({ ms: t + part.offsetMs, w100: part.w100 });
      groups.push({ ...group, atMs: t });
      if (first < 0) first = t;
      lastAt = t;
      at = t + Math.round((groupW100(group) * MS_PER_W) / plan.rate);
    }
    if (segment.peak) {
      const length = Math.min(PEAK_MS[1], Math.max(PEAK_MS[0], lastAt - first + 1000));
      peaks.push({ atMs: first, lengthMs: length });
      peakEnd = first + length;
    }
  }
  // The wave lasts until its last words are up and typed: each group's words come up once it reaches the
  // word zone and take the reference typist W × 2.64 s from there (a backlog past 1.0 is the support's, 00 §4.4).
  let typed = 0;
  for (const group of groups) {
    const done = group.atMs + spanMs(group) + zoneDelayMs(group.lane as Lane, group.foe) + Math.round((groupW100(group) * MS_PER_W) / 100 / group.count);
    if (done > typed) typed = done;
  }
  const endMs = Math.max(...groups.map((group) => group.atMs + spanMs(group)));
  const durationMs = Math.ceil(Math.max(typed, endMs + 3000) / 1000) * 1000;
  const w100 = groups.reduce((sum, group) => sum + groupW100(group), 0);
  return {
    n: plan.n,
    durationMs,
    load100: Math.round((w100 * MS_PER_W) / durationMs),
    peakLoad100: plan.peak100,
    peaks,
    generals: groups.some((group) => group.foe in GENERALS) ? ["moss-banner"] : [],
    ...(plan.breather ? { breather: true } : {}),
    groups,
  };
}

// From wave 2 a heavy opens the wave and holds each lull; a peak lists its singles slowest to the
// word zone first (Đường Suối's ford, then Đường Cầu, then shooters, wasps, ants), so their words
// come up together at the peak's end while the next heavy walks in.
const PLANS: readonly Plan[] = [
  {
    // Grunts and ant clusters; 00 §4.4 sets no peak for wave 1, so it stays at or under 1.0.
    n: 1, rate: 72, peak100: 100, fit100: 98,
    segments: [
      P(grunt("suoi"), grunt("cau"), ants("cau", 6)),
      L(grunt("cau")),
      P(grunt("suoi"), grunt("cau"), ants("cau", 6)),
      L(grunt("suoi")),
      P(grunt("suoi"), ants("cau", 8), grunt("cau"), grunt("cau")),
    ],
  },
  {
    // First Ong Gai and first Yêu Rêu Cung (alone in the third lull); grunt pairs hold the other lulls (no heavy foe yet: our side is two items strong).
    n: 2, rate: 90, peak100: 115, fit100: 100,
    segments: [
      L(grunts("cau")),
      P(grunt("suoi"), grunt("cau"), grunt("cau")),
      L(grunts("suoi")),
      P(grunt("suoi"), grunt("cau"), wasp()),
      L(archer("cau")),
      P(grunt("suoi"), ants("cau", 8), grunt("cau"), grunt("suoi"), grunt("cau")),
    ],
  },
  {
    // First Heo Nanh Đá, alone in a lull; the first Yêu Rêu Cung in a peak (it stops 12 m out and shoots the Dragon while it lives).
    n: 3, rate: 90, peak100: 115, fit100: 100,
    segments: [
      L(grunts("cau")),
      P(grunt("suoi"), grunt("cau"), archer("cau")),
      L(boar("suoi")),
      P(grunt("suoi"), grunt("cau"), wasp()),
      L(archer("cau")),
      P(grunt("suoi"), ants("cau", 8), grunt("cau"), grunt("cau"), grunt("cau")),
    ],
  },
  {
    // Đường Suối leads; boars open the wave and hold a lull.
    n: 4, rate: 94, peak100: 115, fit100: 102,
    segments: [
      L(boar("suoi")),
      P(grunt("suoi"), grunt("cau"), archer("suoi")),
      L(boar("cau")),
      P(grunt("suoi"), grunt("suoi"), archer("cau"), wasp()),
      L(archer("suoi")),
      P(grunt("suoi"), ants("suoi", 8), grunt("cau"), grunt("suoi")),
    ],
  },
  {
    // First general: G01 walks Đường Suối alone in the long lull; its 6 W keep the typist on it ~16 s.
    n: 5, rate: 100, peak100: 115, fit100: 106,
    segments: [
      L(boar("cau")),
      P(grunt("suoi"), grunt("cau"), archer("suoi"), ants("suoi", 6)),
      L(banner("suoi")),
      P(grunt("suoi"), grunt("cau"), wasp()),
      L(boar("suoi")),
      P(grunt("suoi"), ants("suoi", 8), grunt("cau"), archer("cau"), grunt("suoi")),
    ],
  },
  {
    // Breather after the general (02 §5.1): the same mix, slower.
    n: 6, rate: 96, peak100: 115, fit100: 104, breather: true,
    segments: [
      L(boar("suoi")),
      P(grunt("suoi"), archer("cau"), ants("suoi", 6)),
      L(grunt("cau")),
      P(grunt("suoi"), archer("cau"), wasp()),
      L(grunt("cau")),
      P(grunt("suoi"), ants("suoi", 8), grunt("cau"), grunt("suoi"), grunt("suoi")),
    ],
  },
  {
    // Đường Cầu leads again; the first wolf line opens it.
    n: 7, rate: 108, peak100: 115, fit100: 110,
    segments: [
      L(wolves("cau", 3)),
      P(grunt("suoi"), grunt("cau"), archer("suoi"), ants("cau", 6)),
      L(boar("suoi")),
      P(grunt("suoi"), grunt("cau"), wasp()),
      L(grunt("cau"), archer("suoi")),
      P(grunt("suoi"), ants("cau", 8), grunt("cau"), grunt("cau")),
    ],
  },
  {
    // Two boars; a near-full typist from start to end.
    n: 8, rate: 110, peak100: 115, fit100: 106,
    segments: [
      L(boar("cau")),
      P(grunt("suoi"), grunt("cau"), archer("suoi"), ants("cau", 6)),
      L(boar("suoi")),
      P(grunt("suoi"), grunt("cau"), wasp()),
      L(grunt("cau"), archer("cau")),
      P(grunt("suoi"), ants("cau", 8), grunt("cau"), grunt("cau")),
    ],
  },
  {
    // Đường Suối leads: a wolf line opens, a boar holds a lull.
    n: 9, rate: 112, peak100: 115, fit100: 110,
    segments: [
      L(wolves("suoi", 3)),
      P(grunt("suoi"), grunt("cau"), archer("cau"), ants("suoi", 6)),
      L(boar("cau")),
      P(grunt("suoi"), grunt("suoi"), grunt("cau"), wasp()),
      L(archer("cau")),
      P(grunt("suoi"), ants("suoi", 8), grunt("cau"), grunt("suoi")),
    ],
  },
  {
    // Last wave: a wolf line 2.2 s apart opens, G01 in the long lull, a boar after the second peak; the M0 exception cap 1.40 (00 §7).
    n: 10, rate: 140, peak100: 140, fit100: 139,
    segments: [
      L(wolves("suoi", 3, 2200)),
      P(grunt("suoi"), grunt("cau"), archer("suoi"), ants("suoi", 6)),
      L(banner("suoi")),
      P(grunt("suoi"), grunt("cau"), archer("cau"), wasp(), grunt("cau")),
      L(boar("cau")),
      P(grunt("suoi"), ants("suoi", 8), grunt("cau"), archer("cau"), wasp(), grunt("suoi"), grunt("cau")),
    ],
  },
];

export const M0_WAVES: readonly WaveDef[] = PLANS.map(layOut);
