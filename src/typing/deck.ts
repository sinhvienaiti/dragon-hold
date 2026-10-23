/**
 * Builds the stage's WordDeck (01 §6.1): 70–100 words, new 12–15 % (8 a
 * stage, 6 on a boss stage), due 35 %, learning 30 %, known 20 %; a group
 * that runs short is filled from the stage's level band in list order
 * (common words first). Cold start (no records at all): the first 50 words
 * of the level stand in as known for reflex words. Sensitive words never
 * enter (00 D15): the app filters them with kit/vocab before this, and the
 * deck keeps only a–z words of 3–10 letters. Pure: the app loads vocabulary
 * and learning records first.
 * Owner: typing-learning (LANES.md).
 */
import { LEARNING } from "../content/rules";
import type { DeckWord, WordDeck, WordGroup } from "../content/types";
import { MAX_WORD_LETTERS, MIN_WORD_LETTERS } from "./config";

/** One candidate word with what shared learning knows about it. */
export interface DeckCandidate {
  /** Lower case a–z, NFKC-normalised. */
  readonly text: string;
  readonly level: number;
  /** No record yet: a new word. */
  readonly isNew: boolean;
  readonly mastery: number;
  readonly due: boolean;
  /** Right recalls (meaning-recall, listening, review-card). */
  readonly recalls: number;
}

export interface DeckOptions {
  /** Words in the deck (70–100); default 90. */
  readonly size?: number;
  /** New words at most (8 a stage, 6 on a boss stage). */
  readonly newMax?: number;
}

/** Words the deck may hold: a–z only, 3–10 letters. */
export const isDeckText = (text: string): boolean =>
  text.length >= MIN_WORD_LETTERS && text.length <= MAX_WORD_LETTERS && /^[a-z]+$/.test(text);

/** The group a candidate with a record belongs to (01 §6.1). */
export function groupOf(candidate: DeckCandidate): WordGroup {
  if (candidate.isNew) return "new";
  if (candidate.due || candidate.mastery < LEARNING.weakMastery) return "due";
  return candidate.mastery < LEARNING.knownMastery ? "learning" : "known";
}

/** Cold start: this many first words of the level stand in as known (01 §6.1). */
export const COLD_KNOWN = 50;
/** Long words (≥ 7 letters) each group keeps first, for urgent and general words (01 §3.4). */
const LONG = 7;

/** `pick` is an integer source in [min, max] from the run's `words` RNG stream. */
export function buildWordDeck(candidates: readonly DeckCandidate[], vocabLevel: number, pick: (min: number, max: number) => number, options: DeckOptions = {}): WordDeck {
  const [minSize, maxSize] = LEARNING.deckSize;
  const size = Math.max(minSize, Math.min(maxSize, options.size ?? 90));
  const newMax = options.newMax ?? LEARNING.newPerStage;
  const seen = new Set<string>();
  const pool = candidates.filter((candidate) => {
    const ok = isDeckText(candidate.text) && !seen.has(candidate.text);
    if (ok) seen.add(candidate.text);
    return ok;
  });
  const cold = pool.every((candidate) => candidate.isNew);
  const taken = new Set<string>();
  const out: DeckWord[] = [];
  const add = (candidate: DeckCandidate, group: WordGroup): void => {
    taken.add(candidate.text);
    out.push({ text: candidate.text, group, level: candidate.level, mastery: group === "new" ? 0 : candidate.mastery, recalls: candidate.recalls });
  };
  /** Up to `count` of `list`, long words first (a quarter of the count), then list order. */
  const takeFrom = (list: readonly DeckCandidate[], count: number, group: WordGroup): void => {
    const longFirst = Math.ceil(count / 4);
    let added = 0;
    for (const candidate of list) {
      if (added >= longFirst) break;
      if (candidate.text.length >= LONG && !taken.has(candidate.text)) {
        add(candidate, group);
        added += 1;
      }
    }
    for (const candidate of list) {
      if (added >= count) break;
      if (!taken.has(candidate.text)) {
        add(candidate, group);
        added += 1;
      }
    }
  };
  if (cold) {
    // An empty profile: reflex words from the first 50, 8 new words, the rest to learn.
    takeFrom(pool.slice(0, COLD_KNOWN), Math.min(COLD_KNOWN, size - newMax), "known");
    takeFrom(pool.filter((candidate) => !taken.has(candidate.text)), newMax, "new");
  } else {
    const byGroup = (group: WordGroup) => pool.filter((candidate) => groupOf(candidate) === group);
    const due = byGroup("due").sort((a, b) => a.mastery - b.mastery);
    takeFrom(byGroup("new"), Math.min(newMax, Math.round((size * LEARNING.groupPct.new) / 100)), "new");
    takeFrom(due, Math.round((size * LEARNING.groupPct.due) / 100), "due");
    takeFrom(byGroup("learning"), Math.round((size * LEARNING.groupPct.learning) / 100), "learning");
    takeFrom(byGroup("known"), Math.round((size * LEARNING.groupPct.known) / 100), "known");
  }
  // Short groups are filled from the band in list order: recorded words keep their group, unrecorded ones are learnt in play.
  for (const candidate of pool) {
    if (out.length >= size) break;
    if (taken.has(candidate.text)) continue;
    add(candidate, candidate.isNew ? "learning" : groupOf(candidate));
  }
  // A seeded shuffle; the run's picker shuffles again on its own stream.
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = pick(0, index);
    const value = out[index]!;
    out[index] = out[other]!;
    out[other] = value;
  }
  return { words: out, vocabLevel };
}

/** The deck's new words in deck order: the stage's Học trước list (01 §6.5). */
export const newWordsOf = (deck: WordDeck): readonly DeckWord[] => deck.words.filter((word) => word.group === "new");
