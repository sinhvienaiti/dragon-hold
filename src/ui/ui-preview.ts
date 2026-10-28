/**
 * UI preview page (?view=ui): the HUD, wave card, carry strip, placement and
 * results over a flat 2D map, fed by a mock world (previewWorld: only the
 * fields the UI reads, set by hand per scene) and mock events, with a small
 * key router on the 00 §6 table. It never loads the sim systems, so it works
 * while they are being built.
 * Dev only: scripts/visual/scenarios/ui-preview.mjs switches scenes through
 * window.__dhUi and takes the screenshots. Commands go to a stand-in sink that
 * changes the mock world just enough to show the result; the real rules live
 * in src/sim. The learning frame and word tags drawn here are stand-ins too
 * (typing-learning owns them), only to check the HUD keeps clear of them.
 * Owner: ui (LANES.md).
 */
import type { ActionHandler, FrameInfo, Presenter, Projector, ScreenPoint } from "../app/contracts";
import { CONSUMABLES, HERO_UPGRADES } from "../content/data/our-side";
import { ENEMIES } from "../content/data/enemies";
import { MAPS } from "../content/data/maps";
import { STAGE_M0 } from "../content/data/stages";
import { ECONOMY, FIRE_DRAGON, FLOW, HERO_SKILLS, KEYS, OUR_SIDE, gPm } from "../content/rules";
import type { EnemyId, FoeId, PlaceableId, SimCommand, SimEvent, SpawnGroupDef, StageDef, Vec2, WaveDef, WordGroup, WordKind } from "../content/types";
import type { EventBody } from "../sim/events";
import type { PlaceCheck, SlotState } from "../sim/placement";
import type { World } from "../sim/world";
import { LEARNING_FRAME_CLASSES } from "../kit/ui";
import { callEarlyBonus, createHud, phaseTicksLeft } from "./hud";
import { createPlacementUi, placeableInfo, sellRefund, upgradeCost, type PlacementRules } from "./placement-ui";
import { createResults } from "./results";
import { createShopStrip } from "./shop-strip";
import { el, installSkin } from "./skin";
import { createWaveCard } from "./wave-card";

// ── A stage with groups, for the card (sim-battle authors the real ones) ──

const g = (atMs: number, lane: string, foe: FoeId, count: number, extra: Partial<SpawnGroupDef> = {}): SpawnGroupDef => ({
  atMs,
  lane,
  shape: count > 1 ? "line" : "single",
  foe,
  count,
  ...extra,
});

const PREVIEW_GROUPS: readonly (readonly SpawnGroupDef[])[] = [
  [g(0, "cau", "moss-grunt", 3), g(9000, "suoi", "thorn-ant", 6, { shape: "cluster" }), g(21000, "cau", "moss-grunt", 4)],
  [g(0, "cau", "moss-grunt", 3), g(6000, "suoi", "thorn-ant", 8, { shape: "cluster" }), g(18000, "cau", "moss-archer", 2)],
  [g(0, "suoi", "moss-grunt", 4), g(8000, "cau", "blight-wolf", 3, { shape: "pair" }), g(26000, "cau", "moss-archer", 2)],
  [g(0, "cau", "moss-grunt", 5), g(7000, "suoi", "moss-archer", 2), g(15000, "troi", "thorn-wasp", 3, { shape: "flight" }), g(30000, "cau", "tusk-boar", 1)],
  [g(0, "suoi", "blight-wolf", 3), g(10000, "cau", "moss-banner", 1, { shape: "escort", escort: { foe: "moss-grunt", count: 4 } }), g(24000, "troi", "thorn-wasp", 2, { shape: "flight" })],
  [g(0, "cau", "thorn-ant", 8, { shape: "cluster" }), g(12000, "suoi", "moss-grunt", 4)],
  [g(0, "suoi", "moss-grunt", 5), g(9000, "cau", "tusk-boar", 2), g(20000, "troi", "thorn-wasp", 3, { shape: "flight" })],
  [g(0, "cau", "blight-wolf", 4, { shape: "pair" }), g(11000, "suoi", "moss-archer", 3), g(26000, "suoi", "thorn-ant", 10, { shape: "cluster" })],
  [g(0, "cau", "moss-grunt", 6), g(8000, "suoi", "tusk-boar", 2), g(16000, "troi", "thorn-wasp", 4, { shape: "flight" })],
  [g(0, "suoi", "blight-wolf", 4), g(8000, "cau", "moss-banner", 1, { shape: "escort", escort: { foe: "moss-archer", count: 4 } }), g(22000, "troi", "thorn-wasp", 4, { shape: "flight" })],
];

export const PREVIEW_STAGE: StageDef = {
  ...STAGE_M0,
  waves: STAGE_M0.waves.map((wave: WaveDef, index): WaveDef => ({
    ...wave,
    peaks: wave.peaks.length > 0 ? wave.peaks : [{ atMs: 10_000, lengthMs: 8000 }, { atMs: Math.round(wave.durationMs * 0.62), lengthMs: 9000 }],
    groups: wave.groups.length > 0 ? wave.groups : PREVIEW_GROUPS[index] ?? [],
  })),
};

// ── A mock world: only what the UI reads, so the page loads while sim systems are still being built ──

/** A fresh mock world in prep for `stage` (real worlds come from sim/world createWorld). */
export function previewWorld(stage: StageDef = PREVIEW_STAGE): World {
  const map = MAPS[stage.mapId]!;
  const slots = map.slots.map((def, index) => ({
    index, def, x: Math.round(def.pos[0] * 60_000), z: Math.round(def.pos[1] * 60_000),
    lane: def.lane === undefined ? -1 : stage.lanes.indexOf(def.lane), along: def.atM === undefined ? 0 : Math.round(def.atM * 60_000),
    item: null, level: 0, spent: 0, boughtInBreak: -1, activeAt: 0,
  })) as unknown as SlotState[];
  const hp = Math.round((FIRE_DRAGON.hp * gPm(stage.chapter)) / 1000);
  const world = {
    stage, map, seed: stage.seed, difficulty: "normal", tick: 0, phase: "prep", phaseEndsAt: -1, wave: 0,
    hero: { hp, hpMax: hp, shield: 0, armour: FIRE_DRAGON.armour, resist: FIRE_DRAGON.resist, level: 1, xp: 0, statuses: {} },
    guide: { hp: 700, hpMax: 700, downUntil: -1 },
    combat: { strikes: [], readyAt: { breath: 0, skyfire: 0, roar: 0, inferno: 0 }, rage: 0, lastUltAt: -1, infernoUntil: -1, urgentUsed: false },
    words: { live: [], lock: -1, chain: 0 },
    slots,
    traps: { list: [] }, houses: { list: [] }, units: { list: [] },
    shop: { held: {} as Record<string, number>, heroBuys: {} as Record<string, number>, consumableReadyAt: 0, breakNo: 0, quickPlaced: 0 },
    economy: { gold: ECONOMY.startGold, budget: 0, killPaid: 0, waveEndPaid: 0, otherPaid: 0 },
    stats: { keys: 0, wrongKeys: 0, strayKeys: 0, words: 0, grades: [0, 0, 0, 0, 0], goldEarned: 0, goldSpent: 0, kills: 0 },
  };
  return world as unknown as World;
}

// ── Stand-in placement rules (sim-ourside owns the real ones) ─────────────

export const PREVIEW_RULES: PlacementRules = {
  canPlace(world: World, item: PlaceableId, index: number): PlaceCheck {
    const slot = world.slots[index];
    if (!slot) return { ok: false, reason: "unknown-slot" };
    const info = placeableInfo(item);
    if (slot.def.kind !== info.slot) return { ok: false, reason: "slot-kind" };
    if (slot.item !== null) return { ok: false, reason: "occupied" };
    if (world.phase !== "prep" && world.phase !== "break") return { ok: false, reason: "phase" };
    if (world.economy.gold < info.cost) return { ok: false, reason: "gold" };
    return { ok: true };
  },
  suggestedSlots(world: World, item: PlaceableId): number[] {
    const kind = placeableInfo(item).slot;
    const free = world.slots.filter((slot) => slot.def.kind === kind && slot.item === null);
    // Lane slots by lane, then from the gate inwards; pads inner ring first.
    return free
      .sort((a, b) => (a.lane - b.lane) || (kind === "house" ? Math.abs(a.x) + Math.abs(a.z) - (Math.abs(b.x) + Math.abs(b.z)) : a.along - b.along))
      .map((slot) => slot.index);
  },
};

// ── Flat projector over the default camera (05 §3: FOV 30°, pitch 55°) ────

export function previewProjector(view: Window, camera: { yawDeg: number; pitchDeg: number; distanceM: number }, fovDeg = 30): Projector {
  const yaw = (camera.yawDeg * Math.PI) / 180;
  const pitch = (camera.pitchDeg * Math.PI) / 180;
  const d = camera.distanceM;
  const cx = Math.sin(yaw) * Math.cos(pitch) * d;
  const cz = Math.cos(yaw) * Math.cos(pitch) * d;
  const cy = Math.sin(pitch) * d;
  const fx = -cx / d;
  const fy = -cy / d;
  const fz = -cz / d;
  const rl = Math.hypot(fz, fx) || 1;
  const rx = -fz / rl;
  const rz = fx / rl;
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const t = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  return (x: number, y: number, z: number, out: ScreenPoint): ScreenPoint => {
    const w = view.innerWidth;
    const h = view.innerHeight;
    const vx = x - cx;
    const vy = y - cy;
    const vz = z - cz;
    const xc = vx * rx + vz * rz;
    const yc = vx * ux + vy * uy + vz * uz;
    const zc = vx * fx + vy * fy + vz * fz;
    out.x = w / 2 + (xc / (zc * t)) * (h / 2);
    out.y = h / 2 - (yc / (zc * t)) * (h / 2);
    out.visible = zc > 0.1 && out.x >= 0 && out.x <= w && out.y >= 0 && out.y <= h;
    return out;
  };
}

// ── Sample words for the results list ───────────────────────────────────────

const WORDS: readonly { text: string; vi: string; ipa: string; group: WordGroup }[] = [
  { text: "bridge", vi: "cây cầu", ipa: "/brɪdʒ/", group: "new" },
  { text: "honey", vi: "mật ong", ipa: "/ˈhʌni/", group: "new" },
  { text: "valley", vi: "thung lũng", ipa: "/ˈvæli/", group: "new" },
  { text: "forest", vi: "khu rừng", ipa: "/ˈfɔːrɪst/", group: "learning" },
  { text: "river", vi: "con sông", ipa: "/ˈrɪvər/", group: "due" },
  { text: "stone", vi: "hòn đá", ipa: "/stoʊn/", group: "known" },
  { text: "arrow", vi: "mũi tên", ipa: "/ˈæroʊ/", group: "learning" },
  { text: "shield", vi: "cái khiên", ipa: "/ʃiːld/", group: "due" },
  { text: "banner", vi: "lá cờ", ipa: "/ˈbænər/", group: "learning" },
  { text: "wolf", vi: "con sói", ipa: "/wʊlf/", group: "known" },
  { text: "leaf", vi: "chiếc lá", ipa: "/liːf/", group: "known" },
  { text: "dragon", vi: "con rồng", ipa: "/ˈdræɡən/", group: "known" },
  { text: "village", vi: "ngôi làng", ipa: "/ˈvɪlɪdʒ/", group: "due" },
  { text: "thunder", vi: "sấm", ipa: "/ˈθʌndər/", group: "new" },
];

// ── The preview ─────────────────────────────────────────────────────────────

export type PreviewScene = "prep" | "break" | "breather" | "placing" | "edit" | "warning" | "wave" | "low" | "victory" | "defeat";

export interface PreviewHandle {
  scene(name: PreviewScene, options?: { freeze?: boolean }): void;
  readonly commands: SimCommand[];
  readonly actions: string[];
  state(): { phase: string; gold: number; tick: number; placement: string; slots: (string | null)[]; held: Record<string, number> };
  setFreeze(freeze: boolean): void;
}

declare global {
  interface Window {
    __dhUi?: PreviewHandle;
  }
}

/** Starts the UI preview in `doc` (clears the overlay); returns the handle also put on window.__dhUi. */
export function startUiPreview(doc: Document = document): PreviewHandle {
  installSkin(doc);
  const view = doc.defaultView!;
  const overlay = doc.getElementById("dh-overlay") ?? doc.body;
  const canvasHost = doc.getElementById("dh-canvas") ?? doc.body;
  overlay.replaceChildren();
  doc.title = "Dragonhold · UI preview";

  let world = previewWorld();
  const project = previewProjector(view, world.map.camera);
  const commands: SimCommand[] = [];
  const actionLog: string[] = [];
  let pending: SimEvent[] = [];
  const emit = (event: EventBody): void => {
    pending.push({ ...event, tick: world.tick } as SimEvent);
  };

  // Backdrop: the map drawn flat (preview only; the real view is WebGL).
  const canvas = el(doc, "canvas");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.dataset.fake = "backdrop";
  canvasHost.replaceChildren(canvas);

  // Stand-ins owned by typing-learning: a learning frame and a few word tags.
  const frameStub = el(doc, "div", LEARNING_FRAME_CLASSES.root);
  frameStub.dataset.fake = "learning-frame";
  frameStub.innerHTML =
    `<div class="${LEARNING_FRAME_CLASSES.word}"><span class="${LEARNING_FRAME_CLASSES.typed}">fo</span>rest</div>` +
    `<div class="${LEARNING_FRAME_CLASSES.ipa}">/ˈfɔːrɪst/</div><div class="${LEARNING_FRAME_CLASSES.meaning}">khu rừng</div>` +
    `<div class="${LEARNING_FRAME_CLASSES.recent}">Learned: bridge · honey · valley</div>`;
  const tagLayer = el(doc, "div");
  tagLayer.dataset.fake = "tags";
  tagLayer.style.position = "absolute";
  tagLayer.style.inset = "0";
  tagLayer.style.pointerEvents = "none";
  overlay.append(tagLayer, frameStub);

  const sink = (command: SimCommand): void => {
    commands.push(command);
    applyMock(command);
  };

  const placement = createPlacementUi(overlay, project, sink, { rules: PREVIEW_RULES });
  const hud = createHud(overlay, sink, { onPause: () => hud.toast("Paused (preview)"), onCameraReset: () => hud.toast("Reset camera") });
  const waveCard = createWaveCard(overlay, sink);
  const strip = createShopStrip(overlay, sink, { placement, rules: PREVIEW_RULES });
  const gloss = (text: string) => {
    const word = WORDS.find((entry) => entry.text === text);
    return word ? { vi: word.vi, ipa: word.ipa } : null;
  };
  const results = createResults(overlay, { retry: () => scene("prep"), listen: (text) => actionLog.push("listen:" + text), gloss });
  const presenters: Presenter[] = [placement, hud, waveCard, strip, results];
  const handlers: ActionHandler[] = [results, placement, strip, waveCard, hud];

  // ── Stand-in sink: just enough state change to see each command land ──
  function applyMock(command: SimCommand): void {
    const w = world;
    const spend = (amount: number, reason: "build" | "upgrade" | "buy"): boolean => {
      if (w.economy.gold < amount) {
        emit({ type: "rejected", command: command.type, reason: "gold" });
        return false;
      }
      w.economy.gold -= amount;
      emit({ type: "gold", delta: -amount, total: w.economy.gold, reason });
      return true;
    };
    switch (command.type) {
      case "place": {
        const index = w.slots.findIndex((slot) => slot.def.id === command.slot);
        const slot = w.slots[index];
        const check = PREVIEW_RULES.canPlace(w, command.item, index);
        if (!slot || !check.ok) {
          emit({ type: "rejected", command: "place", reason: check.ok ? "unknown-slot" : check.reason });
          return;
        }
        const cost = placeableInfo(command.item).cost;
        if (!spend(cost, "build")) return;
        slot.item = command.item;
        slot.level = 1;
        slot.spent = cost;
        slot.boughtInBreak = w.shop.breakNo;
        emit({ type: "built", slot: index, item: command.item, level: 1 });
        return;
      }
      case "upgrade": {
        const index = w.slots.findIndex((slot) => slot.def.id === command.slot);
        const slot = w.slots[index];
        if (!slot || !slot.item) return;
        const cost = upgradeCost(slot.item, slot.level);
        if (cost === null) {
          emit({ type: "rejected", command: "upgrade", reason: "max-level" });
          return;
        }
        if (!spend(cost, "upgrade")) return;
        slot.level += 1;
        slot.spent += cost;
        emit({ type: "upgraded", slot: index, item: slot.item, level: slot.level });
        return;
      }
      case "sell": {
        const index = w.slots.findIndex((slot) => slot.def.id === command.slot);
        const slot = w.slots[index];
        if (!slot || !slot.item) return;
        const refund = sellRefund(w, index);
        const item = slot.item;
        w.economy.gold += refund;
        slot.item = null;
        slot.level = 0;
        slot.spent = 0;
        emit({ type: "gold", delta: refund, total: w.economy.gold, reason: "sell" });
        emit({ type: "sold", slot: index, item, refund });
        return;
      }
      case "buy": {
        if (command.item in CONSUMABLES) {
          const id = command.item as keyof typeof CONSUMABLES;
          const held = Object.values(w.shop.held).reduce((a, b) => a + b, 0);
          if (held >= OUR_SIDE.consumableSlots * CONSUMABLES[id].stackMax) {
            emit({ type: "rejected", command: "buy", reason: "full" });
            return;
          }
          if (!spend(CONSUMABLES[id].cost, "buy")) return;
          w.shop.held[id] = (w.shop.held[id] ?? 0) + 1;
          emit({ type: "bought", item: id, count: w.shop.held[id]! });
        } else {
          const id = command.item as keyof typeof HERO_UPGRADES;
          const bought = w.shop.heroBuys[id] ?? 0;
          const price = HERO_UPGRADES[id].costs[bought];
          if (price === undefined) {
            emit({ type: "rejected", command: "buy", reason: "limit" });
            return;
          }
          if (!spend(price, "buy")) return;
          w.shop.heroBuys[id] = bought + 1;
          if (id === "hard-scale") w.hero.armour += 15;
          else {
            const gain = Math.round(w.hero.hpMax / 10);
            w.hero.hpMax += gain;
            w.hero.hp += gain;
          }
          emit({ type: "bought", item: id, count: bought + 1 });
        }
        return;
      }
      case "skill": {
        if (command.skill === "inferno") {
          if (w.combat.rage < 1000) {
            emit({ type: "rejected", command: "skill", reason: "rage" });
            return;
          }
          w.combat.rage = 0;
          w.combat.infernoUntil = w.tick + 600;
          w.combat.lastUltAt = w.tick;
        } else {
          if (w.combat.readyAt[command.skill] > w.tick) {
            emit({ type: "rejected", command: "skill", reason: "cooldown" });
            return;
          }
          const spec = HERO_SKILLS[command.skill];
          w.combat.readyAt[command.skill] = w.tick + Math.round((("cooldownMs" in spec ? spec.cooldownMs : 0) * 60) / 1000);
        }
        emit({ type: "skill", skill: command.skill, stage: "cast", x: 0, z: 0 });
        return;
      }
      case "consumable": {
        if (w.shop.consumableReadyAt > w.tick) {
          emit({ type: "rejected", command: "consumable", reason: "cooldown" });
          return;
        }
        const n = w.shop.held[command.item] ?? 0;
        if (n <= 0) return;
        w.shop.held[command.item] = n - 1;
        w.shop.consumableReadyAt = w.tick + Math.round((OUR_SIDE.consumableCooldownMs * 60) / 1000);
        w.hero.hp = Math.min(w.hero.hpMax, w.hero.hp + Math.round(w.hero.hpMax / 4));
        emit({ type: "consumable", item: command.item, x: 0, z: 0 });
        return;
      }
      case "call-early": {
        const left = phaseTicksLeft(w) ?? 0;
        const bonus = callEarlyBonus(left);
        w.economy.gold += bonus;
        emit({ type: "gold", delta: bonus, total: w.economy.gold, reason: "call-early" });
        w.combat.rage = Math.min(1000, w.combat.rage + 50);
        w.phase = "warning";
        w.phaseEndsAt = w.tick + Math.round((FLOW.warningMs * 60) / 1000);
        emit({ type: "phase", phase: "warning", wave: w.wave + 1, endsAtTick: w.phaseEndsAt });
        return;
      }
      case "start":
      case "continue": {
        w.phase = "warning";
        w.phaseEndsAt = w.tick + Math.round((FLOW.warningMs * 60) / 1000);
        emit({ type: "phase", phase: "warning", wave: w.wave + 1, endsAtTick: w.phaseEndsAt });
        return;
      }
      default:
        return;
    }
  }

  // ── Scenes ──
  let freeze = true;
  const setSlot = (id: string, item: PlaceableId, level: number, spent: number, boughtInBreak = 1): void => {
    const slot = world.slots.find((entry) => entry.def.id === id);
    if (!slot) return;
    slot.item = item;
    slot.level = level;
    slot.spent = spent;
    slot.boughtInBreak = boughtInBreak;
  };

  const midRun = (wave: number): void => {
    world.tick = 60 * 60 * wave;
    world.wave = wave;
    world.economy.gold = 245;
    world.hero.hpMax = 1020;
    world.hero.hp = 796;
    world.hero.level = 3;
    world.hero.xp = 62;
    world.words.chain = 12;
    world.combat.rage = 640;
    world.combat.readyAt.breath = world.tick + 6 * 60;
    world.shop.held["small-potion"] = 2;
    world.shop.heroBuys["dragon-heart"] = 1;
    world.shop.breakNo = 3;
    setSlot("cau-t2", "spikes", 2, 85);
    setSlot("cau-b2", "moss-warden", 1, 70);
    setSlot("h-ne", "herb-hut", 1, 120, 3);
    setSlot("suoi-t2", "pine-bomb", 1, 90);
  };

  const feedWords = (): void => {
    WORDS.forEach((word, index) => {
      const kind: WordKind = word.text === "banner" ? "general" : "enemy";
      emit({ type: "word-assigned", word: index, text: word.text, kind, group: word.group, target: null, firstTier: 1 });
      const errors = word.text === "valley" || word.text === "river" ? 2 : word.text === "arrow" ? 1 : 0;
      emit({
        type: "word-complete", word: index, text: word.text, kind, grade: errors >= 2 ? "sloppy" : errors === 1 ? "ok" : index % 3 === 0 ? "flash" : "perfect",
        errors, keyTicks: 60, responseMs: 900, target: null, activity: "typing-enemy", scored: true, hintUsed: word.text === "thunder",
      });
    });
    world.stats.keys = 412;
    world.stats.wrongKeys = 23;
    world.stats.words = 131;
    world.stats.goldEarned = 1340;
  };

  const placeTags = (): void => {
    // Stand-in tags on foes walking the lanes (typing-learning draws the real ones).
    const foes: { pos: Vec2; text: string; foe: EnemyId }[] = [
      { pos: [5, -22.5], text: "forest", foe: "moss-grunt" },
      { pos: [3.4, -18], text: "arrow", foe: "moss-archer" },
      { pos: [-24, 4.2], text: "honey", foe: "thorn-ant" },
      { pos: [-15, 1.2], text: "river", foe: "blight-wolf" },
      { pos: [20, -7], text: "shield", foe: "thorn-wasp" },
      { pos: [1.4, -11], text: "stone", foe: "tusk-boar" },
    ];
    const p: ScreenPoint = { x: 0, y: 0, visible: false };
    tagLayer.replaceChildren(
      ...foes.map((foe) => {
        project(foe.pos[0], 2.2, foe.pos[1], p);
        const tag = el(doc, "div", "", foe.text);
        tag.dataset.fakeTag = foe.foe;
        Object.assign(tag.style, {
          position: "absolute", left: p.x + "px", top: p.y + "px", translate: "-50% -100%", padding: "2px 8px",
          background: "rgba(35,28,23,0.9)", color: "#FFF4D6", border: "1.5px solid #6b4f36", borderRadius: "6px",
          font: "700 calc(20px * var(--ui) * 0.9) / 1.2 var(--dh-font)", whiteSpace: "nowrap",
        });
        return tag;
      }),
    );
    foesOnMap = foes.map((foe) => ({ pos: foe.pos, color: ENEMIES[foe.foe].show.placeholder.color }));
  };

  let foesOnMap: { pos: Vec2; color: string }[] = [];

  function scene(name: PreviewScene, options: { freeze?: boolean } = {}): void {
    freeze = options.freeze ?? true;
    world = previewWorld();
    pending = [];
    placement.cancel();
    tagLayer.replaceChildren();
    foesOnMap = [];
    frameStub.hidden = true;
    switch (name) {
      case "prep":
        world.phase = "prep";
        world.phaseEndsAt = -1;
        emit({ type: "gold", delta: 200, total: 200, reason: "start" });
        break;
      case "break":
      case "placing":
      case "edit":
        midRun(3);
        world.phase = "break";
        world.phaseEndsAt = world.tick + Math.round(14.2 * 60);
        emit({ type: "phase", phase: "break", wave: 3, endsAtTick: world.phaseEndsAt });
        break;
      case "breather":
        // The break after wave 5: the card shows wave 6, the breather (its "Đợt nhẹ" tag).
        midRun(5);
        world.phase = "break";
        world.phaseEndsAt = world.tick + Math.round(14.2 * 60);
        emit({ type: "phase", phase: "break", wave: 5, endsAtTick: world.phaseEndsAt });
        break;
      case "warning":
        midRun(4);
        world.phase = "warning";
        world.phaseEndsAt = world.tick + 4 * 60;
        emit({ type: "phase", phase: "warning", wave: 5, endsAtTick: world.phaseEndsAt });
        break;
      case "wave":
      case "low":
        midRun(5);
        world.phase = "wave";
        world.phaseEndsAt = -1;
        world.hero.hp = name === "low" ? 290 : 548;
        world.hero.shield = name === "low" ? 0 : 40;
        world.combat.rage = 1000;
        world.combat.readyAt.breath = world.tick;
        world.combat.readyAt.skyfire = world.tick + 9 * 60;
        world.combat.urgentUsed = name === "low";
        world.shop.held["small-potion"] = 1;
        world.shop.consumableReadyAt = world.tick + 5 * 60;
        world.words.chain = 23;
        emit({ type: "wave-start", wave: 5, waves: world.stage.waves.length, lanes: ["cau", "suoi", "troi"], generals: ["moss-banner"] });
        if (name === "low") emit({ type: "hit", target: { kind: "hero" }, source: { kind: "enemy", slot: 0, serial: 1 }, amount: 30, damageType: "physical", tier: 1, grade: null, x: 0, z: 0, hpLeft: 290 });
        frameStub.hidden = false;
        placeTags();
        break;
      case "victory":
        midRun(10);
        world.phase = "victory";
        world.hero.hp = 742;
        world.economy.gold = 312;
        feedWords();
        emit({ type: "victory", stars: 2 });
        break;
      case "defeat":
        midRun(7);
        world.phase = "defeat";
        world.hero.hp = 0;
        world.economy.gold = 58;
        feedWords();
        emit({ type: "defeat", wave: 7 });
        break;
    }
    if (name === "placing") placement.begin("pine-bomb");
    if (name === "edit") placement.edit();
  }

  // ── Key router (00 §6 by event.code; the integrator's real one sits in app/input-router) ──
  view.addEventListener(
    "keydown",
    (event) => {
      if (event.repeat || event.ctrlKey || event.metaKey) return;
      const mod = event.altKey ? "alt" : event.shiftKey ? "shift" : "none";
      const binding = KEYS.find((key) => key.code === event.code && key.mod === mod) ?? (mod === "shift" && event.code.startsWith("Digit") ? KEYS.find((key) => key.code === event.code && key.mod === "alt") : undefined);
      if (!binding) return;
      event.preventDefault();
      actionLog.push(binding.action);
      for (const handler of handlers) if (handler.handleAction(binding.action)) return;
      actionLog.push("unclaimed:" + binding.action);
    },
    { capture: true },
  );

  // ── Frame loop ──
  const ctx = canvas.getContext("2d");
  let last = view.performance.now();
  let carry = 0;
  const draw = (): void => {
    if (!ctx) return;
    const dpr = view.devicePixelRatio || 1;
    const w = view.innerWidth;
    const h = view.innerHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#2c3a2c");
    sky.addColorStop(1, "#3d4f33");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const p: ScreenPoint = { x: 0, y: 0, visible: false };
    const poly = (points: readonly Vec2[], y = 0): void => {
      ctx.beginPath();
      points.forEach(([x, z], k) => {
        project(x, y, z, p);
        if (k === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
    };
    const circle = (cx: number, cz: number, r: number, n = 40): Vec2[] => Array.from({ length: n }, (_, k) => [cx + Math.cos((k / n) * Math.PI * 2) * r, cz + Math.sin((k / n) * Math.PI * 2) * r] as Vec2);
    poly(circle(0, 0, 36));
    ctx.closePath();
    ctx.fillStyle = "#4a5e3a";
    ctx.fill();
    const m = world.map;
    if (m.river) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let k = 1; k < m.river.points.length; k += 1) {
        const a = m.river.points[k - 1]!;
        const b = m.river.points[k]!;
        const wM = m.river.widthsM[k] ?? 4;
        project(a[0], 0, a[1], p);
        const ax = p.x;
        const ay = p.y;
        project(b[0], 0, b[1], p);
        const q: ScreenPoint = { x: 0, y: 0, visible: false };
        project(b[0] + wM, 0, b[1], q);
        ctx.strokeStyle = "#3f6f78";
        ctx.lineWidth = Math.abs(q.x - p.x);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }
    for (const lane of m.lanes) {
      const q: ScreenPoint = { x: 0, y: 0, visible: false };
      project(lane.widthM, 0, 0, q);
      project(0, 0, 0, p);
      ctx.strokeStyle = "#8b6a47";
      ctx.lineWidth = Math.abs(q.x - p.x);
      poly(lane.points);
      ctx.stroke();
    }
    ctx.setLineDash([6, 6]);
    for (const sky2 of m.sky) {
      ctx.strokeStyle = "rgba(239,230,210,0.5)";
      ctx.lineWidth = 2;
      poly(sky2.points, sky2.altitudeM);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    poly(circle(0, 0, m.dais.radiusM));
    ctx.closePath();
    ctx.fillStyle = "#8d8a80";
    ctx.fill();
    project(0, m.dais.heroHoverM, 0, p);
    ctx.fillStyle = "#e8875a";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
    ctx.fill();
    project(m.dais.guideAt[0], 1, m.dais.guideAt[1], p);
    ctx.fillStyle = "#eef1f2";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    for (const foe of foesOnMap) {
      project(foe.pos[0], 0.6, foe.pos[1], p);
      ctx.fillStyle = foe.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const loop = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!freeze) {
      carry += dt * 60;
      while (carry >= 1) {
        world.tick += 1;
        carry -= 1;
      }
    }
    const events = pending;
    pending = [];
    const info: FrameInfo = { dt, worldDt: freeze ? 0 : dt, alpha: 0, now };
    for (const presenter of presenters) presenter.onEvents(events, world);
    for (const presenter of presenters) presenter.frame(world, info);
    draw();
    view.requestAnimationFrame(loop);
  };

  const handle: PreviewHandle = {
    scene,
    commands,
    actions: actionLog,
    state: () => ({
      phase: world.phase,
      gold: world.economy.gold,
      tick: world.tick,
      placement: placement.mode + ":" + (placement.item ?? ""),
      slots: world.slots.map((slot) => (slot.item ? slot.item + "@" + slot.level : null)),
      held: { ...world.shop.held, ...Object.fromEntries(Object.entries(world.shop.heroBuys).map(([k, v]) => ["buy:" + k, v])) },
    }),
    setFreeze: (value: boolean) => {
      freeze = value;
    },
  };
  view.__dhUi = handle;
  scene("prep");
  view.requestAnimationFrame(loop);
  return handle;
}
