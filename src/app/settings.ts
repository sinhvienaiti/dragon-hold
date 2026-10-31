import { DEFAULT_VOLUMES, type AudioVolumes } from "../audio/mix";
import type { QuickValue } from "../kit/ui";
import type { Quality } from "./contracts";

export const SETTINGS_KEY = "dragon-hold:settings:v1";
/**
 * Owner 30/10: Bright Clack (Velvet) is the default keyboard sound in every
 * game. The hard default only: the Typing Feel catalogue's `default` comes
 * first for a save without a keyboard sound (keyboard.ts settleKeyboard).
 */
export const DEFAULT_KEYBOARD_SOUND = "bright-clack";
export const BUILT_IN_KEYS = "dragonhold";
export const QUALITY_LEVELS: readonly Quality[] = ["low", "medium", "high", "ultra"];

export interface Settings {
  master: number;
  muted: boolean;
  music: number;
  effects: number;
  keyboard: string;
  keyboardVolume: number;
  voice: number;
  ui: number;
  quality: Quality;
  /** Settings › Graphics: no screen shake and no pulsing or flying UI (app.ts applyMotion). */
  reducedMotion: boolean;
  /** Settings › Learning: the Vietnamese meaning on word tags and in the learning frame (app.ts shownGloss). */
  learnMeaning: boolean;
  /** Settings › Learning: the IPA line in the learning frame. */
  learnIpa: boolean;
}

export const SETTINGS_DEFAULTS: Readonly<Settings> = Object.freeze({
  master: DEFAULT_VOLUMES.master,
  muted: false,
  music: DEFAULT_VOLUMES.music,
  effects: DEFAULT_VOLUMES.sfx,
  keyboard: DEFAULT_KEYBOARD_SOUND,
  keyboardVolume: 1,
  voice: DEFAULT_VOLUMES.voice,
  ui: DEFAULT_VOLUMES.sfx,
  quality: "high",
  reducedMotion: false,
  learnMeaning: true,
  learnIpa: true,
});

const level = (raw: unknown, fallback: number): number => typeof raw === "number" && Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : fallback;

export function loadSettings(raw: unknown): Settings {
  const s = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    master: level(s.master, SETTINGS_DEFAULTS.master),
    muted: typeof s.muted === "boolean" ? s.muted : false,
    music: level(s.music, SETTINGS_DEFAULTS.music),
    effects: level(s.effects, SETTINGS_DEFAULTS.effects),
    keyboard: typeof s.keyboard === "string" && /^[a-z0-9][a-z0-9-]{0,31}$/.test(s.keyboard) ? s.keyboard : DEFAULT_KEYBOARD_SOUND,
    keyboardVolume: level(s.keyboardVolume, SETTINGS_DEFAULTS.keyboardVolume),
    voice: level(s.voice, SETTINGS_DEFAULTS.voice),
    ui: level(s.ui, SETTINGS_DEFAULTS.ui),
    quality: QUALITY_LEVELS.includes(s.quality as Quality) ? s.quality as Quality : SETTINGS_DEFAULTS.quality,
    reducedMotion: typeof s.reducedMotion === "boolean" ? s.reducedMotion : SETTINGS_DEFAULTS.reducedMotion,
    learnMeaning: typeof s.learnMeaning === "boolean" ? s.learnMeaning : SETTINGS_DEFAULTS.learnMeaning,
    learnIpa: typeof s.learnIpa === "boolean" ? s.learnIpa : SETTINGS_DEFAULTS.learnIpa,
  };
}

/** The Settings panel's switches (boolean settings besides `muted`). */
export const SETTING_SWITCHES = ["reducedMotion", "learnMeaning", "learnIpa"] as const;

/**
 * What goes into the save. The keyboard sound is written only once the save
 * owns one (it had the field, the Typing Feel catalogue repaired it, or the
 * player picked one: parent TYPING_FEEL_SERVICE.md §4.5); until then it is
 * left out, so a save without it keeps following the catalogue's default
 * instead of keeping whatever the page played then (Dragonhold while Typing
 * Feel was down, the hard default while the catalogue loaded).
 */
export function storedSettings(s: Settings, keyboardOwned: boolean): Settings | Omit<Settings, "keyboard"> {
  if (keyboardOwned) return s;
  const { keyboard: _unowned, ...rest } = s;
  return rest;
}

export function quickValues(s: Settings): Record<string, QuickValue> {
  return { ...s, ...Object.fromEntries(["master", "music", "effects", "keyboardVolume", "voice", "ui"].map((id) => [id, Math.round(s[id as keyof Settings] as number * 100)])) };
}

export function applyQuick(s: Settings, id: string, value: QuickValue): boolean {
  if (["master", "music", "effects", "keyboardVolume", "voice", "ui"].includes(id) && typeof value === "number" && Number.isFinite(value)) {
    Object.assign(s, { [id]: level(value / 100, 0) });
  } else if (id === "muted" && typeof value === "boolean") s.muted = value;
  else if (id === "keyboard" && typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,31}$/.test(value)) s.keyboard = value;
  else if (id === "quality" && QUALITY_LEVELS.includes(value as Quality)) s.quality = value as Quality;
  else if ((SETTING_SWITCHES as readonly string[]).includes(id) && typeof value === "boolean") Object.assign(s, { [id]: value });
  else return false;
  return true;
}

/**
 * Whether the game's own Dragonhold key sound plays: it is the choice, or it
 * stands in for the chosen set, which cannot sound this session (`standIn`,
 * keyboard.ts GameKeyboard onFail). A stand-in counts only while that set is
 * still the choice.
 */
export function builtInKeys(s: Settings, standIn: string | null = null): boolean {
  return s.keyboard === BUILT_IN_KEYS || (standIn !== null && standIn !== "off" && s.keyboard === standIn);
}

/** Keyboard is independent of Effects, including the original typing bus (on for Dragonhold and its stand-in only). */
export function audioVolumes(s: Settings, standIn: string | null = null): AudioVolumes {
  return { master: s.master, music: s.music, sfx: s.effects, voice: s.voice, learning: s.ui, ui: s.ui, keyboard: builtInKeys(s, standIn) ? s.keyboardVolume : 0 };
}

export const keyboardLevel = (s: Settings): number => s.muted || s.keyboard === "off" || s.keyboard === BUILT_IN_KEYS ? 0 : s.master * s.keyboardVolume;
export const voiceLevel = (s: Settings): number => s.muted ? 0 : s.master * s.voice;
