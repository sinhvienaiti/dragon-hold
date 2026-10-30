/**
 * Debut cards (02 §1.5: "loài mới có thẻ góc 3 s … làm gì, khắc chế"): the
 * first time a species walks onto the field a small card in the top-right
 * corner names it, says what it does and what counters it, for 3 s, without
 * pausing. A general's card wears its crown (02 §3.4 intro). Each species is
 * introduced at most SHOWN_MAX times per player (kept in local storage), once
 * a run. Test passes 26–27/10: new foes (Ong Gai, Yêu Rêu Cung, Heo, Sói, G01)
 * came with only "Heo ×1" on the wave card.
 * Owner: ui (LANES.md).
 */
import type { FrameInfo, Presenter } from "../app/contracts";
import { ENEMIES } from "../content/data/enemies";
import { GENERALS } from "../content/data/generals";
import type { FoeId, SimEvent } from "../content/types";
import { safeLocalStorage } from "../kit/platform";
import type { World } from "../sim/world";
import { el, foeIcon, icon, keyLabel, setShown, setText } from "./skin";

/** What each M0 species does and what beats it, in one line each (02 §2, §3; 03 for our side). */
export const DEBUT_LINES: Readonly<Partial<Record<FoeId, { readonly does: string; readonly counter: string }>>> = {
  "moss-grunt": { does: "Walks to the platform and slashes Hỏa Long.", counter: "Type its word; Grove Warden can block it." },
  "thorn-ant": { does: "The swarm shares one word: type it to hit them all.", counter: "Pine Bomb, Fire Breath." },
  "thorn-wasp": { does: "Flies along Sky Lane and fires from 10 m away; ground traps cannot hit it.", counter: "Net Launcher grounds it." },
  "moss-archer": { does: "Stops 12 m away and fires at Hỏa Long until defeated.", counter: "Type it first; Sky Fire hits the group." },
  "tusk-boar": { does: "Marks a red line, then charges the platform.", counter: "Grove Warden blocks it; Spikes slow it." },
  "blight-wolf": { does: "Runs in fast packs and leaps past blockers.", counter: "Spikes slow them; type each wolf early." },
  "moss-banner": { does: "A general that plants a Banner: foes within 5 m deal 25% more damage.", counter: "Type the Banner word to remove it; word chains strip the aura." },
};

/** A card stays this long (02 §1.5: 3 s). */
export const DEBUT_MS = 3000;
/** A queued card older than this is dropped (a general's never): it would name a foe long after it came. */
export const DEBUT_STALE_MS = 6000;
/** Introductions per species per player, across runs. */
export const SHOWN_MAX = 3;
const STORE_KEY = "dragon-hold.debuts";

/** How many times each species was introduced (storage-safe: an unreadable store is empty). */
function readShown(): Record<string, number> {
  try {
    const raw = JSON.parse(safeLocalStorage.getItem(STORE_KEY) ?? "{}") as unknown;
    return raw !== null && typeof raw === "object" ? (raw as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** The species a batch of events brings onto the field for the first time this run, in order. */
export function debutsIn(events: readonly SimEvent[], seen: Set<FoeId>, shown: Readonly<Record<string, number>>): FoeId[] {
  const out: FoeId[] = [];
  for (const event of events) {
    if (event.type !== "spawn" || seen.has(event.foe)) continue;
    seen.add(event.foe);
    if (DEBUT_LINES[event.foe] && (shown[event.foe] ?? 0) < SHOWN_MAX) out.push(event.foe);
  }
  return out;
}

/** A species waiting for its card, and when it was queued (0: stamp it at the next frame). */
export interface QueuedDebut {
  readonly foe: FoeId;
  at: number;
}

/**
 * The next card to show from `queue` at `now`, or null; drops stale cards
 * (a fast-forward or a crowded first peak can queue several: a card naming a
 * foe 10 s after it came reads wrong) but never a general's, and shows a
 * general first so it does not wait behind its escort.
 */
export function nextDebut(queue: QueuedDebut[], now: number): FoeId | null {
  for (let k = queue.length - 1; k >= 0; k -= 1) {
    const item = queue[k]!;
    if (item.at <= 0) item.at = now;
    else if (!(item.foe in GENERALS) && now - item.at > DEBUT_STALE_MS) queue.splice(k, 1);
  }
  if (queue.length === 0) return null;
  const general = queue.findIndex((item) => item.foe in GENERALS);
  return queue.splice(general >= 0 ? general : 0, 1)[0]!.foe;
}

export function createDebutCard(root: HTMLElement): Presenter {
  const doc = root.ownerDocument;
  const card = el(doc, "section", "dh-panel dh-debut");
  card.dataset.ui = "debut";
  // Word tags keep off it (app keep-out rectangles) like the HUD panels.
  card.dataset.keepout = "";
  card.setAttribute("role", "status");
  const head = el(doc, "div", "dh-debut__head");
  const mark = el(doc, "span", "dh-icon dh-debut__icon");
  const kicker = el(doc, "span", "dh-debut__kicker", "");
  const name = el(doc, "span", "dh-title dh-debut__name", "");
  const titleCol = el(doc, "div", "dh-debut__titles");
  titleCol.append(kicker, name);
  head.append(mark, titleCol);
  const does = el(doc, "div", "dh-debut__line", "");
  const counter = el(doc, "div", "dh-debut__line dh-debut__counter", "");
  card.append(head, does, counter);
  setShown(card, false);
  root.append(card);

  let world: World | null = null;
  const seen = new Set<FoeId>();
  const queue: QueuedDebut[] = [];
  let now = 0;
  let showing: FoeId | null = null;
  let until = 0;

  const show = (foe: FoeId, now: number): void => {
    const lines = DEBUT_LINES[foe];
    const general = foe in GENERALS;
    const def = general ? GENERALS[foe as keyof typeof GENERALS] : ENEMIES[foe as keyof typeof ENEMIES];
    if (!lines || !def) return;
    showing = foe;
    until = now + DEBUT_MS;
    mark.innerHTML = general ? icon("crown", { box: 28 }) : foeIcon(def.family, { box: 28 });
    setText(kicker, general ? "New general" : "New foe");
    setText(name, def.nameVi);
    setText(does, lines.does);
    // Skill keys are named the way the HUD shows them (⌥1 on a Mac).
    setText(counter, "Counter: " + lines.counter.replace("Fire Breath", "Fire Breath (" + keyLabel("skill-1") + ")").replace("Sky Fire", "Sky Fire (" + keyLabel("skill-2") + ")"));
    card.classList.toggle("is-general", general);
    card.classList.remove("is-on");
    void card.offsetWidth;
    card.classList.add("is-on");
    setShown(card, true);
    const shown = readShown();
    shown[foe] = (shown[foe] ?? 0) + 1;
    safeLocalStorage.setItem(STORE_KEY, JSON.stringify(shown));
  };

  return {
    onEvents(events: readonly SimEvent[], w: World): void {
      if (w !== world) {
        // A new run: every species may be introduced again (within SHOWN_MAX).
        world = w;
        seen.clear();
        queue.length = 0;
        showing = null;
        setShown(card, false);
      }
      for (const foe of debutsIn(events, seen, readShown())) queue.push({ foe, at: now });
    },
    frame(w: World, info: FrameInfo): void {
      now = info.now;
      if (w.phase === "victory" || w.phase === "defeat") {
        queue.length = 0;
        showing = null;
        setShown(card, false);
        return;
      }
      if (showing !== null && info.now >= until) {
        showing = null;
        setShown(card, false);
      }
      if (showing === null) {
        const next = nextDebut(queue, info.now);
        if (next !== null) show(next, info.now);
      }
    },
    dispose(): void {
      card.remove();
    },
  };
}
