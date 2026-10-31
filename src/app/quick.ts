import { QuickSettings, QUICK_ICON_NAMES, defaultSoundRows, type QuickIcons, type QuickRow, type QuickSettingsOptions, type QuickSkin } from "../kit/ui";
import type { KeyboardSoundChoice } from "../kit/feedback/typing-fx";
import { allowedQualities } from "./quality";
import { manifestJson, sampleBytes } from "./keyboard";

const UI_BASE = `${import.meta.env.BASE_URL}assets/dragon-hold/ui/quick-settings/`;
/** The 180 icons; Keyboard volume reuses the keyboard icon until its own (ticket 244) is accepted. */
export const QUICK_ICONS: QuickIcons = {
  ...Object.fromEntries(QUICK_ICON_NAMES.map((name) => [name, UI_BASE + name + ".64.png"])),
  "vol-keyboard-volume": UI_BASE + "vol-keyboard.64.png",
};
/**
 * The 162 button art (2172 x 724) as a nine-slice plate: its visible plate is 2102 x 433 at (35, 143), and the
 * corner ornaments reach 195 px across and 185 px down inside it. The cuts hold the margin plus the ornament, so the
 * ornaments keep their shape and only the band and the slate between them stretch.
 */
export const PLATE_SLICE = [328, 230, 333, 230] as const;
/** Transparent margins of the button art (top, right, bottom, left), in source px. */
export const PLATE_MARGIN = [143, 35, 148, 35] as const;
/** Keyboard sound rows (34 px): the visible plate is 30 px tall, so the art is drawn at 30 / 433 of its size. */
const ROW_SCALE = 30 / 433;
const px = (n: number): number => Math.round(n * ROW_SCALE * 10) / 10;
/**
 * Frame, button and slider art (tickets 162, 225 knob, 241 groove). At 1080p the groove is drawn about 15 CSS px tall
 * and the knob box 42 px, so the 1024 x 64 groove and the 128 px knob stay sharp on a 2x screen.
 * - The fill layer runs on the 241 groove until the 244 fill art is accepted: `sliderEmpty` is the groove (app.css
 *   dims and greys it) and the fill falls back to the same groove, lit (--kit-qs-fill-filter).
 * - Keyboard sound rows are 162 button plates, the chosen row the 162 button-active plate (`buttonActive`);
 *   LIST_ROW_VARS pulls the art's transparent margins outside each row. The 245 list-row art drops in here (with its
 *   own cut in LIST_ROW_VARS).
 */
export const QUICK_SKIN: QuickSkin = {
  panel: UI_BASE + "panel-large.alpha.png",
  button: UI_BASE + "button.alpha.png",
  buttonActive: UI_BASE + "button-active.alpha.png",
  sliderTrack: UI_BASE + "slider-track.png",
  sliderThumb: UI_BASE + "slider-thumb.128.png",
  sliderEmpty: UI_BASE + "slider-track.png",
  listRow: { slice: PLATE_SLICE, edge: PLATE_SLICE.map(px) },
};
/**
 * The keyboard rows' plate at the panel's scale (app.css scales the 34 px rows by --kit-qs-s; the kit's own values are
 * these at scale 1): edges, the art's margins pulled outside each row with 2 px of air above and below (inset: top,
 * right, bottom, left) and the label clear of the corner ornaments.
 */
const scaled = (n: number): string => `calc(${Math.round(n * 10) / 10}px * var(--kit-qs-s))`;
const ROW_EDGE = PLATE_SLICE.map((n) => scaled(px(n))).join(" ");
export const LIST_ROW_VARS: Readonly<Record<string, string>> = {
  "--kit-qs-list-edge": ROW_EDGE,
  "--kit-qs-list-active-edge": ROW_EDGE,
  "--kit-qs-list-inset": [2 - px(PLATE_MARGIN[0]), -px(PLATE_MARGIN[1]), 2 - px(PLATE_MARGIN[2]), -px(PLATE_MARGIN[3])].map(scaled).join(" "),
  "--kit-qs-list-text-x": scaled(Math.max(px(PLATE_SLICE[1]), px(PLATE_SLICE[3])) + 4),
};
/** Art the kit's skin has no field for, passed to app.css as variables on the layer: the 180 muted speaker for the Master row. */
export const QUICK_ART_VARS: Readonly<Record<string, string>> = {
  "--dh-qs-icon-muted": UI_BASE + "hud-sound-muted.64.png",
};
const cssUrl = (url: string): string => `url(${JSON.stringify(url)})`;

export function settingsRows(): QuickRow[] {
  return [
    // "next launch" sits in the heading, so the row's label stays one short word and the chips one line.
    { kind: "heading", id: "graphicsHeading", label: "Graphics · next launch" },
    // The release build never offers Low (195 quality floor); dev keeps all four.
    { kind: "choice", id: "quality", label: "Quality", options: allowedQualities(import.meta.env.PROD).map((value) => ({ value, label: value[0]!.toUpperCase() + value.slice(1) })), default: "high" },
    { kind: "button", id: "resume", label: "Resume", action: "resume", primary: true },
    { kind: "button", id: "quit", label: "Quit to title", action: "quit" },
  ];
}

/**
 * The panels' options. The keyboard row opens with `keyboards`, the pending
 * list (Off, Dragonhold, the saved set "Loading…"), and takes the settled
 * list from Typing Feel through QuickSettings.setChoiceOptions (keyboard.ts
 * startKeyboard); the current id always stays in the list, so the row never
 * repairs it on its own. A picked set and every preview load through the
 * startup's timed fetches (the manifest HTTP-cached within 3 s, each file
 * within 8 s); the game passes onKeyboardLoad and onKeyboardFail.
 */
export function quickOptions(options: QuickSettingsOptions, keyboards: readonly KeyboardSoundChoice[]): QuickSettingsOptions {
  return {
    ...options,
    settingsRows: settingsRows(),
    soundRows: defaultSoundRows({ keyboardProfiles: keyboards }),
    keyboardFetch: { fetchJson: manifestJson, fetchBytes: sampleBytes },
    icons: QUICK_ICONS,
    skin: QUICK_SKIN,
  };
}

export function createQuickSettings(options: QuickSettingsOptions, keyboards: readonly KeyboardSoundChoice[]): QuickSettings {
  const quick = new QuickSettings(quickOptions(options, keyboards));
  quick.root.classList.add("dh-quick");
  for (const [name, url] of Object.entries(QUICK_ART_VARS)) quick.root.style.setProperty(name, cssUrl(url));
  for (const [name, value] of Object.entries(LIST_ROW_VARS)) quick.root.style.setProperty(name, value);
  quick.root.querySelector<HTMLElement>(".kit-qs__bar")!.dataset.keepout = "";
  watchMute(quick.root);
  return quick;
}

/** The Mute button's label while muted; its own label ("Mute") comes back when unmuted. */
export const UNMUTE_LABEL = "Unmute";

/**
 * The kit draws no muted state on the Master row (only the corner speaker changes). While Mute is pressed the row takes
 * `dh-quick__row--muted` (app.css dims the groove and strikes the number) and the button reads "Unmute"; muted or at
 * 0 the row takes `dh-quick__row--silent` (the muted speaker art). It follows what the kit draws (the button's
 * aria-pressed, the number's text), so a change in the panel, a refresh() and a reopened panel all repaint it.
 */
export function watchMute(root: HTMLElement): void {
  const row = root.querySelector<HTMLElement>('.kit-qs__row[data-row="master"]');
  const button = row?.querySelector<HTMLButtonElement>('.kit-qs__btn[data-toggle="muted"]');
  const number = row?.querySelector<HTMLElement>(".kit-qs__num");
  if (!row || !button || !number) return;
  const label = button.textContent ?? "";
  const paint = (): void => {
    const muted = button.getAttribute("aria-pressed") === "true";
    row.classList.toggle("dh-quick__row--muted", muted);
    row.classList.toggle("dh-quick__row--silent", muted || number.textContent === "0");
    const text = muted ? UNMUTE_LABEL : label;
    if (button.textContent !== text) button.textContent = text;
  };
  const observer = new MutationObserver(paint);
  observer.observe(button, { attributes: true, attributeFilter: ["aria-pressed"] });
  observer.observe(number, { childList: true, characterData: true, subtree: true });
  paint();
}
