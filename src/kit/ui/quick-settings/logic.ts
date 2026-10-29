// Source: new for the kit: quick settings logic without DOM (key routing, countdown, preview throttle, value checks)
import type { QuickChoiceRow, QuickPanel, QuickRow, QuickSliderRow, QuickToggleRow, QuickValue } from "./types";

/** Shortcut keys: none is a letter, so typing never opens a panel. */
export const QUICK_KEYS: Readonly<Record<QuickPanel, string>> = { settings: "F1", sound: "F2" };

export type QuickKeyState = {
  /** The open panel, or null. */
  readonly panel: QuickPanel | null;
  /** A panel is open or the resume countdown runs. */
  readonly blocking: boolean;
};

export type QuickKeyInput = {
  /** "keydown", "keypress" or "keyup". */
  readonly type: string;
  readonly key: string;
  readonly repeat?: boolean;
  /** The event's target is inside the quick-settings root. */
  readonly inside: boolean;
};

export type QuickKeyDecision = {
  /** preventDefault + stopImmediatePropagation at the window capture listener. */
  readonly swallow: boolean;
  readonly command: { readonly toggle: QuickPanel } | "close" | null;
};

/**
 * What the window capture listener does with one key event. F1/F2 are always
 * ours (the browser's help never opens); Esc closes an open panel; while
 * blocking, every other key outside the panel is swallowed so the game's
 * typing input never sees it.
 */
export function routeQuickKey(state: QuickKeyState, input: QuickKeyInput): QuickKeyDecision {
  const press = input.type === "keydown" && input.repeat !== true;
  const panel = input.key === QUICK_KEYS.settings ? "settings" : input.key === QUICK_KEYS.sound ? "sound" : null;
  if (panel !== null) return { swallow: true, command: press ? { toggle: panel } : null };
  if (input.key === "Escape" && state.blocking) return { swallow: true, command: press && state.panel !== null ? "close" : null };
  return { swallow: state.blocking && !input.inside, command: null };
}

export type QuickTimers = {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

/** Looks the timer functions up on each call, so test fake timers apply. */
export const realTimers: QuickTimers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

/**
 * Shows `steps`, `steps - 1` … 1 (one per `stepMs`), then calls onDone.
 * Returns a cancel function; onDone never runs after cancel. With no steps or
 * no time, onDone runs at once.
 */
export function startCountdown(
  steps: number,
  stepMs: number,
  onStep: (remaining: number) => void,
  onDone: () => void,
  timers: QuickTimers = realTimers,
): () => void {
  let left = Number.isFinite(steps) ? Math.floor(steps) : 0;
  if (left <= 0 || !Number.isFinite(stepMs) || stepMs <= 0) {
    onDone();
    return () => {};
  }
  let live = true;
  let handle: unknown = null;
  const tick = (): void => {
    if (!live) return;
    if (left === 0) {
      live = false;
      handle = null;
      onDone();
      return;
    }
    onStep(left);
    left -= 1;
    handle = timers.setTimeout(tick, stepMs);
  };
  tick();
  return () => {
    if (!live) return;
    live = false;
    if (handle !== null) timers.clearTimeout(handle);
  };
}

export type KeyedThrottle = {
  call(key: string): void;
  cancel(): void;
};

/**
 * At most one call per `ms` for each key: the first call runs at once, and if
 * more came during the window one more runs at its end (so the last level
 * of a dragged slider is the one heard).
 */
export function createKeyedThrottle(run: (key: string) => void, ms: number, timers: QuickTimers = realTimers): KeyedThrottle {
  const gates = new Map<string, { handle: unknown; pending: boolean }>();
  const open = (key: string): void => {
    const gate = { handle: null as unknown, pending: false };
    gates.set(key, gate);
    gate.handle = timers.setTimeout(() => {
      gates.delete(key);
      if (gate.pending) fire(key);
    }, ms);
  };
  const fire = (key: string): void => {
    open(key);
    run(key);
  };
  return {
    call(key) {
      if (!(ms > 0)) {
        run(key);
        return;
      }
      const gate = gates.get(key);
      if (gate === undefined) fire(key);
      else gate.pending = true;
    },
    cancel() {
      for (const gate of gates.values()) timers.clearTimeout(gate.handle);
      gates.clear();
    },
  };
}

export function sliderBounds(row: QuickSliderRow): { min: number; max: number; step: number } {
  const min = Number.isFinite(row.min) ? (row.min as number) : 0;
  const max = Number.isFinite(row.max) && (row.max as number) > min ? (row.max as number) : Math.max(min, 100);
  const step = Number.isFinite(row.step) && (row.step as number) > 0 ? (row.step as number) : 1;
  return { min, max, step };
}

/** A stored value as a slider position: clamped, snapped to the step, else the row default. */
export function readSlider(row: QuickSliderRow, raw: unknown): number {
  const { min, max, step } = sliderBounds(row);
  const source = typeof raw === "number" && Number.isFinite(raw) ? raw : Number.isFinite(row.default) ? (row.default as number) : min;
  const snapped = min + Math.round((source - min) / step) * step;
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(6));
}

/** A stored value as one of the row's options (a disabled one counts), else the default, else the first enabled option. */
export function readChoice(row: QuickChoiceRow, raw: unknown): string {
  const has = (value: unknown): value is string => typeof value === "string" && row.options.some((option) => option.value === value);
  if (has(raw)) return raw;
  if (row.id === "keyboard" && typeof raw === "string") return row.options.find((option) => option.value !== "off" && !option.disabled)?.value ?? row.options.find((option) => !option.disabled)?.value ?? "off";
  if (has(row.default)) return row.default;
  return (row.options.find((option) => option.disabled !== true) ?? row.options[0])?.value ?? "";
}

export function readToggle(row: Pick<QuickToggleRow, "default">, raw: unknown): boolean {
  return typeof raw === "boolean" ? raw : row.default === true;
}

/** Every value the rows show, checked; ids no row uses are left out. */
export function readRowValues(rows: readonly QuickRow[], raw: Readonly<Record<string, unknown>>): Record<string, QuickValue> {
  const values: Record<string, QuickValue> = {};
  for (const row of rows) {
    if (row.kind === "slider") {
      values[row.id] = readSlider(row, raw[row.id]);
      if (row.toggle !== undefined) values[row.toggle.id] = readToggle({}, raw[row.toggle.id]);
    } else if (row.kind === "choice") values[row.id] = readChoice(row, raw[row.id]);
    else if (row.kind === "toggle") values[row.id] = readToggle(row, raw[row.id]);
  }
  return values;
}

/** The Sound button shows the muted icon when `muted` is on or `master` is 0. */
export function isQuickMuted(values: Readonly<Record<string, unknown>>): boolean {
  return values.muted === true || (typeof values.master === "number" && values.master <= 0);
}

/** Size factor from the host's height: 1 at 720 px (32 px buttons), up to 1.5 at 1080 px and above. */
export function quickScale(hostHeight: number): number {
  if (!Number.isFinite(hostHeight) || hostHeight <= 0) return 1;
  return Math.min(1.5, Math.max(1, hostHeight / 720));
}
