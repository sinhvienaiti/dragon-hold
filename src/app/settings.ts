import { DEFAULT_VOLUMES, type AudioVolumes } from "../audio/mix";
import type { KeyboardSoundChoice } from "../kit/feedback/typing-fx";
import type { QuickValue } from "../kit/ui";
import type { Quality } from "./contracts";

export const SETTINGS_KEY = "dragon-hold:settings:v1";
/** Ticket 189: provisional until the owner chooses a default. */
export const DEFAULT_KEYBOARD_SOUND = "deep";
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
  };
}

export function keyboardChoice(id: string, choices: readonly KeyboardSoundChoice[]): string {
  return choices.some((p) => p.value === id && !p.disabled) ? id : choices.find((p) => p.value !== "off" && !p.disabled)?.value ?? "off";
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
  else return false;
  return true;
}

/** Keyboard is independent of Effects, including the original typing bus. */
export function audioVolumes(s: Settings): AudioVolumes {
  return { master: s.master, music: s.music, sfx: s.effects, voice: s.voice, learning: s.ui, ui: s.ui, keyboard: s.keyboard === BUILT_IN_KEYS ? s.keyboardVolume : 0 };
}

export const keyboardLevel = (s: Settings): number => s.muted || s.keyboard === "off" || s.keyboard === BUILT_IN_KEYS ? 0 : s.master * s.keyboardVolume;
export const voiceLevel = (s: Settings): number => s.muted ? 0 : s.master * s.voice;
