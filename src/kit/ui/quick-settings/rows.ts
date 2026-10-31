// Source: new for the kit: default rows of the two quick panels (docs/games/IN_GAME_SETTINGS.md §2–3)
import type { QuickChoiceOption, QuickMount, QuickRow } from "./types";

/**
 * Legacy fallback only, until a game supplies its ticket-189 catalogue: the same ids and names as KEYBOARD_PROFILES in
 * feedback/typing-fx/audio.ts. A game passes its catalogue list, with unavailable packs
 * it has not staged marked disabled.
 */
export const DEFAULT_KEYBOARD_PROFILES: readonly QuickChoiceOption[] = [
  { value: "off", label: "Off" },
  { value: "creamy", label: "Creamy Linear" },
  { value: "thock", label: "Deep Thock" },
  { value: "marbly", label: "Marbly" },
  { value: "clack", label: "Clean Clack" },
  { value: "dome", label: "Soft Dome" },
];

// Same ids as feedback/typing-fx/settings.ts; ui does not import feedback.
const LETTER_STYLES: readonly QuickChoiceOption[] = [
  { value: "stamp", label: "Stamp" },
  { value: "flare", label: "Flare" },
  { value: "smash", label: "Smash" },
  { value: "shatter", label: "Shatter" },
  { value: "rune", label: "Rune" },
  { value: "minimal", label: "Minimal" },
];

const STRENGTHS: readonly QuickChoiceOption[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "ultra", label: "Ultra" },
];

const WORD_SIZES: readonly QuickChoiceOption[] = [
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "huge", label: "Huge" },
];

const QUALITIES: readonly QuickChoiceOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "ultra", label: "Ultra" },
];

export type QuickDefaultsOptions = {
  /** Keyboard sound choices; default DEFAULT_KEYBOARD_PROFILES. */
  readonly keyboardProfiles?: readonly QuickChoiceOption[];
  /** Learning toggles the game supports; a row appears only when its flag is true. */
  readonly learning?: { readonly meaning?: boolean; readonly ipa?: boolean };
  /** Fills the typing-effect preview box while Settings is open. */
  readonly mountPreview?: QuickMount;
  /** The game's own rows, under their own heading. */
  readonly gameRows?: readonly QuickRow[];
  /** Fills a host element under the game's rows while Settings is open. */
  readonly mountGameItems?: QuickMount;
  /** Heading above the game's rows; default "Game". */
  readonly gameSectionLabel?: string;
};

/** Sound panel rows in the spec's order (§2). Values 0–100; `muted` is a boolean. */
export function defaultSoundRows(options: QuickDefaultsOptions = {}): QuickRow[] {
  return [
    { kind: "slider", id: "master", label: "Master", icon: "vol-master", preview: "master", toggle: { id: "muted", label: "Mute" } },
    { kind: "slider", id: "music", label: "Music", icon: "vol-music", preview: "music" },
    { kind: "slider", id: "effects", label: "Effects", icon: "vol-effects", preview: "effects" },
    { kind: "choice", id: "keyboard", label: "Keyboard sound", icon: "vol-keyboard", options: options.keyboardProfiles ?? DEFAULT_KEYBOARD_PROFILES, default: (options.keyboardProfiles ?? DEFAULT_KEYBOARD_PROFILES).find((p) => p.value !== "off" && !p.disabled)?.value ?? "off", preview: "keyboard" },
    { kind: "slider", id: "keyboardVolume", label: "Keyboard volume", preview: "keyboard" },
    { kind: "slider", id: "voice", label: "Voice", icon: "vol-voice", preview: "voice" },
    { kind: "slider", id: "ui", label: "Interface", icon: "vol-interface", preview: "ui" },
  ];
}

/** Settings panel rows in the spec's order (§3): typing effects, graphics, learning, the game's rows, Resume, Quit to title. */
export function defaultSettingsRows(options: QuickDefaultsOptions = {}): QuickRow[] {
  const rows: QuickRow[] = [
    { kind: "heading", id: "typingHeading", label: "Typing effects" },
    { kind: "choice", id: "fxStyle", label: "Letter style", options: LETTER_STYLES, default: "stamp" },
    { kind: "choice", id: "fxIntensity", label: "Effect strength", options: STRENGTHS, default: "normal" },
    { kind: "choice", id: "fxSize", label: "Word size", options: WORD_SIZES, default: "large" },
  ];
  if (options.mountPreview !== undefined) rows.push({ kind: "slot", id: "fxPreview", label: "Preview", mount: options.mountPreview });
  rows.push(
    { kind: "heading", id: "graphicsHeading", label: "Graphics" },
    { kind: "choice", id: "quality", label: "Quality", options: QUALITIES, default: "high" },
    { kind: "toggle", id: "reducedMotion", label: "Reduced motion", default: false },
  );
  const learning = options.learning ?? {};
  if (learning.meaning === true || learning.ipa === true) {
    rows.push({ kind: "heading", id: "learningHeading", label: "Learning" });
    if (learning.meaning === true) rows.push({ kind: "toggle", id: "learnMeaning", label: "Show Vietnamese meaning", default: true });
    if (learning.ipa === true) rows.push({ kind: "toggle", id: "learnIpa", label: "Show pronunciation", default: true });
  }
  const gameRows = options.gameRows ?? [];
  if (gameRows.length > 0 || options.mountGameItems !== undefined) {
    rows.push({ kind: "heading", id: "gameHeading", label: options.gameSectionLabel ?? "Game" }, ...gameRows);
    if (options.mountGameItems !== undefined) rows.push({ kind: "slot", id: "gameItems", mount: options.mountGameItems });
  }
  rows.push(
    { kind: "button", id: "resume", label: "Resume", action: "resume", primary: true },
    { kind: "button", id: "quit", label: "Quit to title", action: "quit" },
  );
  return rows;
}
