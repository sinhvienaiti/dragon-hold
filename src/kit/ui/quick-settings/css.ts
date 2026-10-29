// Source: new for the kit: quick settings style sheet, injected once per document (no CSS file to sync)
/**
 * A plain, neutral dark panel: flat colours and borders, no drawn ornaments.
 * Frames, buttons and slider parts come from art through `skin` (image URLs).
 * A game restyles through the variables below on `.kit-qs` (they are set at
 * zero specificity, so any game rule on `.kit-qs` wins).
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

export const QUICK_SETTINGS_STYLE_ID = "kit-quick-settings";

const s = (px: number): string => `calc(${px}px * var(--kit-qs-s))`;
const ring = "outline:2px solid var(--kit-qs-focus);outline-offset:2px";

export const QUICK_SETTINGS_CSS = `
:where(.kit-qs){${Object.entries(QUICK_SETTINGS_COLORS).map(([name, value]) => `${name}:${value};`).join("")}--kit-qs-s:1;--kit-qs-step:500ms}
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
.kit-qs__dialog{position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;pointer-events:auto}
.kit-qs__dialog:focus{outline:none}
.kit-qs__backdrop{position:absolute;inset:0;background:var(--kit-qs-backdrop)}
.kit-qs__panel{position:relative;box-sizing:border-box;width:min(${s(560)},calc(100% - 32px));max-height:calc(100% - 32px);overflow:auto;padding:${s(16)} ${s(20)} ${s(18)};border:1px solid var(--kit-qs-line);border-radius:${s(10)};background-color:var(--kit-qs-bg);color:var(--kit-qs-text)}
.kit-qs--skin-panel .kit-qs__panel{border-color:transparent;background-image:var(--kit-qs-skin-panel);background-size:100% 100%;background-repeat:no-repeat}
.kit-qs__head{display:flex;align-items:center;justify-content:space-between;gap:${s(12)};margin-bottom:${s(6)}}
.kit-qs__title{margin:0;font-size:${s(21)};font-weight:800}
.kit-qs__heading{margin:${s(14)} 0 ${s(4)};font-size:${s(13)};font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--kit-qs-muted)}
.kit-qs__row{display:grid;grid-template-columns:${s(24)} minmax(7.5em,auto) minmax(0,1fr);align-items:center;gap:${s(10)};min-height:${s(36)};padding:${s(3)} 0}
.kit-qs__icon{display:block;width:${s(24)};height:${s(24)};object-fit:contain}
.kit-qs__label{font-weight:600}
.kit-qs__control{display:flex;flex-wrap:wrap;align-items:center;gap:${s(8)};min-width:0}
.kit-qs__range{flex:1 1 8em;min-width:6em;height:${s(24)};margin:0;accent-color:var(--kit-qs-accent)}
.kit-qs__range:focus-visible{${ring}}
.kit-qs__num{min-width:2.4em;text-align:right;font-variant-numeric:tabular-nums}
.kit-qs__opts{display:flex;flex-wrap:wrap;gap:${s(6)}}
.kit-qs__opt{position:relative;display:inline-flex}
.kit-qs__opt input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.kit-qs__opt input:disabled{cursor:not-allowed}
.kit-qs__chip{display:inline-block;padding:${s(5)} ${s(10)};border:1px solid var(--kit-qs-line);border-radius:${s(6)};background:var(--kit-qs-control);white-space:nowrap}
.kit-qs__opt:hover input:not(:disabled)+.kit-qs__chip{border-color:var(--kit-qs-focus)}
.kit-qs__opt input:checked+.kit-qs__chip{border-color:var(--kit-qs-accent);background:var(--kit-qs-accent);color:var(--kit-qs-accent-text)}
.kit-qs__opt input:focus-visible+.kit-qs__chip{${ring}}
.kit-qs__opt input:disabled+.kit-qs__chip{border-style:dashed;color:var(--kit-qs-muted)}
.kit-qs__note{margin-left:.35em;font-size:.82em;font-weight:400}
.kit-qs__btn{box-sizing:border-box;min-height:${s(32)};padding:0 ${s(14)};border:1px solid var(--kit-qs-line);border-radius:${s(6)};background:var(--kit-qs-control);font-weight:700}
.kit-qs__btn:hover{border-color:var(--kit-qs-focus)}
.kit-qs__btn:focus-visible{${ring}}
.kit-qs__btn--primary,.kit-qs__btn[aria-pressed="true"],.kit-qs__btn[aria-checked="true"]{border-color:var(--kit-qs-accent);background:var(--kit-qs-accent);color:var(--kit-qs-accent-text)}
.kit-qs--skin-button .kit-qs__btn,.kit-qs--skin-button .kit-qs__corner:not(.has-icon){background-image:var(--kit-qs-skin-button);background-size:100% 100%;background-repeat:no-repeat}
.kit-qs__slot{grid-column:1/-1;position:relative;min-width:0}
.kit-qs__row--slot{grid-template-columns:minmax(0,1fr)}
.kit-qs__actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:${s(10)};margin-top:${s(16)}}
.kit-qs--skin-slider .kit-qs__range{-webkit-appearance:none;appearance:none;background:transparent}
.kit-qs--skin-slider .kit-qs__range::-webkit-slider-runnable-track{height:${s(10)};border:0;background:var(--kit-qs-line) var(--kit-qs-skin-track,none) center/100% 100% no-repeat}
.kit-qs--skin-slider .kit-qs__range::-moz-range-track{height:${s(10)};border:0;background:var(--kit-qs-line) var(--kit-qs-skin-track,none) center/100% 100% no-repeat}
.kit-qs--skin-slider .kit-qs__range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:${s(22)};height:${s(22)};margin-top:${s(-6)};border:0;background:var(--kit-qs-text) var(--kit-qs-skin-thumb,none) center/100% 100% no-repeat}
.kit-qs--skin-slider .kit-qs__range::-moz-range-thumb{width:${s(22)};height:${s(22)};border:0;background:var(--kit-qs-text) var(--kit-qs-skin-thumb,none) center/100% 100% no-repeat}
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
