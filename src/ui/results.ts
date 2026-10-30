/**
 * End of the run (01 §5, §6.5; 06 §4 screens 8 and 9): victory with stars or
 * defeat, gold, accuracy, new words learned, and the Sổ Từ Ải list (words
 * met: new, mistyped, to review; listen to each). Collects the word log from
 * word events during the run. Keyboard: ↑ ↓ pick a word, Tab listens, ← →
 * pick retry or portal, Enter activates it; while shown it takes every command key.
 * Owner: ui (LANES.md).
 */
import type { ActionHandler, FrameInfo, Presenter } from "../app/contracts";
import { portalHome } from "../app/portal";
import { STARS } from "../content/rules";
import type { Grade, SimEvent, WordGroup, WordKind } from "../content/types";
import type { World } from "../sim/world";
import type { Gloss } from "./learning-frame";
import { el, icon, keyLabel, setClass, setShown, setText, uiButton } from "./skin";

export interface ResultsActions {
  retry(): void;
  /**
   * 00 §4.10: after two defeats in a row on a stage the screen offers one
   * level easier, never forcing it. Returns the easier level's name, or null
   * when there is no offer now (already Dễ, or not two defeats yet).
   */
  easierOffer?(): string | null;
  /** Replays the stage one level easier (⇧↵ on the screen). */
  easier?(): void;
  /** Says a word (kit/speech); the listen buttons show only when given. */
  listen?(text: string): void;
  /** Meaning and IPA for the list (the app's LearningClient.gloss). */
  gloss?: Gloss;
}

// ── Word log (tests/ui/results.test.ts) ─────────────────────────────────────

const GRADE_ORDER: readonly Grade[] = ["sloppy", "ok", "good", "perfect", "flash"];

export interface WordRecord {
  readonly text: string;
  group: WordGroup;
  kind: WordKind;
  /** Times it was dealt and finished. */
  met: number;
  done: number;
  /** Wrong keys over all finishes; finishes with Ẩu; finishes with a hint. */
  errors: number;
  sloppy: number;
  hints: number;
  /** Finishes with no wrong key. */
  clean: number;
  best: Grade | null;
}

export type WordStatus = "new" | "fresh" | "miss" | "review" | "good";

/**
 * Status in Sổ Từ Ải (01 §6.5: mới học, gõ sai, cần ôn). A new word is "mới
 * học" only once it was typed with no wrong key (the summary's "Từ mới đã
 * học" counts the same); a new word met but never typed clean is "fresh"
 * (test pass 27/10: the defeat screen called words never typed "Mới học").
 */
export function wordStatus(record: WordRecord): WordStatus {
  if (record.group === "new" && record.clean > 0) return "new";
  if (record.errors > 0) return "miss";
  if (record.group === "new") return "fresh";
  if (record.sloppy > 0 || record.hints > 0 || record.done === 0) return "review";
  return "good";
}

const STATUS_RANK: Readonly<Record<WordStatus, number>> = { new: 0, fresh: 1, miss: 2, review: 3, good: 4 };

/** Every word dealt in the run, from `word-assigned` and `word-complete`. */
export class WordLog {
  private readonly bySlot = new Map<number, { text: string; group: WordGroup; kind: WordKind }>();
  readonly words = new Map<string, WordRecord>();

  reset(): void {
    this.bySlot.clear();
    this.words.clear();
  }

  private record(text: string, group: WordGroup, kind: WordKind): WordRecord {
    let entry = this.words.get(text);
    if (!entry) {
      entry = { text, group, kind, met: 0, done: 0, errors: 0, sloppy: 0, hints: 0, clean: 0, best: null };
      this.words.set(text, entry);
    }
    return entry;
  }

  onEvents(events: readonly SimEvent[]): void {
    for (const event of events) {
      if (event.type === "word-assigned") {
        this.bySlot.set(event.word, { text: event.text, group: event.group, kind: event.kind });
        this.record(event.text, event.group, event.kind).met += 1;
      } else if (event.type === "word-complete") {
        const slot = this.bySlot.get(event.word);
        const entry = this.record(event.text, slot?.group ?? "known", event.kind);
        entry.done += 1;
        entry.errors += event.errors;
        if (event.errors === 0) entry.clean += 1;
        if (event.grade === "sloppy") entry.sloppy += 1;
        if (event.hintUsed) entry.hints += 1;
        if (entry.best === null || GRADE_ORDER.indexOf(event.grade) > GRADE_ORDER.indexOf(entry.best)) entry.best = event.grade;
      }
    }
  }

  /** Sổ Từ Ải order: new, mistyped, to review, then the rest; alphabetical inside. */
  list(): WordRecord[] {
    return [...this.words.values()].sort((a, b) => STATUS_RANK[wordStatus(a)] - STATUS_RANK[wordStatus(b)] || a.text.localeCompare(b.text, "en"));
  }
}

export interface ResultsSummary {
  readonly outcome: "victory" | "defeat";
  readonly stars: 0 | 1 | 2 | 3;
  /** Wave reached (the losing wave on defeat) and the stage's count. */
  readonly wave: number;
  readonly waves: number;
  readonly hpPct: number;
  readonly goldLeft: number;
  readonly goldEarned: number;
  /** Right keys over all letter keys, %; null without keys. */
  readonly accuracyPct: number | null;
  readonly words: number;
  readonly met: number;
  /** New words typed at least once with no wrong key, of the new words met. */
  readonly newLearned: number;
  readonly newMet: number;
  readonly mistyped: number;
  /** Letter keys typed in the run. */
  readonly keys: number;
  /** HP the Fire Dragon lost to Héo lan's seep and to foes' blows (the defeat line names the bigger one). */
  readonly hurt: HurtTally;
}

/** HP lost by cause, read from `hit` events on the Fire Dragon: Héo lan comes from the hero itself (combat stepBlight). */
export interface HurtTally {
  blight: number;
  blows: number;
}

export const emptyHurt = (): HurtTally => ({ blight: 0, blows: 0 });

/** Adds the Fire Dragon's losses in `events` to `tally`. */
export function tallyHurt(tally: HurtTally, events: readonly SimEvent[]): void {
  for (const event of events) {
    if (event.type !== "hit" || event.target.kind !== "hero" || event.amount <= 0) continue;
    if (event.source.kind === "hero") tally.blight += event.amount;
    else tally.blows += event.amount;
  }
}

export function summarizeRun(world: World, log: WordLog, outcome: "victory" | "defeat", stars: 0 | 1 | 2 | 3, wave: number, hurt: HurtTally = emptyHurt()): ResultsSummary {
  const records = [...log.words.values()];
  const fresh = records.filter((record) => record.group === "new");
  const keys = world.stats.keys;
  return {
    outcome,
    stars: outcome === "victory" ? stars : 0,
    wave,
    waves: world.stage.waves.length,
    hpPct: world.hero.hpMax > 0 ? Math.round((Math.max(0, world.hero.hp) * 100) / world.hero.hpMax) : 0,
    goldLeft: world.economy.gold,
    goldEarned: world.stats.goldEarned,
    accuracyPct: keys > 0 ? Math.round((Math.max(0, keys - world.stats.wrongKeys) * 100) / keys) : null,
    words: world.stats.words,
    met: records.length,
    newLearned: fresh.filter((record) => record.clean > 0).length,
    newMet: fresh.length,
    mistyped: records.filter((record) => record.errors > 0).length,
    keys,
    hurt: { ...hurt },
  };
}

/** Fewer letter keys than this in a lost run: the player hardly typed. */
const FEW_KEYS = 10;

/**
 * Why the run was lost, for the line under the title: hardly any typing, Héo
 * lan (words left waiting in the word zone), or foes' blows at the dais.
 * Test pass 27/10: the screen always advised blockers and traps, while
 * 99 % of the Dragon's losses in waves 5–10 were Héo lan and a run with no
 * key at all got the same advice.
 */
export function defeatCause(summary: Pick<ResultsSummary, "keys" | "hurt">): "typing" | "blight" | "blows" {
  if (summary.keys < FEW_KEYS) return "typing";
  return summary.hurt.blight >= summary.hurt.blows ? "blight" : "blows";
}

/** The line under the stars (06 §6: "Giữ máu Hỏa Long để có 3 sao"). */
export function starHint(summary: ResultsSummary): string {
  if (summary.outcome === "defeat") {
    const at = "Hỏa Long fell on wave " + summary.wave;
    const cause = defeatCause(summary);
    if (cause === "typing") return at + ". Type foes' words to make Hỏa Long breathe fire at them.";
    if (cause === "blight")
      return at + ", mainly from Blight: untyped foes in the Word Zone drain Hỏa Long's HP. Type foes nearest the platform first; use " + keyLabel("skill-1") + " Fire Breath when foes crowd in.";
    return at + " as foes reached the platform. Place blockers and traps on busier lanes.";
  }
  if (summary.stars >= 3) return "Hỏa Long has " + summary.hpPct + "% HP: all three stars.";
  const need = summary.stars === 2 ? STARS.threeStarHpPct : STARS.twoStarHpPct;
  return "Hỏa Long has " + summary.hpPct + "% HP. Keep at least " + need + "% for " + (summary.stars + 1) + " stars.";
}

// ── The screen ──────────────────────────────────────────────────────────────

const STATUS_VI: Readonly<Record<WordStatus, string>> = { new: "Learned", fresh: "New", miss: "Mistyped", review: "Review", good: "Good" };

/**
 * A won stage holds this long before the panel (05 §6.1 Victory, §6.7 C1):
 * the Dragon's victory clip, the camera's slow turn and the title over the
 * dais come first; Enter or Esc shows the panel at once. Test pass 27/10:
 * the panel covered the dais 0.7 s after the last word.
 */
export const VICTORY_HOLD_MS = 2600;

export function createResults(root: HTMLElement, actions: ResultsActions): Presenter & ActionHandler {
  const doc = root.ownerDocument;
  const log = new WordLog();
  let hurt = emptyHurt();
  let world: World | null = null;
  let summary: ResultsSummary | null = null;
  let list: WordRecord[] = [];
  let selected = 0;

  const screen = el(doc, "div", "dh-results");
  screen.dataset.ui = "results";
  const panel = el(doc, "section", "dh-panel dh-results__panel");
  const titleBox = el(doc, "div", "dh-results__title");
  const title = el(doc, "div", "dh-title");
  const sub = el(doc, "div", "dh-results__sub");
  titleBox.append(title, sub);
  const starsBox = el(doc, "div");
  const stars = el(doc, "div", "dh-stars");
  const starNodes = [0, 1, 2].map(() => {
    const node = el(doc, "span", "dh-star");
    node.innerHTML = icon("star");
    stars.append(node);
    return node;
  });
  const hint = el(doc, "div", "dh-results__hint");
  starsBox.append(stars, hint);
  const tiles = el(doc, "div", "dh-tiles");
  const book = el(doc, "div", "dh-book");
  const bookHead = el(doc, "div", "dh-book__head");
  const bookCount = el(doc, "span");
  bookHead.append(el(doc, "span", "dh-title", "Wordbook"), bookCount);
  const bookList = el(doc, "ul", "dh-book__list");
  book.append(bookHead, bookList);
  const foot = el(doc, "div", "dh-results__foot");
  const buttons = el(doc, "div", "dh-results__actions");
  const retryButton = uiButton(doc, "dh-retry", () => actions.retry());
  // Keep focus in the window key router, as uiButton does elsewhere.
  const resultButtons: HTMLElement[] = [retryButton];
  const home = portalHome(import.meta.env.VITE_PORTAL_URL);
  if (home) {
    const portalButton = el(doc, "a", "dh-btn dh-results__portal");
    portalButton.href = home;
    portalButton.target = "_top";
    portalButton.tabIndex = -1;
    portalButton.addEventListener("mousedown", (event) => event.preventDefault());
    portalButton.innerHTML = `<span class="dh-key">${keyLabel("enter")}</span>Back to portal`;
    resultButtons.push(portalButton);
  }
  let focusedAction = 0;
  const focusAction = (index: number): void => {
    focusedAction = index;
    resultButtons.forEach((button, k) => setClass(button, "is-focused", k === index));
  };
  resultButtons.forEach((button, index) => {
    button.addEventListener("mouseenter", () => focusAction(index));
    button.addEventListener("focus", () => focusAction(index));
  });
  buttons.append(...resultButtons);
  const easierButton = uiButton(doc, "dh-retry dh-retry--easier", () => actions.easier?.());
  setShown(easierButton, false);
  const keys = el(doc, "span", "dh-results__keys");
  foot.append(buttons, easierButton, keys);
  panel.append(titleBox, starsBox, tiles, book, foot);
  screen.append(panel);
  setShown(screen, false);
  root.append(screen);
  // The title over the field while a won stage holds (VICTORY_HOLD_MS).
  const cheer = el(doc, "div", "dh-victory");
  cheer.dataset.ui = "victory";
  const cheerTitle = el(doc, "div", "dh-victory__title", "Stage cleared");
  const cheerKeys = el(doc, "div", "dh-victory__keys");
  cheerKeys.innerHTML = `<span class="dh-key">${keyLabel("enter")}</span> see results`;
  cheer.append(cheerTitle, cheerKeys);
  setShown(cheer, false);
  root.append(cheer);
  /** The defeat screen offers one level easier (⇧↵). */
  let offerEasier = false;
  /** A won stage waiting for its panel: stars, wave, and when (−1: set at the next frame). */
  let pending: { stars: 0 | 1 | 2 | 3; wave: number; at: number } | null = null;

  const tile = (value: string, label: string, money = false): HTMLElement => {
    const node = el(doc, "div", "dh-tile" + (money ? " is-money" : ""));
    node.append(el(doc, "b", "", value), el(doc, "span", "", label));
    return node;
  };

  const select = (index: number): void => {
    if (list.length === 0) return;
    selected = Math.max(0, Math.min(list.length - 1, index));
    const rows = bookList.children;
    for (let k = 0; k < rows.length; k += 1) setClass(rows[k]!, "is-sel", k === selected);
    (rows[selected] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  };

  const show = (outcome: "victory" | "defeat", starCount: 0 | 1 | 2 | 3, wave: number): void => {
    if (!world) return;
    summary = summarizeRun(world, log, outcome, starCount, wave, hurt);
    const s = summary;
    setText(title, s.outcome === "victory" ? "Stage cleared" : "Dragon Platform lost");
    setText(sub, world.stage.nameVi + " · " + (s.outcome === "victory" ? s.waves + "/" + s.waves + " waves" : "lost at wave " + s.wave + "/" + s.waves));
    starNodes.forEach((node, index) => setClass(node, "is-on", index < s.stars));
    setShown(stars, s.outcome === "victory");
    setText(hint, starHint(s));
    tiles.replaceChildren(
      tile(String(s.goldLeft), "Gold left", true),
      tile(String(s.goldEarned), "Gold earned", true),
      tile(s.accuracyPct === null ? "—" : s.accuracyPct + "%", "Accuracy"),
      tile(s.newLearned + "/" + s.newMet, "New learned"),
      tile(String(s.met), "Words seen"),
    );
    list = log.list();
    setText(bookCount, list.length + " words · " + s.mistyped + " mistyped");
    bookList.replaceChildren(
      ...list.map((record, index) => {
        const row = el(doc, "li", "dh-word");
        const status = wordStatus(record);
        const g = actions.gloss?.(record.text) ?? null;
        row.append(
          el(doc, "span", "dh-word__text", record.text),
          el(doc, "span", "dh-word__ipa", g?.ipa ?? ""),
          el(doc, "span", "dh-word__vi", g?.vi ?? ""),
          el(doc, "span", "dh-wstatus is-" + status, STATUS_VI[status] + (record.errors > 0 ? " · " + record.errors + " errors" : "")),
        );
        if (actions.listen) {
          const listen = uiButton(doc, "dh-listen", () => {
            select(index);
            actions.listen?.(record.text);
          });
          listen.title = "Listen: " + record.text;
          listen.innerHTML = icon("speaker");
          row.append(listen);
        } else row.append(el(doc, "span"));
        row.addEventListener("mouseenter", () => select(index));
        return row;
      }),
    );
    if (list.length === 0) bookList.append(el(doc, "li", "dh-book__empty", "No words typed this stage."));
    retryButton.innerHTML = `<span class="dh-key">${keyLabel("enter")}</span>` + (s.outcome === "victory" ? "Replay" : "Retry");
    const easier = s.outcome === "defeat" ? (actions.easierOffer?.() ?? null) : null;
    offerEasier = easier !== null;
    setShown(easierButton, offerEasier);
    if (easier !== null) easierButton.innerHTML = `<span class="dh-key">${keyLabel("call-early")}</span>Lost twice: retry on ${easier}`;
    keys.innerHTML =
      (resultButtons.length > 1 ? `<span class="dh-key">${keyLabel("rotate-left")}</span><span class="dh-key">${keyLabel("rotate-right")}</span> buttons · ` : "") +
      `<span class="dh-key">${keyLabel("tilt-up")}</span><span class="dh-key">${keyLabel("tilt-down")}</span> words` +
      (actions.listen ? ` · <span class="dh-key">${keyLabel("replay")}</span> listen` : "");
    focusAction(0);
    setShown(screen, true);
    select(0);
  };

  const hide = (): void => {
    summary = null;
    pending = null;
    setShown(cheer, false);
    setShown(screen, false);
  };

  const showPending = (): void => {
    if (!pending) return;
    const { stars: count, wave } = pending;
    pending = null;
    setShown(cheer, false);
    show("victory", count, wave);
  };

  const onEvents = (events: readonly SimEvent[], w: World): void => {
    if (w !== world) {
      // A new run: start a fresh log.
      log.reset();
      hurt = emptyHurt();
      hide();
    }
    world = w;
    log.onEvents(events);
    tallyHurt(hurt, events);
    for (const event of events) {
      if (event.type === "victory") {
        pending = { stars: event.stars, wave: w.wave, at: -1 };
        setShown(cheer, true);
      } else if (event.type === "defeat") show("defeat", 0, event.wave);
    }
  };

  const frame = (w: World, info: FrameInfo): void => {
    if (w !== world) {
      log.reset();
      hurt = emptyHurt();
      hide();
      world = w;
    }
    if (pending) {
      if (pending.at < 0) pending.at = info.now + VICTORY_HOLD_MS;
      else if (info.now >= pending.at) showPending();
    }
  };

  const handleAction = (action: string): boolean => {
    if (pending) {
      // The hold takes every key; Enter or Esc skips to the panel.
      if (action === "enter" || action === "escape") showPending();
      return true;
    }
    if (!summary) return false;
    if (action === "enter") resultButtons[focusedAction]!.click();
    else if (action === "rotate-left" || action === "rotate-right") focusAction((focusedAction + 1) % resultButtons.length);
    else if (action === "call-early" && offerEasier) actions.easier?.();
    else if (action === "tilt-up") select(selected - 1);
    else if (action === "tilt-down") select(selected + 1);
    else if (action === "replay") {
      const record = list[selected];
      if (record) actions.listen?.(record.text);
    }
    // Everything else waits while the screen is up.
    return true;
  };

  return {
    onEvents,
    frame,
    handleAction,
    dispose(): void {
      screen.remove();
      cheer.remove();
    },
  };
}
