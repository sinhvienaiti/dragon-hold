/**
 * End of the run (01 §5, §6.5; 06 §4 screens 8 and 9): victory with stars or
 * defeat, gold, accuracy, new words learned, and the Sổ Từ Ải list (words
 * met: new, mistyped, to review; listen to each). Collects the word log from
 * word events during the run. Keyboard: ↑ ↓ pick a word, Tab listens, Enter
 * plays again; while shown it takes every command key.
 * Owner: ui (LANES.md).
 */
import type { ActionHandler, FrameInfo, Presenter } from "../app/contracts";
import { STARS } from "../content/rules";
import type { Grade, SimEvent, WordGroup, WordKind } from "../content/types";
import type { World } from "../sim/world";
import type { Gloss } from "./learning-frame";
import { el, icon, keyLabel, setClass, setShown, setText, uiButton } from "./skin";

export interface ResultsActions {
  retry(): void;
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

export type WordStatus = "new" | "miss" | "review" | "good";

/** Status in Sổ Từ Ải (01 §6.5: mới học, gõ sai, cần ôn). */
export function wordStatus(record: WordRecord): WordStatus {
  if (record.group === "new") return "new";
  if (record.errors > 0) return "miss";
  if (record.sloppy > 0 || record.hints > 0 || record.done === 0) return "review";
  return "good";
}

const STATUS_RANK: Readonly<Record<WordStatus, number>> = { new: 0, miss: 1, review: 2, good: 3 };

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
}

export function summarizeRun(world: World, log: WordLog, outcome: "victory" | "defeat", stars: 0 | 1 | 2 | 3, wave: number): ResultsSummary {
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
  };
}

/** The line under the stars (06 §6: "Giữ máu Hỏa Long để có 3 sao"). */
export function starHint(summary: ResultsSummary): string {
  if (summary.outcome === "defeat") return "Hỏa Long gục ở đợt " + summary.wave + ". Đặt lính chặn và bẫy ở đường đông quái hơn.";
  if (summary.stars >= 3) return "Hỏa Long còn " + summary.hpPct + " % máu: trọn ba sao.";
  const need = summary.stars === 2 ? STARS.threeStarHpPct : STARS.twoStarHpPct;
  return "Hỏa Long còn " + summary.hpPct + " % máu. Giữ từ " + need + " % để có " + (summary.stars + 1) + " sao.";
}

// ── The screen ──────────────────────────────────────────────────────────────

const STATUS_VI: Readonly<Record<WordStatus, string>> = { new: "Mới học", miss: "Gõ sai", review: "Cần ôn", good: "Gõ tốt" };

export function createResults(root: HTMLElement, actions: ResultsActions): Presenter & ActionHandler {
  const doc = root.ownerDocument;
  const log = new WordLog();
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
  bookHead.append(el(doc, "span", "dh-title", "Sổ Từ Ải"), bookCount);
  const bookList = el(doc, "ul", "dh-book__list");
  book.append(bookHead, bookList);
  const foot = el(doc, "div", "dh-results__foot");
  const retryButton = uiButton(doc, "dh-retry", () => actions.retry());
  const keys = el(doc, "span", "dh-results__keys");
  foot.append(retryButton, keys);
  panel.append(titleBox, starsBox, tiles, book, foot);
  screen.append(panel);
  setShown(screen, false);
  root.append(screen);

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
    summary = summarizeRun(world, log, outcome, starCount, wave);
    const s = summary;
    setText(title, s.outcome === "victory" ? "Giữ Ải thành công" : "Bệ Rồng thất thủ");
    setText(sub, world.stage.nameVi + " · " + (s.outcome === "victory" ? s.waves + "/" + s.waves + " đợt" : "thua ở đợt " + s.wave + "/" + s.waves));
    starNodes.forEach((node, index) => setClass(node, "is-on", index < s.stars));
    setShown(stars, s.outcome === "victory");
    setText(hint, starHint(s));
    tiles.replaceChildren(
      tile(String(s.goldLeft), "Vàng còn", true),
      tile(String(s.goldEarned), "Vàng kiếm được", true),
      tile(s.accuracyPct === null ? "—" : s.accuracyPct + " %", "Độ chuẩn"),
      tile(s.newLearned + "/" + s.newMet, "Từ mới đã học"),
      tile(String(s.met), "Từ đã gặp"),
    );
    list = log.list();
    setText(bookCount, list.length + " từ · " + s.mistyped + " từ gõ sai");
    bookList.replaceChildren(
      ...list.map((record, index) => {
        const row = el(doc, "li", "dh-word");
        const status = wordStatus(record);
        const g = actions.gloss?.(record.text) ?? null;
        row.append(
          el(doc, "span", "dh-word__text", record.text),
          el(doc, "span", "dh-word__ipa", g?.ipa ?? ""),
          el(doc, "span", "dh-word__vi", g?.vi ?? ""),
          el(doc, "span", "dh-wstatus is-" + status, STATUS_VI[status] + (record.errors > 0 ? " · " + record.errors + " lỗi" : "")),
        );
        if (actions.listen) {
          const listen = uiButton(doc, "dh-listen", () => {
            select(index);
            actions.listen?.(record.text);
          });
          listen.title = "Nghe " + record.text;
          listen.innerHTML = icon("speaker");
          row.append(listen);
        } else row.append(el(doc, "span"));
        row.addEventListener("mouseenter", () => select(index));
        return row;
      }),
    );
    if (list.length === 0) bookList.append(el(doc, "li", "dh-book__empty", "Chưa gõ từ nào trong ải này."));
    retryButton.innerHTML = `<span class="dh-key">${keyLabel("enter")}</span>` + (s.outcome === "victory" ? "Chơi lại ải" : "Thử lại");
    keys.innerHTML =
      `<span class="dh-key">↑</span><span class="dh-key">↓</span> chọn từ` + (actions.listen ? ` · <span class="dh-key">Tab</span> nghe` : "");
    setShown(screen, true);
    select(0);
  };

  const hide = (): void => {
    summary = null;
    setShown(screen, false);
  };

  const onEvents = (events: readonly SimEvent[], w: World): void => {
    if (w !== world) {
      // A new run: start a fresh log.
      log.reset();
      hide();
    }
    world = w;
    log.onEvents(events);
    for (const event of events) {
      if (event.type === "victory") show("victory", event.stars, w.wave);
      else if (event.type === "defeat") show("defeat", 0, event.wave);
    }
  };

  const frame = (w: World, _info: FrameInfo): void => {
    if (w !== world) {
      log.reset();
      hide();
      world = w;
    }
  };

  const handleAction = (action: string): boolean => {
    if (!summary) return false;
    if (action === "enter") actions.retry();
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
    },
  };
}
