/**
 * Learning frame (01 §6.3, 05 §4.4): bottom-centre DOM queue showing word,
 * IPA and meaning by right recalls (never raw mastery, D14); new and weak
 * words pinned 2.5 s, others 0.8 s; "Vừa học" line of the last 3 new words.
 * Never shakes, never under VFX: plain DOM above the canvas, no transforms.
 *
 * Also the two learning panels: Học trước (8 new words before the stage)
 * and Thẻ Ôn (≤ 3 questions in a break), 01 §6.5. While one is open it takes
 * the letter keys (handleLetter) and Enter, Backspace, Esc, Tab.
 * Owner: typing-learning (LANES.md).
 */
import type { FrameInfo, Presenter } from "../app/contracts";
import { DIFFICULTY, LEARNING } from "../content/rules";
import type { Difficulty, SimCommand, SimEvent } from "../content/types";
import { LEARNING_FRAME_CLASSES, SEMANTIC_COLORS, installKitStyles } from "../kit/ui";
import type { World } from "../sim/world";
import { chooseSpot, keepoutRects, zonesFor, type Rect } from "./screen-zones";

/** Meaning and IPA for a word, from the loaded vocabulary. */
export type Gloss = (text: string) => { readonly vi: string; readonly ipa: string } | null;

// ── Pure rules ─────────────────────────────────────────────────────────────

/** 01 §6.3: new (no record), not yet remembered (< 2 right recalls), remembered, known (≥ 2 recalls and mastery ≥ 70). */
export type WordLevel = "new" | "unremembered" | "remembered" | "known";

export function wordLevel(word: { readonly group: string; readonly recalls: number; readonly mastery: number }): WordLevel {
  if (word.group === "new") return "new";
  if (word.recalls < LEARNING.recallsToHide) return "unremembered";
  return word.mastery < LEARNING.knownMastery ? "remembered" : "known";
}

/** A tag's meaning (01 §3.1): the first sense (cut at ";"), notes in brackets out, at most 22 characters with "…". */
export function shortMeaning(vi: string): string {
  const first = (vi.split(";")[0] ?? "").replace(/\s*\([^)]*\)/g, "").trim();
  const max = LEARNING.meaningMaxChars;
  if (first.length <= max) return first;
  // Whole senses up to the first comma that no longer fits: "yêu, thương, yêu thương" → "yêu, thương"
  // (test pass 26/10: the tag read "yêu, thương, yêu thươ…").
  const senses = first.split(",").map((part) => part.trim()).filter((part) => part !== "");
  let kept = "";
  for (const sense of senses) {
    const next = kept === "" ? sense : kept + ", " + sense;
    if (next.length > max) break;
    kept = next;
  }
  return kept !== "" ? kept : first.slice(0, max - 1).trimEnd() + "…";
}

export interface FrameWord {
  readonly text: string;
  readonly level: WordLevel;
  readonly mastery: number;
  readonly vi: string;
  readonly ipa: string;
}

export interface FrameView {
  readonly text: string;
  readonly typed: number;
  readonly ipa: string;
  readonly meaning: string;
  readonly level: WordLevel;
  /** A typed word's "từ · nghĩa ✓" card. */
  readonly done: boolean;
}

/**
 * What the frame shows (01 §6.3): the locked word (IPA unless known; meaning
 * for new and not-yet-remembered words, or after 3 wrong keys), and after a
 * word is typed its "word · meaning ✓" card: 2.5 s pinned for new and weak
 * words (nothing replaces it meanwhile), 0.8 s for others. Known words never
 * enter. Easy shows every meaning; Hard only a new word's.
 */
export class FrameQueue {
  private locked: { word: FrameWord; typed: number; hint: boolean } | null = null;
  private card: { word: FrameWord; until: number; pinned: boolean } | null = null;
  /** The last 3 new words typed, newest first ("Vừa học"). */
  readonly recent: FrameWord[] = [];

  constructor(private readonly meaning: (typeof DIFFICULTY)[Difficulty]["meaning"] = "recalls") {}

  private hidden(word: FrameWord): boolean {
    return word.level === "known" && this.meaning !== "always";
  }

  lock(word: FrameWord, typed: number, hint: boolean): void {
    this.locked = this.hidden(word) ? null : { word, typed, hint };
  }

  progress(text: string, typed: number, hint: boolean): void {
    if (this.locked && this.locked.word.text === text) Object.assign(this.locked, { typed, hint });
  }

  unlock(text?: string): void {
    if (text === undefined || this.locked?.word.text === text) this.locked = null;
  }

  /** A wave ended: the "word · meaning ✓" card goes, so a Thẻ Ôn question never finds its answer pinned here. */
  clearCard(): void {
    this.card = null;
  }

  done(word: FrameWord, now: number): void {
    if (this.locked?.word.text === word.text) this.locked = null;
    if (this.hidden(word)) return;
    const pinned = word.level === "new" || word.mastery < LEARNING.weakMastery;
    if (this.card && this.card.pinned && now < this.card.until && !pinned) return;
    this.card = { word, until: now + (pinned ? LEARNING.pinNewMs : LEARNING.holdOtherMs), pinned };
    if (word.level === "new" && !this.recent.some((item) => item.text === word.text)) {
      this.recent.unshift(word);
      this.recent.length = Math.min(this.recent.length, LEARNING.recentNewWords);
    }
  }

  view(now: number): FrameView | null {
    const card = this.card && now < this.card.until ? this.card : null;
    if (card && (card.pinned || this.locked === null)) {
      return { text: card.word.text, typed: card.word.text.length, ipa: card.word.ipa, meaning: card.word.vi, level: card.word.level, done: true };
    }
    if (this.locked) {
      const { word, typed, hint } = this.locked;
      const level = word.level;
      const showMeaning = this.meaning === "always" || hint || (this.meaning === "first" ? level === "new" : level === "new" || level === "unremembered");
      return { text: word.text, typed, ipa: level === "known" ? "" : word.ipa, meaning: showMeaning ? word.vi : "", level, done: false };
    }
    return null;
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────

const STYLE_ID = "dh-learning-style";
const CSS = `
.dh-learn { border: 1.5px solid rgba(255, 244, 214, 0.22); box-shadow: 0 3px 0 rgba(0, 0, 0, 0.5); transition: opacity 160ms linear; }
.dh-learn.is-idle { opacity: 0.55; }
.dh-learn.is-covered { visibility: hidden; }
.dh-learn__top { display: flex; align-items: center; gap: calc(8px * var(--ui)); }
.dh-learn__dot { width: calc(9px * var(--ui)); height: calc(9px * var(--ui)); border-radius: 50%; background: #F2B880; flex: none; }
.dh-learn__dot.is-new { background: #E9F7D4; }
.dh-learn__dot.is-remembered { background: #9FD3F2; }
.dh-learn__dot.is-known { background: #7FE08A; }
.dh-learn__speaker { width: calc(18px * var(--ui)); height: calc(18px * var(--ui)); color: var(--kit-learning-muted); flex: none; }
.dh-learn__check { color: ${SEMANTIC_COLORS.typing}; font-weight: 800; }
.dh-learn__badge { font-size: max(11px, calc(11px * var(--ui))); font-weight: 800; padding: 0 calc(5px * var(--ui)); border-radius: 3px; background: #E9F7D4; color: #1F3A12; }
.dh-learn .${LEARNING_FRAME_CLASSES.ipa}:empty, .dh-learn .${LEARNING_FRAME_CLASSES.meaning}:empty { display: none; }
.dh-learn .${LEARNING_FRAME_CLASSES.meaning} { max-width: 100%; text-align: center; }
.dh-learn .${LEARNING_FRAME_CLASSES.recent} { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: max(12px, calc(13px * var(--ui))); }
.dh-learn__idle { font-size: max(12px, calc(14px * var(--ui))); color: var(--kit-learning-muted); }
.dh-lpanel {
  position: fixed; left: 50%; top: 50%; translate: -50% -50%; z-index: 60; box-sizing: border-box;
  width: min(92vw, calc(560px * var(--ui))); padding: calc(18px * var(--ui)) calc(24px * var(--ui));
  display: grid; justify-items: center; gap: calc(8px * var(--ui)); pointer-events: auto;
  background: rgba(28, 22, 17, 0.96); color: #FFF4D6; border: 2px solid rgba(255, 244, 214, 0.25); border-radius: calc(12px * var(--ui));
  box-shadow: 0 6px 0 rgba(0, 0, 0, 0.5); font-family: var(--kit-font-battle);
}
.dh-lpanel[hidden] { display: none; }
/* Thẻ Ôn: a small card at the top centre under the next-wave card, never over the dais and its pads (05 §4.5). */
.dh-lpanel.is-card {
  top: calc(176px * var(--ui)); translate: -50% 0; width: min(92vw, calc(420px * var(--ui)));
  padding: calc(10px * var(--ui)) calc(16px * var(--ui)); gap: calc(5px * var(--ui));
}
.dh-lpanel.is-card .dh-lpanel__word { font-size: calc(28px * var(--ui)); }
.dh-lpanel.is-card .dh-lpanel__mean { font-size: max(14px, calc(17px * var(--ui))); }
.dh-lpanel.is-card .dh-lpanel__answer { min-height: calc(34px * var(--ui)); font-size: calc(26px * var(--ui)); }
.dh-lpanel__answer .x { color: #FFB4B4; text-decoration: underline wavy rgba(255, 140, 170, 0.8); }
.dh-lpanel__title { font-size: max(12px, calc(15px * var(--ui))); font-weight: 700; letter-spacing: 0.04em; color: #D9CDB0; }
.dh-lpanel__step { font-size: max(12px, calc(13px * var(--ui))); color: #B9AE95; }
.dh-lpanel__word { font-size: calc(40px * var(--ui)); font-weight: 700; }
.dh-lpanel__ipa { font-family: var(--kit-font-ipa); font-size: calc(20px * var(--ui)); color: #D9CDB0; }
.dh-lpanel__ipa:empty, .dh-lpanel__mean:empty, .dh-lpanel__word:empty { display: none; }
.dh-lpanel__mean { font-size: calc(20px * var(--ui)); text-align: center; }
.dh-lpanel__answer { min-height: calc(44px * var(--ui)); font-size: calc(32px * var(--ui)); font-weight: 700; letter-spacing: 0.12em; color: ${SEMANTIC_COLORS.typing}; }
.dh-lpanel__answer .b { color: rgba(255, 244, 214, 0.35); }
.dh-lpanel__result { min-height: calc(22px * var(--ui)); font-size: calc(17px * var(--ui)); font-weight: 700; }
.dh-lpanel__result.is-right { color: ${SEMANTIC_COLORS.typing}; }
.dh-lpanel__result.is-wrong { color: #FFB4B4; }
.dh-lpanel__keys { font-size: max(12px, calc(13px * var(--ui))); color: #B9AE95; }
`;

const SPEAKER = '<svg class="dh-learn__speaker" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';

function installStyles(doc: Document): void {
  installKitStyles(doc as unknown as Parameters<typeof installKitStyles>[0]);
  if (doc.getElementById(STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.append(style);
}

const escapeHtml = (text: string): string => text.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

// ── The frame ──────────────────────────────────────────────────────────────

export interface LearningFrameOptions {
  /** Plays a word (the learning client's speak); the speaker icon only shows with it. */
  readonly speak?: (text: string) => void;
}

/** The frame, and a cover for while a learning panel asks: its words and the Vừa học line would give the answers away. */
export interface LearningFramePresenter extends Presenter {
  setCovered(covered: boolean): void;
  readonly covered: boolean;
}

/** What the frame may show while a Học trước or Thẻ Ôn panel is open: nothing (01 §6.5 answers stay hidden). */
export const frameVisible = (panelOpen: boolean): boolean => !panelOpen;

export function createLearningFrame(root: HTMLElement, gloss: Gloss, options: LearningFrameOptions = {}): LearningFramePresenter {
  const doc = root.ownerDocument;
  installStyles(doc);
  const c = LEARNING_FRAME_CLASSES;
  const el = doc.createElement("div");
  el.className = c.root + " dh-learn is-idle";
  el.dataset.dhAvoid = "";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.innerHTML =
    '<div class="dh-learn__top"><i class="dh-learn__dot"></i><span class="' + c.word + '"></span>' + (options.speak ? SPEAKER : "") + "</div>" +
    '<div class="' + c.ipa + '"></div><div class="' + c.meaning + '"></div><div class="' + c.recent + '"></div>';
  root.append(el);
  const word = el.querySelector<HTMLElement>("." + c.word)!;
  const dot = el.querySelector<HTMLElement>(".dh-learn__dot")!;
  const ipa = el.querySelector<HTMLElement>("." + c.ipa)!;
  const meaning = el.querySelector<HTMLElement>("." + c.meaning)!;
  const recent = el.querySelector<HTMLElement>("." + c.recent)!;
  let queue: FrameQueue | null = null;
  let deckRef: unknown = null;
  const byText = new Map<string, { group: string; recalls: number; mastery: number }>();
  const slots = new Map<number, string>();
  let lockedSlot = -1;
  let key = "\u0000";
  let recentKey = "";
  let covered = false;

  const frameWord = (text: string): FrameWord => {
    const deck = byText.get(text) ?? { group: "learning", recalls: 0, mastery: 0 };
    const g = gloss(text);
    return { text, level: wordLevel(deck), mastery: deck.mastery, vi: g?.vi ?? "", ipa: g?.ipa ?? "" };
  };

  const ensure = (world: World): FrameQueue => {
    if (deckRef !== world.words.deck) {
      deckRef = world.words.deck;
      byText.clear();
      for (const item of world.words.deck.words) byText.set(item.text, item);
      queue = new FrameQueue(DIFFICULTY[world.difficulty].meaning);
    }
    return queue!;
  };

  return {
    onEvents(events: readonly SimEvent[], world: World): void {
      const q = ensure(world);
      const now = performance.now();
      for (const event of events) {
        switch (event.type) {
          case "word-assigned":
            slots.set(event.word, event.text);
            break;
          case "word-progress": {
            if (event.word < 0 || event.key === "pair") break;
            const text = slots.get(event.word);
            if (text === undefined) break;
            if (event.key === "switch" && event.typed === 0) {
              q.unlock(text);
              break;
            }
            if (event.key === "back" && event.typed === 0) {
              q.unlock(text);
              if (lockedSlot === event.word) lockedSlot = -1;
              break;
            }
            const live = world.words.live[event.word];
            const hint = live ? live.errors >= 3 : false;
            if (lockedSlot !== event.word) {
              lockedSlot = event.word;
              q.lock(frameWord(text), event.typed, hint);
            } else q.progress(text, event.typed, hint);
            break;
          }
          case "word-complete":
            q.done(frameWord(event.text), now);
            if (lockedSlot === event.word) lockedSlot = -1;
            break;
          case "word-released": {
            const text = slots.get(event.word);
            slots.delete(event.word);
            if (event.reason !== "done" && text !== undefined) q.unlock(text);
            if (lockedSlot === event.word) lockedSlot = -1;
            break;
          }
          case "wave-end":
            q.clearCard();
            break;
          default:
            break;
        }
      }
    },

    frame(world: World, info: FrameInfo): void {
      const q = ensure(world);
      const view = q.view(info.now);
      // With no word up there is nothing to lock: in a wave the frame waits quietly; prep and breaks point to the shop.
      const resting = world.phase === "prep" || world.phase === "break";
      const anyWord = world.words.live.some((item) => item !== null);
      const next = view ? [view.text, view.typed, view.ipa, view.meaning, view.level, view.done].join("|") : resting ? "rest:" + world.phase : anyWord ? "idle" : "empty";
      if (next !== key) {
        key = next;
        el.classList.toggle("is-idle", view === null);
        if (view === null) {
          word.innerHTML = resting
            ? '<span class="dh-learn__idle">' + (world.phase === "prep" ? "Deploy" : "Break") + "</span>"
            : anyWord
              ? '<span class="dh-learn__idle">Type the first letter to lock</span>'
              : "";
          ipa.textContent = meaning.textContent = "";
          dot.className = "dh-learn__dot";
        } else {
          const typed = escapeHtml(view.text.slice(0, view.typed));
          const rest = escapeHtml(view.text.slice(view.typed));
          word.innerHTML =
            '<span class="' + c.typed + '">' + typed + "</span>" + rest + (view.done ? ' <span class="dh-learn__check">✓</span>' : "") +
            (view.level === "new" ? ' <span class="dh-learn__badge">NEW</span>' : "");
          ipa.textContent = view.ipa;
          meaning.textContent = view.meaning;
          dot.className = "dh-learn__dot is-" + view.level;
        }
      }
      // "small (nhỏ) · big (to, lớn)": HTML collapses runs of spaces, so entries need a visible separator.
      // At 720p the line holds two words whole; the third was cut to "city (…" (test pass 26/10).
      const room = (el.ownerDocument.defaultView?.innerHeight ?? 1080) < 820 ? 2 : LEARNING.recentNewWords;
      const recentNext = q.recent.slice(0, room).map((item) => item.text + " (" + shortMeaning(item.vi) + ")").join(" · ");
      if (recentNext !== recentKey) {
        recentKey = recentNext;
        recent.textContent = recentNext === "" ? "" : "Learned: " + recentNext;
      }
    },

    setCovered(next: boolean): void {
      if (next === covered) return;
      covered = next;
      el.classList.toggle("is-covered", !frameVisible(next));
      el.setAttribute("aria-hidden", next ? "true" : "false");
    },

    get covered() {
      return covered;
    },

    dispose(): void {
      el.remove();
    },
  };
}

// ── Panels: Học trước and Thẻ Ôn (01 §6.5) ─────────────────────────────────

export interface PanelWord {
  readonly text: string;
  readonly vi: string;
  readonly ipa: string;
}

export interface PanelHooks {
  /** Plays a word now (the learning client's speak). */
  speak(text: string): void;
  /** One answer as a learning event (activity review-card, always sent). */
  recall(text: string, correct: boolean, responseMs: number, userAnswer: string): void;
  /** Player intent to the sim: learn-ahead gold, review-card answers. */
  send(command: SimCommand): void;
  /** The panel closed (the app gives keys back to the battle). */
  onClose?(): void;
  /** Wall clock, ms; default performance.now. */
  now?(): number;
  /** Delay before the next word; default setTimeout. */
  later?(ms: number, run: () => void): void;
}

/** A panel that takes the keys while open. */
export interface LearningPanel {
  readonly isOpen: boolean;
  /** A typed letter a–z; true when the panel used it. */
  handleLetter(letter: string): boolean;
  /** "enter", "backspace", "escape", "replay"; true when used. */
  handleAction(action: string): boolean;
  dispose(): void;
}

interface AnswerBox {
  readonly el: HTMLElement;
  readonly title: HTMLElement;
  readonly step: HTMLElement;
  readonly word: HTMLElement;
  readonly ipa: HTMLElement;
  readonly mean: HTMLElement;
  readonly answer: HTMLElement;
  readonly result: HTMLElement;
  readonly keys: HTMLElement;
}

function panelBox(root: HTMLElement, label: string, card = false): AnswerBox {
  const doc = root.ownerDocument;
  installStyles(doc);
  const el = doc.createElement("div");
  el.className = "dh-lpanel" + (card ? " is-card" : "");
  el.hidden = true;
  el.dataset.dhAvoid = "";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", label);
  el.innerHTML =
    '<div class="dh-lpanel__title"></div><div class="dh-lpanel__step"></div><div class="dh-lpanel__word"></div><div class="dh-lpanel__ipa"></div>' +
    '<div class="dh-lpanel__mean"></div><div class="dh-lpanel__answer"></div><div class="dh-lpanel__result"></div><div class="dh-lpanel__keys"></div>';
  root.append(el);
  const q = (cls: string) => el.querySelector<HTMLElement>(".dh-lpanel__" + cls)!;
  return { el, title: q("title"), step: q("step"), word: q("word"), ipa: q("ipa"), mean: q("mean"), answer: q("answer"), result: q("result"), keys: q("keys") };
}

const blanks = (typed: string, length: number): string =>
  escapeHtml(typed) + '<span class="b">' + "_".repeat(Math.max(0, length - typed.length)) + "</span>";

/** Copying a shown word (Học trước): each letter that differs from it is pink, so a slip shows at once. */
const blanksAgainst = (typed: string, target: string): string =>
  [...typed].map((ch, k) => (ch === target[k] ? escapeHtml(ch) : '<span class="x">' + escapeHtml(ch) + "</span>")).join("") +
  '<span class="b">' + "_".repeat(Math.max(0, target.length - typed.length)) + "</span>";

/** Two Esc presses within this many ms close Học trước; one skips the word on screen. */
const DOUBLE_ESC_MS = 600;

const hookNow = (hooks: PanelHooks) => (hooks.now ? hooks.now() : performance.now());
const hookLater = (hooks: PanelHooks, ms: number, run: () => void) => (hooks.later ? hooks.later(ms, run) : void setTimeout(run, ms));

/**
 * Học trước (01 §6.5): the stage's new words one by one (word, IPA, meaning,
 * sound); the player copies each once, with no time limit. A right copy goes
 * on by itself; a slip shows pink and waits for Backspace or Enter. Esc skips
 * the word on screen, Esc twice closes the panel. Closing sends learn-ahead
 * with the right answers (+5 gold each, at most +40, in the sim).
 */
export function createPrelearn(root: HTMLElement, hooks: PanelHooks): LearningPanel & { show(words: readonly PanelWord[]): void } {
  const box = panelBox(root, "Preview");
  let words: readonly PanelWord[] = [];
  let index = 0;
  let typed = "";
  let correct = 0;
  let startedAt = 0;
  let waiting = false;
  let open = false;
  let escAt = -Infinity;

  const draw = () => {
    const word = words[index]!;
    box.title.textContent = "PREVIEW · NEW STAGE WORDS";
    box.step.textContent = index + 1 + " / " + words.length;
    box.word.textContent = word.text;
    box.ipa.textContent = word.ipa;
    box.mean.textContent = word.vi;
    box.answer.innerHTML = blanksAgainst(typed, word.text);
    box.keys.textContent = "Retype · Enter submit · Tab replay · Esc skip word · Esc twice skip all";
  };
  const redraw = () => {
    const word = words[index]!;
    box.answer.innerHTML = blanksAgainst(typed, word.text);
    const slip = typed.length === word.text.length && typed !== word.text;
    box.result.textContent = slip ? "Typo: Backspace to fix, Enter to submit" : "";
    box.result.className = "dh-lpanel__result" + (slip ? " is-wrong" : "");
  };
  const finish = () => {
    open = false;
    box.el.hidden = true;
    if (correct > 0) hooks.send({ type: "learn-ahead", correct });
    hooks.onClose?.();
  };
  const next = () => {
    waiting = false;
    index += 1;
    typed = "";
    box.result.textContent = "";
    box.result.className = "dh-lpanel__result";
    if (index >= words.length) return finish();
    startedAt = hookNow(hooks);
    draw();
    hooks.speak(words[index]!.text);
  };
  const submit = () => {
    const word = words[index]!;
    const right = typed === word.text;
    if (right) correct += 1;
    hooks.recall(word.text, right, hookNow(hooks) - startedAt, typed);
    box.result.textContent = right ? "Correct! +5 Gold at stage start" : "Not quite: " + word.text;
    box.result.className = "dh-lpanel__result " + (right ? "is-right" : "is-wrong");
    waiting = true;
    hookLater(hooks, right ? 700 : 1400, next);
  };

  return {
    get isOpen() {
      return open;
    },
    show(list: readonly PanelWord[]) {
      words = list.slice(0, LEARNING.newPerStage);
      if (words.length === 0) return;
      index = 0;
      typed = "";
      correct = 0;
      open = true;
      waiting = false;
      box.el.hidden = false;
      box.result.textContent = "";
      startedAt = hookNow(hooks);
      draw();
      hooks.speak(words[0]!.text);
    },
    handleLetter(letter: string): boolean {
      if (!open) return false;
      if (waiting || !/^[a-z]$/.test(letter)) return true;
      const word = words[index]!;
      if (typed.length >= word.text.length) return true;
      typed += letter;
      // A right copy goes on at once; a slip waits for Backspace or Enter (never sent half-way by itself).
      if (typed === word.text) submit();
      else redraw();
      return true;
    },
    handleAction(action: string): boolean {
      if (!open) return false;
      if (action === "escape") {
        const now = hookNow(hooks);
        if (now - escAt <= DOUBLE_ESC_MS) finish();
        else {
          escAt = now;
          // Skips only the word on screen: no answer, no learning event for it.
          if (!waiting) next();
        }
      } else if (action === "replay") hooks.speak(words[index]!.text);
      else if (action === "backspace" && !waiting) {
        typed = typed.slice(0, -1);
        redraw();
      } else if (action === "enter" && !waiting && typed.length > 0) submit();
      return true;
    },
    dispose() {
      box.el.remove();
    },
  };
}

/** A Thẻ Ôn question: hear then type, or read the meaning then type (01 §6.5; choose-the-meaning comes from chapter 3). */
export interface ReviewQuestion extends PanelWord {
  readonly mode: "listen" | "meaning";
}

/**
 * Thẻ Ôn (01 §6.5): up to 3 questions from the wave just played. A right
 * answer sends review-card (+10 gold, +2 XP in the sim); a wrong one costs
 * nothing and shows the word, meaning and IPA again.
 * Round 2: while open it picks a spot each frame that covers no build slot,
 * no lane and no HUD panel or wave card (screen-zones.ts); without zones (UI
 * preview) it keeps the CSS spot at the top centre.
 */
export function createReviewCard(root: HTMLElement, hooks: PanelHooks): LearningPanel & { show(items: readonly ReviewQuestion[]): void } {
  const box = panelBox(root, "Review", true);
  let spot = -1;
  let placeTimer = 0;
  /** Candidate spots: top centre, top right, top left, then the sides at mid height (CSS px). */
  const place = (): void => {
    const view = root.ownerDocument.defaultView;
    const zones = zonesFor(root);
    if (!view || zones === null || box.el.hidden) return;
    const ui = Number.parseFloat(view.getComputedStyle(root.ownerDocument.documentElement).getPropertyValue("--ui")) || 1;
    const vw = view.innerWidth;
    const vh = view.innerHeight;
    const w = box.el.offsetWidth;
    const h = box.el.offsetHeight;
    const margin = 16 * ui;
    const gap = 10 * ui;
    const system = root.querySelector<HTMLElement>(".dh-system")?.getBoundingClientRect();
    const hud = root.querySelector<HTMLElement>(".dh-battle")?.getBoundingClientRect();
    const underSystem = (system && system.height > 0 ? system.bottom : 12 * ui) + gap;
    const underHud = (hud && hud.height > 0 ? hud.bottom : 12 * ui) + gap;
    const middle = Math.max(underHud, vh * 0.42 - h / 2);
    const spots: Rect[] = [
      { x: (vw - w) / 2, y: 176 * ui, w, h },
      { x: vw - margin - w, y: underSystem, w, h },
      { x: margin, y: underHud, w, h },
      { x: vw - margin - w, y: middle, w, h },
      { x: margin, y: middle, w, h },
      { x: (vw - w) / 2, y: 12 * ui, w, h },
    ];
    spot = chooseSpot(spots, zones, keepoutRects(root, box.el), { w: vw, h: vh }, spot);
    const at = spots[spot]!;
    box.el.style.left = at.x.toFixed(1) + "px";
    box.el.style.top = at.y.toFixed(1) + "px";
    box.el.style.translate = "none";
    box.el.dataset.spot = String(spot);
  };
  const follow = (): void => {
    const view = root.ownerDocument.defaultView;
    if (!view || box.el.hidden) return;
    place();
    placeTimer = view.requestAnimationFrame(follow);
  };
  let items: readonly ReviewQuestion[] = [];
  let index = 0;
  let typed = "";
  let startedAt = 0;
  let waiting = false;
  let open = false;

  const draw = () => {
    const item = items[index]!;
    box.title.textContent = "REVIEW";
    box.step.textContent = (item.mode === "listen" ? "Listen and type" : "Read the meaning, type the word") + " · " + (index + 1) + " / " + items.length;
    box.word.textContent = "";
    box.ipa.textContent = "";
    box.mean.textContent = item.mode === "meaning" ? item.vi : "🔊";
    box.answer.innerHTML = blanks(typed, item.text.length);
    box.result.textContent = "";
    box.result.className = "dh-lpanel__result";
    box.keys.textContent = "Enter submit · Tab replay · Esc close";
    if (item.mode === "listen") hooks.speak(item.text);
  };
  const close = () => {
    open = false;
    box.el.hidden = true;
    root.ownerDocument.defaultView?.cancelAnimationFrame(placeTimer);
    hooks.onClose?.();
  };
  const next = () => {
    waiting = false;
    index += 1;
    typed = "";
    if (index >= items.length) return close();
    startedAt = hookNow(hooks);
    draw();
  };
  const submit = () => {
    const item = items[index]!;
    const right = typed === item.text;
    hooks.recall(item.text, right, hookNow(hooks) - startedAt, typed);
    hooks.send({ type: "review-card", correct: right });
    if (right) {
      box.result.textContent = "Correct! +10 Gold";
      box.result.className = "dh-lpanel__result is-right";
    } else {
      box.word.textContent = item.text;
      box.ipa.textContent = item.ipa;
      box.mean.textContent = item.vi;
      box.result.textContent = "Not quite. Try to remember it";
      box.result.className = "dh-lpanel__result is-wrong";
      hooks.speak(item.text);
    }
    waiting = true;
    hookLater(hooks, right ? 800 : 1800, next);
  };

  return {
    get isOpen() {
      return open;
    },
    show(list: readonly ReviewQuestion[]) {
      items = list.slice(0, 3);
      if (items.length === 0) return;
      index = 0;
      typed = "";
      open = true;
      waiting = false;
      box.el.hidden = false;
      startedAt = hookNow(hooks);
      draw();
      spot = -1;
      root.ownerDocument.defaultView?.cancelAnimationFrame(placeTimer);
      follow();
    },
    handleLetter(letter: string): boolean {
      if (!open) return false;
      if (waiting || !/^[a-z]$/.test(letter)) return true;
      const item = items[index]!;
      if (typed.length >= item.text.length) return true;
      typed += letter;
      box.answer.innerHTML = blanks(typed, item.text.length);
      if (typed.length === item.text.length) submit();
      return true;
    },
    handleAction(action: string): boolean {
      if (!open) return false;
      if (action === "escape") close();
      else if (action === "replay") hooks.speak(items[index]!.text);
      else if (action === "backspace" && !waiting) {
        typed = typed.slice(0, -1);
        box.answer.innerHTML = blanks(typed, items[index]!.text.length);
      } else if (action === "enter" && !waiting && typed.length > 0) submit();
      return true;
    },
    dispose() {
      root.ownerDocument.defaultView?.cancelAnimationFrame(placeTimer);
      box.el.remove();
    },
  };
}
