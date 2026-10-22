/**
 * Letters per word by the typist's speed E and the word's slot (01 §3.4).
 * Owner: typing-learning (LANES.md).
 */
import { WORD_LENGTHS, type LengthRow } from "../content/rules";

export type LengthSlot = Exclude<keyof LengthRow, "minWpm">;

/** [min, max] letters for `slot` at `wpm`. */
export function lengthRange(wpm: number, slot: LengthSlot): readonly [number, number] {
  let row = WORD_LENGTHS[0]!;
  for (const candidate of WORD_LENGTHS) if (wpm >= candidate.minWpm) row = candidate;
  return row[slot];
}
