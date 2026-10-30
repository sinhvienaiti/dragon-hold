import { QuickSettings, QUICK_ICON_NAMES, defaultSoundRows, type QuickIcons, type QuickRow, type QuickSettingsOptions } from "../kit/ui";
import type { KeyboardSoundChoice } from "../kit/feedback/typing-fx";
import { QUALITY_LEVELS } from "./settings";

const UI_BASE = `${import.meta.env.BASE_URL}assets/dragon-hold/ui/quick-settings/`;
export const QUICK_ICONS: QuickIcons = Object.fromEntries(QUICK_ICON_NAMES.map((name) => [name, UI_BASE + name + ".64.png"]));

export function settingsRows(): QuickRow[] {
  return [
    { kind: "heading", id: "graphicsHeading", label: "Graphics" },
    { kind: "choice", id: "quality", label: "Quality (next launch)", options: QUALITY_LEVELS.map((value) => ({ value, label: value[0]!.toUpperCase() + value.slice(1) })), default: "high" },
    { kind: "button", id: "resume", label: "Resume", action: "resume", primary: true },
    { kind: "button", id: "quit", label: "Quit to title", action: "quit" },
  ];
}

export function createQuickSettings(options: QuickSettingsOptions, keyboards: readonly KeyboardSoundChoice[]): QuickSettings {
  const quick = new QuickSettings({
    ...options,
    settingsRows: settingsRows(),
    soundRows: defaultSoundRows({ keyboardProfiles: keyboards }),
    icons: QUICK_ICONS,
    skin: { panel: UI_BASE + "panel-large.alpha.png", button: UI_BASE + "button.alpha.png" },
  });
  quick.root.classList.add("dh-quick");
  quick.root.querySelector<HTMLElement>(".kit-qs__bar")!.dataset.keepout = "";
  return quick;
}
