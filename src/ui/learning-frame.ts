/**
 * Learning frame (01 §6.3, 05 §4.4): bottom-centre DOM queue showing word,
 * IPA and meaning by right recalls (never raw mastery, D14); new and weak
 * words pinned 2.5 s, others 0.8 s; "Vừa học" line of the last 3 new words.
 * Never shakes, never under VFX.
 * Owner: typing-learning (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { Presenter } from "../app/contracts";

/** Meaning and IPA for a word, from the loaded vocabulary. */
export type Gloss = (text: string) => { readonly vi: string; readonly ipa: string } | null;

export function createLearningFrame(root: HTMLElement, gloss: Gloss): Presenter {
  // TODO(typing-learning)
  throw new Error("ui/learning-frame: not built yet (typing-learning lane)");
}
