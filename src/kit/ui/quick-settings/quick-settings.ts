// Source: new for the kit: in-play Settings and Sound panels (docs/games/IN_GAME_SETTINGS.md)
/**
 * Two buttons in the host's top-right corner open two overlay panels over
 * play. Opening pauses the game and freezes typing; closing runs a 3-2-1
 * countdown, then resumes. Changes go out at once through onChange; the game
 * applies and saves them (no Save button).
 *
 * a11y-dialog traps Tab inside the open panel and returns focus (normally to
 * the game's typing input) when it closes. Keys: one window capture listener
 * routes F1/F2/Esc and, while `blocking`, swallows every key aimed outside the
 * panel; a bubble listener on the root keeps keys meant for the panel's
 * controls from reaching the game's document/window handlers.
 */
import A11yDialog from "a11y-dialog";
import { KeyboardSoundPreview, type KeyboardLoad, type TypingSounds } from "../../feedback/typing-fx/audio";
import { KeyboardSoundChoices, type KeyboardPointer } from "./keyboard-choices";
import { cssUrl, installQuickSettingsStyles } from "./css";
import {
  QUICK_KEYS,
  createKeyedThrottle,
  isQuickMuted,
  quickScale,
  readRowValues,
  readSlider,
  routeQuickKey,
  sliderBounds,
  startCountdown,
  type KeyedThrottle,
} from "./logic";
import { defaultSettingsRows, defaultSoundRows, type QuickDefaultsOptions } from "./rows";
import {
  QUICK_PANELS,
  type QuickButtonRow,
  type QuickChoiceOption,
  type QuickChoiceRow,
  type QuickIconName,
  type QuickIcons,
  type QuickMount,
  type QuickPanel,
  type QuickRow,
  type QuickSkin,
  type QuickSliderRow,
  type QuickToggleRow,
  type QuickValue,
} from "./types";

export const QUICK_COUNTDOWN_STEPS = 3;
export const QUICK_COUNTDOWN_STEP_MS = 500;
export const QUICK_PREVIEW_THROTTLE_MS = 150;
export const QUICK_DEFAULT_Z_INDEX = 100;

/**
 * The fetchers the Sound panel's keyboard choices use; each one left out is
 * the kit's own fetch, with no time limit (and no HTTP cache for a manifest).
 */
export type QuickKeyboardFetch = {
  /** A picked set's manifest, e.g. timedJson(3000, { cache: "default" }) (its URL is versioned). */
  readonly fetchJson?: (url: string) => Promise<unknown>;
  /** A picked set's samples and every preview file, e.g. timedBytes(). */
  readonly fetchBytes?: (url: string) => Promise<ArrayBuffer>;
};

export type QuickSettingsOptions = QuickDefaultsOptions & {
  /** Element the layer covers (give it position relative/absolute/fixed); default document.body. */
  readonly host?: HTMLElement;
  /** Current values by row id; read when a panel opens and on refresh(). */
  readonly getValues: () => Readonly<Record<string, QuickValue>>;
  /** Called on every change; the game applies the value at once and saves it. */
  readonly onChange: (id: string, value: QuickValue) => void;
  /** Play a short sample of a sound group ("master", "music", "effects", "keyboard", "voice", "ui"); throttled. */
  readonly onPreview?: (group: string) => void;
  /** Gameplay sound player: catalogue selection loads samples into this same instance. */
  readonly keyboardSounds?: TypingSounds;
  /** Game-owned choice without a catalogue manifest (e.g. Relay). Apply it here. */
  readonly onKeyboardUse?: (choice: QuickChoiceOption) => void;
  /** How the keyboard row fetches a picked set and its previews (TYPING_FEEL_SERVICE.md §5.1); default the kit's fetch. */
  readonly keyboardFetch?: QuickKeyboardFetch;
  /** A set picked in the Sound panel finished loading ("pending": no sample, it cannot sound). Only the latest pick reports. */
  readonly onKeyboardLoad?: (result: KeyboardLoad) => void;
  /**
   * A set picked in the Sound panel cannot sound: its load gave no sample or
   * failed (§5.3). The game stands its own sound in for it (unsaved). Only
   * the latest pick reports; a new pick (Off, the game's own sound, a set)
   * is the place to end the stand-in.
   */
  readonly onKeyboardFail?: (choice: QuickChoiceOption) => void;
  /** A panel opened from play: freeze the game. */
  readonly onPause?: () => void;
  /** The countdown after closing ended: unfreeze. */
  readonly onResume?: () => void;
  /** "Quit to title" pressed (no countdown, no onResume). */
  readonly onQuit?: () => void;
  /** Icon art URLs; a missing icon leaves a plain text button. */
  readonly icons?: QuickIcons;
  readonly skin?: QuickSkin;
  /** Replace the kit's rows (e.g. a filtered or reordered defaultSettingsRows()). */
  readonly settingsRows?: readonly QuickRow[];
  readonly soundRows?: readonly QuickRow[];
  /** One countdown step in ms (3 steps, default 500); 0 resumes at once. A function is read on each close. */
  readonly countdownMs?: number | (() => number);
  /** z-index of the layer; default 100. */
  readonly zIndex?: number;
};

const TEXT = {
  settings: "Settings",
  sound: "Sound",
  soundOff: "Sound off",
  close: "Close",
  closeHint: "Close (Esc)",
  on: "On",
  off: "Off",
  pending: "pending",
} as const;

const KEY_EVENTS = ["keydown", "keypress", "keyup"] as const;
/** Each carries where the mouse pointer is now (QuickSettings.pointer). */
const POINTER_EVENTS = ["pointermove", "pointerdown", "pointerover"] as const;
/** The panel's margin from the layer's top and bottom edges (css.ts: max-height calc(100% - 32px)). */
const PANEL_EDGE_PX = 16;

type Panel = {
  readonly element: HTMLElement;
  /** The panel box the dialog centres (.kit-qs__panel). */
  readonly box: HTMLElement;
  readonly dialog: A11yDialog;
  readonly syncers: (() => void)[];
  readonly slots: { readonly host: HTMLElement; readonly mount: QuickMount }[];
  readonly cleanups: (() => void)[];
};

type RowHead = { readonly id: string; readonly label: string; readonly icon?: QuickIconName };

let instances = 0;

const isNode = (target: EventTarget | null): target is Node => target !== null && typeof (target as Partial<Node>).nodeType === "number";

export class QuickSettings {
  /** The layer over the host: the two buttons, both panels and the countdown. Restyle through its CSS variables. */
  readonly root: HTMLElement;
  private readonly options: QuickSettingsOptions;
  private readonly doc: Document;
  private readonly view: Window;
  private readonly uid: string;
  /** setChoiceOptions() replaces a choice row here. */
  private readonly rows: Record<QuickPanel, QuickRow[]>;
  private readonly corners: Readonly<Record<QuickPanel, HTMLButtonElement>>;
  private readonly panels: Readonly<Record<QuickPanel, Panel>>;
  private readonly count: HTMLElement;
  private readonly rowIcons: { readonly name: QuickIconName; readonly holder: HTMLElement }[] = [];
  private readonly failedIcons = new Set<string>();
  private readonly previews: KeyedThrottle;
  private readonly keyboardPreview: KeyboardSoundPreview;
  private readonly keyboardChoices: KeyboardSoundChoices[] = [];
  /** Each choice row's line and the function that rebuilds its control from new options (it returns what puts focus and scroll back once synced). */
  private readonly choiceRows = new Map<string, { readonly line: HTMLElement; readonly fill: (row: QuickChoiceRow) => () => void }>();
  private readonly resizeObserver: ResizeObserver | null;
  private icons: QuickIcons;
  private values: Record<string, QuickValue> = {};
  /** setChoiceOptions() is rebuilding a row: syncing must not scroll a list to its selection. */
  private rebuilding = false;
  /** Where the mouse pointer last was in this document (pointermove/pointerdown/pointerover), for a rebuilt keyboard list. */
  private pointer: KeyboardPointer | null = null;
  private current: QuickPanel | null = null;
  private stopCountdown: (() => void) | null = null;
  private destroyed = false;

  constructor(options: QuickSettingsOptions) {
    this.options = options;
    this.doc = options.host?.ownerDocument ?? document;
    this.view = this.doc.defaultView ?? window;
    const host = options.host ?? this.doc.body;
    this.uid = `kit-qs-${++instances}`;
    this.icons = { ...options.icons };
    this.rows = { settings: [...(options.settingsRows ?? defaultSettingsRows(options))], sound: [...(options.soundRows ?? defaultSoundRows(options))] };
    this.previews = createKeyedThrottle((group) => this.options.onPreview?.(group), QUICK_PREVIEW_THROTTLE_MS);
    this.keyboardPreview = new KeyboardSoundPreview({
      sounds: options.keyboardSounds,
      levels: () => ({ master: Number(this.values.master ?? 100) / 100, keyboard: Number(this.values.keyboardVolume ?? 70) / 100, muted: this.values.muted === true }),
      onUse: options.onKeyboardUse,
      fetchJson: options.keyboardFetch?.fetchJson,
      fetchBytes: options.keyboardFetch?.fetchBytes,
      onLoad: options.onKeyboardLoad,
      onFail: options.onKeyboardFail,
    });
    installQuickSettingsStyles(this.doc);

    this.root = this.el("div", "kit-qs");
    if (host === this.doc.body) this.root.classList.add("kit-qs--fixed");
    this.root.style.zIndex = String(options.zIndex ?? QUICK_DEFAULT_Z_INDEX);
    this.applySkin(options.skin ?? {});
    const bar = this.el("div", "kit-qs__bar");
    this.corners = { settings: this.corner("settings"), sound: this.corner("sound") };
    bar.append(this.corners.settings, this.corners.sound);
    this.panels = { settings: this.buildPanel("settings"), sound: this.buildPanel("sound") };
    this.count = this.el("div", "kit-qs__count");
    this.count.setAttribute("role", "status");
    this.count.hidden = true;
    this.root.append(bar, this.panels.settings.element, this.panels.sound.element, this.count);
    host.append(this.root);

    for (const type of KEY_EVENTS) {
      this.view.addEventListener(type, this.onWindowKey, true);
      this.root.addEventListener(type, this.onRootKey);
    }
    for (const type of POINTER_EVENTS) this.view.addEventListener(type, this.onPointer, { capture: true, passive: true });
    const Observer = (this.view as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (typeof Observer === "function") {
      this.resizeObserver = new Observer(this.onResize);
      this.resizeObserver.observe(this.root);
    } else {
      this.resizeObserver = null;
      this.view.addEventListener("resize", this.onResize);
    }
    this.onResize();
    this.readValues();
    this.paintRowIcons();
  }

  /** A panel is open. */
  get isOpen(): boolean {
    return this.current !== null;
  }

  /** The open panel, or null. */
  get panel(): QuickPanel | null {
    return this.current;
  }

  /** A panel is open or the resume countdown runs: the game must ignore typing and stay paused. */
  get blocking(): boolean {
    return this.current !== null || this.stopCountdown !== null;
  }

  /** Opens a panel (switching from the other one, or cancelling a running countdown). */
  open(panel: QuickPanel): void {
    if (this.destroyed || this.current === panel) return;
    const wasBlocking = this.blocking;
    this.cancelCountdown();
    if (this.current !== null) this.hidePanel(this.current);
    this.current = panel;
    this.readValues();
    this.showPanel(panel);
    if (!wasBlocking) this.options.onPause?.();
  }

  /** Closes the open panel and starts the countdown to onResume. */
  close(): void {
    if (this.destroyed || this.current === null) return;
    this.hidePanel(this.current);
    this.current = null;
    this.resume();
  }

  toggle(panel: QuickPanel): void {
    if (this.current === panel) this.close();
    else this.open(panel);
  }

  /** Reads getValues() again (e.g. after the game changed a value elsewhere). */
  refresh(): void {
    if (!this.destroyed) this.readValues();
  }

  /**
   * Replaces the options of choice row `id` and redraws it in place, open or
   * not: the keyboard sets once the Typing Feel catalogue arrives, after a panel
   * built at once with pendingKeyboardChoices() (TYPING_FEEL_SERVICE.md §5.1).
   * Values are then read again as on open(), so a saved keyboard id the new
   * options lack is repaired through onChange, as at construction: pass
   * settleKeyboardChoice(...).options, which always list it. False: no such row.
   * The rebuild is not the player's doing: it plays no preview, stops none,
   * and keeps the selection, the list's scroll position and keyboard focus
   * (on the same option when the new list has it enabled, else the selected
   * one). New rows that land under a resting mouse pointer preview nothing
   * until it moves (KeyboardSoundChoices `settle`), and an open panel keeps
   * its top where it was until it closes (holdTop), so the rows the player
   * was aiming at stay put.
   */
  setChoiceOptions(id: string, options: readonly QuickChoiceOption[]): boolean {
    const entry = this.choiceRows.get(id);
    if (this.destroyed || entry === undefined) return false;
    let restore = (): void => {};
    let held: { readonly kind: QuickPanel; readonly top: number } | null = null;
    this.rebuilding = true;
    try {
      for (const kind of QUICK_PANELS) {
        const at = this.rows[kind].findIndex((row) => row.kind === "choice" && row.id === id);
        if (at < 0) continue;
        if (this.current === kind) held = { kind, top: this.panels[kind].box.getBoundingClientRect().top };
        const row: QuickChoiceRow = { ...(this.rows[kind][at] as QuickChoiceRow), options };
        this.rows[kind][at] = row;
        restore = entry.fill(row);
        break;
      }
      this.readValues();
    } finally {
      this.rebuilding = false;
    }
    restore();
    if (held !== null) this.holdTop(held.kind, held.top);
    return true;
  }

  /** Adds or replaces icon URLs (an undefined URL removes one: the button turns back to text). */
  setIcons(icons: QuickIcons): void {
    if (this.destroyed) return;
    this.icons = { ...this.icons, ...icons };
    this.paintCorners();
    this.paintRowIcons();
    for (const picker of this.keyboardChoices) picker.setListenIcon(this.iconUrl("hud-sound") ?? undefined);
  }

  /** Removes the layer, its listeners and both dialog instances; calls no callback. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelCountdown();
    this.previews.cancel();
    this.keyboardPreview.destroy();
    for (const picker of this.keyboardChoices) picker.destroy();
    for (const kind of QUICK_PANELS) {
      const panel = this.panels[kind];
      for (const cleanup of panel.cleanups.splice(0)) cleanup();
      panel.dialog.destroy();
    }
    this.current = null;
    for (const type of KEY_EVENTS) {
      this.view.removeEventListener(type, this.onWindowKey, true);
      this.root.removeEventListener(type, this.onRootKey);
    }
    for (const type of POINTER_EVENTS) this.view.removeEventListener(type, this.onPointer, true);
    this.resizeObserver?.disconnect();
    this.view.removeEventListener("resize", this.onResize);
    this.root.remove();
  }

  private readonly onWindowKey = (event: Event): void => {
    const key = event as KeyboardEvent;
    const inside = isNode(event.target) && this.root.contains(event.target);
    const decision = routeQuickKey({ panel: this.current, blocking: this.blocking }, { type: event.type, key: key.key, repeat: key.repeat, inside });
    if (decision.swallow) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (decision.command === "close") this.close();
    else if (decision.command !== null) this.toggle(decision.command.toggle);
  };

  private readonly onRootKey = (event: Event): void => {
    if (this.blocking) event.stopPropagation();
  };

  private readonly onPointer = (event: Event): void => {
    const pointer = event as PointerEvent;
    if (pointer.pointerType === "mouse") this.pointer = { x: pointer.clientX, y: pointer.clientY };
  };

  private readonly onResize = (): void => {
    this.root.style.setProperty("--kit-qs-s", quickScale(this.root.clientHeight).toFixed(3));
    // A new size centres the panels again.
    for (const kind of QUICK_PANELS) this.releaseTop(kind);
  };

  /**
   * After a rebuild changed an open panel's height, keeps its top at `top`
   * (the dialog centres it, so a longer list would move every row under the
   * player's pointer). The panel grows or shrinks downwards and scrolls when
   * it no longer fits. Lasts until the panel closes or the layer is resized.
   */
  private holdTop(kind: QuickPanel, top: number): void {
    const { element, box } = this.panels[kind];
    if (Math.abs(box.getBoundingClientRect().top - top) < 0.5) return;
    const offset = Math.max(0, top - element.getBoundingClientRect().top);
    box.style.alignSelf = "flex-start";
    box.style.marginTop = `${offset}px`;
    box.style.maxHeight = `calc(100% - ${offset + PANEL_EDGE_PX}px)`;
  }

  private releaseTop(kind: QuickPanel): void {
    const { style } = this.panels[kind].box;
    style.removeProperty("align-self");
    style.removeProperty("margin-top");
    style.removeProperty("max-height");
  }

  private resume(): void {
    const stepMs = this.countdownStepMs();
    this.root.style.setProperty("--kit-qs-step", `${stepMs}ms`);
    let done = false;
    const stop = startCountdown(
      QUICK_COUNTDOWN_STEPS,
      stepMs,
      (left) => {
        this.count.hidden = false;
        this.count.replaceChildren(this.el("span", "kit-qs__digit", String(left)));
      },
      () => {
        done = true;
        this.stopCountdown = null;
        this.count.hidden = true;
        this.count.replaceChildren();
        this.options.onResume?.();
      },
    );
    if (!done) this.stopCountdown = stop;
  }

  private cancelCountdown(): void {
    if (this.stopCountdown === null) return;
    this.stopCountdown();
    this.stopCountdown = null;
    this.count.hidden = true;
    this.count.replaceChildren();
  }

  private countdownStepMs(): number {
    const option = this.options.countdownMs;
    const value = typeof option === "function" ? option() : option;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : QUICK_COUNTDOWN_STEP_MS;
  }

  private quit(): void {
    if (this.current !== null) this.hidePanel(this.current);
    this.current = null;
    this.cancelCountdown();
    this.options.onQuit?.();
  }

  private showPanel(kind: QuickPanel): void {
    if (kind === "sound") this.keyboardPreview.unlock();
    const panel = this.panels[kind];
    panel.dialog.show();
    this.corners[kind].setAttribute("aria-expanded", "true");
    for (const slot of panel.slots) {
      const cleanup = slot.mount(slot.host);
      if (typeof cleanup === "function") panel.cleanups.push(cleanup);
    }
  }

  private hidePanel(kind: QuickPanel): void {
    const panel = this.panels[kind];
    this.previews.cancel();
    this.keyboardPreview.stop();
    for (const cleanup of panel.cleanups.splice(0)) cleanup();
    for (const slot of panel.slots) slot.host.replaceChildren();
    panel.dialog.hide();
    this.releaseTop(kind);
    this.corners[kind].setAttribute("aria-expanded", "false");
  }

  private readValues(): void {
    const raw = this.options.getValues() ?? {};
    this.values = { ...raw, ...readRowValues([...this.rows.settings, ...this.rows.sound], raw) };
    // Persist a removed saved pack as the first available pack; never leave a stale id in save.
    const keyboard = this.rows.sound.find((row) => row.kind === "choice" && row.id === "keyboard");
    if (keyboard && raw.keyboard !== undefined && raw.keyboard !== this.values.keyboard) this.options.onChange("keyboard", this.values.keyboard!);
    this.paint();
  }

  private change(id: string, value: QuickValue): void {
    this.values[id] = value;
    this.options.onChange(id, value);
    this.paint();
  }

  private paint(): void {
    this.keyboardPreview.refreshVolume();
    for (const kind of QUICK_PANELS) for (const sync of this.panels[kind].syncers) sync();
    this.root.classList.toggle("kit-qs--still", this.values.reducedMotion === true);
    this.paintCorners();
  }

  private iconUrl(name: QuickIconName): string | null {
    const url = this.icons[name];
    return typeof url === "string" && url !== "" && !this.failedIcons.has(url) ? url : null;
  }

  private paintCorners(): void {
    const muted = isQuickMuted(this.values);
    this.paintCorner(this.corners.settings, TEXT.settings, "hud-settings", QUICK_KEYS.settings);
    this.paintCorner(this.corners.sound, muted ? TEXT.soundOff : TEXT.sound, muted ? "hud-sound-muted" : "hud-sound", QUICK_KEYS.sound);
  }

  private paintCorner(button: HTMLButtonElement, text: string, icon: QuickIconName, key: string): void {
    const url = this.iconUrl(icon);
    button.title = `${text} (${key})`;
    button.classList.toggle("has-icon", url !== null);
    if (url === null) {
      button.removeAttribute("aria-label");
      if (button.firstElementChild !== null || button.textContent !== text) button.textContent = text;
      return;
    }
    button.setAttribute("aria-label", text);
    if (button.firstElementChild?.getAttribute("src") !== url) button.replaceChildren(this.image(url, "kit-qs__corner-img"));
  }

  private paintRowIcons(): void {
    for (const { name, holder } of this.rowIcons) {
      const url = this.iconUrl(name);
      if (url === null) holder.replaceChildren();
      else if (holder.firstElementChild?.getAttribute("src") !== url) holder.replaceChildren(this.image(url, "kit-qs__icon"));
    }
  }

  /** An art image; if it fails to load, its button or row falls back to text / no icon. */
  private image(url: string, className: string): HTMLImageElement {
    const img = this.el("img", className);
    img.alt = "";
    img.draggable = false;
    img.addEventListener(
      "error",
      () => {
        this.failedIcons.add(url);
        this.paintCorners();
        this.paintRowIcons();
      },
      { once: true },
    );
    img.src = url;
    return img;
  }

  private applySkin(skin: QuickSkin): void {
    const set = (url: string | undefined, className: string, variable: string): void => {
      if (typeof url !== "string" || url === "") return;
      this.root.classList.add(className);
      this.root.style.setProperty(variable, cssUrl(url));
    };
    set(skin.panel, "kit-qs--skin-panel", "--kit-qs-skin-panel");
    set(skin.button, "kit-qs--skin-button", "--kit-qs-skin-button");
    set(skin.sliderThumb, "kit-qs--skin-slider", "--kit-qs-skin-thumb");
    set(skin.sliderTrack, "kit-qs--skin-slider", "--kit-qs-skin-track");
  }

  private corner(kind: QuickPanel): HTMLButtonElement {
    const button = this.button("kit-qs__corner", "");
    button.dataset.panel = kind;
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", `${this.uid}-${kind}`);
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-keyshortcuts", QUICK_KEYS[kind]);
    // A click must not take focus from the game's typing input: the dialog returns focus there on close.
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => this.toggle(kind));
    return button;
  }

  private buildPanel(kind: QuickPanel): Panel {
    const element = this.el("div", "kit-qs__dialog");
    element.id = `${this.uid}-${kind}`;
    element.dataset.panel = kind;
    element.setAttribute("aria-labelledby", `${element.id}-title`);
    const backdrop = this.el("div", "kit-qs__backdrop");
    backdrop.addEventListener("click", () => this.close());
    const box = this.el("div", "kit-qs__panel");
    box.setAttribute("role", "document");
    const head = this.el("div", "kit-qs__head");
    const title = this.el("h2", "kit-qs__title", kind === "settings" ? TEXT.settings : TEXT.sound);
    title.id = `${element.id}-title`;
    const close = this.button("kit-qs__btn kit-qs__close", TEXT.close);
    close.title = TEXT.closeHint;
    close.addEventListener("click", () => this.close());
    head.append(title, close);
    const body = this.el("div", "kit-qs__body");
    box.append(head, body);
    element.append(backdrop, box);
    const panel: Panel = { element, box, dialog: new A11yDialog(element), syncers: [], slots: [], cleanups: [] };
    let actions: HTMLElement | null = null;
    for (const row of this.rows[kind]) {
      if (row.kind === "button") {
        if (actions === null) {
          actions = this.el("div", "kit-qs__actions");
          body.append(actions);
        }
        actions.append(this.renderButton(row));
      } else {
        actions = null;
        body.append(this.renderRow(row, panel));
      }
    }
    return panel;
  }

  private renderRow(row: Exclude<QuickRow, QuickButtonRow>, panel: Panel): HTMLElement {
    switch (row.kind) {
      case "heading":
        return this.el("h3", "kit-qs__heading", row.label);
      case "slider":
        return this.renderSlider(row, panel);
      case "choice":
        return this.renderChoice(row, panel);
      case "toggle":
        return this.renderToggle(row, panel);
      case "slot": {
        const line = this.el("div", "kit-qs__row kit-qs__row--slot");
        line.dataset.row = row.id;
        if (row.label !== undefined) line.append(this.el("span", "kit-qs__label", row.label));
        const host = this.el("div", "kit-qs__slot");
        line.append(host);
        panel.slots.push({ host, mount: row.mount });
        return line;
      }
    }
  }

  private shell(row: RowHead, labelTag: "label" | "span"): { line: HTMLElement; label: HTMLElement; control: HTMLElement } {
    const line = this.el("div", "kit-qs__row");
    line.dataset.row = row.id;
    const icon = this.el("span", "kit-qs__icon-cell");
    icon.setAttribute("aria-hidden", "true");
    if (row.icon !== undefined) this.rowIcons.push({ name: row.icon, holder: icon });
    const label = this.el(labelTag, "kit-qs__label", row.label);
    label.id = `${this.uid}-${row.id}-label`;
    const control = this.el("div", "kit-qs__control");
    line.append(icon, label, control);
    return { line, label, control };
  }

  private renderSlider(row: QuickSliderRow, panel: Panel): HTMLElement {
    const { line, label, control } = this.shell(row, "label");
    const { min, max, step } = sliderBounds(row);
    const input = this.el("input", "kit-qs__range");
    input.type = "range";
    input.id = `${this.uid}-${row.id}`;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    (label as HTMLLabelElement).htmlFor = input.id;
    const number = this.el("span", "kit-qs__num");
    number.setAttribute("aria-hidden", "true");
    input.addEventListener("input", () => {
      this.change(row.id, readSlider(row, Number(input.value)));
      if (row.preview !== undefined) this.previews.call(row.preview);
    });
    control.append(input, number);
    panel.syncers.push(() => {
      const value = String(this.values[row.id]);
      if (input.value !== value) input.value = value;
      number.textContent = value;
    });
    if (row.toggle !== undefined) {
      const { id, label: text } = row.toggle;
      const button = this.button("kit-qs__btn", text);
      button.dataset.toggle = id;
      button.addEventListener("click", () => this.change(id, this.values[id] !== true));
      control.append(button);
      panel.syncers.push(() => button.setAttribute("aria-pressed", String(this.values[id] === true)));
    }
    return line;
  }

  private renderChoice(row: QuickChoiceRow, panel: Panel): HTMLElement {
    const { line, label, control } = this.shell(row, "span");
    if (row.id === "keyboard") line.classList.add("kit-qs__row--keyboards");
    let picker: KeyboardSoundChoices | null = null;
    let sync = (): void => {};
    // Builds the control from `current`'s options; setChoiceOptions() runs it again with new ones,
    // then calls the returned function (after syncing) to put scroll and keyboard focus back.
    const fill = (current: QuickChoiceRow): (() => void) => {
      const before = picker?.state() ?? null;
      const active = this.doc.activeElement;
      const radioFocus = picker === null && active !== null && control.contains(active) ? (active as HTMLInputElement).value : null;
      if (picker !== null) {
        this.keyboardChoices.splice(this.keyboardChoices.indexOf(picker), 1);
        // Replaced, not closed: a preview the player started plays on.
        picker.destroy(false);
        picker = null;
      }
      control.replaceChildren();
      if (current.id === "keyboard") {
        const made = new KeyboardSoundChoices({
          document: this.doc, options: current.options, label: current.label,
          listenIcon: this.iconUrl("hud-sound") ?? undefined,
          // A list that replaces another settles under a resting pointer.
          settle: before !== null ? { pointer: this.pointer } : undefined,
          onPreview: (choice, delay) => { if (this.current === "sound") this.keyboardPreview.preview(choice, delay); },
          onStop: () => this.keyboardPreview.stop(),
          onSelect: (choice) => {
            this.change(current.id, choice.value);
            this.keyboardPreview.select(choice);
            // Legacy game-owned sounds have no preview URL and keep their existing callback.
            if (!choice.preview && choice.value !== "off" && current.preview) this.previews.call(current.preview);
          },
        });
        picker = made;
        this.keyboardChoices.push(made);
        control.append(made.element);
        sync = () => made.sync(String(this.values[current.id]), !this.rebuilding);
        return () => { if (before !== null) made.adopt(before); };
      }
      const group = this.el("div", "kit-qs__opts");
      group.setAttribute("role", "radiogroup");
      group.setAttribute("aria-labelledby", label.id);
      const inputs: HTMLInputElement[] = [];
      for (const option of current.options) {
        const wrap = this.el("label", "kit-qs__opt");
        const input = this.el("input", "kit-qs__radio");
        input.type = "radio";
        input.name = `${this.uid}-${current.id}`;
        input.value = option.value;
        input.disabled = option.disabled === true;
        const chip = this.el("span", "kit-qs__chip", option.label);
        const note = option.note ?? (option.disabled === true ? TEXT.pending : undefined);
        if (note !== undefined) chip.append(" ", this.el("small", "kit-qs__note", note));
        input.addEventListener("change", () => {
          if (!input.checked) return;
          this.change(current.id, option.value);
          if (current.preview !== undefined) this.previews.call(current.preview);
        });
        wrap.append(input, chip);
        group.append(wrap);
        inputs.push(input);
      }
      control.append(group);
      sync = () => {
        for (const input of inputs) input.checked = input.value === this.values[current.id];
      };
      return () => {
        if (radioFocus === null) return;
        (inputs.find((input) => input.value === radioFocus && !input.disabled) ?? inputs.find((input) => input.checked && !input.disabled) ?? inputs.find((input) => !input.disabled))?.focus({ preventScroll: true });
      };
    };
    fill(row);
    panel.syncers.push(() => sync());
    this.choiceRows.set(row.id, { line, fill });
    return line;
  }

  private renderToggle(row: QuickToggleRow, panel: Panel): HTMLElement {
    const { line, label, control } = this.shell(row, "span");
    const button = this.button("kit-qs__btn kit-qs__switch", TEXT.off);
    button.setAttribute("role", "switch");
    button.setAttribute("aria-labelledby", label.id);
    button.addEventListener("click", () => this.change(row.id, this.values[row.id] !== true));
    control.append(button);
    panel.syncers.push(() => {
      const on = this.values[row.id] === true;
      button.setAttribute("aria-checked", String(on));
      button.textContent = on ? TEXT.on : TEXT.off;
    });
    return line;
  }

  private renderButton(row: QuickButtonRow): HTMLButtonElement {
    const button = this.button(row.primary === true ? "kit-qs__btn kit-qs__btn--primary" : "kit-qs__btn", row.label);
    button.dataset.action = row.id;
    button.addEventListener("click", () => {
      if (row.action === "resume") this.close();
      else if (row.action === "quit") this.quit();
      else row.action();
    });
    return button;
  }

  private button(className: string, text: string): HTMLButtonElement {
    const button = this.el("button", className, text);
    button.type = "button";
    return button;
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const node = this.doc.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
}
