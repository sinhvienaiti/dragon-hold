/**
 * Letters per word by the typist's speed E and the word's slot (01 §3.4),
 * and which slot a foe or a special word takes. Pure.
 * Owner: typing-learning (LANES.md).
 */
import { WORD_LENGTHS, type LengthRow } from "../content/rules";
import type { Gait, Tier, WordKind } from "../content/types";
import { MAX_WORD_LETTERS, MIN_WORD_LETTERS } from "./config";

export type LengthSlot = Exclude<keyof LengthRow, "minWpm">;

/** [min, max] letters for `slot` at `wpm`. */
export function lengthRange(wpm: number, slot: LengthSlot): readonly [number, number] {
  let row = WORD_LENGTHS[0]!;
  for (const candidate of WORD_LENGTHS) if (wpm >= candidate.minWpm) row = candidate;
  return row[slot];
}

/** A small foe from this speed counts as fast (02 §1.2: S3 starts at 2.4 m/s). */
export const FAST_MM_S = 2400;

/** What the slot of a foe's word depends on. */
export interface FoeShape {
  readonly tier: Tier;
  readonly gait: Gait;
  readonly speedMmS: number;
  readonly general: boolean;
  readonly elite: boolean;
}

/** True for foes that leave little time to read: flyers, swarms and fast small ones (01 §6.2). */
export const isFastFoe = (foe: FoeShape): boolean =>
  foe.gait === "flyer" || foe.gait === "swarm" || ((foe.tier === "small" || foe.tier === "swarm") && foe.speedMmS >= FAST_MM_S);

/** The length slot of a word of `kind` (01 §3.4); `foe` is the foe it stands on, if any. */
export function lengthSlotFor(kind: WordKind, foe: FoeShape | null): LengthSlot {
  switch (kind) {
    case "urgent":
      return "urgent";
    case "skill":
    case "assist":
    case "interrupt":
    case "trigger":
    case "map":
    case "flag":
      return "special";
    case "boss-part":
    case "boss-seal":
      return "bossPart";
    case "general":
    case "seal":
      return "general";
    case "cluster":
      return "fast";
    case "elite":
    case "enemy":
      if (foe === null) return "small";
      if (foe.general) return "general";
      if (foe.tier === "medium" || foe.tier === "heavy" || foe.tier === "giant") return "medium";
      return isFastFoe(foe) ? "fast" : "small";
  }
}

/**
 * The [lo, hi] a word of `slot` asks for at `wpm`; an elite's word is one
 * letter longer than a small foe's (01 §3.6). Held inside the deck's 3–10.
 */
export function wordLengths(wpm: number, slot: LengthSlot, elite = false): [number, number] {
  const [lo, hi] = lengthRange(wpm, slot);
  const extra = elite ? 1 : 0;
  const clampLen = (n: number) => Math.min(MAX_WORD_LETTERS, Math.max(MIN_WORD_LETTERS, n));
  return [clampLen(lo + extra), clampLen(hi + extra)];
}
