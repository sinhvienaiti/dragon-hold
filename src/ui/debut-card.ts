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
  "moss-grunt": { does: "Đi bộ tới bệ rồi chém Hỏa Long.", counter: "Gõ chữ trên đầu nó; Vệ Binh Rêu chặn được." },
  "thorn-ant": { does: "Cả bầy mang một chữ: gõ một lần là trúng cả bầy.", counter: "Bom Hạt Thông, Phun Lửa." },
  "thorn-wasp": { does: "Bay trên Đường Trời, dừng cách bệ 10 m rồi bắn; bẫy sàn không trúng.", counter: "Lưới Phóng kéo nó xuống đất." },
  "moss-archer": { does: "Dừng cách bệ 12 m và bắn Hỏa Long tới khi bị hạ.", counter: "Gõ nó trước; Thiên Hỏa trúng cả nhóm." },
  "tusk-boar": { does: "Báo vạch đỏ rồi húc thẳng vào bệ.", counter: "Vệ Binh Rêu chặn, Gai Chông làm chậm." },
  "blight-wolf": { does: "Chạy nhanh theo bầy, vồ qua lính chặn.", counter: "Gai Chông làm chậm; gõ từng con sớm." },
  "moss-banner": { does: "Tướng địch: cắm cờ, quân trong 5 m quanh cờ đánh mạnh hơn 25 %.", counter: "Gõ chữ trên cờ để nhổ cờ; chuỗi từ làm nó mất hào quang." },
};

/** A card stays this long (02 §1.5: 3 s). */
export const DEBUT_MS = 3000;
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
  const queue: FoeId[] = [];
  let showing: FoeId | null = null;
  let until = 0;

  const show = (foe: FoeId, now: number): void => {
    const lines = DEBUT_LINES[foe];
    const general = foe in GENERALS;
    const def = general ? GENERALS[foe as keyof typeof GENERALS] : ENEMIES[foe as keyof typeof ENEMIES];
    if (!lines || !def) return;
    showing = foe;
    until = now + DEBUT_MS;
    mark.innerHTML = general ? icon("crown") : foeIcon(def.gait, def.show.placeholder.color);
    setText(kicker, general ? "Tướng địch mới" : "Quái mới");
    setText(name, def.nameVi);
    setText(does, lines.does);
    // Skill keys are named the way the HUD shows them (⌥1 on a Mac).
    setText(counter, "Khắc chế: " + lines.counter.replace("Phun Lửa", "Phun Lửa (" + keyLabel("skill-1") + ")").replace("Thiên Hỏa", "Thiên Hỏa (" + keyLabel("skill-2") + ")"));
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
      queue.push(...debutsIn(events, seen, readShown()));
    },
    frame(w: World, info: FrameInfo): void {
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
      // A general goes first: its card should not wait behind its escort's.
      if (showing === null && queue.length > 0) {
        const general = queue.findIndex((foe) => foe in GENERALS);
        const next = queue.splice(general >= 0 ? general : 0, 1)[0]!;
        show(next, info.now);
      }
    },
    dispose(): void {
      card.remove();
    },
  };
}
