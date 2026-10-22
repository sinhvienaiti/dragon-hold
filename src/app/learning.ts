/**
 * Learning glue (01 §6): loads vocabulary (kit/vocab, /vocabulary/), asks
 * shared learning through the portal bridge (kit/learning, gameId
 * "dragon-hold"), builds the WordDeck (typing/deck.ts), and turns
 * word-complete events into learning events (one scored event per word per
 * run, D14), queued locally when the portal is absent.
 * Owner: typing-learning (LANES.md). Stub: signatures fixed, body TODO.
 */
import type { SimEvent, StageDef, WordDeck } from "../content/types";
import type { Gloss } from "../ui/learning-frame";

export interface LearningClient {
  /** The stage's deck; resolves with a cold-start deck when the portal does not answer in 2 s. */
  buildDeck(stage: StageDef): Promise<WordDeck>;
  readonly gloss: Gloss;
  onEvents(events: readonly SimEvent[]): void;
  /** Sends queued events now (wave end, run end, tab close). */
  flush(): void;
  dispose(): void;
}

export function createLearningClient(): LearningClient {
  // TODO(typing-learning)
  throw new Error("app/learning: not built yet (typing-learning lane)");
}
