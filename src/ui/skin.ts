/**
 * The carved-wood UI skin (DESIGN.md §1, 05 §4): Cormorant Garamond titles,
 * Be Vietnam Pro battle text, kit/ui semantic colours and --ui scale, and
 * src/ui/styles/dh.css. Installs once at boot. Also the small DOM helpers and
 * stand-in icons every ui part shares (05 §4.1: canvas or vector icons until
 * the hand-drawn set arrives). Buttons never take focus (06 §2 rule 7).
 * Owner: ui (LANES.md).
 */
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/be-vietnam-pro/800.css";
import "@fontsource/cormorant-garamond/700.css";
// IPA lines (05 §4.4): Be Vietnam Pro lacks most IPA glyphs; kit IPA_FONT_FAMILY lists Noto Sans first.
import "@fontsource/noto-sans/latin-400.css";
import "@fontsource/noto-sans/latin-ext-400.css";
import "@fontsource/noto-sans/greek-400.css";
import "./styles/dh.css";
import { applyUiScale, installKitStyles } from "../kit/ui";
import { KEYS } from "../content/rules";
import type { Gait } from "../content/types";

const SKIN_FLAG = "dhSkin";

/** Installs fonts, kit tokens and the game stylesheet on `doc`; keeps --ui in step with the viewport. */
export function installSkin(doc: Document): void {
  const root = doc.documentElement;
  root.classList.add("dh-skin");
  if (root.dataset[SKIN_FLAG] === "1") return;
  root.dataset[SKIN_FLAG] = "1";
  installKitStyles(doc as unknown as Parameters<typeof installKitStyles>[0]);
  const view = doc.defaultView;
  if (!view) return;
  const rescale = (): void => {
    applyUiScale(view.innerWidth, view.innerHeight, doc as unknown as Parameters<typeof applyUiScale>[2]);
  };
  rescale();
  view.addEventListener("resize", rescale);
}

// ── DOM helpers ─────────────────────────────────────────────────────────────

/** A new element with a class and optional text. */
export function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A button that never takes focus from the window key router: tabindex −1, mousedown default blocked. */
export function uiButton(doc: Document, className: string, onPress: (event: MouseEvent) => void): HTMLButtonElement {
  const button = el(doc, "button", "dh-btn " + className);
  button.type = "button";
  button.tabIndex = -1;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!button.disabled) onPress(event);
  });
  return button;
}

/** Sets text only when it changed (HUD parts update every frame). */
export function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Toggles a class only when it changed. */
export function setClass(node: Element, name: string, on: boolean): void {
  if (node.classList.contains(name) !== on) node.classList.toggle(name, on);
}

/** Sets a CSS custom property only when it changed. */
export function setVar(node: HTMLElement, name: string, value: string): void {
  if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
}

/** Shows or hides a node by the `hidden` attribute. */
export function setShown(node: HTMLElement, shown: boolean): void {
  if (node.hidden === shown) node.hidden = !shown;
}

/** Vietnamese number: decimal comma, at most one decimal ("1,5"). */
export function viNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded).replace(".", ",");
}

// ── Key labels (00 §6: event.code; Alt is Option on Mac, Shift on Linux for digits) ──

export type KeyPlatform = "mac" | "linux" | "other";

export function keyPlatform(nav: { readonly platform?: string; readonly userAgent?: string } | undefined = globalThis.navigator): KeyPlatform {
  const text = ((nav?.platform ?? "") + " " + (nav?.userAgent ?? "")).toLowerCase();
  if (text.includes("mac")) return "mac";
  if (text.includes("linux") && !text.includes("android")) return "linux";
  return "other";
}

const CODE_LABEL: Readonly<Record<string, string>> = {
  Enter: "↵",
  Escape: "Esc",
  Backspace: "⌫",
  Tab: "Tab",
  Backquote: "`",
  Equal: "=",
  Minus: "-",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
};

/** The keycap text of a key-table action: "⌥1" on Mac, "Alt+1" elsewhere, "Shift+1" for digits on Linux. */
export function keyLabel(action: string, platform: KeyPlatform = keyPlatform()): string {
  const binding = KEYS.find((key) => key.action === action);
  if (!binding) return "";
  const base = binding.code.startsWith("Digit") ? binding.code.slice(5) : CODE_LABEL[binding.code] ?? binding.code;
  if (binding.mod === "none") return base === "↵" && platform !== "mac" ? "Enter" : base;
  const digit = binding.code.startsWith("Digit");
  const mod = binding.mod === "alt" && digit && platform === "linux" ? "shift" : binding.mod;
  if (platform === "mac") return (mod === "alt" ? "⌥" : "⇧") + base;
  return (mod === "alt" ? "Alt+" : "Shift+") + (base === "↵" ? "Enter" : base);
}

// ── Stand-in icons (inline SVG, 24 × 24; colours by CSS `color` unless fixed) ──

const svg = (body: string, extra = ""): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;

const POTION = svg('<path d="M9.5 3h5M10.3 3v4.6L6 14.5A4.2 4.2 0 0 0 9.6 21h4.8a4.2 4.2 0 0 0 3.6-6.5l-4.3-6.9V3" fill="#3a2a22" stroke="#e9dcc0" stroke-width="1.3" stroke-linejoin="round"/><path d="M7.2 14.2h9.6l1 1.8A3 3 0 0 1 15.2 20H8.8a3 3 0 0 1-2.6-4z" fill="#d9707a"/>');

export const ICONS = {
  coin: svg('<circle cx="12" cy="12" r="9" fill="var(--kit-money)"/><circle cx="12" cy="12" r="6" fill="none" stroke="#8a5a12" stroke-width="1.6"/><path d="M12 8.5v7" stroke="#8a5a12" stroke-width="1.8" stroke-linecap="round"/>'),
  armour: svg('<path d="M12 2.8 4.5 5.6v6.1c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V5.6z" fill="#8f9aa3" stroke="#2a2420" stroke-width="1.2"/><path d="M12 5.6v13" stroke="#cfd6dc" stroke-width="1.4"/>'),
  shield: svg('<circle cx="12" cy="12" r="8.5" fill="none" stroke="#f3efe2" stroke-width="2" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="4" fill="#f3efe2" opacity=".7"/>'),
  breath: svg('<path d="M3 13c4-1 6-5 10-6 3-.8 5 .2 7 2-2.3-.2-3.7.6-4.4 2 2.6.2 4 1.6 4.6 3.6-2-1-4-1-5.7.2C12 17 8 16.6 3 13z" fill="#ffb27a" stroke="#7a2a12" stroke-width="1.1"/><path d="M6 13c3-.3 5-2 7.5-2.4" stroke="#fff1c8" stroke-width="1.3" fill="none" stroke-linecap="round"/>'),
  skyfire: svg('<circle cx="15.5" cy="15.5" r="4.6" fill="#ff9a52" stroke="#7a2a12" stroke-width="1.1"/><path d="M3.5 3.5 12 12M7 3l6.5 7M3 7l7 6.5" stroke="#ffd29a" stroke-width="1.7" stroke-linecap="round"/><path d="M8 21h13" stroke="#ffb27a" stroke-width="1.4" stroke-dasharray="2 2"/>'),
  inferno: svg('<path d="M12 2.5c1.6 3.4 5.5 5 5.5 9.7A5.5 5.5 0 0 1 12 18a5.5 5.5 0 0 1-5.5-5.8c0-2.4 1.2-3.7 2.3-5 .3 1.8 1 2.6 2 3 0-3.2.4-5.3 1.2-7.7z" fill="#ff7a3a" stroke="#6b1e0c" stroke-width="1.1"/><path d="M12 11c1 1.4 2.4 2.1 2.4 3.6A2.4 2.4 0 0 1 12 17a2.4 2.4 0 0 1-2.4-2.4c0-1.4 1.4-2.2 2.4-3.6z" fill="#ffe08a"/><path d="M4 21h16" stroke="#ff9a52" stroke-width="1.6" stroke-linecap="round"/>'),
  roar: svg('<path d="M4 9.5h3.5l5-4v13l-5-4H4z" fill="#ffcf9a" stroke="#6b3a1c" stroke-width="1.1"/><path d="M15.5 8.5c1.6 1.8 1.6 5.2 0 7M18 6c3 3.3 3 8.7 0 12" stroke="#ffcf9a" stroke-width="1.6" fill="none" stroke-linecap="round"/>'),
  potion: POTION,
  spikes: svg('<path d="M3 18 6 8l3 10 3-12 3 12 3-10 3 10z" fill="#a98463" stroke="#3c2a1a" stroke-width="1.1" stroke-linejoin="round"/><path d="M2 19h20" stroke="#6b4a2e" stroke-width="2"/>'),
  "pine-bomb": svg('<ellipse cx="11" cy="14" rx="6" ry="7" fill="#8a5d36" stroke="#3c2a1a" stroke-width="1.1"/><path d="M6.5 11.5c3 1.5 6 1.5 9 0M6 15c3 1.6 7 1.6 10 0M8 18.4c2 .9 4 .9 6 0" stroke="#c9945e" stroke-width="1.1" fill="none"/><path d="M14 7.5c1-2 3-3 5.5-3" stroke="#d9c49a" stroke-width="1.3" fill="none"/><circle cx="20" cy="4.3" r="1.6" fill="#ffb27a"/>'),
  "net-launcher": svg('<circle cx="12" cy="11" r="7.5" fill="none" stroke="#d9c49a" stroke-width="1.3"/><path d="M5 11h14M12 3.5v15M7 6l10 10M17 6 7 16" stroke="#d9c49a" stroke-width=".9"/><path d="M12 18.5V22M9 22h6" stroke="#8a6a48" stroke-width="1.8" stroke-linecap="round"/>'),
  "moss-warden": svg('<circle cx="12" cy="6" r="3.2" fill="#9cc488" stroke="#24301c" stroke-width="1.1"/><path d="M6 21c0-6 2.4-10 6-10s6 4 6 10z" fill="#5d8a5a" stroke="#24301c" stroke-width="1.1"/><path d="M13.5 13.5h6v3.2c0 2-1.4 3.4-3 4-1.6-.6-3-2-3-4z" fill="#b9a27a" stroke="#3c2a1a" stroke-width="1"/>'),
  "herb-hut": svg('<path d="M3.5 11 12 4l8.5 7" fill="none" stroke="#c9b48a" stroke-width="1.6" stroke-linejoin="round"/><path d="M5.5 10.5V20h13v-9.5" fill="#6b5a46" stroke="#2a2018" stroke-width="1.1"/><path d="M12 19.5c-2.6-1-3.6-3.6-2.3-6.6 2.8.6 4 3.1 2.3 6.6z" fill="#9fd1e8"/><path d="M12 19.5c.4-2 1.6-3.4 3.4-4" stroke="#e9f6ff" stroke-width="1" fill="none"/>'),
  "small-potion": POTION,
  "dragon-heart": svg('<path d="M12 20.5s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z" fill="#d9705f" stroke="#5a1c12" stroke-width="1.1"/><path d="M8 10.5c.5-1.4 1.6-2 2.8-2" stroke="#ffd0c0" stroke-width="1.3" fill="none" stroke-linecap="round"/>'),
  "hard-scale": svg('<path d="M4 9a8 8 0 0 1 16 0c0 5-3.5 9-8 12-4.5-3-8-7-8-12z" fill="#b9705a" stroke="#4a1e12" stroke-width="1.1"/><path d="M6 10c2-2.5 10-2.5 12 0M7 14c2-2.2 8-2.2 10 0M9 17.6c1.4-1.4 4.6-1.4 6 0" stroke="#f0b9a0" stroke-width="1.1" fill="none"/>'),
  crown: svg('<path d="M3.5 17.5 5 7.5l4.4 4.3L12 5l2.6 6.8L19 7.5l1.5 10z" fill="var(--dh-blight)" stroke="#3a3a12" stroke-width="1.1" stroke-linejoin="round"/><path d="M4 20h16" stroke="var(--dh-blight)" stroke-width="1.8"/>'),
  wing: svg('<path d="M2.5 15c4-6.5 9-9.5 19-10.5-2.5 2-3.5 3.5-4 5.5 1.5-.3 2.5 0 3.5.5-2.6.8-4 2-5 3.6 1 0 1.8.3 2.4.8-5.4 1.4-10.2 1.4-15.9.1z" fill="var(--dh-blight)" stroke="#3a3a12" stroke-width="1.1" stroke-linejoin="round"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/>'),
  camera: svg('<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
  speaker: svg('<path d="M4 9.5h3.5l5-4v13l-5-4H4z" fill="currentColor"/><path d="M15.5 8.5c1.6 1.8 1.6 5.2 0 7M18 6c3 3.3 3 8.7 0 12" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>'),
  star: svg('<path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.5 1.2 6.4L12 17.3l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" stroke-linejoin="round"/>'),
  dragon: svg('<path d="M4 17c2-1 3-3.5 3-6.5C7 6.5 9.6 4 13 4c2.5 0 4.6 1.4 5.6 3.6L21 8.4l-2 1.6c0 3.6-2.6 6.5-6.2 7l-1.8 3-1.6-2.4L6.5 21z" fill="#e8875a" stroke="#5a1c0c" stroke-width="1.1" stroke-linejoin="round"/><circle cx="15.2" cy="8" r="1.1" fill="#fff1c8"/><path d="M9 9.5c1.5-.6 2.6-.4 3.6.6" stroke="#ffd0a0" stroke-width="1.1" fill="none"/>'),
  "white-dragon": svg('<path d="M4 17c2-1 3-3.5 3-6.5C7 6.5 9.6 4 13 4c2.5 0 4.6 1.4 5.6 3.6L21 8.4l-2 1.6c0 3.6-2.6 6.5-6.2 7l-1.8 3-1.6-2.4L6.5 21z" fill="#eef1f2" stroke="#5a6470" stroke-width="1.1" stroke-linejoin="round"/><circle cx="15.2" cy="8" r="1.1" fill="#5a8ab8"/>'),
  flag: svg('<path d="M6 21V3.5" stroke="#d9c49a" stroke-width="1.8" stroke-linecap="round"/><path d="M6.5 4h11l-2.6 3.6L17.5 11h-11z" fill="#6f9a5a" stroke="#24301c" stroke-width="1"/>'),
  rune: svg('<circle cx="12" cy="12" r="8" fill="none" stroke="#9fd1e8" stroke-width="1.6"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="#9fd1e8" stroke-width="1" stroke-dasharray="2 2"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3" stroke="#9fd1e8" stroke-width="1.2"/>'),
  bar: svg('<rect x="3" y="9.5" width="18" height="5" rx="2.5" fill="#d9c49a" stroke="#3c2a1a" stroke-width="1"/>'),
} as const;

export type IconName = keyof typeof ICONS;

/** Icon markup by name; unknown names give an empty string. */
export function icon(name: string): string {
  return (ICONS as Readonly<Record<string, string>>)[name] ?? "";
}

/** A foe silhouette by gait in its family colour (wave card, results): biped tall, quadruped long and low, flyer winged, swarm a cluster. */
export function foeIcon(gait: Gait, color: string): string {
  const stroke = 'stroke="#14100c" stroke-width="1.1" stroke-linejoin="round"';
  const eye = '#C8D24A';
  switch (gait) {
    case "biped":
      return svg(`<circle cx="12" cy="6" r="3.4" fill="${color}" ${stroke}/><path d="M7.5 21.5 8.5 11a3.5 3.5 0 0 1 7 0l1 10.5z" fill="${color}" ${stroke}/><circle cx="13.2" cy="5.6" r=".9" fill="${eye}"/>`);
    case "quadruped":
      return svg(`<path d="M3 12.5c0-2.3 2.2-3.5 5-3.5h7.5l2.5-2.5 3 1.5-1 3c.4 2.2-.6 4-3 4.5H8c-3 0-5-1-5-3z" fill="${color}" ${stroke}/><path d="M6.5 15.5v4M10 15.5v4M14 15.5v4M17 15v4" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/><circle cx="19.2" cy="8.6" r=".9" fill="${eye}"/>`);
    case "flyer":
      return svg(`<path d="M12 9c-3-4-7-5-10-4 1.6 3 4.4 5.2 8 5.6M12 9c3-4 7-5 10-4-1.6 3-4.4 5.2-8 5.6" fill="${color}" ${stroke}/><ellipse cx="12" cy="13" rx="2.8" ry="5" fill="${color}" ${stroke}/><circle cx="12" cy="10.2" r=".9" fill="${eye}"/><path d="M12 18v3" stroke="${color}" stroke-width="1.4"/>`);
    case "swarm":
      return svg(`<ellipse cx="7" cy="15" rx="3.2" ry="2.2" fill="${color}" ${stroke}/><ellipse cx="16.5" cy="16.5" rx="3.2" ry="2.2" fill="${color}" ${stroke}/><ellipse cx="12" cy="8.5" rx="3.2" ry="2.2" fill="${color}" ${stroke}/><circle cx="9" cy="14.6" r=".7" fill="${eye}"/><circle cx="18.5" cy="16.1" r=".7" fill="${eye}"/><circle cx="14" cy="8.1" r=".7" fill="${eye}"/>`);
  }
}
