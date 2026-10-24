/**
 * The speed card (typing-pace.ts): asks how fast the player types before the
 * first run, and again from the pause menu. Rows are the measured speed (when
 * there is one, key 0) and the presets (keys 1–7, stable); a row's digit picks
 * it, ↑ ↓ move, Enter picks, a click picks, Esc goes back when the card was
 * opened from the menu. The app hands Digit 0 in as "carry-0" (KEYS binds 1–9 only).
 * Owner: integrator (LANES.md).
 */
import { el, setShown, uiButton } from "../ui/skin";
import type { PaceHeader, PaceOption } from "./typing-pace";

export interface PaceCard {
  readonly isOpen: boolean;
  /** Shows the rows; `onPick` gets the chosen header, `onBack` (if given) makes Esc close the card. */
  open(options: readonly PaceOption[], selected: number, onPick: (header: PaceHeader) => void, onBack?: () => void, current?: PaceHeader): void;
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
  card.setAttribute("aria-label", "Tốc độ gõ");
  const title = el(doc, "div", "dh-pacecard__title", "Bạn gõ nhanh cỡ nào?");
  const lead = el(doc, "div", "dh-pacecard__lead", "Quái đến dày hay thưa, từ dài hay ngắn theo tốc độ này. Chưa biết: gõ mười ngón không nhìn phím thì chọn 35, còn nhìn phím thì chọn 20–25. Hết ải, game đo tốc độ thật của bạn cho lần sau.");
  const list = el(doc, "div", "dh-pacecard__list");
  const keys = el(doc, "div", "dh-pacecard__keys", "");
  card.append(title, lead, list, keys);
  setShown(card, false);
  root.append(card);

  let rows: HTMLButtonElement[] = [];
  let items: readonly PaceOption[] = [];
  let index = 0;
  let open = false;
  let pick: ((header: PaceHeader) => void) | null = null;
  let back: (() => void) | null = null;

  const select = (next: number): void => {
    if (rows.length === 0) return;
    index = (next + rows.length) % rows.length;
    rows.forEach((row, k) => row.classList.toggle("is-on", k === index));
  };

  const choose = (k: number): void => {
    const item = items[k];
    if (!open || item === undefined) return;
    const done = pick;
    close();
    done?.(item.header);
  };

  function close(): void {
    open = false;
    pick = null;
    back = null;
    setShown(card, false);
  }

  return {
    get isOpen() {
      return open;
    },
    open(options, selected, onPick, onBack, current) {
      items = options;
      pick = onPick;
      back = onBack ?? null;
      rows = options.map((option, k) => {
        const row = uiButton(doc, "dh-pacecard__row", () => choose(k));
        row.dataset.wpm = String(option.header.typistWpm);
        row.dataset.source = option.header.source;
        const now = current !== undefined && current.typistWpm === option.header.typistWpm && current.source === option.header.source;
        row.dataset.key = String(option.key);
        row.append(
          el(doc, "span", "dh-key", String(option.key)),
          el(doc, "span", "dh-pacecard__wpm", option.label),
          el(doc, "span", "dh-pacecard__hint", option.hint + (now ? " · đang dùng" : "")),
        );
        row.addEventListener("pointerenter", () => select(k));
        return row;
      });
      list.replaceChildren(...rows);
      const digits = options.map((option) => option.key);
      keys.textContent = "Phím " + Math.min(...digits) + "–" + Math.max(...digits) + " chọn · ↑ ↓ rồi Enter" + (back ? " · Esc quay lại" : "");
      open = true;
      setShown(card, true);
      select(selected);
    },
    handleAction(action) {
      if (!open) return false;
      if (action === "tilt-up") select(index - 1);
      else if (action === "tilt-down") select(index + 1);
      else if (action === "enter") choose(index);
      else if (action === "escape") {
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
