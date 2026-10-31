// Source: new for the kit: public API of the in-play quick settings (docs/games/IN_GAME_SETTINGS.md)
export {
  QUICK_COUNTDOWN_STEPS,
  QUICK_COUNTDOWN_STEP_MS,
  QUICK_DEFAULT_Z_INDEX,
  QUICK_PREVIEW_THROTTLE_MS,
  QuickSettings,
  type QuickKeyboardFetch,
  type QuickSettingsOptions,
} from "./quick-settings";
export { DEFAULT_KEYBOARD_PROFILES, defaultSettingsRows, defaultSoundRows, type QuickDefaultsOptions } from "./rows";
export { QUICK_SETTINGS_COLORS, QUICK_SETTINGS_CSS, QUICK_SETTINGS_STYLE_ID, installQuickSettingsStyles } from "./css";
export { QUICK_KEYS } from "./logic";
export {
  QUICK_ICON_NAMES,
  QUICK_PANELS,
  type QuickButtonRow,
  type QuickChoiceOption,
  type QuickChoiceRow,
  type QuickHeadingRow,
  type QuickIconName,
  type QuickIcons,
  type QuickMount,
  type QuickPanel,
  type QuickRow,
  type QuickSkin,
  type QuickSliderRow,
  type QuickSlotRow,
  type QuickToggleRow,
  type QuickValue,
  type QuickValues,
} from "./types";

export { KeyboardSoundChoices, KEYBOARD_CHOICES_CSS, type KeyboardChoicesState, type KeyboardPointer } from "./keyboard-choices";
export { loadKeyboardCatalog, KeyboardSoundPreview, keyboardPreviewGain, type KeyboardCatalog, type KeyboardLoad, type KeyboardSoundChoice, type KeyboardPreviewLevels } from "../../feedback/typing-fx/audio";
export { KEYBOARD_SAMPLE_TIMEOUT_MS, pendingKeyboardChoices, settleKeyboardChoice, timedBytes, timedJson, typingFeelKeysBase, type KeyboardSettlement } from "../../feedback/typing-fx/audio";
