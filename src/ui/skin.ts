/**
 * The carved-wood UI skin (DESIGN.md §1, 05 §4): Cormorant Garamond titles,
 * Be Vietnam Pro battle text, kit/ui semantic colours and --ui scale, and
 * src/ui/styles/dh.css. Installs once at boot. Also the small DOM helpers and
 * authored icons every UI part shares. Buttons never take focus (06 §2 rule 7).
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
import type { Family } from "../content/types";
import art from "./ui-art.json";

const SKIN_FLAG = "dhSkin";

/** Installs fonts, kit tokens and the game stylesheet on `doc`; keeps --ui in step with the viewport. */
export function installSkin(doc: Document): void {
  const root = doc.documentElement;
  root.classList.add("dh-skin");
  if (root.dataset[SKIN_FLAG] === "1") return;
  root.dataset[SKIN_FLAG] = "1";
  const warned = new Set<string>();
  doc.addEventListener("error", (event) => handleArtError(event, warned), true);
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

/** A number with at most one decimal, US style ("1.5"). */
export function viNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded);
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

// ── Authored UI icons; three SVGs still await accepted art. ───────────

const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

const STILL_SVG: Readonly<Record<string, string>> = {
  armour: svg('<path d="M12 2.8 4.5 5.6v6.1c0 4.6 3.1 8 7.5 9.5 4.4-1.5 7.5-4.9 7.5-9.5V5.6z" fill="#8f9aa3" stroke="#2a2420" stroke-width="1.2"/><path d="M12 5.6v13" stroke="#cfd6dc" stroke-width="1.4"/>'),
  dragon: svg('<path d="M4 17c2-1 3-3.5 3-6.5C7 6.5 9.6 4 13 4c2.5 0 4.6 1.4 5.6 3.6L21 8.4l-2 1.6c0 3.6-2.6 6.5-6.2 7l-1.8 3-1.6-2.4L6.5 21z" fill="#e8875a" stroke="#5a1c0c" stroke-width="1.1" stroke-linejoin="round"/><circle cx="15.2" cy="8" r="1.1" fill="#fff1c8"/><path d="M9 9.5c1.5-.6 2.6-.4 3.6.6" stroke="#ffd0a0" stroke-width="1.1" fill="none"/>'),
  "white-dragon": svg('<path d="M4 17c2-1 3-3.5 3-6.5C7 6.5 9.6 4 13 4c2.5 0 4.6 1.4 5.6 3.6L21 8.4l-2 1.6c0 3.6-2.6 6.5-6.2 7l-1.8 3-1.6-2.4L6.5 21z" fill="#eef1f2" stroke="#5a6470" stroke-width="1.1" stroke-linejoin="round"/><circle cx="15.2" cy="8" r="1.1" fill="#5a8ab8"/>'),
};

export interface IconOptions {
  readonly box?: number;
  readonly label?: boolean;
}

const ART_BY_KEY = new Map(art.icons.flatMap((entry) => [entry.name, ...entry.keys].map((key) => [key, entry] as const)));
const escapeAttribute = (text: string): string => text.replace(/[&"<>]/g, (ch) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[ch]!);

/** Markup uses the table alone; later art replacements need no caller changes. */
export function icon(name: string, { box = 20, label = false }: IconOptions = {}): string {
  const entry = ART_BY_KEY.get(name);
  if (!entry) return STILL_SVG[name] ?? "";
  const size = entry.sizes.find((candidate) => candidate >= box * 2.4) ?? entry.sizes[entry.sizes.length - 1]!;
  return `<img class="dh-art" src="/assets/dragon-hold/ui/icons/${entry.name}.${size}.webp?v=${art.version}" width="${box}" height="${box}" alt="${label ? escapeAttribute(entry.alt) : ""}"${label ? "" : ' aria-hidden="true"'} decoding="async" draggable="false" style="--dh-art-box:${box}px">`;
}

/** Kept for callers that read the shared table directly. */
export const ICONS: Readonly<Record<string, string>> = Object.fromEntries([
  ...Object.keys(STILL_SVG).map((name) => [name, icon(name)]),
  ...[...ART_BY_KEY.keys()].map((name) => [name, icon(name)]),
]);
export type IconName = keyof typeof ICONS;

/** Family portraits replace the former gait silhouettes. */
export function foeIcon(family: Family, options?: IconOptions): string {
  return icon("family-" + family, options);
}

interface ArtErrorTarget {
  readonly tagName: string;
  readonly classList?: { contains(name: string): boolean };
  readonly currentSrc?: string;
  readonly src?: string;
  hidden: boolean;
}

/** Capture errors without a DOM dependency; each document warns once per URL. */
export function handleArtError(event: { readonly target: unknown }, warned: Set<string>, warn: (message: string) => void = console.warn): void {
  const image = event.target as ArtErrorTarget | null;
  if (image?.tagName !== "IMG" || !image.classList?.contains("dh-art")) return;
  const url = image.currentSrc || image.src || "";
  if (!warned.has(url)) {
    warned.add(url);
    warn("[ui-art] missing image: " + url);
  }
  image.hidden = true;
}
