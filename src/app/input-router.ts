/**
 * One key router on window, capture phase (05 §4.1, 00 §6, 06 §2 rule 6):
 * a–z become key commands (IME composing, repeats, Ctrl, Cmd or Alt ignored,
 * kit/input rules); command keys map through rules.ts KEYS by event.code to
 * actions that panels and presenters may claim (results, placement, carry
 * strip, wave card, HUD, learning replay, camera) before the app's fallback.
 * Letters never reach a handler: in placement mode they still type (00 §6).
 * Owner: integrator (LANES.md).
 */
import { KEYS } from "../content/rules";
import { isComposingKey, typedLetter, vietnameseInputSign } from "../kit/input";
import type { ActionHandler, CommandSink } from "./contracts";

/** A learning panel (Học trước, Thẻ Ôn) takes letters and enter, backspace, escape, replay while open. */
export interface KeyPanel {
  readonly isOpen: boolean;
  handleLetter(letter: string): boolean;
  handleAction(action: string): boolean;
  /**
   * Another action came while the panel is open: true when the panel stepped
   * aside (closed) and the action should go on (Thẻ Ôn and ⇧↵ Gọi sớm, test
   * pass 27/10: the key did nothing while the HUD still offered it).
   */
  passOn?(action: string): boolean;
}

export interface RouterOptions {
  /** First look at every press (pause overlay, countdown, pause menu); true swallows it. */
  intercept?(event: KeyboardEvent, action: string | null, letter: string | null): boolean;
  /** The open learning panel, if any. */
  panel?(): KeyPanel | null;
  /** A word is locked: Esc releases it before anything else (00 §6). */
  locked?(): boolean;
  /** Actions no handler claimed (pause menu, fast-forward). */
  fallback?(action: string): boolean;
  /** A Vietnamese input method is on (composing keys, accented letters). */
  onImeSign?(): void;
  /** Wall clock in ms for key commands (learning only); performance.now by default. */
  now?(): number;
}

export interface RouterStats {
  /** Letter presses seen and sent to the sim (or a panel). */
  letters: number;
  /** Command key presses mapped to an action. */
  actions: number;
  /** Presses swallowed by the intercept (pause overlay, countdown, menu). */
  swallowed: number;
  /** event.timeStamp of the last letter (ms, performance clock). */
  lastLetterAt: number;
}

export interface InputRouter {
  /** Handlers asked in order before the fallback gets an action. */
  readonly handlers: ActionHandler[];
  readonly stats: RouterStats;
  /** Runs an action as if its key was pressed (pointer buttons, scenarios). */
  dispatch(action: string): boolean;
  dispose(): void;
}

/** Actions that may repeat while the key is held. */
const REPEATING: ReadonlySet<string> = new Set(["rotate-left", "rotate-right", "tilt-up", "tilt-down", "zoom-in", "zoom-out", "backspace"]);
/** Actions a learning panel gets first. */
const PANEL_ACTIONS: ReadonlySet<string> = new Set(["enter", "backspace", "escape", "replay"]);
/** Camera actions still work while a panel is open. */
const CAMERA: ReadonlySet<string> = new Set(["rotate-left", "rotate-right", "tilt-up", "tilt-down", "zoom-in", "zoom-out", "camera-reset"]);

type Mod = "none" | "shift" | "alt";

/** The KEYS action for a press, or null. Linux uses Shift for Alt on the digit row (00 §6); it works everywhere. */
export function actionFor(code: string, mod: Mod): string | null {
  const hit = KEYS.find((binding) => binding.code === code && binding.mod === mod);
  if (hit) return hit.action;
  if (mod === "shift" && code.startsWith("Digit")) return KEYS.find((binding) => binding.code === code && binding.mod === "alt")?.action ?? null;
  return null;
}

export function createInputRouter(target: Window, sink: CommandSink, options: RouterOptions = {}): InputRouter {
  const handlers: ActionHandler[] = [];
  const stats: RouterStats = { letters: 0, actions: 0, swallowed: 0, lastLetterAt: 0 };
  const now = options.now ?? (() => target.performance.now());

  const dispatch = (action: string): boolean => {
    const panel = options.panel?.() ?? null;
    if (panel?.isOpen) {
      if (PANEL_ACTIONS.has(action)) return panel.handleAction(action) || true;
      if (!CAMERA.has(action) && panel.passOn?.(action) !== true) return true;
    }
    if (action === "escape" && options.locked?.()) {
      sink({ type: "release" });
      return true;
    }
    if (action === "backspace") {
      sink({ type: "backspace" });
      return true;
    }
    for (const handler of handlers) if (handler.handleAction(action)) return true;
    return options.fallback?.(action) ?? false;
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey) return; // browser and OS shortcuts
    if (isComposingKey(event)) {
      options.onImeSign?.();
      return;
    }
    const letter = typedLetter(event);
    const mod: Mod = event.altKey ? "alt" : event.shiftKey ? "shift" : "none";
    const action = letter === null ? actionFor(event.code, mod) : null;
    if (letter === null && action === null && vietnameseInputSign(event)) options.onImeSign?.();
    if (options.intercept?.(event, action, letter)) {
      stats.swallowed += 1;
      event.preventDefault();
      return;
    }
    if (letter !== null) {
      event.preventDefault();
      stats.letters += 1;
      stats.lastLetterAt = event.timeStamp;
      const panel = options.panel?.() ?? null;
      if (panel?.isOpen) panel.handleLetter(letter);
      else sink({ type: "key", letter: letter.charCodeAt(0) - 97, ms: now() });
      return;
    }
    if (action === null) return;
    // Tab, arrows, Enter, Backspace, Alt + digit: the page never sees them (focus, scrolling, ¡ ™ £ on a Mac).
    event.preventDefault();
    if (event.repeat && !REPEATING.has(action)) return;
    stats.actions += 1;
    dispatch(action);
  };

  target.addEventListener("keydown", onKey, { capture: true });
  return {
    handlers,
    stats,
    dispatch,
    dispose(): void {
      target.removeEventListener("keydown", onKey, { capture: true });
    },
  };
}
