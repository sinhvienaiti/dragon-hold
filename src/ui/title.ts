import "./styles/title.css";
import { portalHome } from "../app/portal";
import { el, icon, uiButton } from "./skin";
import table from "./ui-art.json";
import { initialTitleState, reopenTitle, retryTitle, settleTitle, titleAction, wantsRetry, type TitleDeckError, type TitleSource, type TitleStatus } from "./title-state";

export interface TitleArtTable {
  readonly version: number;
  readonly art?: readonly { readonly name: string; readonly alt: string; readonly source: string; readonly width: number; readonly accepted: string | null }[];
}
export interface Title {
  readonly isOpen: boolean;
  readonly state: TitleStatus;
  readonly quickSlot: HTMLElement;
  show(): void;
  /** Quit to title (192): show() refuses a started title; this brings it back ready and shows it. */
  reopen(): void;
  hide(): void;
  settle(source: TitleSource, reason?: TitleDeckError): void;
  handleAction(action: string | null): boolean;
  onShow(fn: () => void): () => void;
  onHide(fn: () => void): () => void;
  setBackdrop(mode: "art" | "live"): void;
  dispose(): void;
}

/** onRetry reloads the words after a deck error; it returns false when no load started. */
export function createTitle(root: HTMLElement, options: { onStart(): void; onRetry?(): boolean | void; art?: TitleArtTable }): Title {
  const doc = root.ownerDocument;
  const art = options.art ?? table;
  const home = portalHome(import.meta.env.VITE_PORTAL_URL);
  let state = initialTitleState(home !== null);
  let open = false, disposed = false, retrying = false;
  const shown = new Set<() => void>(), hidden = new Set<() => void>();
  const warned = new Set<string>();
  const warn = (name: string): void => {
    if (warned.has(name)) return;
    warned.add(name); console.warn("title: missing art", name);
  };
  // Layout lives on .dh-title-screen only; .dh-title keeps the shared heading typography.
  const screen = el(doc, "section", "dh-title-screen dh-title");
  screen.hidden = true;
  screen.dataset.backdrop = "art";
  screen.setAttribute("aria-label", "Dragonhold");
  const logoText = el(doc, "h1", "dh-title__logo-text", "Dragonhold");
  const image = (name: string, cls: string, fail?: () => void, optional = false): HTMLImageElement | null => {
    const entry = art.art?.find(entry => entry.name === name && entry.accepted !== null);
    if (!entry) { if (!optional) warn(name); return null; }
    const node = el(doc, "img", cls);
    node.alt = name === "logo" ? "Dragonhold" : entry.alt;
    node.draggable = false;
    node.addEventListener("error", () => { node.hidden = true; warn(name); fail?.(); });
    node.src = `/assets/dragon-hold/ui/title/${name}.webp?v=${art.version}`;
    return node;
  };
  const backdrop = image("title-backdrop", "dh-title__backdrop");
  const loading = image("loading", "dh-title__backdrop dh-title__loading", undefined, true);
  const logo = image("logo", "dh-title__logo", () => { logoText.hidden = false; });
  logoText.hidden = logo !== null;
  const menu = el(doc, "div", "dh-title__menu");
  const emblem = image("emblem", "dh-title__emblem");
  const start = uiButton(doc, "dh-title__start", () => { if (primary() === start) { select(0); act("enter"); } });
  start.textContent = "Start";
  // The 195 recovery on the title: shown while words are blocked or reloading.
  const retryButton = options.onRetry ? uiButton(doc, "dh-title__retry", () => { select(0); retry(); }) : null;
  let retryLabel = "";
  const status = el(doc, "p", "dh-title__status");
  status.setAttribute("role", "status");
  const progress = el(doc, "progress", "dh-title__progress");
  progress.max = 4;
  progress.setAttribute("aria-label", "Loading progress");
  const error = el(doc, "p", "dh-title__error", "Words could not load");
  error.hidden = true;
  const help = el(doc, "div", "dh-title__help");
  for (const line of [
    "Type the word over a foe and Hỏa Long breathes fire on it.",
    "Place traps, units and houses on the lanes during breaks.",
    "Keep Hỏa Long standing until the last wave ends.",
  ]) help.append(el(doc, "p", "", line));
  if (emblem) menu.append(emblem);
  menu.append(start);
  if (retryButton) menu.append(retryButton);
  menu.append(error, status, progress, help);
  const portal = home ? el(doc, "a", "dh-btn dh-title__portal", "Back to portal") : null;
  if (portal && home) {
    portal.href = home; portal.target = "_top"; portal.tabIndex = -1;
    portal.addEventListener("mousedown", event => event.preventDefault());
    menu.append(portal);
  }
  const quickSlot = el(doc, "div", "dh-title__quick");
  if (backdrop) screen.append(backdrop);
  if (loading) screen.append(loading);
  if (logo) screen.append(logo);
  screen.append(logoText, menu, quickSlot); root.append(screen);

  /** Slot 0: Retry while words are blocked or reloading, else Start; slot 1: the portal. */
  const primary = (): HTMLButtonElement => retryButton && (state.status === "blocked" || retrying) ? retryButton : start;
  const paint = (): void => {
    start.disabled = state.status !== "ready";
    if (retryButton) {
      retryButton.hidden = primary() !== retryButton;
      retryButton.disabled = state.status !== "blocked";
      const label = state.status === "blocked" ? "retry" : "loading";
      if (label !== retryLabel) {
        retryLabel = label;
        if (label === "retry") retryButton.innerHTML = icon("retry") + "Retry";
        else retryButton.textContent = "Loading words…";
      }
    }
    const slots = [primary(), portal];
    for (const node of [start, retryButton, portal]) node?.classList.toggle("is-focused", node === slots[state.focus]);
    error.hidden = state.status !== "blocked";
    const last = state.completed[state.completed.length - 1] ?? "words";
    // While words reload after Retry the line names that wait, not the 197 source count.
    status.textContent = state.status === "blocked"
      ? state.reason === "load-failed" ? "Check your connection and try again." : "Not enough words arrived for this stage."
      : state.status === "ready" || state.status === "started" ? "Press Enter to start"
      : retrying ? "Loading words…"
      : `Loading ${state.completed.length} of 4 · ${last}`;
    progress.value = state.completed.length;
    progress.hidden = state.status !== "loading";
    if (loading && !warned.has("loading")) loading.hidden = state.status !== "loading";
  };
  const select = (index: number): void => { state = { ...state, focus: index }; paint(); };
  const show = (): void => {
    if (disposed || open || state.status === "started") return;
    open = true; screen.hidden = false; shown.forEach(fn => fn());
  };
  const hide = (): void => {
    if (!open) return;
    open = false; screen.hidden = true; hidden.forEach(fn => fn());
  };
  const retry = (): void => {
    if (!open || disposed || !options.onRetry || state.status !== "blocked") return;
    const before = state;
    state = retryTitle(state); retrying = true; paint();
    // The loader refused (busy or closed): stay blocked.
    if (options.onRetry() === false) { state = before; retrying = false; paint(); }
  };
  const act = (action: string | null): void => {
    if (!open || disposed) return;
    if (retryButton && wantsRetry(state, action)) { retry(); return; }
    const next = titleAction(state, action); state = next.state; paint();
    if (next.command === "start") { hide(); options.onStart(); }
    else if (next.command === "portal") portal?.click();
  };
  const hover = (node: HTMLElement | null, index: number, when: () => boolean = () => true): void => {
    for (const event of ["pointerenter", "mouseenter", "focus"]) node?.addEventListener(event, () => { if (when()) select(index); });
  };
  hover(start, 0, () => primary() === start);
  hover(retryButton, 0);
  hover(portal, 1);
  paint();
  return {
    get isOpen() { return open; }, get state() { return state.status; }, quickSlot,
    show,
    reopen() {
      if (disposed) return;
      retrying = false;
      state = reopenTitle(state); paint();
      show();
    },
    hide,
    settle(source, reason) {
      if (disposed) return;
      if (source === "words") retrying = false;
      state = settleTitle(state, source, reason); paint();
    },
    handleAction(action) { if (!open) return false; act(action); return true; },
    onShow(fn) { shown.add(fn); return () => { shown.delete(fn); }; },
    onHide(fn) { hidden.add(fn); return () => { hidden.delete(fn); }; },
    setBackdrop(mode) { screen.dataset.backdrop = mode; },
    dispose() { if (disposed) return; hide(); disposed = true; shown.clear(); hidden.clear(); screen.remove(); },
  };
}
