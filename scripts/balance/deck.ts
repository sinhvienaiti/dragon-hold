/**
 * The bots' word deck (01 §6.1): 100 words from shared/vocabulary levels 1–3
 * (a–z only, no q x z j starts), frozen here so balance runs and golden
 * hashes do not move when the vocabulary does. Lengths 3–10 cover every slot
 * of 01 §3.4 from 25 to 60 WPM; groups follow 01 §6.1 (new 15 %, due 35 %,
 * learning 30 %, known 20 %), spread evenly over lengths.
 * Owner: bot-balance (LANES.md).
 */
import type { DeckWord, WordDeck, WordGroup } from "../../src/content/types";

/** word:level, by length (12 × 3, 20 × 4, 20 × 5, 16 × 6, 14 × 7, 10 × 8, 6 × 9, 2 × 10 letters). */
const SOURCE =
  "bad:1 old:1 new:1 sad:1 hot:1 day:1 man:1 car:1 get:1 eat:1 way:1 too:1 " +
  "year:1 room:1 idea:1 food:1 kind:1 look:1 play:1 also:1 very:1 good:1 cold:1 easy:1 hard:1 time:1 week:1 name:1 book:1 road:1 make:1 know:1 " +
  "small:1 young:1 place:1 learn:1 drink:1 about:1 first:1 often:2 visit:2 issue:3 happy:1 right:1 wrong:1 night:1 today:1 child:1 money:1 phone:1 story:1 group:1 " +
  "family:1 answer:1 listen:1 before:1 enough:2 decide:2 office:3 inside:3 please:1 thanks:1 school:1 friend:1 mother:1 health:1 better:1 little:1 " +
  "kitchen:3 evening:1 already:2 company:2 instead:2 website:3 outside:3 receive:3 morning:1 brother:1 problem:1 history:1 special:1 explain:2 " +
  "national:3 together:2 remember:2 actually:2 language:3 computer:3 internet:3 original:3 " +
  "possible:2 bathroom:3 different:2 afternoon:1 sometimes:2 important:2 " +
  "education:3 beautiful:2 understand:2 university:2";

/** 20 buckets of 5 %: 3 new, 7 due, 6 learning, 4 known (01 §6.1). */
const GROUP_BUCKETS: readonly WordGroup[] = [
  ...Array<WordGroup>(3).fill("new"),
  ...Array<WordGroup>(7).fill("due"),
  ...Array<WordGroup>(6).fill("learning"),
  ...Array<WordGroup>(4).fill("known"),
];

const MASTERY: Readonly<Record<WordGroup, { mastery: number; recalls: number }>> = {
  new: { mastery: 0, recalls: 0 },
  due: { mastery: 45, recalls: 1 },
  learning: { mastery: 30, recalls: 1 },
  known: { mastery: 85, recalls: 3 },
};

/** The deck's words in source order; word i takes bucket (7 i mod 20), so every length gets each group. */
export const BOT_WORDS: readonly DeckWord[] = SOURCE.split(" ").map((item, index) => {
  const [text, level] = item.split(":") as [string, string];
  const group = GROUP_BUCKETS[(index * 7) % GROUP_BUCKETS.length]!;
  return { text, group, level: Number(level), ...MASTERY[group] };
});

/** The bots' stage deck at vocabulary level 3. */
export function botDeck(words: readonly DeckWord[] = BOT_WORDS): WordDeck {
  return { words, vocabLevel: 3 };
}
