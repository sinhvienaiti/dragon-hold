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

/**
 * The length slot of a word of `kind` (01 §3.4); `foe` is the foe it stands on, if any.
 * Ấn Phá and a general's last word are D4, the urgent column (02 §1.4); `last` marks that last word.
 */
export function lengthSlotFor(kind: WordKind, foe: FoeShape | null, last = false): LengthSlot {
  switch (kind) {
    case "urgent":
    case "seal":
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
      return last ? "urgent" : "general";
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

/** D1 words (02 §1.4: banner flags, swarm clusters) are one letter shorter at the top than their slot: 3–4 at E 25–44. */
export const isD1Kind = (kind: WordKind): boolean => kind === "flag" || kind === "cluster";

/**
 * The [lo, hi] a word of `slot` asks for at `wpm`; an elite's word is one
 * letter longer than a small foe's (01 §3.6); a D1 word one letter shorter
 * at the top. Held inside the deck's 3–10.
 */
export function wordLengths(wpm: number, slot: LengthSlot, elite = false, d1 = false): [number, number] {
  const [lo, hi] = lengthRange(wpm, slot);
  const extra = elite ? 1 : 0;
  const top = d1 ? Math.max(lo, hi - 1) : hi;
  const clampLen = (n: number) => Math.min(MAX_WORD_LETTERS, Math.max(MIN_WORD_LETTERS, n));
  return [clampLen(lo + extra), clampLen(top + extra)];
}
