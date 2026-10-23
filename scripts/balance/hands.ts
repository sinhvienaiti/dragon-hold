/**
 * A typist's hands for the bots (DESIGN.md §5.2, 00 §4.3): typing power
 *   C(E) = 60 / (0.45 + 12 (ℓ + 1) / (E d))   words a minute
 * read as one word = a first-key latency (0.45 s reaction plus one key for
 * the eyes moving on) and then its letters, each 12 / (E d) seconds, d by the
 * word's group (01 §3.7). Keys slip onto a QWERTY neighbour by 1 − accuracy
 * and a slip is sometimes followed by a Backspace out of habit; the key gap
 * shrinks so that a word still takes the formula's time on average, so E is
 * the typist's net speed. Human-like bots (BALANCE.md §6) add: recognition
 * time by how well the word is known (in place of the flat 0.45 s), a
 * log-normal speed per word (CV), a slower hand when ≥ 6 words are live, and
 * a chance to drop the lock after a slip. Draws come from the bot's own
 * stream, never the world's. Script side: floats are fine here.
 * Owner: bot-balance (LANES.md).
 */
import type { RngStream } from "../../src/kit/platform";
import { logNormalDraw } from "../../src/kit/balance";
import { GRADE, TEMPO } from "../../src/content/rules";
import type { WordGroup } from "../../src/content/types";

export interface HandsSpec {
  /** E, net words a minute (5 letters a word). */
  readonly wpm: number;
  /** Share of key presses that land on the aimed letter (00 §7: 0.95, 60 WPM 0.97). */
  readonly accuracy: number;
  /** Chance of a Backspace right after a slip. */
  readonly backspace: number;
  /** Mean reaction before a word's first key, ms (00 §4.3: 450); used when `recognize` is not set. */
  readonly latencyMs: number;
  /** Per-word speed spread (log-normal CV, BALANCE.md §6); 0 or unset: none. */
  readonly cv?: number;
  /** Seconds to the first key by how well the word is known, uniform in [lo, hi] (BALANCE.md §6). */
  readonly recognize?: { readonly known: readonly [number, number]; readonly learning: readonly [number, number]; readonly new: readonly [number, number] };
  /** At this many live words the hand slows by `crowdDrop` (attention, BALANCE.md §2 factor 7). */
  readonly crowdAt?: number;
  readonly crowdDrop?: number;
  /** Chance of letting go of the lock (Esc) after a slip on a word with letters in. */
  readonly abandon?: number;
}

/** Mean seconds of the reaction in C(E) (00 §4.3). */
export const BASE_LATENCY_MS = TEMPO.baseSecondsX100 * 10;

/** d of a word group (01 §3.7). */
export const dOf = (group: WordGroup): number => GRADE.dPm[group] / 1000;

/** Mean word length ℓ at E (00 §4.3). */
export function meanLength(wpm: number): number {
  let x10: number = TEMPO.meanLengthX10[0]!.x10;
  for (const row of TEMPO.meanLengthX10) if (wpm >= row.minWpm) x10 = row.x10;
  return x10 / 10;
}

/** C(E) in words a minute with the mixed deck's d (00 §4.3); 0 for a typist who does not type. */
export function capacity(wpm: number, d = TEMPO.dMixPm / 1000, length = meanLength(wpm)): number {
  if (wpm <= 0) return 0;
  return 60 / (TEMPO.baseSecondsX100 / 100 + (12 * (length + 1)) / (wpm * d));
}

/** Expected presses for `letters` letters: misses retried, a Backspace after a slip undoing one right letter (00 §4.3 bots). */
export function expectedPresses(letters: number, accuracy: number, backspace: number): number {
  const slips = (letters * (1 - accuracy)) / accuracy;
  return letters / accuracy + slips * backspace * (1 + 1 / accuracy);
}

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

/** For each letter (a = 0), the letters beside it on its QWERTY row: where a slip lands. */
export const NEIGHBOURS: readonly (readonly number[])[] = Array.from({ length: 26 }, (_, letter) => {
  const ch = String.fromCharCode(97 + letter);
  const row = ROWS.find((keys) => keys.includes(ch))!;
  const at = row.indexOf(ch);
  return [row[at - 1], row[at + 1]].filter((key): key is string => key !== undefined).map((key) => key.charCodeAt(0) - 97);
});

export class Hands {
  constructor(
    readonly spec: HandsSpec,
    private readonly rng: RngStream,
  ) {}

  /** Mean ms between two presses on a word of `letters` letters and group `group`, so the whole word keeps C(E)'s time. */
  meanGapMs(letters: number, group: WordGroup): number {
    const { wpm, accuracy, backspace } = this.spec;
    const presses = expectedPresses(letters, accuracy, backspace);
    // 0.45 + 12 (ℓ + 1) / (E d) = latency + gap × (1 + presses).
    return ((12_000 * (letters + 1)) / (wpm * dOf(group))) / (1 + presses);
  }

  /** One gap: the mean ±50 %, even. */
  gapMs(mean: number): number {
    return mean * (0.5 + this.rng.float());
  }

  /** Reaction before a word's first key: by familiarity when the spec says, else the latency ±40 %, even. */
  reactionMs(group?: WordGroup): number {
    const recognize = this.spec.recognize;
    if (recognize && group !== undefined) {
      const [lo, hi] = group === "new" ? recognize.new : group === "known" ? recognize.known : recognize.learning;
      return (lo + (hi - lo) * this.rng.float()) * 1000;
    }
    return this.spec.latencyMs * (0.6 + 0.8 * this.rng.float());
  }

  /** This word's time × (log-normal, mean 1, CV), and × 1 / (1 − drop) in a crowd. */
  wordFactor(liveWords: number): number {
    const cv = this.spec.cv ?? 0;
    const speed = cv > 0 ? logNormalDraw(this.rng, cv) : 1;
    const crowded = this.spec.crowdAt !== undefined && liveWords >= this.spec.crowdAt;
    return speed / (crowded ? 1 - Math.min(0.9, this.spec.crowdDrop ?? 0) : 1);
  }

  /** After a slip on a word with letters in: drop the lock (Esc)? */
  abandonAfterSlip(): boolean {
    const chance = this.spec.abandon ?? 0;
    return chance > 0 && this.rng.chance(chance);
  }

  /** The letter the hand presses aiming at `letter`: it, or by 1 − accuracy a neighbour. */
  hit(letter: number): number {
    if (!this.rng.chance(1 - this.spec.accuracy)) return letter;
    const near = NEIGHBOURS[letter]!;
    return near[this.rng.int(0, near.length - 1)]!;
  }

  /** A uniform draw in [0, 1) from the hand's stream (target choice). */
  uniform(): number {
    return this.rng.float();
  }

  backspaceAfterSlip(): boolean {
    return this.rng.chance(this.spec.backspace);
  }

  chance(probability: number): boolean {
    return this.rng.chance(probability);
  }
}
