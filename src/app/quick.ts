import { QuickSettings, QUICK_ICON_NAMES, defaultSoundRows, type QuickIcons, type QuickRow, type QuickSettingsOptions, type QuickSkin } from "../kit/ui";
import type { KeyboardSoundChoice } from "../kit/feedback/typing-fx";
import { allowedQualities } from "./quality";
import { manifestJson, sampleBytes } from "./keyboard";

const UI_BASE = `${import.meta.env.BASE_URL}assets/dragon-hold/ui/quick-settings/`;
export const QUICK_ICONS: QuickIcons = Object.fromEntries(QUICK_ICON_NAMES.map((name) => [name, UI_BASE + name + ".64.png"]));
/**
 * Frame, button and slider art (tickets 162, 225 knob, 241 groove). At 1080p the groove is drawn about 306 × 15 CSS px
 * and the knob box 42 px, so the 1024 × 64 groove and the 128 px knob stay sharp on a 2× screen. app.css draws the
 * groove in three slices (the chevron caps keep their proportion), sizes the knob and clears the kit's flat colours
 * under both (`.dh-quick.kit-qs--skin-slider`), so only the art shows.
 */
export const QUICK_SKIN: QuickSkin = {
  panel: UI_BASE + "panel-large.alpha.png",
  button: UI_BASE + "button.alpha.png",
  sliderTrack: UI_BASE + "slider-track.png",
  sliderThumb: UI_BASE + "slider-thumb.128.png",
};

export function settingsRows(): QuickRow[] {
  return [
    { kind: "heading", id: "graphicsHeading", label: "Graphics" },
    // The release build never offers Low (195 quality floor); dev keeps all four.
    { kind: "choice", id: "quality", label: "Quality (next launch)", options: allowedQualities(import.meta.env.PROD).map((value) => ({ value, label: value[0]!.toUpperCase() + value.slice(1) })), default: "high" },
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
  quick.root.querySelector<HTMLElement>(".kit-qs__bar")!.dataset.keepout = "";
  return quick;
}
