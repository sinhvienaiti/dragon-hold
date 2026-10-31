// Source: new for the kit: quick settings style sheet, injected once per document (no CSS file to sync)
/**
 * A plain, neutral dark panel: flat colours and borders, no drawn ornaments.
 * Frames, buttons, slider parts, list plates and Close come from art through
 * `skin` (image URLs). A game restyles through the variables below on `.kit-qs`
 * (they are set at zero specificity, so any game rule on `.kit-qs` wins):
 * QUICK_SETTINGS_COLORS and QUICK_SETTINGS_VARS.
 */

/** Default colours. Every text/background pair reaches WCAG AAA (≥ 7:1); see quick-settings tests. */
export const QUICK_SETTINGS_COLORS = {
  "--kit-qs-bg": "#14161B",
  "--kit-qs-control": "#232731",
  "--kit-qs-text": "#F3F4F6",
  "--kit-qs-muted": "#C3C9D3",
  "--kit-qs-accent": "#8FD3FF",
  "--kit-qs-accent-text": "#0B0D12",
  "--kit-qs-focus": "#FFD166",
  "--kit-qs-line": "#4A505C",
  "--kit-qs-backdrop": "rgba(5, 6, 10, 0.55)",
} as const;

/**
 * Sizes and effects a game sets on the layer (`.kit-qs`), with their defaults.
 * Fonts have no default (each part then uses the panel's font):
 * --kit-qs-title-font (panel title), --kit-qs-button-font (buttons, chips,
 * keyboard rows), --kit-qs-label-font (row labels, section and family
 * headings); small notes stay in --kit-qs-note-font (default the kit's
 * battle font, Be Vietnam Pro).
 */
export const QUICK_SETTINGS_VARS = {
  /** Focus glow colour on skinned buttons, chips, list rows, knobs and Close. */
  "--kit-qs-glow": "var(--kit-qs-focus)",
  /** The glow itself (a filter); hugs the art's alpha. */
  "--kit-qs-glow-filter": "drop-shadow(0 0 1px var(--kit-qs-glow)) drop-shadow(0 0 1px var(--kit-qs-glow)) drop-shadow(0 0 calc(5px * var(--kit-qs-s)) var(--kit-qs-glow))",
  /** Lettering on an active plate (a chosen list row, a pressed button on `buttonActive`). */
  "--kit-qs-active-text": "var(--kit-qs-text)",
  /** Row icon cell, kept when empty so labels line up. */
  "--kit-qs-icon-size": "calc(24px * var(--kit-qs-s))",
  /** Column after the number on every slider row of a panel that has a slider toggle (Mute). */
  "--kit-qs-aside-w": "calc(100px * var(--kit-qs-s))",
  /** Knob box; the fill is clipped at its centre. */
  "--kit-qs-knob": "calc(22px * var(--kit-qs-s))",
  /** Groove height. */
  "--kit-qs-groove-h": "calc(10px * var(--kit-qs-s))",
  /** Groove art cut in source px (border-image-slice, no `fill`); 0 stretches the whole picture. */
  "--kit-qs-groove-slice": "0",
  /** Drawn width of the groove's end caps. --kit-qs-fill-slice / --kit-qs-fill-cap override both for the fill art. */
  "--kit-qs-groove-cap": "0px",
  /** On the fill layer; the default brightens only when the fill falls back to the `sliderTrack` art. */
  "--kit-qs-fill-filter": "none",
  "--kit-qs-empty-filter": "none",
  /** The chosen list row when no active plate art exists. */
  "--kit-qs-list-active-filter": "brightness(1.3) saturate(1.25)",
  /** A list row's plate under the pointer: brighter, with the glow. */
  "--kit-qs-list-hover-filter": "brightness(1.3) drop-shadow(0 0 calc(5px * var(--kit-qs-s)) var(--kit-qs-glow))",
  /** A slider row whose toggle is pressed (a muted Master): its groove layers and knob. */
  "--kit-qs-muted-filter": "grayscale(.7) brightness(.6)",
  /** The keyboard list's thin scrollbar thumb (no grey OS bar inside the panel art); its track is clear. */
  "--kit-qs-scroll-thumb": "var(--kit-qs-line)",
  /** The icon Close; --kit-qs-close-x / --kit-qs-close-y move it (e.g. onto the frame's corner). */
  "--kit-qs-close-size": "calc(32px * var(--kit-qs-s))",
} as const;

/** Fill filter when the fill is the `sliderTrack` art (no `sliderFill`): the same groove, lit. */
export const QUICK_FILL_FROM_TRACK_FILTER = "brightness(1.3) saturate(1.35)";

export const QUICK_SETTINGS_STYLE_ID = "kit-quick-settings";

const s = (px: number): string => `calc(${px}px * var(--kit-qs-s))`;
const ring = "outline:2px solid var(--kit-qs-focus);outline-offset:2px";
const glow = "outline:none;filter:var(--kit-qs-glow-filter)";
const vars = (table: Readonly<Record<string, string>>): string => Object.entries(table).map(([name, value]) => `${name}:${value};`).join("");
/** Fill clip: the right edge at the knob's centre (thumb travels 0..100% minus its own width); room above, below and left for a glow. */
const fillClip = "inset(calc(-1 * var(--kit-qs-groove-h)) calc(100% - var(--kit-qs-knob) / 2 - var(--kit-qs-v, 0) * (100% - var(--kit-qs-knob))) calc(-1 * var(--kit-qs-groove-h)) calc(-1 * var(--kit-qs-groove-h)))";

export const QUICK_SETTINGS_CSS = `
:where(.kit-qs){${vars(QUICK_SETTINGS_COLORS)}--kit-qs-s:1;--kit-qs-step:500ms;${vars(QUICK_SETTINGS_VARS)}}
:where(.kit-qs--slider-fill:not(.kit-qs--fill-art)){--kit-qs-fill-filter:${QUICK_FILL_FROM_TRACK_FILTER}}
.kit-qs{position:absolute;inset:0;pointer-events:none;color:var(--kit-qs-text);font-family:var(--kit-font-battle,"Be Vietnam Pro","Segoe UI",system-ui,sans-serif);font-size:${s(15)};line-height:1.35}
.kit-qs--fixed{position:fixed}
.kit-qs [hidden],.kit-qs__dialog[aria-hidden="true"]{display:none!important}
:where(.kit-qs) button{font:inherit;color:inherit;cursor:pointer}
.kit-qs__bar{position:absolute;top:${s(12)};right:${s(12)};z-index:2;display:flex;gap:${s(8)};pointer-events:auto}
.kit-qs__corner{box-sizing:border-box;min-width:${s(32)};height:${s(32)};padding:0 ${s(10)};border:1px solid var(--kit-qs-line);border-radius:${s(6)};background:var(--kit-qs-control);font-weight:700;white-space:nowrap}
.kit-qs__corner.has-icon{width:${s(32)};padding:0;border-color:transparent;background:transparent}
.kit-qs__corner img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none}
.kit-qs__corner:hover{${ring}}
.kit-qs__corner:focus-visible{outline:3px solid var(--kit-qs-focus);outline-offset:2px}
.kit-qs__corner.has-icon:hover{outline:none;filter:brightness(1.15) drop-shadow(0 0 ${s(4)} var(--kit-qs-glow))}
.kit-qs__corner.has-icon:focus-visible{${glow}}
.kit-qs__dialog{position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;pointer-events:auto}
.kit-qs__dialog:focus{outline:none}
.kit-qs__backdrop{position:absolute;inset:0;background:var(--kit-qs-backdrop)}
.kit-qs__panel{position:relative;box-sizing:border-box;width:min(${s(560)},calc(100% - 32px));max-height:calc(100% - 32px);overflow:auto;padding:${s(16)} ${s(20)} ${s(18)};border:1px solid var(--kit-qs-line);border-radius:${s(10)};background-color:var(--kit-qs-bg);color:var(--kit-qs-text)}
.kit-qs--skin-panel .kit-qs__panel{border-color:transparent;background-image:var(--kit-qs-skin-panel);background-size:100% 100%;background-repeat:no-repeat}
.kit-qs__head{display:flex;align-items:center;justify-content:space-between;gap:${s(12)};margin-bottom:${s(6)}}
.kit-qs__title{margin:0;font-family:var(--kit-qs-title-font,inherit);font-size:${s(21)};font-weight:800}
.kit-qs__heading{margin:${s(14)} 0 ${s(4)};font-family:var(--kit-qs-label-font,inherit);font-size:${s(13)};font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--kit-qs-muted)}
.kit-qs__row{display:grid;grid-template-columns:var(--kit-qs-icon-size) 9.5em minmax(0,1fr);align-items:center;gap:${s(10)};min-height:${s(36)};padding:${s(3)} 0}
.kit-qs__icon-cell{display:block;width:var(--kit-qs-icon-size);height:var(--kit-qs-icon-size)}
.kit-qs__icon{display:block;width:100%;height:100%;object-fit:contain}
.kit-qs__label{font-family:var(--kit-qs-label-font,inherit);font-weight:600;overflow-wrap:anywhere}
.kit-qs__control{display:flex;flex-wrap:wrap;align-items:center;gap:${s(8)};min-width:0}
.kit-qs__control--slider{flex-wrap:nowrap}
.kit-qs__slider{position:relative;display:flex;align-items:center;flex:1 1 0;min-width:4em}
.kit-qs__range{flex:1 1 auto;width:100%;min-width:0;height:${s(24)};margin:0;accent-color:var(--kit-qs-accent)}
.kit-qs__range:focus-visible{${ring}}
.kit-qs__num{flex:0 0 2.4em;min-width:2.4em;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.kit-qs__aside{flex:0 0 var(--kit-qs-aside-w);display:flex;min-width:0}
.kit-qs__row--muted .kit-qs__slider{filter:var(--kit-qs-muted-filter)}
.kit-qs__row--muted .kit-qs__num{opacity:.55;text-decoration:line-through;text-decoration-thickness:${s(2)}}
.kit-qs__aside>.kit-qs__btn{width:100%}
.kit-qs__opts{display:flex;flex-wrap:wrap;gap:${s(6)}}
.kit-qs__opt{position:relative;display:inline-flex}
.kit-qs__opt input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.kit-qs__opt input:disabled{cursor:not-allowed}
.kit-qs__chip{display:inline-block;padding:${s(5)} ${s(10)};border:1px solid var(--kit-qs-line);border-radius:${s(6)};background:var(--kit-qs-control);white-space:nowrap}
.kit-qs__opt:hover input:not(:disabled)+.kit-qs__chip{border-color:var(--kit-qs-focus)}
.kit-qs__opt input:checked+.kit-qs__chip{border-color:var(--kit-qs-accent);background:var(--kit-qs-accent);color:var(--kit-qs-accent-text)}
.kit-qs__opt input:focus-visible+.kit-qs__chip{${ring}}
.kit-qs.kit-qs--skin-button .kit-qs__panel .kit-qs__opt input:focus-visible+.kit-qs__chip{${glow}}
.kit-qs__opt input:disabled+.kit-qs__chip{border-style:dashed;color:var(--kit-qs-muted)}
.kit-qs__opt input:checked:disabled+.kit-qs__chip{border-color:var(--kit-qs-accent);background:var(--kit-qs-bg)}
.kit-qs__note{margin-left:.35em;font-size:.82em;font-weight:400}
.kit-qs .kit-qs__btn,.kit-qs .kit-qs__chip,.kit-qs .kit-qs__corner,.kit-qs .kit-keyboards button.kit-keyboards__option{font-family:var(--kit-qs-button-font,inherit)}
.kit-qs .kit-keyboards .kit-keyboards__family{font-family:var(--kit-qs-label-font,inherit)}
.kit-qs .kit-qs__note,.kit-qs .kit-keyboards__note{font-family:var(--kit-qs-note-font,var(--kit-font-battle,"Be Vietnam Pro","Segoe UI",system-ui,sans-serif))}
.kit-qs__btn{box-sizing:border-box;min-height:${s(32)};padding:0 ${s(14)};border:1px solid var(--kit-qs-line);border-radius:${s(6)};background:var(--kit-qs-control);font-weight:700}
.kit-qs__btn:hover{border-color:var(--kit-qs-focus)}
.kit-qs__btn:focus-visible{${ring}}
.kit-qs__btn--primary,.kit-qs__btn[aria-pressed="true"],.kit-qs__btn[aria-checked="true"]{border-color:var(--kit-qs-accent);background:var(--kit-qs-accent);color:var(--kit-qs-accent-text)}
.kit-qs--skin-button .kit-qs__btn,.kit-qs--skin-button .kit-qs__corner:not(.has-icon){background-image:var(--kit-qs-skin-button);background-size:100% 100%;background-repeat:no-repeat}
.kit-qs--skin-button-active .kit-qs__btn[aria-pressed="true"],.kit-qs--skin-button-active .kit-qs__btn[aria-checked="true"]{border-color:transparent;background:var(--kit-qs-skin-button-active) center/100% 100% no-repeat transparent;color:var(--kit-qs-active-text)}
.kit-qs.kit-qs--skin-button .kit-qs__panel .kit-qs__btn:focus-visible,.kit-qs.kit-qs--skin-button .kit-qs__bar .kit-qs__corner:focus-visible{${glow}}
.kit-qs.kit-qs--skin-close .kit-qs__head .kit-qs__close--icon{box-sizing:border-box;flex:none;width:var(--kit-qs-close-size);height:var(--kit-qs-close-size);min-width:0;min-height:0;margin:0;padding:0;border:0;border-radius:0;border-image:none;background:none;transform:translate(var(--kit-qs-close-x,0px),var(--kit-qs-close-y,0px))}
.kit-qs__close--icon img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none}
.kit-qs.kit-qs--skin-close .kit-qs__head .kit-qs__close--icon:hover{filter:brightness(1.18)}
.kit-qs.kit-qs--skin-close .kit-qs__head .kit-qs__close--icon:focus-visible{${glow}}
.kit-qs__slot{grid-column:1/-1;position:relative;min-width:0}
.kit-qs__row--slot{grid-template-columns:minmax(0,1fr)}
.kit-qs__actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:${s(10)};margin-top:${s(16)}}
.kit-qs--skin-slider .kit-qs__range{-webkit-appearance:none;appearance:none;background:transparent}
.kit-qs--skin-slider .kit-qs__range::-webkit-slider-runnable-track{height:var(--kit-qs-groove-h);border:0;background:var(--kit-qs-line) var(--kit-qs-skin-track,none) center/100% 100% no-repeat}
.kit-qs--skin-slider .kit-qs__range::-moz-range-track{height:var(--kit-qs-groove-h);border:0;background:var(--kit-qs-line) var(--kit-qs-skin-track,none) center/100% 100% no-repeat}
.kit-qs--skin-slider .kit-qs__range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:var(--kit-qs-knob);height:var(--kit-qs-knob);margin-top:calc((var(--kit-qs-groove-h) - var(--kit-qs-knob)) / 2);border:0;background:var(--kit-qs-text) var(--kit-qs-skin-thumb,none) center/100% 100% no-repeat}
.kit-qs--skin-slider .kit-qs__range::-moz-range-thumb{width:var(--kit-qs-knob);height:var(--kit-qs-knob);border:0;background:var(--kit-qs-text) var(--kit-qs-skin-thumb,none) center/100% 100% no-repeat}
.kit-qs--skin-slider .kit-qs__range:focus-visible{outline:none}
.kit-qs--skin-slider .kit-qs__range:focus-visible::-webkit-slider-thumb{filter:var(--kit-qs-glow-filter)}
.kit-qs--skin-slider .kit-qs__range:focus-visible::-moz-range-thumb{filter:var(--kit-qs-glow-filter)}
.kit-qs__groove,.kit-qs__fill{display:none}
.kit-qs--slider-fill .kit-qs__groove,.kit-qs--slider-fill .kit-qs__fill{display:block;position:absolute;z-index:0;left:0;right:0;top:calc(50% - var(--kit-qs-groove-h) / 2);height:var(--kit-qs-groove-h);box-sizing:border-box;border:0 solid transparent;pointer-events:none}
.kit-qs--slider-fill .kit-qs__range{position:relative;z-index:1}
.kit-qs--slider-fill .kit-qs__groove{border-image:var(--kit-qs-skin-empty,none) var(--kit-qs-groove-slice) fill / 0 var(--kit-qs-groove-cap) / 0 stretch;filter:var(--kit-qs-empty-filter)}
.kit-qs--slider-fill .kit-qs__fill{border-image:var(--kit-qs-skin-fill,none) var(--kit-qs-fill-slice,var(--kit-qs-groove-slice)) fill / 0 var(--kit-qs-fill-cap,var(--kit-qs-groove-cap)) / 0 stretch;filter:var(--kit-qs-fill-filter);clip-path:${fillClip}}
.kit-qs.kit-qs--slider-fill .kit-qs__slider .kit-qs__range::-webkit-slider-runnable-track{border:0;border-image:none;background:transparent}
.kit-qs.kit-qs--slider-fill .kit-qs__slider .kit-qs__range::-moz-range-track{border:0;border-image:none;background:transparent}
.kit-qs__count{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;pointer-events:none}
.kit-qs__digit{font-size:${s(96)};font-weight:800;line-height:1;color:var(--kit-qs-text);text-shadow:0 2px 0 rgba(0,0,0,.65),0 0 18px rgba(0,0,0,.6);animation:kit-qs-pop var(--kit-qs-step) ease-out both}
@keyframes kit-qs-pop{from{opacity:0;transform:scale(1.5)}35%{opacity:1}to{opacity:1;transform:scale(1)}}
.kit-qs--still .kit-qs__digit{animation:none}
@media (prefers-reduced-motion:reduce){.kit-qs__digit{animation:none}}
`;

/** Adds the sheet to `doc` once; returns false when it was already there. */
export function installQuickSettingsStyles(doc: Document): boolean {
  if (doc.getElementById(QUICK_SETTINGS_STYLE_ID) !== null) return false;
  const style = doc.createElement("style");
  style.id = QUICK_SETTINGS_STYLE_ID;
  style.textContent = QUICK_SETTINGS_CSS;
  doc.head.appendChild(style);
  return true;
}

/** A URL as a CSS `url("…")` value. */
export function cssUrl(url: string): string {
  return `url("${url.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\n\r\f]/g, " ")}")`;
}
