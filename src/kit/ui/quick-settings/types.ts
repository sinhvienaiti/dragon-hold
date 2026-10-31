// Source: new for the kit: in-play quick settings (docs/games/IN_GAME_SETTINGS.md)
/**
 * Row schema of the two quick panels. A panel is a list of rows; the kit
 * builds the spec's rows (rows.ts) and a game may reorder, drop or add rows.
 * Values are plain numbers, strings and booleans keyed by row id; the game
 * owns them (reads through getValues, writes through onChange, saves them).
 */

export const QUICK_PANELS = ["settings", "sound"] as const;
export type QuickPanel = (typeof QUICK_PANELS)[number];

/** Icon art by name (Codex ticket 180); the game passes a URL for each. */
export const QUICK_ICON_NAMES = [
  "hud-settings",
  "hud-sound",
  "hud-sound-muted",
  "vol-master",
  "vol-music",
  "vol-effects",
  "vol-keyboard",
  "vol-voice",
  "vol-interface",
] as const;
export type QuickIconName = (typeof QUICK_ICON_NAMES)[number];
export type QuickIcons = Partial<Record<QuickIconName, string>>;

export type QuickValue = number | string | boolean;
export type QuickValues = Readonly<Record<string, QuickValue>>;

/** Fills `host` when its panel opens; the returned function runs when it closes. */
export type QuickMount = (host: HTMLElement) => void | (() => void);

/** A section title. */
export type QuickHeadingRow = {
  readonly kind: "heading";
  readonly id: string;
  readonly label: string;
};

/** A native range slider (0–100 unless min/max say otherwise), with an optional on/off button beside it. */
export type QuickSliderRow = {
  readonly kind: "slider";
  readonly id: string;
  readonly label: string;
  readonly icon?: QuickIconName;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Used when getValues has no valid number for this id. */
  readonly default?: number;
  /** Sound group passed to onPreview while the slider moves. */
  readonly preview?: string;
  /** A pressed/unpressed button in the same row, e.g. Master's mute (`muted`). */
  readonly toggle?: { readonly id: string; readonly label: string };
};

export type QuickChoiceOption = {
  /** Catalogue URLs, resolved relative to its base by loadKeyboardCatalog(). */
  readonly manifest?: string;
  readonly preview?: string;
  readonly value: string;
  readonly label: string;
  /** Shown but not selectable (for example a sound pack not made yet). */
  readonly disabled?: boolean;
  /** A short note beside the option; a disabled option without one shows "pending". */
  readonly note?: string;
};

/** One choice from a short list (a radio group). */
export type QuickChoiceRow = {
  readonly kind: "choice";
  readonly id: string;
  readonly label: string;
  readonly icon?: QuickIconName;
  readonly options: readonly QuickChoiceOption[];
  readonly default?: string;
  /** Sound group passed to onPreview when the choice changes. */
  readonly preview?: string;
};

/** An on/off switch. */
export type QuickToggleRow = {
  readonly kind: "toggle";
  readonly id: string;
  readonly label: string;
  readonly icon?: QuickIconName;
  readonly default?: boolean;
};

/** A panel button: "resume" closes with the countdown, "quit" calls onQuit, a function runs as is. */
export type QuickButtonRow = {
  readonly kind: "button";
  readonly id: string;
  readonly label: string;
  readonly action: "resume" | "quit" | (() => void);
  readonly primary?: boolean;
};

/** A host element the game fills while the panel is open (preview, game rows). */
export type QuickSlotRow = {
  readonly kind: "slot";
  readonly id: string;
  readonly label?: string;
  readonly mount: QuickMount;
};

export type QuickRow = QuickHeadingRow | QuickSliderRow | QuickChoiceRow | QuickToggleRow | QuickButtonRow | QuickSlotRow;

/** Image URLs for frames and slider parts (art tickets 115/160, 162, 127). */
export type QuickSkin = {
  readonly panel?: string;
  readonly button?: string;
  readonly sliderThumb?: string;
  readonly sliderTrack?: string;
};
