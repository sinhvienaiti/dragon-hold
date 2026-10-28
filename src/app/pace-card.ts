/**
 * The speed card (typing-pace.ts): asks how fast the player types before the
 * first run, and again from the pause menu. Rows are the measured speed (when
 * there is one, key 0) and the presets (keys 1–7, stable); a row's digit picks
 * it, ↑ ↓ move, Enter picks, a click picks, Esc goes back when the card was
 * opened from the menu. The app hands Digit 0 in as "carry-0" (KEYS binds 1–9 only).
 * Owner: integrator (LANES.md).
 */
import { el, setShown, uiButton } from "../ui/skin";
import { PACE_CURRENT_KEY, type PaceHeader, type PaceOption } from "./typing-pace";

export interface PaceCard {
  readonly isOpen: boolean;
  /** Shows the rows; `onPick` gets the chosen header, `onBack` (if given) makes Esc close the card. */
  open(options: readonly PaceOption[], selected: number, onPick: (header: PaceHeader, choice?: { easy: boolean }) => void, onBack?: () => void, current?: PaceHeader, note?: string, easy?: (wpm: number) => boolean): void;
  /** Keyboard actions (rules.ts KEYS names); true when the card took it. */
  handleAction(action: string | null): boolean;
  close(): void;
  dispose(): void;
}

export function createPaceCard(root: HTMLElement): PaceCard {
  const doc = root.ownerDocument;
  const card = el(doc, "section", "dh-panel dh-pacecard");
  card.dataset.dhAvoid = "";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Typing speed");
  const title = el(doc, "div", "dh-pacecard__title", "How fast do you type?");
  const lead = el(doc, "div", "dh-pacecard__lead", "This sets foe pace and word length. Unsure? Pick 35 if you touch type, or 20–25 if you look at the keys. After each stage, your measured speed helps set the next one.");
  const list = el(doc, "div", "dh-pacecard__list");
  const keys = el(doc, "div", "dh-pacecard__keys", "");
  const noteNode = el(doc, "div", "dh-pacecard__note", "");
  const easyButton = uiButton(doc, "dh-pacecard__easy", () => choose(index, true));
  // The note sits above the rows: under them, the pointer crossed faster rows on its way and hid the Easy button.
  card.append(title, lead, noteNode, list, keys);
  setShown(card, false);
  root.append(card);

  let rows: HTMLButtonElement[] = [];
  let items: readonly PaceOption[] = [];
  let index = 0;
  let open = false;
  let pick: ((header: PaceHeader, choice?: { easy: boolean }) => void) | null = null;
  let back: (() => void) | null = null;
  let easy: ((wpm: number) => boolean) | null = null;
  let originalNote = "";
  let easyShown = false;

  const updateNote = (): void => {
    const wpm = items[index]?.header.typistWpm;
    easyShown = wpm !== undefined && (easy?.(wpm) ?? false);
    noteNode.textContent = easyShown
      ? "New typist? Try Easy for fewer, slower foes. ⇧↵ picks this speed and Easy."
      : originalNote;
    if (easyShown) {
      easyButton.textContent = "Play Easy at " + wpm + " WPM";
      noteNode.append(" ", easyButton);
    }
    // While a row can take the hint, its two lines stay reserved so the rows never shift under the pointer.
    const reserve = easy !== null && items.some((item) => easy!(item.header.typistWpm));
    noteNode.classList.toggle("is-reserved", reserve);
    setShown(noteNode, reserve || Boolean(originalNote));
  };

  const select = (next: number): void => {
    index = rows.length === 0 ? 0 : (next + rows.length) % rows.length;
    rows.forEach((row, k) => row.classList.toggle("is-on", k === index));
    updateNote();
  };

  const choose = (k: number, useEasy = false): void => {
    const item = items[k];
    if (!open || item === undefined || (useEasy && !easyShown)) return;
    select(k);
    const done = pick;
    close();
    done?.(item.header, { easy: useEasy });
  };

  function close(): void {
    open = false;
    pick = null;
    back = null;
    easy = null;
    easyShown = false;
    setShown(card, false);
  }

  return {
    get isOpen() {
      return open;
    },
    open(options, selected, onPick, onBack, current, note, offer) {
      items = options;
      pick = onPick;
      back = onBack ?? null;
      easy = offer ?? null;
      originalNote = note ?? "";
      rows = options.map((option, k) => {
        const row = uiButton(doc, "dh-pacecard__row", () => choose(k));
        row.dataset.wpm = String(option.header.typistWpm);
        row.dataset.source = option.header.source;
        // The speed in use, whatever row or source it came from (a ?wpm= 35 is the 35 row).
        const now = current !== undefined && current.typistWpm === option.header.typistWpm;
        row.dataset.key = String(option.key);
        row.append(
          el(doc, "span", "dh-key", String(option.key)),
          el(doc, "span", "dh-pacecard__wpm", option.label),
          el(doc, "span", "dh-pacecard__hint", option.hint + (now && option.key !== PACE_CURRENT_KEY ? " · in use" : "")),
        );
        row.addEventListener("pointerenter", () => select(k));
        return row;
      });
      list.replaceChildren(...rows);
      const digits = options.map((option) => option.key);
      keys.textContent = "Keys " + Math.min(...digits) + "–" + Math.max(...digits) + " select · ↑ ↓ then Enter" + (back ? " · Esc back" : "");
      open = true;
      setShown(card, true);
      select(selected);
    },
    handleAction(action) {
      if (!open) return false;
      if (action === "tilt-up") select(index - 1);
      else if (action === "tilt-down") select(index + 1);
      else if (action === "enter") choose(index);
      else if (action === "call-early") {
        if (!easyShown) return false;
        choose(index, true);
      } else if (action === "escape") {
        if (back) {
          const done = back;
          close();
          done();
        }
      } else if (action !== null && action.startsWith("carry-")) {
        const digit = Number(action.slice(6));
        const k = items.findIndex((item) => item.key === digit);
        if (k >= 0) choose(k);
      }
      return true;
    },
    close,
    dispose() {
      close();
      card.remove();
    },
  };
}
