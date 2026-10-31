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
/**
 * Row icons the kit's default rows name beyond ticket 180 (ticket 244 and
 * later). Kept out of QUICK_ICON_NAMES, which games map to files they have:
 * a name with no URL leaves an empty icon cell of the same width.
 */
export const QUICK_ROW_ICON_NAMES = [
  "vol-keyboard-volume",
  "fx-style",
  "fx-strength",
  "fx-size",
  "gfx-quality",
  "gfx-motion",
  "learn-meaning",
  "learn-ipa",
] as const;
export type QuickIconName = (typeof QUICK_ICON_NAMES)[number] | (typeof QUICK_ROW_ICON_NAMES)[number];
/** Any row icon: a kit name or a game's own (e.g. "game-pace"); its URL comes through `icons`. */
export type QuickIconKey = QuickIconName | (string & {});
export type QuickIcons = Partial<Record<QuickIconKey, string>>;

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
  readonly icon?: QuickIconKey;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Used when getValues has no valid number for this id. */
  readonly default?: number;
  /** Sound group passed to onPreview while the slider moves. */
  readonly preview?: string;
  /**
   * A pressed/unpressed button in the same row, e.g. Master's mute (`muted`).
   * It sits in a fixed column after the number (`.kit-qs__aside`, width
   * --kit-qs-aside-w); every slider row of that panel keeps the column, so all
   * grooves have one length.
   */
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
  readonly icon?: QuickIconKey;
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
  readonly icon?: QuickIconKey;
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

/**
 * A nine-slice plate (list rows): the image, where to cut it and how wide its
 * edges are drawn, as CSS border-image does.
 */
export type QuickNineSlice = {
  /** Plate image. Unset: the skin's `button` art (`buttonActive` for the active plate). */
  readonly url?: string;
  /** Cuts in source px, CSS order (top, right, bottom, left); one number for all four. The middle is drawn too (fill). */
  readonly slice: number | readonly number[];
  /** Drawn edge widths in CSS px, same order; default 12. List rows are 34 px tall (44 on touch). */
  readonly edge?: number | readonly number[];
};

/**
 * Image URLs for frames, buttons, slider parts and list plates (art tickets
 * 115/160, 162, 127, 225/241, 244, 245). Every field is optional; a missing
 * one keeps the kit's plain look for that part.
 */
export type QuickSkin = {
  readonly panel?: string;
  readonly button?: string;
  /** Plate of a pressed or switched-on button (Mute pressed, a switch On); also the active list row's fallback. */
  readonly buttonActive?: string;
  readonly sliderThumb?: string;
  readonly sliderTrack?: string;
  /**
   * The groove's filled part, left of the knob (ticket 244). Setting this or
   * `sliderEmpty` turns the fill layer on: the empty groove is drawn under the
   * range and the fill over it, clipped at the knob's centre. Unset: the
   * `sliderTrack` art through --kit-qs-fill-filter (brighter by default).
   */
  readonly sliderFill?: string;
  /** The groove's empty part, right of the knob. Unset: the `sliderTrack` art (through --kit-qs-empty-filter). */
  readonly sliderEmpty?: string;
  /**
   * Keyboard sound list rows as art plates (ticket 245), in place of the web
   * listbox look. Setting this or `listRowActive` turns the plates on.
   */
  readonly listRow?: QuickNineSlice;
  /** The chosen row's plate. Unset: `buttonActive`, else the row plate brightened (--kit-qs-list-active-filter). */
  readonly listRowActive?: QuickNineSlice;
  /** Close as an icon button (ticket 245), about 32 px at 720p (--kit-qs-close-size). Unset: the text button. */
  readonly close?: string;
};
