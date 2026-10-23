/**
 * A typist bot (00 §7 bots, 03 §13.1): eyes that pick the word with the
 * highest priority (reader.ts: urgent word first, then threat or nearness),
 * a reaction before each word's first key, then hands (hands.ts) pressing its
 * letters at E with slips and an occasional Backspace. It follows the lock the
 * world shows (a slip may soft-switch it), takes the second key of an open
 * tier-2 pair, lets go of a word that falls asleep, and never sends more than
 * one key a tick. Keys go out as the same SimCommands the keyboard sends.
 * A human-like typist (BALANCE.md §6) picks its next word by a mix of most
 * dangerous, nearest and first shown, reads it by familiarity, types it at a
 * per-word speed, slows in a crowd and sometimes drops a lock after a slip.
 * Owner: bot-balance (LANES.md).
 */
import type { SimCommand } from "../../src/content/types";
import type { Hands } from "./hands";
import type { SeenWord, TypingView } from "./reader";

/** How a typist picks its next foe word (BALANCE.md §6 "Chọn mục tiêu"): weights of most dangerous, nearest, first shown. */
export interface TargetMix {
  readonly danger: number;
  readonly nearest: number;
  readonly first: number;
}

export interface TypistStats {
  /** Letter keys sent, slips among them, Backspaces, Esc presses. */
  keys: number;
  slips: number;
  backspaces: number;
  releases: number;
  /** Words whose last letter the typist pressed right. */
  finished: number;
}

const code = (text: string, at: number): number => text.charCodeAt(at) - 97;

export class Typist {
  readonly stats: TypistStats = { keys: 0, slips: 0, backspaces: 0, releases: 0, finished: 0 };
  /** The hands may press again at this ms (an ideal clock, so ticks do not slow the typist). */
  private readyAt = 0;
  private target: { slot: number; text: string } | null = null;
  private gapMean = 0;
  private backspaceNext = false;
  /** The locked word the last key tried to switch away from (−1: none). */
  private switchFrom = -1;
  /** The word just finished, skipped until the world drops it. */
  private finished: { slot: number; text: string; untilMs: number } | null = null;

  constructor(
    readonly hands: Hands,
    readonly mix: TargetMix | null = null,
  ) {}

  /** The next word: special words by their priority first, then the mix (or the highest priority). */
  private choose(words: readonly SeenWord[]): SeenWord | null {
    if (this.mix === null) return pick(words);
    const awake = words.filter((word) => !word.asleep);
    if (awake.length === 0) return null;
    const special = awake.filter((word) => word.special);
    if (special.length > 0) return pick(special);
    const { danger, nearest, first } = this.mix;
    const roll = this.hands.uniform() * (danger + nearest + first);
    const by = roll < danger ? "danger" : roll < danger + nearest ? "nearest" : "first";
    let best = awake[0]!;
    for (const word of awake) {
      const better = by === "danger" ? word.priority > best.priority : by === "nearest" ? word.distance < best.distance : word.born < best.born;
      if (better) best = word;
    }
    return best;
  }

  /** True while the typist has a word in mind (the meter's busy time). */
  get busy(): boolean {
    return this.target !== null;
  }

  /** The hands press a command key (Alt + 1 …, a potion) for `ms`. */
  hold(nowMs: number, ms: number): void {
    this.readyAt = Math.max(this.readyAt, nowMs) + ms;
  }

  /** The command to send on this tick, or null. */
  act(view: TypingView, nowMs: number): SimCommand | null {
    if (nowMs < this.readyAt) return null;
    const locked = view.lock >= 0 ? view.words.find((word) => word.slot === view.lock) : undefined;
    if (locked && !this.isTarget(locked)) {
      if (locked.typed > 0 || this.switchFrom === locked.slot) {
        // A slip switched the lock, or a key meant to switch away from it did not (a slip first): type the locked word.
        this.aimAt(locked, view.words.length);
      } else if (this.target === null) {
        // A foe's next word came locked (01 §3.5): keep it unless a clearly higher word waits; its first key switches.
        const best = pick(view.words);
        const next = best !== null && best.priority > locked.priority * 1.25 ? best : locked;
        this.aimAt(next, view.words.length);
        this.readyAt = Math.max(this.readyAt, nowMs) + this.hands.reactionMs(next.group) + this.hands.gapMs(this.gapMean);
        return null;
      }
    }
    let word = this.target === null ? undefined : view.words.find((seen) => this.isTarget(seen));
    if (this.target !== null && !word) {
      this.target = null;
      this.backspaceNext = false;
    }
    if (word?.asleep) {
      this.target = null;
      if (view.lock === word.slot) {
        this.stats.releases += 1;
        this.readyAt = nowMs + this.hands.gapMs(this.gapMean);
        return { type: "release" };
      }
      word = undefined;
    }
    if (!word) {
      const done = this.finished !== null && nowMs < this.finished.untilMs ? this.finished : null;
      const next = this.choose(done === null ? view.words : view.words.filter((seen) => seen.slot !== done.slot || seen.text !== done.text));
      if (!next) {
        this.readyAt = nowMs;
        return null;
      }
      this.aimAt(next, view.words.length);
      // Reaction (by familiarity for a human-like typist) plus the formula's extra key (00 §4.3: ℓ + 1).
      this.readyAt = Math.max(this.readyAt, nowMs) + this.hands.reactionMs(next.group) + this.hands.gapMs(this.gapMean);
      return null;
    }
    this.readyAt += this.hands.gapMs(this.gapMean);
    if (this.readyAt < nowMs) this.readyAt = nowMs;
    if (this.backspaceNext) {
      this.backspaceNext = false;
      this.stats.backspaces += 1;
      return { type: "backspace" };
    }
    const typed = view.lock === word.slot ? word.typed : view.pair >= 0 && view.pair === code(word.text, 0) ? 1 : 0;
    if (typed >= word.text.length) {
      this.target = null;
      return null;
    }
    const aim = code(word.text, typed);
    // A first key while another word holds the lock is meant to switch to this one (01 §3.5).
    this.switchFrom = view.lock >= 0 && view.lock !== word.slot ? view.lock : -1;
    const press = this.hands.hit(aim);
    this.stats.keys += 1;
    if (press !== aim) {
      this.stats.slips += 1;
      if (typed > 0 && view.lock === word.slot && this.hands.abandonAfterSlip()) {
        // Lets go of the word (Esc) after this slip and looks again.
        this.target = null;
        this.stats.releases += 1;
        this.readyAt += this.hands.gapMs(this.gapMean);
        return { type: "release" };
      }
      // A Backspace takes back a right letter (the router never took the wrong one): only worth it with letters in.
      if (typed > 0 && this.hands.backspaceAfterSlip()) this.backspaceNext = true;
    } else if (typed + 1 === word.text.length) {
      this.stats.finished += 1;
      this.finished = { slot: word.slot, text: word.text, untilMs: nowMs + 500 };
      this.target = null;
    }
    return { type: "key", letter: press, ms: Math.round(nowMs) };
  }

  private isTarget(word: SeenWord): boolean {
    return this.target !== null && this.target.slot === word.slot && this.target.text === word.text;
  }

  private aimAt(word: SeenWord, liveWords: number): void {
    this.target = { slot: word.slot, text: word.text };
    this.switchFrom = -1;
    this.gapMean = this.hands.meanGapMs(word.text.length, word.group) * this.hands.wordFactor(liveWords);
    this.backspaceNext = false;
  }
}

/** The awake word with the highest priority (lowest slot on ties). */
export function pick(words: readonly SeenWord[]): SeenWord | null {
  let best: SeenWord | null = null;
  for (const word of words) if (!word.asleep && (best === null || word.priority > best.priority)) best = word;
  return best;
}
