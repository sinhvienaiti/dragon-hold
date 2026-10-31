// Ticket 190: shared keyboard-sound picker for QuickSettings and the Typing Feedback Lab.
import type { QuickChoiceOption } from "./types";
import type { KeyboardSoundChoice } from "../../feedback/typing-fx/audio";

const STYLE_ID = "kit-keyboard-choices";
let nextGroupId = 0;
/**
 * Kept separate from TF2's quick-settings/css.ts. 9 × 34 px at 720p, independently scrollable.
 * The selected option keeps its accent fill under the pointer (a dark inset ring marks the hover);
 * a selected option that is also disabled ("Saved sound · unavailable") is muted ink on the panel's
 * dark ground with an accent bar, so every state stays readable (≥ 4.5:1, see keyboard-panel.test.ts).
 */
export const KEYBOARD_CHOICES_CSS = `
.kit-keyboards{display:grid;grid-template-columns:minmax(0,1fr) auto;max-height:306px;overflow:auto;overscroll-behavior:contain;width:100%;border:1px solid var(--kit-qs-line,#4A505C);border-radius:6px;background:var(--kit-qs-control,#232731)}
.kit-keyboards__list,.kit-keyboards__listens,.kit-keyboards__group{display:flex;flex-direction:column;min-width:0}
.kit-keyboards button{box-sizing:border-box;display:block;flex:0 0 34px;height:34px;min-height:34px;margin:0;border:0;border-radius:0;padding:0 10px;font:inherit;text-align:left;background:transparent;color:var(--kit-qs-text,#F3F4F6);cursor:pointer}
.kit-keyboards__option{width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kit-keyboards button:focus-visible{outline:2px solid var(--kit-qs-focus,#FFD166);outline-offset:-3px}
.kit-keyboards button:hover:not(:disabled){background:var(--kit-qs-bg,#14161B)}
.kit-keyboards button[aria-selected="true"]{background:var(--kit-qs-accent,#8FD3FF);color:var(--kit-qs-accent-text,#0B0D12)}
.kit-keyboards button[aria-selected="true"]:hover:not(:disabled){background:var(--kit-qs-accent,#8FD3FF);box-shadow:inset 0 0 0 2px var(--kit-qs-accent-text,#0B0D12)}
.kit-keyboards button:disabled{color:var(--kit-qs-muted,#C3C9D3);cursor:not-allowed}
.kit-keyboards button[aria-selected="true"]:disabled{background:var(--kit-qs-bg,#14161B);color:var(--kit-qs-muted,#C3C9D3);box-shadow:inset 4px 0 0 var(--kit-qs-accent,#8FD3FF)}
.kit-keyboards__listen{min-width:44px;text-align:center!important}
.kit-keyboards__listen img{display:block;width:24px;height:24px;object-fit:contain;pointer-events:none}
.kit-keyboards__family{box-sizing:border-box;height:28px;min-height:28px;flex:0 0 28px;padding:4px 10px;font-size:.82em;font-weight:700;color:var(--kit-qs-muted,#C3C9D3)}
.kit-keyboards__note{font-size:.82em;margin-left:.35em}
.kit-keyboards__spacer{height:34px;flex:0 0 34px}
.kit-qs__row--keyboards{align-items:start}
@media (any-pointer:coarse){.kit-keyboards button{height:44px;min-height:44px;flex-basis:44px}.kit-keyboards__spacer{height:44px;flex-basis:44px}}
`;

/**
 * What a list hands to the one that replaces it (QuickSettings.setChoiceOptions):
 * its scroll position and the option or Listen button that had keyboard focus.
 */
export type KeyboardChoicesState = {
  readonly scrollTop: number;
  readonly focus: { readonly value: string; readonly listen: boolean } | null;
};

/** A mouse pointer's place in client coordinates (PointerEvent clientX/clientY). */
export type KeyboardPointer = { readonly x: number; readonly y: number };

export class KeyboardSoundChoices {
  readonly element: HTMLElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly listens: HTMLButtonElement[] = [];
  private pointerFocus = false;
  /** True while adopt() moves focus: that focus is not the player's, so it previews nothing. */
  private quietFocus = false;
  /** This list replaced another (config.settle) and the mouse pointer has not moved since: see still(). */
  private settling: boolean;
  /** Where the pointer rested when this list replaced the old one; null until known. */
  private rest: KeyboardPointer | null;
  private destroyed = false;
  private readonly families: { family: string; index: number }[] = [];

  constructor(private readonly config: {
    readonly document: Document;
    readonly options: readonly KeyboardSoundChoice[];
    readonly label: string;
    readonly onSelect: (choice: QuickChoiceOption) => void;
    /** delay=0 for the explicit Listen button; otherwise the 150 ms dwell. */
    readonly onPreview: (choice: QuickChoiceOption, delay?: number) => void;
    readonly onStop: () => void;
    /** Ticket 180 hud-sound image URL. Missing art uses a labelled Listen button. */
    readonly listenIcon?: string;
    /**
     * Set when this list replaces another one (QuickSettings.setChoiceOptions):
     * where the mouse pointer last was (null: not known). The new rows can land
     * under a resting pointer, and the browser then sends their pointerenter
     * (and pointerleave) with no move. Until the pointer really moves, those
     * events at that point preview and stop nothing: only the player's own
     * hover does. Unknown: the first mouse event the list sees gives the point.
     */
    readonly settle?: { readonly pointer: KeyboardPointer | null };
  }) {
    this.settling = config.settle !== undefined;
    this.rest = config.settle?.pointer ?? null;
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
    // A move away from where the pointer rested ends the settling (a catch-up move at the same point does not).
    if (this.settling) root.addEventListener("pointermove", (event) => { this.still(event); }, { passive: true });
    let parent = list;
    let family: string | undefined;
    config.options.forEach((choice, index) => {
      // Contiguous groups preserve the catalogue's order even when a family recurs.
      const nextFamily = choice.value === "off" ? undefined : choice.family?.trim() || undefined;
      if (nextFamily !== family) {
        family = nextFamily;
        parent = list;
        if (family) {
          const group = doc.createElement("div");
          group.className = "kit-keyboards__group";
          group.setAttribute("role", "group");
          const heading = doc.createElement("div");
          heading.className = "kit-keyboards__family";
          heading.id = `kit-keyboards-family-${++nextGroupId}`;
          heading.textContent = family;
          group.setAttribute("aria-labelledby", heading.id);
          group.append(heading);
          list.append(group);
          parent = group;
          this.families.push({ family, index });
          const spacer = doc.createElement("span");
          spacer.className = "kit-keyboards__family";
          spacer.setAttribute("aria-hidden", "true");
          listens.append(spacer);
        }
      }
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
        if (event.pointerType !== "mouse" || this.still(event)) return;
        if (!button.disabled) config.onPreview(choice);
      });
      button.addEventListener("pointerleave", (event) => {
        if (event.pointerType !== "mouse" || this.still(event)) return;
        config.onStop();
      });
      button.addEventListener("focus", () => {
        this.rove(index);
        if (!this.pointerFocus && !this.quietFocus && !button.disabled) config.onPreview(choice);
      });
      // A replaced list's last events (its focused option leaving the document) are not the player's.
      button.addEventListener("blur", () => { this.pointerFocus = false; if (!this.destroyed) config.onStop(); });
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
        const currentFamily = [...this.families].reverse().find((group) => group.index <= index);
        const familyTarget = event.key === "PageDown"
          ? this.families.find((group) => group.index > index && group !== currentFamily)
          : [...this.families].reverse().find((group) => group.index < (currentFamily?.index ?? index));
        const pageTarget = familyTarget && enabled.find((i) => i >= familyTarget.index && i < (this.families.find((group) => group.index > familyTarget.index)?.index ?? this.buttons.length));
        if (event.key === "PageUp" || event.key === "PageDown") event.preventDefault();
        const target = event.key === "PageUp" || event.key === "PageDown" ? pageTarget : event.key === "Home" ? enabled[0] : event.key === "End" ? enabled.at(-1) : event.key === "ArrowDown" ? enabled[Math.min(enabled.length - 1, at + 1)] : event.key === "ArrowUp" ? enabled[Math.max(0, at - 1)] : undefined;
        if (target === undefined) return;
        event.preventDefault();
        this.buttons[target]!.focus({ preventScroll: true });
        this.scrollTo(this.buttons[target]!);
      });
      this.buttons.push(button);
      parent.append(button);
      if (choice.preview && !choice.disabled) {
        const listen = doc.createElement("button");
        listen.type = "button";
        listen.className = "kit-keyboards__listen";
        listen.dataset.listen = choice.value;
        listen.setAttribute("aria-label", `Listen to ${choice.label}`);
        listen.title = `Listen to ${choice.label}`;
        // Touch must not start a focus/hover preview as well as the explicit one.
        listen.addEventListener("click", () => config.onPreview(choice, 0));
        listen.addEventListener("blur", () => { if (!this.destroyed) config.onStop(); });
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
    // Nothing selected yet: the owner's own sync(value) reveals the selection.
    this.sync("", false);
  }

  /**
   * While this list settles: true for a mouse event at the point where the
   * pointer rested (the first event seen gives that point when it was not
   * known), which is the browser catching up with the new layout, not the
   * player. An event anywhere else means the pointer moved: the settling ends
   * and from then on every event is the player's (false).
   */
  private still(event: PointerEvent): boolean {
    if (!this.settling || event.pointerType !== "mouse") return false;
    const rest = this.rest ?? (this.rest = { x: event.clientX, y: event.clientY });
    if (Math.abs(event.clientX - rest.x) < 1 && Math.abs(event.clientY - rest.y) < 1) return true;
    this.settling = false;
    return false;
  }

  private rove(index: number): void {
    this.buttons.forEach((button, i) => { button.tabIndex = i === index ? 0 : -1; });
  }

  /**
   * Marks `value` selected. `reveal` (default) then scrolls it into view once
   * the list is visible; QuickSettings passes false while it rebuilds a list,
   * so the list stays where the player left it.
   */
  sync(value: string, reveal = true): void {
    this.buttons.forEach((button) => button.setAttribute("aria-selected", String(button.dataset.value === value)));
    const focused = this.buttons.indexOf(this.config.document.activeElement as HTMLButtonElement);
    const selected = this.buttons.findIndex((button) => button.dataset.value === value && !button.disabled);
    this.rove(focused >= 0 ? focused : selected >= 0 ? selected : this.buttons.findIndex((button) => !button.disabled));
    if (!reveal) return;
    // QuickSettings syncs just before dialog.show(); measure after it becomes visible.
    queueMicrotask(() => {
      if (!this.destroyed && this.element.isConnected) {
        const button = this.buttons.find((b) => b.getAttribute("aria-selected") === "true");
        if (button) this.scrollTo(button);
      }
    });
  }

  /** Scroll only this control, keeping the surrounding settings panel stationary. */
  private scrollTo(button: HTMLButtonElement): void {
    const box = this.element.getBoundingClientRect();
    const target = button.getBoundingClientRect();
    const top = box.top + this.element.clientTop;
    const bottom = top + this.element.clientHeight;
    if (target.top < top) this.element.scrollTop += target.top - top;
    else if (target.bottom > bottom) this.element.scrollTop += target.bottom - bottom;
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

  /** This list's scroll and keyboard focus, for the list that replaces it (adopt). */
  state(): KeyboardChoicesState {
    const active = this.config.document.activeElement;
    const option = this.buttons.find((button) => button === active);
    const listen = this.listens.find((button) => button === active);
    return {
      scrollTop: this.element.scrollTop,
      focus: option !== undefined ? { value: option.dataset.value ?? "", listen: false } : listen !== undefined ? { value: listen.dataset.listen ?? "", listen: true } : null,
    };
  }

  /**
   * Takes over from the list this one replaced, once its element is in the
   * document and synced: the same scroll position and, when the old list had
   * keyboard focus, focus on the same option or Listen button (else the
   * selected option, else the first enabled one). That focus is not the
   * player's, so it previews nothing and scrolls nothing.
   */
  adopt(state: KeyboardChoicesState): void {
    if (this.destroyed) return;
    this.element.scrollTop = state.scrollTop;
    if (state.focus === null) return;
    const { value, listen } = state.focus;
    const target = (listen ? this.listens.find((button) => button.dataset.listen === value) : undefined)
      ?? this.buttons.find((button) => button.dataset.value === value && !button.disabled)
      ?? this.buttons.find((button) => button.getAttribute("aria-selected") === "true" && !button.disabled)
      ?? this.buttons.find((button) => !button.disabled);
    if (target === undefined) return;
    this.quietFocus = true;
    try {
      target.focus({ preventScroll: true });
    } finally {
      this.quietFocus = false;
    }
  }

  /** Removes the list. `stop` (default) also stops its preview; a list being replaced passes false, so a preview the player started plays on. */
  destroy(stop = true): void {
    this.destroyed = true;
    if (stop) this.config.onStop();
    this.element.remove();
  }
}
