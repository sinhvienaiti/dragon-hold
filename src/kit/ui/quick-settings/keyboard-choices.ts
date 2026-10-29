// Ticket 190: shared keyboard-sound picker for QuickSettings and the Typing Feedback Lab.
import type { QuickChoiceOption } from "./types";

const STYLE_ID = "kit-keyboard-choices";
/** Kept separate from TF2's quick-settings/css.ts. 9 × 34 px at 720p, independently scrollable. */
export const KEYBOARD_CHOICES_CSS = `
.kit-keyboards{display:grid;grid-template-columns:minmax(0,1fr) auto;max-height:306px;overflow:auto;overscroll-behavior:contain;width:100%;border:1px solid var(--kit-qs-line,#4A505C);border-radius:6px;background:var(--kit-qs-control,#232731)}
.kit-keyboards__list,.kit-keyboards__listens{display:flex;flex-direction:column;min-width:0}
.kit-keyboards button{box-sizing:border-box;display:block;flex:0 0 34px;height:34px;min-height:34px;margin:0;border:0;border-radius:0;padding:0 10px;font:inherit;text-align:left;background:transparent;color:var(--kit-qs-text,#F3F4F6);cursor:pointer}
.kit-keyboards__option{width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kit-keyboards button:focus-visible{outline:2px solid var(--kit-qs-focus,#FFD166);outline-offset:-3px}
.kit-keyboards button:hover:not(:disabled){background:var(--kit-qs-bg,#14161B)}
.kit-keyboards button[aria-selected="true"]{background:var(--kit-qs-accent,#8FD3FF);color:var(--kit-qs-accent-text,#0B0D12)}
.kit-keyboards button:disabled{color:var(--kit-qs-muted,#C3C9D3);cursor:not-allowed}
.kit-keyboards__listen{min-width:44px;text-align:center!important}
.kit-keyboards__listen img{display:block;width:24px;height:24px;object-fit:contain;pointer-events:none}
.kit-keyboards__note{font-size:.82em;margin-left:.35em}
.kit-keyboards__spacer{height:34px;flex:0 0 34px}
.kit-qs__row--keyboards{align-items:start}
@media (any-pointer:coarse){.kit-keyboards button{height:44px;min-height:44px;flex-basis:44px}.kit-keyboards__spacer{height:44px;flex-basis:44px}}
`;

export class KeyboardSoundChoices {
  readonly element: HTMLElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly listens: HTMLButtonElement[] = [];
  private pointerFocus = false;

  constructor(private readonly config: {
    readonly document: Document;
    readonly options: readonly QuickChoiceOption[];
    readonly label: string;
    readonly onSelect: (choice: QuickChoiceOption) => void;
    /** delay=0 for the explicit Listen button; otherwise the 150 ms dwell. */
    readonly onPreview: (choice: QuickChoiceOption, delay?: number) => void;
    readonly onStop: () => void;
    /** Ticket 180 hud-sound image URL. Missing art uses a labelled Listen button. */
    readonly listenIcon?: string;
  }) {
    const doc = config.document;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent = KEYBOARD_CHOICES_CSS;
      doc.head.append(style);
    }
    const root = this.element = doc.createElement("div");
    root.className = "kit-keyboards";
    const list = doc.createElement("div");
    list.className = "kit-keyboards__list";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", config.label);
    // Listen buttons are siblings of the listbox, never interactive descendants of role=option.
    const listens = doc.createElement("div");
    listens.className = "kit-keyboards__listens";
    root.append(list, listens);
    config.options.forEach((choice, index) => {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "kit-keyboards__option";
      button.setAttribute("role", "option");
      button.dataset.value = choice.value;
      button.textContent = choice.label;
      button.title = choice.label;
      button.disabled = choice.disabled === true;
      button.tabIndex = -1;
      const note = choice.note ?? (choice.disabled ? "pending" : "");
      if (note) {
        const small = doc.createElement("small");
        small.className = "kit-keyboards__note";
        small.textContent = note;
        button.append(" ", small);
      }
      button.addEventListener("pointerdown", () => { this.pointerFocus = true; });
      button.addEventListener("pointerenter", (event) => {
        if (event.pointerType === "mouse" && !button.disabled) config.onPreview(choice);
      });
      button.addEventListener("pointerleave", (event) => { if (event.pointerType === "mouse") config.onStop(); });
      button.addEventListener("focus", () => {
        this.rove(index);
        if (!this.pointerFocus && !button.disabled) config.onPreview(choice);
      });
      button.addEventListener("blur", () => { this.pointerFocus = false; config.onStop(); });
      button.addEventListener("pointercancel", () => { this.pointerFocus = false; config.onStop(); });
      button.addEventListener("click", () => {
        this.pointerFocus = false;
        if (!button.disabled) config.onSelect(choice);
      });
      button.addEventListener("keydown", (event) => {
        this.pointerFocus = false;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!event.repeat && !button.disabled) config.onSelect(choice);
          return;
        }
        const enabled = this.buttons.map((b, i) => b.disabled ? -1 : i).filter((i) => i >= 0);
        const at = enabled.indexOf(index);
        const target = event.key === "Home" ? enabled[0] : event.key === "End" ? enabled.at(-1) : event.key === "ArrowDown" ? enabled[Math.min(enabled.length - 1, at + 1)] : event.key === "ArrowUp" ? enabled[Math.max(0, at - 1)] : undefined;
        if (target === undefined) return;
        event.preventDefault();
        this.buttons[target]!.focus();
        this.buttons[target]!.scrollIntoView?.({ block: "nearest" });
      });
      this.buttons.push(button);
      list.append(button);
      if (choice.preview && !choice.disabled) {
        const listen = doc.createElement("button");
        listen.type = "button";
        listen.className = "kit-keyboards__listen";
        listen.dataset.listen = choice.value;
        listen.setAttribute("aria-label", `Listen to ${choice.label}`);
        listen.title = `Listen to ${choice.label}`;
        // Touch must not start a focus/hover preview as well as the explicit one.
        listen.addEventListener("click", () => config.onPreview(choice, 0));
        listen.addEventListener("blur", config.onStop);
        this.listens.push(listen);
        listens.append(listen);
      } else {
        const spacer = doc.createElement("span");
        spacer.className = "kit-keyboards__spacer";
        spacer.setAttribute("aria-hidden", "true");
        listens.append(spacer);
      }
    });
    this.setListenIcon(config.listenIcon);
    this.sync("");
  }

  private rove(index: number): void {
    this.buttons.forEach((button, i) => { button.tabIndex = i === index ? 0 : -1; });
  }

  sync(value: string): void {
    this.buttons.forEach((button) => button.setAttribute("aria-selected", String(button.dataset.value === value)));
    const focused = this.buttons.indexOf(this.config.document.activeElement as HTMLButtonElement);
    const selected = this.buttons.findIndex((button) => button.dataset.value === value && !button.disabled);
    this.rove(focused >= 0 ? focused : selected >= 0 ? selected : this.buttons.findIndex((button) => !button.disabled));
  }

  setListenIcon(url?: string): void {
    for (const listen of this.listens) {
      listen.replaceChildren();
      if (!url) { listen.textContent = "Listen"; continue; }
      const img = this.config.document.createElement("img");
      img.src = url;
      img.alt = "";
      img.addEventListener("error", () => { listen.textContent = "Listen"; }, { once: true });
      listen.append(img);
    }
  }

  destroy(): void {
    this.config.onStop();
    this.element.remove();
  }
}
