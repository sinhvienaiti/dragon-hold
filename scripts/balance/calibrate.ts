/**
 * Calibrates the typist (hands.ts, typist.ts) without a battle: a stream of
 * live words on kit/typing's own router and letters (TD rules), always
 * `live` words up, oldest first. Measures words a minute, letters, slips and
 * soft switches, and the formula's words a minute for the very words typed
 * (C(E) per word with its length and d, 00 §4.3), so a test can hold the bot
 * to DESIGN.md §5.2. Script side: floats are fine here.
 *   tsx scripts/balance/calibrate.ts [--wpm=35] [--minutes=20]
 * Owner: bot-balance (LANES.md).
 */
import { createRng } from "../../src/kit/platform";
import { TD_TYPING, KEY, addWord, compileDeck, compileTyping, createSession, dropWord, typeBackspace, typeLetter, unlock, wordText } from "../../src/kit/typing";
import type { DeckWord, WordGroup } from "../../src/content/types";
import { BOT_WORDS } from "./deck";
import { BASE_LATENCY_MS, Hands, dOf, type HandsSpec } from "./hands";
import type { SeenWord } from "./reader";
import { Typist } from "./typist";

export interface Calibration {
  readonly words: number;
  readonly minutes: number;
  readonly wordsPerMin: number;
  /** C(E) for the words actually typed: 60 / mean(0.45 + 12 (ℓ + 1) / (E d)). */
  readonly formulaPerMin: number;
  readonly meanLetters: number;
  readonly keys: number;
  readonly slipPct: number;
  readonly switches: number;
  readonly errorsPerWord: number;
}

export function calibrate(hands: HandsSpec, options: { minutes?: number; seed?: number; live?: number; words?: readonly DeckWord[] } = {}): Calibration {
  const words = options.words ?? BOT_WORDS;
  const minutes = options.minutes ?? 20;
  const live = options.live ?? 6;
  const rng = createRng(options.seed ?? 1);
  const rules = compileTyping(TD_TYPING);
  const deck = compileDeck(words.map((word) => ({ id: word.text, text: word.text, level: word.level })), { min: 3, max: 12 });
  const groupOf = new Map<string, WordGroup>(words.map((word) => [word.text, word.group]));
  const session = createSession(rules, deck, 24);
  const typist = new Typist(new Hands(hands, rng.ai));
  const ticks = Math.round(minutes * 3600);
  let done = 0;
  let letters = 0;
  let formulaS = 0;
  let errors = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    // Keep `live` words up, each with a first letter nobody holds or rests.
    for (let tries = 0; session.words.count < live && tries < 50; tries += 1) {
      const word = rng.words.int(0, deck.count - 1);
      const c = deck.letters[deck.start[word]!]!;
      if (session.letters.owner[c]! >= 0 || session.letters.freeAt[c]! > tick) continue;
      addWord(session, word, 0, 1, tick);
    }
    const seen: SeenWord[] = session.words.live().map((slot) => {
      const text = wordText(deck, session.words.word[slot]!);
      return { slot, text, kind: "enemy", group: groupOf.get(text) ?? "known", typed: session.words.typed[slot]!, asleep: false, priority: -session.words.born[slot]! - slot / 100 };
    });
    const command = typist.act({ words: seen, lock: session.router.lock, pair: session.router.group }, (tick * 1000) / 60);
    if (!command) continue;
    if (command.type === "key") {
      const outcome = typeLetter(session, command.letter, tick);
      if (outcome.result === KEY.done) {
        const word = session.words.word[outcome.slot]!;
        const text = wordText(deck, word);
        done += 1;
        letters += text.length;
        errors += session.words.errors[outcome.slot]!;
        formulaS += BASE_LATENCY_MS / 1000 + (12 * (text.length + 1)) / (hands.wpm * dOf(groupOf.get(text) ?? "known"));
        dropWord(session, outcome.slot, tick);
      }
    } else if (command.type === "backspace") typeBackspace(session);
    else if (command.type === "release") unlock(session);
  }
  return {
    words: done,
    minutes,
    wordsPerMin: done / minutes,
    formulaPerMin: done === 0 ? 0 : 60 / (formulaS / done),
    meanLetters: done === 0 ? 0 : letters / done,
    keys: typist.stats.keys,
    slipPct: typist.stats.keys === 0 ? 0 : (typist.stats.slips * 100) / typist.stats.keys,
    switches: session.stats.switches,
    errorsPerWord: done === 0 ? 0 : errors / done,
  };
}

if (process.argv[1] && /calibrate\.ts$/.test(process.argv[1])) {
  const arg = (name: string, fallback: number) => Number(process.argv.find((a) => a.startsWith("--" + name + "="))?.split("=")[1] ?? fallback);
  const wpm = arg("wpm", 35);
  console.log(JSON.stringify(calibrate({ wpm, accuracy: wpm >= 60 ? 0.97 : 0.95, backspace: 0.1, latencyMs: BASE_LATENCY_MS }, { minutes: arg("minutes", 20) }), null, 1));
}
