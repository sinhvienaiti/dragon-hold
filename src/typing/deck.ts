/**
 * Builds the stage's WordDeck (01 §6.1): 70–100 words, new 12–15 % (8 a
 * stage), due 35 %, learning 30 %, known 20 %; sensitive words never enter
 * (00 D15). Pure: the app loads vocabulary and learning records first.
 * Owner: typing-learning (LANES.md). Stub: body TODO.
 */
import type { WordDeck } from "../content/types";

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

/** `pick` is an integer source in [min, max] from the run's `words` RNG stream. */
export function buildWordDeck(candidates: readonly DeckCandidate[], vocabLevel: number, pick: (min: number, max: number) => number): WordDeck {
  // TODO(typing-learning)
  return { words: [], vocabLevel };
}
