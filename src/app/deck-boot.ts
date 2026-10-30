import type { StageDef, WordDeck } from "../content/types";
import { el, icon } from "../ui/skin";
import { DeckBuildError, type LearningClient } from "./learning";
import { portalHome } from "./portal";

/** Owns pre-router input and the single deck-to-boot transition. */
export function startDeckBoot(root: HTMLElement, notice: HTMLElement, learning: Pick<LearningClient, "buildDeck">, stage: StageDef, ready: (deck: WordDeck) => void): { dispose(): void } {
  const doc = root.ownerDocument;
  const view = doc.defaultView!;
  let panel: HTMLElement | null = null;
  let retry: HTMLButtonElement | null = null;
  let actions: HTMLElement[] = [];
  let busy = false;
  let closed = false;
  let index = 0;

  const onKey = (event: KeyboardEvent): void => {
    if (closed || !panel || !["Enter", "Tab", "ArrowLeft", "ArrowRight"].includes(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    if (event.code === "Enter") actions[index]?.click();
    else {
      const delta = event.code === "ArrowLeft" || (event.code === "Tab" && event.shiftKey) ? -1 : 1;
      index = (index + delta + actions.length) % actions.length;
      actions[index]?.focus();
    }
  };
  const dispose = (): void => {
    closed = true;
    view.removeEventListener("keydown", onKey, true);
    panel?.remove();
  };
  const show = (error: DeckBuildError): void => {
    if (!panel) {
      notice.remove();
      panel = el(doc, "section", "dh-panel dh-deck-notice");
      panel.setAttribute("role", "alertdialog");
      panel.setAttribute("aria-modal", "true");
      panel.setAttribute("aria-labelledby", "dh-deck-notice-title");
      panel.setAttribute("aria-describedby", "dh-deck-notice-lead");
      const title = el(doc, "h1", "dh-pausemenu__title dh-deck-notice__title", "Words could not load");
      title.id = "dh-deck-notice-title";
      lead = el(doc, "p", "dh-deck-notice__lead");
      lead.id = "dh-deck-notice-lead";
      const row = el(doc, "div", "dh-deck-notice__actions");
      retry = el(doc, "button", "dh-btn dh-deck-notice__retry");
      retry.type = "button";
      retry.addEventListener("click", () => { void load(); });
      row.append(retry);
      actions = [retry];
      const home = portalHome(import.meta.env.VITE_PORTAL_URL);
      if (home) {
        const portal = el(doc, "a", "dh-btn dh-deck-notice__portal", "Back to portal");
        portal.href = home;
        portal.target = "_top";
        row.append(portal);
        actions.push(portal);
      }
      // Track pointer/native focus too, so Enter always activates the focused action.
      actions.forEach((action, i) => action.addEventListener("focus", () => { index = i; }));
      panel.append(title, lead, row);
      root.append(panel);
      view.addEventListener("keydown", onKey, true);
    }
    lead!.textContent = error.reason === "load-failed" ? "Check your connection and try again." : "Not enough words arrived for this stage.";
    retry!.disabled = false;
    retry!.innerHTML = icon("retry") + "Retry";
    index = 0;
    retry!.focus();
  };
  let lead: HTMLElement | null = null;
  const load = async (): Promise<void> => {
    if (closed || busy) return;
    busy = true;
    if (retry) { retry.disabled = true; retry.textContent = "Loading words…"; }
    let built: WordDeck;
    try {
      built = await learning.buildDeck(stage);
    } catch (error) {
      busy = false;
      if (!closed) show(error instanceof DeckBuildError ? error : new DeckBuildError("load-failed", 0));
      return;
    }
    busy = false;
    if (closed) return;
    notice.remove();
    dispose();
    ready(built);
  };
  void load();
  return { dispose };
}
