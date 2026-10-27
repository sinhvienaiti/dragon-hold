/**
 * Wave warning and next-wave card (02 §5.6, 05 §4.2, §4.6): lanes lit,
 * family icons, counts, general crown, flyer wing, a small beat strip showing
 * the peaks; the call-early button (Shift + Enter) in a break, Enter to start
 * in prep (or to end an Easy break). Shown in prep, warning and break, when no
 * foe of a wave is alive; in a wave only a 1.2 s banner at its start.
 * Round 2: the card picks its spot each frame (top left under the HUD, top
 * right, top centre, then the sides) so it never covers a lane or a build
 * slot (screen-zones.ts); without zones (UI preview) it stays at the top centre.
 * Owner: ui (LANES.md).
 */
import type { ActionHandler, CommandSink, FrameInfo, Presenter } from "../app/contracts";
import { ENEMIES } from "../content/data/enemies";
import { GENERALS } from "../content/data/generals";
import { RAGE } from "../content/rules";
import type { FoeId, Family, Gait, GeneralId, MapDef, SimEvent, StageDef } from "../content/types";
import { callEarlyRoom } from "../sim/economy";
import type { World } from "../sim/world";
import { callEarlyBonus, clockSeconds, phaseTicksLeft, upcomingWave } from "./hud";
import { chooseSpot, keepoutRects, zonesFor, type Rect } from "./screen-zones";
import { el, foeIcon, icon, keyLabel, setClass, setShown, setText, uiButton } from "./skin";

// ── Pure summary (tests/ui/wave-card.test.ts) ──────────────────────────────

export interface FoeTally {
  readonly foe: FoeId;
  readonly nameVi: string;
  readonly code: string;
  readonly family: Family;
  readonly gait: Gait;
  readonly color: string;
  count: number;
  readonly general: boolean;
  elite: boolean;
  readonly flyer: boolean;
}

export interface LaneTally {
  readonly id: string;
  readonly nameVi: string;
  readonly sky: boolean;
  readonly foes: FoeTally[];
  count: number;
}

export interface WaveSummary {
  readonly n: number;
  readonly waves: number;
  readonly lanes: readonly LaneTally[];
  /** Heads in the wave (escorts included). */
  readonly total: number;
  readonly flyers: number;
  readonly generals: readonly GeneralId[];
  readonly durationMs: number;
  readonly peaks: readonly { readonly atMs: number; readonly lengthMs: number }[];
  /** Group start times, ms from the wave start. */
  readonly beats: readonly number[];
  readonly breather: boolean;
}

function foeInfo(foe: FoeId): Omit<FoeTally, "count" | "elite"> {
  const general = foe in GENERALS;
  const def = general ? GENERALS[foe as GeneralId] : ENEMIES[foe as Exclude<FoeId, GeneralId>];
  return {
    foe,
    nameVi: def.nameVi,
    code: def.code,
    family: def.family,
    gait: def.gait,
    color: def.show.placeholder.color,
    general,
    flyer: def.gait === "flyer" || def.stance !== "ground",
  };
}

/**
 * A foe's short name on the card: "Yêu Rêu Cung" → "Cung", "Sói Mục" → "Sói";
 * "Yêu Rêu Lính" stays "Yêu Rêu" (test pass 26/10: "Lính" is our Vệ Binh's
 * word, "Lính chặn 2 quái"); a general is "Tướng".
 */
export function shortFoeName(tally: Pick<FoeTally, "nameVi" | "general">): string {
  if (tally.general) return "Tướng";
  if (tally.nameVi === "Yêu Rêu Lính") return "Yêu Rêu";
  const words = tally.nameVi.split(" ");
  return tally.nameVi.startsWith("Yêu Rêu ") ? words.slice(2).join(" ") : words[0] ?? tally.nameVi;
}

/** What wave `n` (1-based) brings, lane by lane in the stage's lane order; null past the last wave. */
export function summarizeWave(stage: StageDef, map: MapDef, n: number): WaveSummary | null {
  const wave = stage.waves[n - 1];
  if (!wave) return null;
  const lanes: LaneTally[] = stage.lanes.map((id) => {
    const ground = map.lanes.find((lane) => lane.id === id);
    const sky = map.sky.find((lane) => lane.id === id);
    return { id, nameVi: (ground ?? sky)?.nameVi ?? id, sky: !ground && Boolean(sky), foes: [], count: 0 };
  });
  const add = (laneId: string, foe: FoeId, count: number, elite: boolean): void => {
    const lane = lanes.find((entry) => entry.id === laneId);
    if (!lane || count <= 0) return;
    let tally = lane.foes.find((entry) => entry.foe === foe);
    if (!tally) {
      tally = { ...foeInfo(foe), count: 0, elite: false };
      lane.foes.push(tally);
    }
    tally.count += count;
    tally.elite ||= elite;
    lane.count += count;
  };
  for (const group of wave.groups) {
    add(group.lane, group.foe, group.count, group.elite === true);
    if (group.escort) add(group.lane, group.escort.foe, group.escort.count, false);
  }
  // Generals named by the wave but not placed in a group still get a crown on the card.
  const generals = [...wave.generals];
  for (const lane of lanes) for (const tally of lane.foes) if (tally.general && !generals.includes(tally.foe as GeneralId)) generals.push(tally.foe as GeneralId);
  // Generals first, then by count.
  for (const lane of lanes) lane.foes.sort((a, b) => Number(b.general) - Number(a.general) || b.count - a.count);
  let total = 0;
  let flyers = 0;
  for (const lane of lanes) {
    total += lane.count;
    for (const tally of lane.foes) if (tally.flyer || lane.sky) flyers += tally.count;
  }
  const beats = [...new Set(wave.groups.map((group) => group.atMs))].sort((a, b) => a - b);
  return { n, waves: stage.waves.length, lanes, total, flyers, generals, durationMs: wave.durationMs, peaks: wave.peaks, beats, breather: wave.breather === true };
}

/** The wave-start banner line (05 §4.6): "Đợt 7 · 2 đường · có tướng địch"; the last wave is "Đợt cuối" (test pass 27/10). */
export function bannerText(summary: WaveSummary): string {
  const ground = summary.lanes.filter((lane) => !lane.sky && lane.count > 0).length;
  const parts = [summary.n === summary.waves && summary.waves > 1 ? "Đợt cuối" : "Đợt " + summary.n];
  if (ground > 0) parts.push(ground + " đường");
  if (summary.flyers > 0) parts.push("có quái bay");
  if (summary.generals.length > 0) parts.push("có tướng địch");
  return parts.join(" · ");
}

// ── The card ────────────────────────────────────────────────────────────────

export function createWaveCard(root: HTMLElement, sink: CommandSink): Presenter & ActionHandler {
  const doc = root.ownerDocument;
  let world: World | null = null;

  const card = el(doc, "section", "dh-panel dh-wave-card");
  card.dataset.ui = "wave-card";
  card.dataset.keepout = "";
  const head = el(doc, "div", "dh-wave-card__head");
  const title = el(doc, "span", "dh-title", "");
  const when = el(doc, "span", "dh-wave-card__when");
  const warns = el(doc, "div", "dh-wave-warns");
  head.append(title, warns);
  const lanesNode = el(doc, "div", "dh-lanes");
  const beat = el(doc, "div", "dh-beat");
  beat.title = "Nhịp đợt: khối sáng là đỉnh, chấm là lúc từng toán vào";
  const foot = el(doc, "div", "dh-wave-card__foot");
  const callButton = uiButton(doc, "dh-call-early", () => callEarly());
  const startButton = uiButton(doc, "dh-start", () => start());
  const hint = el(doc, "span", "dh-wave-card__hint");
  foot.append(startButton, callButton, hint, when);
  card.append(head, lanesNode, beat, foot);

  const banner = el(doc, "div", "dh-panel dh-banner");
  banner.dataset.keepout = "";
  const bannerTitle = el(doc, "span", "dh-title", "");
  banner.append(bannerTitle);
  setShown(card, false);
  setShown(banner, false);
  root.append(card, banner);

  let shownWave = -1;
  let shownStage: StageDef | null = null;
  let bannerTimer = 0;
  /** The spot in use (index into spots()), −1: CSS default. */
  let spot = -1;

  /** Candidate spots for the card, in order of preference (CSS px). */
  const spots = (w: number, h: number, ui: number, vw: number, vh: number): Rect[] => {
    const margin = 16 * ui;
    const gap = 10 * ui;
    const hud = root.querySelector<HTMLElement>(".dh-battle")?.getBoundingClientRect();
    const system = root.querySelector<HTMLElement>(".dh-system")?.getBoundingClientRect();
    const underHud = (hud && hud.height > 0 ? hud.bottom : 12 * ui) + gap;
    const underSystem = (system && system.height > 0 ? system.bottom : 12 * ui) + gap;
    const middle = Math.max(underHud, vh * 0.4 - h / 2);
    return [
      { x: margin, y: underHud, w, h },
      { x: vw - margin - w, y: underSystem, w, h },
      { x: (vw - w) / 2, y: 12 * ui, w, h },
      { x: margin, y: middle, w, h },
      { x: vw - margin - w, y: middle, w, h },
    ];
  };

  /** Moves the card to the first spot that covers no lane, slot or panel (screen-zones.ts). */
  const place = (): void => {
    const view = doc.defaultView;
    const zones = zonesFor(root);
    if (!view || zones === null) {
      if (spot !== -1) {
        spot = -1;
        card.style.left = card.style.top = card.style.translate = "";
      }
      return;
    }
    const ui = Number.parseFloat(view.getComputedStyle(doc.documentElement).getPropertyValue("--ui")) || 1;
    const vw = view.innerWidth;
    const vh = view.innerHeight;
    const list = spots(card.offsetWidth, card.offsetHeight, ui, vw, vh);
    // Thẻ Ôn moves out of the card's way, not the other way round; the wave banner is gone in 1.2 s.
    const panels = keepoutRects(root, card, ".dh-lpanel, .dh-banner");
    spot = chooseSpot(list, zones, panels, { w: vw, h: vh }, spot);
    const at = list[spot]!;
    card.style.left = at.x.toFixed(1) + "px";
    card.style.top = at.y.toFixed(1) + "px";
    card.style.translate = "none";
    card.dataset.spot = String(spot);
  };

  /** The 1.2 s wave banner: top centre unless a lane or slot is there (the north gate where the wave walks in). */
  const placeBanner = (): void => {
    const view = doc.defaultView;
    const zones = zonesFor(root);
    if (!view || zones === null) return;
    const ui = Number.parseFloat(view.getComputedStyle(doc.documentElement).getPropertyValue("--ui")) || 1;
    const vw = view.innerWidth;
    const vh = view.innerHeight;
    const w = banner.offsetWidth;
    const h = banner.offsetHeight;
    const list = spots(w, h, ui, vw, vh);
    // Top centre first for the banner, then the card's own spots.
    const top: Rect = { x: (vw - w) / 2, y: 16 * ui, w, h };
    const all = [top, ...list];
    const pick = chooseSpot(all, zones, keepoutRects(root, banner, ".dh-lpanel, .dh-wave-card"), { w: vw, h: vh });
    const at = all[pick]!;
    banner.style.left = at.x.toFixed(1) + "px";
    banner.style.top = at.y.toFixed(1) + "px";
    banner.style.translate = "none";
  };

  const countNode = (count: number): HTMLElement => {
    const node = el(doc, "span", "dh-foe__count");
    node.append(el(doc, "span", "dh-count-times", "×"), String(count));
    return node;
  };

  const render = (summary: WaveSummary): void => {
    lanesNode.replaceChildren(
      ...summary.lanes.map((lane) => {
        const row = el(doc, "div", "dh-lane" + (lane.count > 0 ? " is-lit" : " is-dark"));
        row.dataset.lane = lane.id;
        const name = el(doc, "span", "dh-lane__name");
        if (lane.sky) name.innerHTML = `<span class="dh-icon">${icon("wing")}</span>`;
        name.append(lane.nameVi);
        const foes = el(doc, "span", "dh-lane__foes");
        if (lane.foes.length === 0) foes.append(el(doc, "span", "dh-wave-card__hint", "Yên"));
        for (const tally of lane.foes) {
          const chip = el(doc, "span", "dh-foe" + (tally.general ? " is-general" : ""));
          chip.title = tally.code + " " + tally.nameVi + (tally.general ? " · tướng địch" : "") + (tally.flyer ? " · bay" : "");
          chip.innerHTML =
            (tally.general ? `<span class="dh-icon dh-foe__mark">${icon("crown")}</span>` : "") +
            `<span class="dh-icon">${foeIcon(tally.gait, tally.color)}</span>` +
            (tally.flyer && !lane.sky ? `<span class="dh-icon dh-foe__mark">${icon("wing")}</span>` : "");
          // The short name beside the icon: a new player reads "Kiến ×6", not only a shape (the title keeps the full name).
          chip.append(el(doc, "span", "dh-foe__name", shortFoeName(tally)), countNode(tally.count));
          foes.append(chip);
        }
        row.append(name, foes);
        return row;
      }),
    );
    const warnNodes: HTMLElement[] = [];
    if (summary.flyers > 0) {
      const skyNames = summary.lanes.filter((lane) => lane.sky && lane.count > 0).map((lane) => lane.nameVi);
      const warn = el(doc, "span", "dh-warn");
      warn.dataset.warn = "flyer";
      warn.title = "Quái bay ×" + summary.flyers + (skyNames.length ? " trên " + skyNames.join(", ") : "") + ": bẫy sàn không trúng, dùng Lưới Phóng";
      warn.innerHTML = `<span class="dh-icon">${icon("wing")}</span>`;
      warn.append("Quái bay ", countNode(summary.flyers));
      warnNodes.push(warn);
    }
    if (summary.generals.length > 0) {
      const warn = el(doc, "span", "dh-warn");
      warn.dataset.warn = "general";
      warn.title = "Tướng địch: " + summary.generals.map((general) => GENERALS[general].nameVi).join(", ");
      warn.innerHTML = `<span class="dh-icon">${icon("crown")}</span>`;
      if (summary.generals.length > 1) warn.append("Tướng ", countNode(summary.generals.length));
      else warn.append("Tướng địch");
      warnNodes.push(warn);
    }
    // "Đợt thở" (02 §5.1) is the design's word; on the card it read as "a breathing wave", so the player sees "Đợt nhẹ".
    if (summary.breather) {
      const warn = el(doc, "span", "dh-warn", "Đợt nhẹ");
      warn.title = "Đợt nhẹ hơn sau tướng địch: quái đến thưa hơn, kịp bày lại binh";
      warnNodes.push(warn);
    }
    warns.replaceChildren(...warnNodes);
    setShown(warns, warnNodes.length > 0);

    const span = Math.max(1, summary.durationMs);
    const pct = (ms: number): string => Math.max(0, Math.min(100, (ms / span) * 100)).toFixed(2) + "%";
    beat.replaceChildren(
      ...summary.peaks.map((peak) => {
        const node = el(doc, "span", "dh-beat__peak");
        node.style.left = pct(peak.atMs);
        node.style.width = pct(peak.lengthMs);
        return node;
      }),
      ...summary.beats.map((atMs) => {
        const node = el(doc, "span", "dh-beat__dot");
        node.style.left = pct(atMs);
        return node;
      }),
      el(doc, "span", "dh-beat__scale", "0 s"),
      el(doc, "span", "dh-beat__scale dh-beat__scale--end", Math.round(summary.durationMs / 1000) + " s"),
    );
    setShown(beat, summary.peaks.length > 0 || summary.beats.length > 0);
  };

  function callEarly(): boolean {
    if (!world || world.phase !== "break" || world.phaseEndsAt < 0) return false;
    sink({ type: "call-early" });
    return true;
  }

  function start(): boolean {
    if (!world) return false;
    if (world.phase === "prep") {
      sink({ type: "start" });
      return true;
    }
    if (world.phase === "break" && world.phaseEndsAt < 0) {
      sink({ type: "continue" });
      return true;
    }
    return false;
  }

  const frame = (w: World, _info: FrameInfo): void => {
    world = w;
    const phase = w.phase;
    const visible = phase === "prep" || phase === "warning" || phase === "break";
    setShown(card, visible);
    if (!visible) return;
    const n = upcomingWave(w);
    if (n !== shownWave || w.stage !== shownStage) {
      shownWave = n;
      shownStage = w.stage;
      const summary = summarizeWave(w.stage, w.map, n);
      if (summary) render(summary);
    }
    setText(title, "Đợt " + n + "/" + w.stage.waves.length);
    setClass(card, "is-warning", phase === "warning");
    const left = phaseTicksLeft(w);
    let whenHtml = "";
    if (phase === "prep") whenHtml = "Bày binh";
    else if (phase === "warning") whenHtml = `tới sau <b>${clockSeconds(left ?? 0)} s</b>`;
    else whenHtml = left === null ? "chờ bạn" : `sau <b>${clockSeconds(left)} s</b>`;
    if (when.innerHTML !== whenHtml) when.innerHTML = whenHtml;

    const easyBreak = phase === "break" && left === null;
    setShown(startButton, phase === "prep" || easyBreak);
    const startHtml = `<span class="dh-key">${keyLabel("enter")}</span>` + (phase === "prep" ? "Bắt đầu ải" : "Vào đợt " + n);
    if (startButton.innerHTML !== startHtml) startButton.innerHTML = startHtml;
    setShown(callButton, phase === "break" && !easyBreak);
    if (phase === "break" && left !== null) {
      // The stage's call-early gold can run out (00 §4.9's 15 % pool): then only the rage is offered (test pass 27/10).
      const bonus = callEarlyBonus(left, callEarlyRoom(w));
      const gains = [...(bonus > 0 ? [`<span class="dh-bonus">+${bonus} vàng</span>`] : []), ...(w.stage.unlocks.rage ? [`+${RAGE.callEarlyX10 / 10} Long Nộ`] : [])];
      const callHtml = `<span class="dh-key">${keyLabel("call-early")}</span>Gọi sớm` + (gains.length > 0 ? " " + gains.join(" · ") : "");
      if (callButton.innerHTML !== callHtml) callButton.innerHTML = callHtml;
    }
    const hintText = phase === "warning" ? "Quái sắp vào từ các đường sáng" : phase === "prep" ? "Đặt bẫy, lính, nhà trước" : "";
    setText(hint, hintText);
    setShown(hint, hintText !== "");
    place();
  };

  const onEvents = (events: readonly SimEvent[], w: World): void => {
    world = w;
    for (const event of events) {
      if (event.type !== "wave-start") continue;
      const summary = summarizeWave(w.stage, w.map, event.wave);
      setText(bannerTitle, summary ? bannerText(summary) : "Đợt " + event.wave);
      // The last wave's banner is larger and stays twice as long.
      const final = event.wave === w.stage.waves.length && w.stage.waves.length > 1;
      setClass(banner, "is-final", final);
      setShown(banner, true);
      placeBanner();
      banner.classList.remove("is-on");
      void banner.offsetWidth;
      banner.classList.add("is-on");
      const view = doc.defaultView;
      if (view) {
        view.clearTimeout(bannerTimer);
        bannerTimer = view.setTimeout(() => setShown(banner, false), final ? 2400 : 1200);
      }
    }
  };

  const handleAction = (action: string): boolean => {
    if (action === "call-early") return callEarly();
    if (action === "enter") return start();
    return false;
  };

  return {
    onEvents,
    frame,
    handleAction,
    dispose(): void {
      doc.defaultView?.clearTimeout(bannerTimer);
      card.remove();
      banner.remove();
    },
  };
}
