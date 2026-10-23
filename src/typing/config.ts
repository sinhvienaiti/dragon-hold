/**
 * Rồng Giữ Ải typing numbers for kit/typing: TD 1A.6 defaults changed where
 * 01 §3 and 00 §5 differ (letter rest 1 s, 3 reserve letters, lock
 * protection 1.2 s from the first lethal blow, grades of 00 §4.2, words of
 * 3–10 letters, letter priority of 01 §3.3). Pure.
 * Owner: typing-learning (LANES.md).
 */
import { GRADE, LETTER_BUDGET, WORDS } from "../content/rules";
import { TD_TYPING, compileTyping, typingConfig, type TypingConfig, type TypingRules } from "../kit/typing";

/** Letter-holding kinds by priority (01 §3.3, rules WORDS.letterPriority); index 0 holds its letter first. */
export type LetterKind = (typeof WORDS.letterPriority)[number];

/** Kinds that leave the reserve letters to the higher ones (01 §3.3: 3 kept for high-priority words). */
const RESERVE_KINDS: readonly LetterKind[] = ["enemy", "skill", "assist", "trigger", "map"];

/** Longest word the run deals (01 §3.4: urgent words reach 10 at E ≥ 65). */
export const MAX_WORD_LETTERS = 10;
export const MIN_WORD_LETTERS = 3;

export const DH_TYPING: TypingConfig = typingConfig(TD_TYPING, {
  kinds: WORDS.letterPriority,
  reserveKinds: RESERVE_KINDS,
  words: { min: MIN_WORD_LETTERS, max: MAX_WORD_LETTERS },
  letters: {
    cooldownS: WORDS.letterRestMs / 1000,
    reserve: WORDS.reserveLetters,
    avoid: WORDS.avoidLetters,
    avoidUntilLevel: WORDS.avoidUpToLevel,
    tier2EarlyFree: WORDS.tier2LowVocabFree,
    tier2EarlyMaxLevel: WORDS.tier2LowVocabLevel,
    // "form" and "from" never live together, at any length the run deals.
    maxEditCheckLen: MAX_WORD_LETTERS,
  },
  router: { softSwitchMaxTyped: 1, protectS: WORDS.lockProtectMs / 1000, protectFrom: "lethal" },
  grade: {
    perChar: GRADE.tExpSecondsPerLetterX,
    flashPct: GRADE.flashTimePm / 10,
    goodLen: GRADE.goodMinLetters,
    allowed: GRADE.sloppyErrors - 1,
    longLen: 0,
    longErrors: 0,
  },
  budget: {
    totalMax: LETTER_BUDGET.nMaxCap,
    slack: LETTER_BUDGET.aOffset,
    enemyMin: LETTER_BUDGET.foesMin,
    enemyPct: LETTER_BUDGET.foesPm / 10,
    urgent: LETTER_BUDGET.urgentSlots,
    otherMax: LETTER_BUDGET.othersMax,
  },
});

/** DH_TYPING compiled once: times in ticks, kinds as indices. */
export const DH_RULES: TypingRules = compileTyping(DH_TYPING);

/** Kit kind index of a letter kind. */
export const letterKind = (kind: LetterKind): number => DH_RULES.kind[kind]!;
