/**
 * Grading a finished word and the chain (01 §3.7–3.8, 00 §4.2): Chớp ×1.25,
 * Hoàn hảo ×1.10, Tốt ×1.00, Vừa ×0.90, Ẩu ×0.60, then the chain tier's
 * M_c up to ×1.16. No random crits anywhere (00 D03). Integers only. Pure.
 * Owner: typing-learning (LANES.md).
 */
import { CHAIN, GRADE } from "../content/rules";
import type { ActivityType, Grade, WordGroup, WordKind } from "../content/types";
import { gradeWord } from "../kit/typing";
import { DH_RULES } from "./config";

export const GRADES: readonly Grade[] = ["flash", "perfect", "good", "ok", "sloppy"];

/** Special words whose good typing adds 2 to the chain (01 §3.8). */
const SPECIAL: ReadonlySet<WordKind> = new Set<WordKind>(["seal", "interrupt", "boss-seal", "urgent"]);

/** d of a word, permille (01 §3.7). */
export const dPmFor = (group: WordGroup): number => GRADE.dPm[group];

/**
 * The grade of a word of `len` letters typed with `errors` wrong keys in
 * `typingTicks` (first key to last), at E = `wpm`: Chớp needs no error and
 * t_k ≤ 0.85 t_exp; one error is Tốt from 6 letters, Vừa below; two (three
 * for a boss seal cluster) is Ẩu.
 */
export function gradeOf(len: number, errors: number, typingTicks: number, wpm: number, group: WordGroup, kind: WordKind): Grade {
  const allowed = (kind === "boss-seal" ? GRADE.sealClusterSloppyErrors : GRADE.sloppyErrors) - 1;
  return gradeWord(DH_RULES, { len, errors, typing: typingTicks }, Math.max(1, wpm), dPmFor(group), allowed);
}

/** Chain tier 0–4 (00 §4.2). */
export function chainTier(chain: number): number {
  let tier = 0;
  CHAIN.thresholds.forEach((min, index) => {
    if (chain >= min) tier = index;
  });
  return tier;
}

/** The chain after a word of `grade`: +1 (+2 for special words typed well), Vừa keeps it, Ẩu halves it (01 §3.7–3.8). */
export function chainAfter(chain: number, grade: Grade, kind: WordKind): number {
  if (grade === "sloppy") return Math.floor(chain / GRADE.sloppyChainDivisor);
  const step = GRADE.chainStep[grade];
  if (step === 0) return chain;
  return chain + (SPECIAL.has(kind) ? GRADE.specialChainStep : step);
}

/** M_q permille (00 §4.2). */
export const mqPmOf = (grade: Grade): number => GRADE.mqPm[grade];

/** M_c permille of the chain tier (00 §4.2). */
export const mcPmOf = (chain: number): number => CHAIN.mcPm[chainTier(chain)]!;

/** Learning activity of a word kind (01 §6.6). */
export function activityFor(kind: WordKind): ActivityType {
  switch (kind) {
    case "enemy":
    case "cluster":
      return "typing-enemy";
    case "elite":
    case "general":
    case "seal":
      return "typing-elite";
    case "boss-part":
    case "boss-seal":
      return "typing-boss";
    default:
      return "typing-skill";
  }
}
