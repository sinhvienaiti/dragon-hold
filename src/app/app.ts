/**
 * App boot and the M0 stage flow: the painted map, the deck (≤ 2 s portal
 * wait), the world, the loop, the key router and every presenter (view, UI,
 * learning, audio). Flow: Học trước (the stage's new words) → setup (prep,
 * starting gold, wave card) → waves with 20 s breaks and the shop, Thẻ Ôn
 * after a wave → results (victory or defeat), retry rebuilds the run.
 *
 * Commands go into the world as soon as they come (a key is in before the
 * next frame even during a hit-stop, 05 §5); each is logged with the tick it
 * entered, which replays to the same hash (step applies input first).
 * The break clock stands still while a learning panel is open (00 §4.5), and
 * the whole sim stands still on focus loss and in the pause menu (06 §2).
 * The world's typing speed comes from ?wpm= or the speed card before the
 * first run (typing-pace.ts), never a silent 35; each finished stage updates
 * the measured profile the card offers next.
 * Owner: integrator (LANES.md).
 */
import "./app.css";
import { Vector3, type Object3D } from "three";
import { createAudio, type GameAudio } from "../audio";
import { MAPS } from "../content/data/maps";
import { STAGE_M0 } from "../content/data/stages";
import { RINGS } from "../content/rules";
import type { Difficulty, FoeId, MapDef, SimCommand, SimEvent, StageDef, WordDeck } from "../content/types";
import { createLearningBridge } from "../kit/learning";
import { safeLocalStorage } from "../kit/platform";
import { setSpeechGate } from "../kit/speech";
import { mmToU, uToM } from "../sim/fixed";
import { applyCommand, createWorld, hashWorldHex, runLog, step, type World } from "../sim/world";
import { newWordsOf } from "../typing/deck";
import { createHud, type Hud } from "../ui/hud";
import { createLearningFrame, createPrelearn, createReviewCard, type LearningFramePresenter, type LearningPanel, type PanelWord } from "../ui/learning-frame";
import { createPlacementUi, type PlacementUi } from "../ui/placement-ui";
import { createResults } from "../ui/results";
import { createShopStrip } from "../ui/shop-strip";
import { el, installSkin, setShown, uiButton } from "../ui/skin";
import { createTags } from "../ui/tags";
import { createWaveCard } from "../ui/wave-card";
import { createActors, type ActorsView } from "../view/actors";
import { createBanners, type BannersView } from "../view/banners";
import { foeDrawnSize } from "../view/foe-look";
import { createFx, type FxPresenter } from "../view/fx";
import { createHeroes } from "../view/heroes";
import { createHpBars } from "../view/hpbars";
import { createMapStage, type MapStage } from "../view/stage";
import { createTelegraphs, type TelegraphsView } from "../view/telegraphs";
import type { ActionHandler, FrameInfo, Presenter, Quality, ScreenPoint } from "./contracts";
import { createInputRouter, type InputRouter, type KeyPanel } from "./input-router";
import { createLearningClient, type LearningClient } from "./learning";
import { createLoop, type Loop } from "./loop";
import { createPaceCard } from "./pace-card";
import { PaceMeter, clampWpm, measuredHeader, paceLabel, paceOptions, readPaceMemory, recordStage, rememberPick, type PaceHeader } from "./typing-pace";

export interface App {
  dispose(): void;
}

export interface AppOptions {
  readonly stage?: StageDef;
  readonly quality?: Quality;
  readonly seed?: number;
  readonly difficulty?: Difficulty;
  /** Typist speed E for word lengths and the pace k (01 §3.4, BALANCE.md §4.1); unset: the speed card asks. */
  readonly typistWpm?: number;
  /** Dev only: world time × speed (rules unchanged, scenarios run a whole stage faster). */
  readonly speed?: number;
  /** Show Học trước before the first setup (default true). */
  readonly prelearn?: boolean;
  /** Word tag size, 80–150 % (01 §3.1; the settings screen comes later). */
  readonly tagSizePct?: number;
}

const QUALITIES: readonly Quality[] = ["low", "medium", "high", "ultra"];
const DIFFICULTIES: readonly Difficulty[] = ["easy", "normal", "hard"];
/** Countdown after a pause in a wave (06 §2 rule 4). */
const COUNTDOWN_MS = 3000;
/** How often the UI rectangles damage numbers keep off are read (fx.numbers.protected). */
const PROTECT_EVERY_MS = 250;
/** Foe pick radius for a left click, CSS px (00 §6 mouse). */
const PICK_PX = 44;
/** Word zone (01 §2.1, rules RINGS), sim u: fast-forward stays off while a foe is inside it. */
const WORD_ZONE_U = mmToU(RINGS.wordZoneMm);

/** URL options: ?q= quality, ?seed=, ?difficulty=, ?wpm=, ?prelearn=0, ?tagsize=80–150, and in dev ?speed=. */
export function optionsFromUrl(search: string, dev: boolean): AppOptions {
  const params = new URLSearchParams(search);
  const q = params.get("q") as Quality | null;
  const d = params.get("difficulty") as Difficulty | null;
  const num = (name: string): number | undefined => {
    const raw = params.get(name);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const speed = num("speed");
  return {
    quality: q && QUALITIES.includes(q) ? q : undefined,
    difficulty: d && DIFFICULTIES.includes(d) ? d : undefined,
    seed: num("seed"),
    // A whole WPM in 10–120: the world keeps integers only.
    typistWpm: clampWpm(num("wpm")),
    speed: dev && speed !== undefined ? Math.min(16, Math.max(0.25, speed)) : undefined,
    prelearn: params.get("prelearn") !== "0",
    tagSizePct: num("tagsize"),
  };
}

/** What a run owns; rebuilt on retry. */
interface Run {
  world: World;
  /** The typing speed the world was built with (replays use it too). */
  header: PaceHeader;
  /** Word timings of this run, folded into the measured profile when it ends. */
  meter: PaceMeter;
  log: { tick: number; command: SimCommand }[];
  presenters: Presenter[];
  /** Its 3D views (actors, telegraphs, bars, effects) and the roots they hung on the stage layers. */
  scene: { presenters: Presenter[]; roots: Object3D[] };
  handlers: ActionHandler[];
  actors: ActorsView;
  fx: FxPresenter;
  telegraphs: TelegraphsView;
  banners: BannersView;
  hud: Hud;
  placement: PlacementUi;
  /** The learning frame: covered while a learning panel asks (its lines would give answers away). */
  frame: LearningFramePresenter;
  prelearn: LearningPanel & { show(words: readonly PanelWord[]): void };
  review: LearningPanel & { show(items: Parameters<ReturnType<typeof createReviewCard>["show"]>[0]): void };
}

interface FrameStats {
  frames: number;
  /** Last 600 frame times, ms. */
  readonly times: number[];
  keyLatency: number[];
}

declare global {
  interface Window {
    /** Dev and scenario handle (dev builds, or ?debug=1). */
    __dh?: DebugHandle;
  }
}

export interface DebugHandle {
  readonly ready: boolean;
  world(): World;
  state(): Record<string, unknown>;
  words(): { slot: number; text: string; kind: string; typed: number; target: { slot: number; serial: number } | null; sx: number; sy: number; visible: boolean }[];
  foes(): { slot: number; serial: number; foe: string; hp: number; hpMax: number; word: number; x: number; z: number; sx: number; sy: number; visible: boolean }[];
  hash(): string;
  /** Replays the command log on a fresh world to the current tick; true when the hashes match. */
  replayCheck(): { live: string; replay: string; same: boolean; commands: number };
  perf(): { frames: number; meanMs: number; p95Ms: number; maxMs: number; drawCalls: number; triangles: number; keyLatencyMaxMs: number; keyLatencyMeanMs: number; keys: number };
  numbersOverlaps(): number;
  /** Pairs of live damage numbers whose drawn boxes touch (view/number-field.ts; must stay 0 after a frame). */
  numbersTouching(): number;
  setSpeed(speed: number): void;
  send(command: SimCommand): void;
  action(name: string): boolean;
  restart(): void;
  panel(): string | null;
  /** Answers of the open Thẻ Ôn, in order. */
  review(): string[];
  /** Events seen by type, the shortest enemy telegraph (ms), frames slowed by hit-stop, live telegraph shapes. */
  events(): { tally: Record<string, number>; telegraphMinMs: number | null; byFoe: Record<string, { n: number; minMs: number; shape: string }>; slowFrames: number; telegraphsLive: number };
  /** Drawn screen height (px) of every live foe, base to top anchor, with its distance to the dais (dh-scale, 05 §2.3). */
  foeSizes(): { foe: string; px: number; widthPx: number; distM: number }[];
  /** Presentation only: `count` tier 4–5 hits on live foes go to the effects (hit-stop, shake, numbers); the sim never sees them. */
  fxStorm(count: number): number;
  setView(view: { yawDeg?: number; pitchDeg?: number; zoom?: number; targetX?: number; targetZ?: number }, snap?: boolean): void;
  project(x: number, y: number, z: number): ScreenPoint;
}

export function startApp(doc: Document = document, given?: AppOptions): App {
  const view = doc.defaultView!;
  const dev = import.meta.env.DEV;
  const options: AppOptions = given ?? optionsFromUrl(view.location.search, dev);
  const stage = options.stage ?? STAGE_M0;
  const quality: Quality = options.quality ?? "high";
  const seed = options.seed ?? stage.seed;
  /** The typing speed of the next run: from ?wpm=, else unset until the speed card is answered. */
  const urlWpm = clampWpm(options.typistWpm);
  let header: PaceHeader | null = urlWpm === undefined ? null : { typistWpm: urlWpm, source: "url" };
  let speed = options.speed ?? 1;

  installSkin(doc);
  const overlay = doc.getElementById("dh-overlay");
  const canvasHost = doc.getElementById("dh-canvas");
  if (!overlay || !canvasHost) throw new Error("app: #dh-overlay or #dh-canvas missing from index.html");
  overlay.replaceChildren();

  const notice = el(doc, "div", "dh-boot", "Rồng Giữ Ải · " + stage.nameVi + " · đang nạp từ…");
  overlay.append(notice);

  const foundMap = MAPS[stage.mapId];
  if (!foundMap) throw new Error("app: stage " + stage.id + " names unknown map " + stage.mapId);
  const mapDef: MapDef = foundMap;
  const map: MapStage = createMapStage(canvasHost, mapDef, quality);
  map.render();

  // The Dragons live as long as the app: a retry resets them instead of loading and decoding the GLBs again.
  const heroes = createHeroes(map.stage, mapDef, { terrain: map.terrain });

  // Persistent services: audio, the learning bridge and client.
  const bridge = createLearningBridge({ gameId: "dragon-hold" });
  const learning: LearningClient = createLearningClient({ bridge });
  const audio: GameAudio = createAudio({ quality });
  const stopMusicWatch = bridge.onSharedMusic((playing) => audio.setSharedMusic(playing));
  setSpeechGate(async (play) => {
    for (let waited = 0; audio.speechBlocked() && waited < 1500; waited += 100) await new Promise((done) => view.setTimeout(done, 100));
    await play();
  });
  // 06 §2 rule 1: take the keys at load and ask the portal for focus.
  view.focus();
  bridge.requestFocus();

  // App-level layers.
  const hurt = el(doc, "div", "dh-hurt");
  const ffBadge = el(doc, "div", "dh-ff", "×2");
  setShown(ffBadge, false);
  /** Pause menu and 3-2-1: a plain dim layer, words and the learning frame hidden (01 §3.9 "Tạm dừng che chữ"). */
  const hush = el(doc, "div", "dh-hush");
  setShown(hush, false);
  const veil = el(doc, "div", "dh-veil");
  const veilText = el(doc, "div", "dh-veil__text", "");
  veil.append(veilText);
  setShown(veil, false);
  const countdownNode = el(doc, "div", "dh-countdown", "");
  setShown(countdownNode, false);
  const paceCard = createPaceCard(overlay);
  const menu = el(doc, "section", "dh-panel dh-pausemenu");
  menu.dataset.dhAvoid = "";
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", "Tạm dừng");
  const menuItems: HTMLButtonElement[] = [];
  const menuTitle = el(doc, "div", "dh-pausemenu__title", "Tạm dừng");
  const menuKeys = el(doc, "div", "dh-pausemenu__keys", "↑ ↓ chọn · Enter chọn · Esc tiếp tục");
  setShown(menu, false);
  overlay.append(hurt, ffBadge);

  let run: Run | null = null;
  let deck: WordDeck | null = null;
  let loop: Loop | null = null;
  let router: InputRouter | null = null;
  let disposed = false;
  let menuOpen = false;
  let menuIndex = 0;
  /** Focus pause (06 §2 rule 3): "focus" shows the veil; "soft" is the first-load hint. */
  let veilMode: "none" | "focus" | "soft" = "none";
  let countdownUntil = 0;
  let fastForward = false;
  let hurtUntil = 0;
  let protectAt = 0;
  let audioPaused = false;
  let prelearnShown = false;
  /** The last Thẻ Ôn answers (debug handle: scenarios answer by keyboard). */
  let lastReview: string[] = [];
  const pendingKeyTimes: number[] = [];
  const stats: FrameStats = { frames: 0, times: [], keyLatency: [] };
  /** Events seen this run by type, and the shortest enemy telegraph (debug handle). */
  const tally: Record<string, number> = {};
  let telegraphMinMs = Infinity;
  /** Enemy telegraphs by species: count and shortest wind-up (dh-telegraphs). */
  const telegraphByFoe: Record<string, { n: number; minMs: number; shape: string }> = {};
  let slowFrames = 0;
  let lastFrameAt = 0;
  let keysToSim = 0;
  let keysToPanels = 0;

  /** The open learning panel, wrapped to count the letters it takes. */
  const activePanel = (): KeyPanel | null => {
    if (!run) return null;
    const panel = run.prelearn.isOpen ? run.prelearn : run.review.isOpen ? run.review : null;
    if (!panel) return null;
    return {
      isOpen: true,
      handleLetter: (letter) => {
        keysToPanels += 1;
        return panel.handleLetter(letter);
      },
      handleAction: (action) => panel.handleAction(action),
    };
  };

  // ── Commands: straight into the world, logged with their tick ──
  const sink = (command: SimCommand): void => {
    if (!run) return;
    const world = run.world;
    if (world.phase === "victory" || world.phase === "defeat") return;
    applyCommand(world, command);
    run.log.push({ tick: world.tick, command });
    if (command.type === "key") {
      keysToSim += 1;
      pendingKeyTimes.push(router?.stats.lastLetterAt ?? view.performance.now());
    }
  };

  // ── Pause menu ──
  const menuActions: { label: string; run(): void }[] = [
    { label: "Tiếp tục", run: () => closeMenu() },
    { label: "Chơi lại ải", run: () => { closeMenu(); restart(); } },
    { label: "Tốc độ gõ", run: () => openPaceFromMenu() },
  ];
  for (const [index, item] of menuActions.entries()) {
    const button = uiButton(doc, "dh-pausemenu__item", () => item.run());
    button.textContent = item.label;
    button.addEventListener("pointerenter", () => selectMenu(index));
    menuItems.push(button);
  }
  /** The menu row that names the speed in use. */
  const paceItem = menuItems[2]!;
  menu.append(menuTitle, ...menuItems, menuKeys);
  overlay.append(hush, menu, veil, countdownNode);

  function selectMenu(index: number): void {
    menuIndex = (index + menuItems.length) % menuItems.length;
    menuItems.forEach((button, k) => button.classList.toggle("is-on", k === menuIndex));
  }
  function openMenu(): void {
    if (!run || menuOpen || paceCard.isOpen) return;
    const phase = run.world.phase;
    if (phase === "victory" || phase === "defeat") return;
    menuOpen = true;
    paceItem.textContent = "Tốc độ gõ: " + paceLabel(run.header);
    selectMenu(0);
    setShown(menu, true);
    loop?.setPaused(true);
  }

  // ── Typing speed (typing-pace.ts) ──
  /** Shows the speed card; `back`: Esc returns to the game (from the menu). */
  function askPace(onPick: (picked: PaceHeader) => void, back?: () => void): void {
    const { options: rows, selected } = paceOptions(readPaceMemory(safeLocalStorage));
    paceCard.open(rows, selected, (picked) => {
      rememberPick(safeLocalStorage, picked);
      onPick(picked);
    }, back, run?.header);
  }
  /** Pause menu → speed card: a new speed replays the stage with it; the same one goes back to the game. */
  function openPaceFromMenu(): void {
    if (!run) return;
    menuOpen = false;
    setShown(menu, false);
    const current = run.header;
    askPace(
      (picked) => {
        if (picked.typistWpm === current.typistWpm && picked.source === current.source && picked.accuracyPm === current.accuracyPm && picked.cvPm === current.cvPm) {
          startCountdownIfWave();
          return;
        }
        header = picked;
        restart();
        run?.hud.toast("Chơi lại ải với tốc độ " + paceLabel(picked));
      },
      () => startCountdownIfWave(),
    );
  }
  function closeMenu(): void {
    if (!menuOpen) return;
    menuOpen = false;
    setShown(menu, false);
    startCountdownIfWave();
  }
  function startCountdownIfWave(): void {
    const phase = run?.world.phase;
    if (phase === "wave" || phase === "warning") countdownUntil = view.performance.now() + COUNTDOWN_MS;
  }

  // ── Focus (06 §2) ──
  const inPlay = (): boolean => {
    const phase = run?.world.phase;
    return phase === "wave" || phase === "warning" || phase === "break";
  };
  const onBlur = (): void => {
    if (!run) return;
    if (inPlay()) {
      veilMode = "focus";
      veilText.textContent = "Bấm hoặc gõ phím bất kỳ để tiếp";
      veil.classList.remove("is-soft");
      setShown(veil, true);
      countdownUntil = 0;
      loop?.setPaused(true); // now, not at the next frame: no tick slips in
    }
  };
  const onVisibility = (): void => {
    if (doc.visibilityState === "hidden") onBlur();
  };
  /** A press while the veil is up: lifts it; in a wave a 3-2-1 follows and the press is used up. */
  const liftVeil = (): boolean => {
    if (veilMode === "none") return false;
    const mode = veilMode;
    veilMode = "none";
    setShown(veil, false);
    if (mode === "soft") return false;
    const phase = run?.world.phase;
    if (phase === "wave" || phase === "warning") {
      countdownUntil = view.performance.now() + COUNTDOWN_MS;
      return true;
    }
    return false;
  };
  const onPointerDown = (): void => {
    view.focus();
    liftVeil();
  };
  view.addEventListener("blur", onBlur);
  doc.addEventListener("visibilitychange", onVisibility);
  view.addEventListener("pointerdown", onPointerDown, { capture: true });

  // ── Left click on a foe marks it (00 §6 mouse) ──
  const pickAt = { x: 0, y: 0, down: false };
  const onCanvasDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    pickAt.x = event.clientX;
    pickAt.y = event.clientY;
    pickAt.down = true;
  };
  const onCanvasUp = (event: PointerEvent): void => {
    if (event.button !== 0 || !pickAt.down || !run) return;
    pickAt.down = false;
    if (Math.hypot(event.clientX - pickAt.x, event.clientY - pickAt.y) > 6 || run.placement.mode !== "idle") return;
    const rect = canvasHost.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    let best: { slot: number; serial: number } | null = null;
    let bestD = PICK_PX * PICK_PX;
    const point = new Vector3();
    const screen: ScreenPoint = { x: 0, y: 0, visible: false };
    for (const enemy of run.world.enemies.list) {
      if (!enemy.alive) continue;
      const located = run.actors.locate(enemy.slot, enemy.serial, "center", point);
      const x = located ? point.x : uToM(enemy.x);
      const y = located ? point.y : uToM(enemy.y) + 0.8;
      const z = located ? point.z : uToM(enemy.z);
      map.worldToScreen(x, y, z, screen);
      if (!screen.visible) continue;
      const d = (screen.x - px) ** 2 + (screen.y - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { slot: enemy.slot, serial: enemy.serial };
      }
    }
    if (best) sink({ type: "mark", enemy: best });
  };
  canvasHost.addEventListener("pointerdown", onCanvasDown);
  canvasHost.addEventListener("pointerup", onCanvasUp);

  // ── A run: world and every presenter that reads it ──
  /** World options of a run at `pace` (E, and a and CV when they were measured). */
  const worldOptions = (pace: PaceHeader) => ({
    deck: deck!,
    typistWpm: pace.typistWpm,
    ...(pace.accuracyPm === undefined ? {} : { accuracyPm: pace.accuracyPm }),
    ...(pace.cvPm === undefined ? {} : { cvPm: pace.cvPm }),
    difficulty: options.difficulty,
  });

  function buildRun(): Run {
    const pace = header!;
    const world = createWorld(stage, seed, worldOptions(pace));
    const layers = map.stage.layers;
    const onStage = (): Object3D[] => [...layers.ground.children, ...layers.actors.children, ...layers.fx.children];
    const before = new Set(onStage());
    const actors = createActors(map.stage, map.terrain);
    heroes.reset();
    heroes.setLocator(actors);
    const telegraphs = createTelegraphs(map.stage, map.terrain, { locator: actors });
    const banners = createBanners(map.stage, map.terrain, { locator: actors, telegraphs });
    const hpbars = createHpBars(map.stage, { locator: actors, terrain: map.terrain });
    const fx = createFx(map.stage, { locator: actors, terrain: map.terrain, heroes, shake: (px) => map.rig.shake(px) });
    const tags = createTags(overlay!, map.stage.project, {
      gloss: learning.gloss,
      sizePct: options.tagSizePct === undefined ? undefined : Math.min(150, Math.max(80, options.tagSizePct)),
      // Thẻ Ôn opens on the last kill of a wave: that word's leaving tag and letter sparks would show the answer.
      quiet: () => run !== null && (run.review.isOpen || run.prelearn.isOpen),
    });
    const frame = createLearningFrame(overlay!, learning.gloss, { speak: learning.speak });
    const placement = createPlacementUi(overlay!, map.stage.project, sink, { onSlots: (visible, highlight) => map.paths.showSlots(visible, highlight) });
    const hud = createHud(overlay!, sink, { onPause: openMenu, onCameraReset: () => map.rig.reset() });
    const waveCard = createWaveCard(overlay!, sink);
    const strip = createShopStrip(overlay!, sink, { placement });
    const results = createResults(overlay!, { retry: restart, listen: (text) => learning.speak(text), gloss: learning.gloss });
    const hooks = {
      speak: (text: string) => learning.speak(text),
      recall: (text: string, correct: boolean, ms: number, answer: string) => {
        learning.recordRecall(text, correct, { responseMs: ms, userAnswer: answer });
        if (!correct) audio.learning("wrong");
      },
      send: sink,
    };
    // Học trước shows the word: copying it is not a recall (00 D14), so its answers go out with hintUsed.
    const prelearn = createPrelearn(overlay!, {
      ...hooks,
      recall: (text: string, correct: boolean, ms: number, answer: string) => {
        learning.recordRecall(text, correct, { responseMs: ms, userAnswer: answer, hintUsed: true });
        if (!correct) audio.learning("wrong");
      },
    });
    const review = createReviewCard(overlay!, hooks);
    const replay: ActionHandler = { handleAction: (action) => action === "replay" && learning.handleAction("replay") };
    return {
      world,
      header: pace,
      meter: new PaceMeter(),
      log: [],
      // actors first: the others read the positions it computes each frame.
      presenters: [actors, heroes, telegraphs, banners, hpbars, fx, tags, frame, placement, hud, waveCard, strip, results, audio],
      scene: { presenters: [actors, telegraphs, banners, hpbars, fx], roots: onStage().filter((root) => !before.has(root)) },
      handlers: [results, placement, strip, waveCard, hud, replay, map.rig],
      actors,
      fx,
      telegraphs,
      banners,
      hud,
      placement,
      frame,
      prelearn,
      review,
    };
  }

  /**
   * The last run's 3D views, off the stage but not yet disposed. three.js drops
   * a compiled GPU program once no material uses it, and some of the new run's
   * materials only appear with its first foe or telegraph; while the old ones
   * live, those find their program cached, so a retry links no shader (a
   * 270 ms frame before). They go at the next restart or with the app.
   */
  let retired: Presenter[] = [];

  /** Disposes `old`; with `retire`, its 3D views leave the stage now and are disposed at the next call. */
  function disposeRun(old: Run | null = run, retire = false): void {
    for (const presenter of retired) presenter.dispose();
    retired = [];
    if (!old) return;
    for (const presenter of old.presenters) {
      if (presenter === audio || presenter === heroes) continue;
      if (!retire || !old.scene.presenters.includes(presenter)) presenter.dispose();
    }
    if (retire) {
      for (const root of old.scene.roots) root.removeFromParent();
      retired = old.scene.presenters;
    }
    old.prelearn.dispose();
    old.review.dispose();
    if (old === run) {
      heroes.setLocator(undefined);
      run = null;
    }
  }

  function restart(): void {
    if (disposed || !deck) return;
    learning.flush();
    audio.resetRun();
    fastForward = false;
    countdownUntil = 0;
    const old = run;
    run = buildRun();
    disposeRun(old, true);
    router!.handlers.splice(0, router!.handlers.length, ...run.handlers);
  }

  // ── Events the app itself follows: Thẻ Ôn, flushes, the hurt edge ──
  /** A stage ended: its word timings go into the measured profile; a run on the measured speed follows it on retry. */
  function measureStage(world: World, won: boolean): void {
    if (!run) return;
    const safety = won && world.hero.hpMax > 0 ? world.hero.hp / world.hero.hpMax : 0;
    const measured = recordStage(safeLocalStorage, run.meter.sample(won ? "won" : "lost", world.stats, safety));
    if (measured !== null && header?.source === "measured") header = measuredHeader(measured);
  }

  function followEvents(events: readonly SimEvent[], now: number): void {
    if (!run) return;
    run.meter.onEvents(events);
    for (const event of events) {
      switch (event.type) {
        case "wave-end":
          learning.flush();
          // No Thẻ Ôn after the last wave: the results screen comes next.
          if (stage.unlocks.reviewCard && event.wave < stage.waves.length) {
            const items = learning.reviewItems(event.wave);
            lastReview = items.map((item) => item.text);
            if (items.length > 0) run.review.show(items);
          }
          break;
        case "phase":
          // The next wave is coming (a click on Gọi sớm): the card closes, nothing is lost.
          if (event.phase === "warning" && run.review.isOpen) run.review.handleAction("escape");
          break;
        case "victory":
        case "defeat":
          learning.flush();
          measureStage(run.world, event.type === "victory");
          run.placement.cancel();
          // The results screen owns the keys; an open panel would also freeze world time (telegraph fades).
          if (run.review.isOpen) run.review.handleAction("escape");
          if (run.prelearn.isOpen) run.prelearn.handleAction("escape");
          fastForward = false;
          break;
        case "hit":
          // A foe's blow darkens the edge; Héo lan's quiet seep (source "hero") does not.
          if (event.target.kind === "hero" && event.source.kind !== "hero") hurtUntil = now + 120;
          break;
        default:
          break;
      }
    }
  }

  /** Alt + →: only in a break, or with no live word and no foe in the word zone (00 §6, 06 §10). */
  function fastForwardAllowed(world: World): boolean {
    if (world.phase === "break") return true;
    if (world.phase !== "wave" && world.phase !== "warning") return false;
    if (world.words.live.some((word) => word !== null)) return false;
    const r = WORD_ZONE_U;
    return !world.enemies.list.some((enemy) => enemy.alive && enemy.x * enemy.x + enemy.z * enemy.z <= r * r);
  }

  const fallback = (action: string): boolean => {
    if (!run) return false;
    if (action === "escape") {
      openMenu();
      return true;
    }
    if (action === "fast-forward") {
      if (!fastForward && !fastForwardAllowed(run.world)) {
        run.hud.toast("Tua nhanh chỉ khi nghỉ hoặc không còn chữ trên quái");
        return true;
      }
      fastForward = !fastForward;
      return true;
    }
    return false;
  };

  /** Pause overlay, countdown and the pause menu see a press first. */
  const intercept = (event: KeyboardEvent, action: string | null): boolean => {
    // The speed card takes every press while it is up (letters too: nothing types under it).
    if (paceCard.isOpen) return paceCard.handleAction(action);
    if (menuOpen) {
      if (action === "escape") closeMenu();
      else if (action === "tilt-up") selectMenu(menuIndex - 1);
      else if (action === "tilt-down") selectMenu(menuIndex + 1);
      else if (action === "enter") menuActions[menuIndex]?.run();
      return true;
    }
    if (veilMode !== "none" && liftVeil()) return true;
    if (countdownUntil > view.performance.now()) return true;
    void event;
    return false;
  };

  const paused = (now: number): boolean => menuOpen || paceCard.isOpen || veilMode === "focus" || countdownUntil > now || activePanel() !== null;

  // ── Frame ──
  function frame(info: FrameInfo): void {
    if (!run) return;
    const world = run.world;
    const now = info.now;
    if (lastFrameAt > 0) {
      stats.times.push(now - lastFrameAt);
      if (stats.times.length > 600) stats.times.shift();
    }
    lastFrameAt = now;
    stats.frames += 1;

    const events = world.events.drain();
    for (const event of events) {
      tally[event.type] = (tally[event.type] ?? 0) + 1;
      if (event.type === "telegraph") tally["telegraph:" + event.owner] = (tally["telegraph:" + event.owner] ?? 0) + 1;
      if (event.type === "telegraph" && event.owner === "enemy") {
        if (event.durationMs < telegraphMinMs) telegraphMinMs = event.durationMs;
        const foe = event.source.kind === "enemy" ? (world.enemies.list[event.source.slot]?.foe ?? "enemy") : event.source.kind;
        const seen = (telegraphByFoe[foe] ??= { n: 0, minMs: Infinity, shape: event.shape });
        seen.n += 1;
        seen.minMs = Math.min(seen.minMs, event.durationMs);
      }
    }
    learning.onEvents(events);
    followEvents(events, now);
    for (const presenter of run.presenters) presenter.onEvents(events, world);
    map.update(info.dt);
    for (const presenter of run.presenters) presenter.frame(world, info);
    map.render();
    run.fx.renderOverlay();

    // Keys typed since the last frame are on screen now.
    for (const at of pendingKeyTimes) {
      stats.keyLatency.push(view.performance.now() - at);
      if (stats.keyLatency.length > 2000) stats.keyLatency.shift();
    }
    pendingKeyTimes.length = 0;

    // Prep: Học trước once, then the setup.
    if (!prelearnShown && world.phase === "prep") {
      prelearnShown = true;
      const words = newWordsOf(deck!)
        .map((word) => ({ text: word.text, ...(learning.gloss(word.text) ?? { vi: "", ipa: "" }) }))
        .filter((word) => word.vi !== "");
      if (options.prelearn !== false && stage.unlocks.learnAhead && words.length > 0) run.prelearn.show(words.slice(0, 8));
    }

    const isPaused = paused(now);
    loop?.setPaused(isPaused);
    const wantAudioPause = menuOpen || paceCard.isOpen || veilMode === "focus";
    if (wantAudioPause !== audioPaused) {
      audioPaused = wantAudioPause;
      audio.setPaused(wantAudioPause);
    }
    audio.setListener(map.rig.target.x, map.rig.target.z, (map.rig.yawDeg * Math.PI) / 180);

    if (veilMode === "soft") setShown(veil, activePanel() === null);
    if (fastForward && !fastForwardAllowed(world)) fastForward = false;
    setShown(ffBadge, fastForward);
    hurt.classList.toggle("is-on", now < hurtUntil);
    const left = countdownUntil - now;
    setShown(countdownNode, left > 0);
    if (left > 0) countdownNode.textContent = String(Math.ceil(left / 1000));
    // Words stay hidden while the game stands still for the menu or the 3-2-1; a learning panel covers the frame.
    const hushed = menuOpen || paceCard.isOpen || left > 0;
    setShown(hush, hushed);
    overlay!.classList.toggle("is-hushed", hushed);
    run.frame.setCovered(activePanel() !== null);

    if (now >= protectAt) {
      protectAt = now + PROTECT_EVERY_MS;
      const rects: { x: number; y: number; w: number; h: number }[] = [];
      for (const node of overlay!.querySelectorAll<HTMLElement>("[data-dh-avoid], [data-keepout], .kit-learning-frame, .dh-tag")) {
        if (node.hidden) continue;
        const r = node.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) rects.push({ x: r.left, y: r.top, w: r.width, h: r.height });
      }
      run.fx.numbers.protected = rects;
    }
  }

  const timeScale = (now: number): number => {
    if (!run) return 1;
    const stop = run.fx.timeScale(now);
    if (stop < 1) slowFrames += 1;
    return stop * (fastForward ? 2 : 1) * speed;
  };

  // ── Boot: deck, world, loop, router ──
  let ready = false;
  /** The first run, once the deck is in and the speed is known. */
  const begin = (): void => {
    if (disposed || run) return;
    run = buildRun();
    router!.handlers.push(...run.handlers);
    loop = createLoop({ step: () => run && step(run.world), frame, timeScale });
    loop.start();
    if (!doc.hasFocus()) {
      veilMode = "soft";
      veilText.textContent = "Bấm hoặc gõ phím bất kỳ để bắt đầu";
      veil.classList.add("is-soft");
      setShown(veil, true);
    }
    ready = true;
  };
  void learning.buildDeck(stage).then((built) => {
    if (disposed) return;
    deck = built;
    notice.remove();
    // The router first: the speed card answers to it before there is a run.
    router = createInputRouter(view, sink, {
      intercept,
      panel: activePanel,
      locked: () => (run ? run.world.words.lock >= 0 : false),
      fallback,
      onImeSign: () => (run ? run.hud.toast("Hãy tắt bộ gõ tiếng Việt để gõ từ tiếng Anh") : undefined),
      now: () => view.performance.now(),
    });
    if (header !== null) begin();
    else
      askPace((picked) => {
        header = picked;
        begin();
      });
  });

  const handle: DebugHandle = {
    get ready() {
      return ready;
    },
    world: () => run!.world,
    state: () => {
      const world = run?.world;
      if (!world) return { ready, paceCard: paceCard.isOpen };
      return {
        ready,
        pace: { ...run!.header, kPm: world.pace.kPm, marginPm: world.pace.marginPm, graceTicks: world.pace.graceTicks },
        paceCard: paceCard.isOpen,
        phase: world.phase,
        wave: world.wave,
        tick: world.tick,
        phaseEndsAt: world.phaseEndsAt,
        gold: world.economy.gold,
        heroHp: world.hero.hp,
        heroHpMax: world.hero.hpMax,
        live: world.enemies.live,
        lock: world.words.lock,
        chain: world.words.chain,
        rage: world.combat.rage,
        kills: world.stats.kills,
        keys: world.stats.keys,
        keysToSim,
        keysToPanels,
        routerLetters: router?.stats.letters ?? 0,
        swallowed: router?.stats.swallowed ?? 0,
        words: world.stats.words,
        grades: [...world.stats.grades],
        paused: paused(view.performance.now()),
        menuOpen,
        veil: veilMode,
        countdown: countdownUntil > view.performance.now(),
        fastForward,
        placement: run!.placement.mode + ":" + (run!.placement.item ?? ""),
        panel: handle.panel(),
        slots: world.slots.map((slot) => (slot.item ? slot.def.id + "=" + slot.item + "@" + slot.level : null)).filter(Boolean),
        held: { ...world.shop.held },
        heroBuys: { ...world.shop.heroBuys },
        steps: loop?.steps ?? 0,
        commands: run!.log.length,
        banners: { carried: run!.banners.carried, planted: run!.banners.planted, named: run!.banners.named },
        layers: { actors: map.stage.layers.actors.children.length, fx: map.stage.layers.fx.children.length, overlay: overlay!.childElementCount },
      };
    },
    words: () => {
      const world = run!.world;
      const out: ReturnType<DebugHandle["words"]> = [];
      const screen: ScreenPoint = { x: 0, y: 0, visible: false };
      world.words.live.forEach((word, slot) => {
        if (!word) return;
        let sx = -1;
        let sy = -1;
        let visible = false;
        const target = word.target && word.target.kind === "enemy" ? { slot: word.target.slot, serial: word.target.serial } : null;
        if (target) {
          const enemy = world.enemies.list[target.slot];
          if (enemy && enemy.alive && enemy.serial === target.serial) {
            map.worldToScreen(uToM(enemy.x), uToM(enemy.y) + 1, uToM(enemy.z), screen);
            sx = screen.x;
            sy = screen.y;
            visible = screen.visible;
          }
        }
        out.push({ slot, text: word.text, kind: word.kind, typed: word.typed, target, sx, sy, visible });
      });
      return out;
    },
    foes: () => {
      const world = run!.world;
      const screen: ScreenPoint = { x: 0, y: 0, visible: false };
      return world.enemies.list
        .filter((enemy) => enemy.alive)
        .map((enemy) => {
          map.worldToScreen(uToM(enemy.x), uToM(enemy.y) + 0.8, uToM(enemy.z), screen);
          return { slot: enemy.slot, serial: enemy.serial, foe: enemy.foe, hp: enemy.hp, hpMax: enemy.hpMax, word: enemy.word, x: uToM(enemy.x), z: uToM(enemy.z), sx: screen.x, sy: screen.y, visible: screen.visible };
        });
    },
    hash: () => hashWorldHex(run!.world),
    replayCheck: () => {
      const world = run!.world;
      const copy = createWorld(stage, seed, worldOptions(run!.header));
      runLog(copy, run!.log, world.tick);
      const live = hashWorldHex(world);
      const replay = hashWorldHex(copy);
      return { live, replay, same: live === replay, commands: run!.log.length };
    },
    perf: () => {
      const times = [...stats.times].sort((a, b) => a - b);
      const mean = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
      const lat = stats.keyLatency;
      const s = map.stage.stats();
      return {
        frames: stats.frames,
        meanMs: mean,
        p95Ms: times[Math.floor(times.length * 0.95)] ?? 0,
        maxMs: times[times.length - 1] ?? 0,
        drawCalls: s.drawCalls,
        triangles: s.triangles,
        keyLatencyMaxMs: lat.length ? Math.max(...lat) : 0,
        keyLatencyMeanMs: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0,
        keys: lat.length,
      };
    },
    numbersOverlaps: () => run!.fx.numbers.overlaps(),
    numbersTouching: () => {
      const field = run!.fx.numbers;
      const a = { x: 0, y: 0, w: 0, h: 0 };
      const b = { x: 0, y: 0, w: 0, h: 0 };
      let touching = 0;
      for (let i = 0; i < field.alive.length; i += 1) {
        if (field.alive[i] !== 1) continue;
        field.box(i, a);
        for (let j = i + 1; j < field.alive.length; j += 1) {
          if (field.alive[j] !== 1) continue;
          field.box(j, b);
          if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) touching += 1;
        }
      }
      return touching;
    },
    setSpeed: (value) => {
      if (dev) speed = Math.min(16, Math.max(0.25, value));
    },
    send: (command) => sink(command),
    action: (name) => router?.dispatch(name) ?? false,
    restart,
    panel: () => (run?.prelearn.isOpen ? "prelearn" : run?.review.isOpen ? "review" : menuOpen ? "menu" : null),
    review: () => [...lastReview],
    events: () => ({ tally: { ...tally }, telegraphMinMs: Number.isFinite(telegraphMinMs) ? telegraphMinMs : null, byFoe: structuredClone(telegraphByFoe), slowFrames, telegraphsLive: run?.telegraphs.live ?? 0 }),
    foeSizes: () => {
      if (!run) return [];
      const base = new Vector3();
      const top = new Vector3();
      const a: ScreenPoint = { x: 0, y: 0, visible: false };
      const b: ScreenPoint = { x: 0, y: 0, visible: false };
      const c: ScreenPoint = { x: 0, y: 0, visible: false };
      const out: { foe: string; px: number; widthPx: number; distM: number }[] = [];
      for (const enemy of run.world.enemies.list) {
        if (!enemy.alive) continue;
        if (!run.actors.locate(enemy.slot, enemy.serial, "base", base) || !run.actors.locate(enemy.slot, enemy.serial, "top", top)) continue;
        map.worldToScreen(base.x, base.y, base.z, a);
        map.worldToScreen(top.x, top.y, top.z, b);
        if (!a.visible || !b.visible) continue;
        // As drawn (foe-look.ts: the tier's draw scale), the same size dh-scale measures.
        const [drawnW, , drawnL] = foeDrawnSize(enemy.foe as FoeId);
        const halfW = Math.max(drawnW, drawnL) / 2;
        map.worldToScreen(base.x + halfW, base.y, base.z, c);
        out.push({ foe: enemy.foe, px: Math.abs(a.y - b.y), widthPx: Math.abs(c.x - a.x) * 2, distM: Math.hypot(base.x, base.z) });
      }
      return out;
    },
    fxStorm: (count) => {
      if (!run) return 0;
      const world = run.world;
      const foes = world.enemies.list.filter((enemy) => enemy.alive);
      const fake: SimEvent[] = [];
      for (let k = 0; k < count; k += 1) {
        const foe = foes[k % Math.max(1, foes.length)];
        const x = foe ? uToM(foe.x) : (k % 7) - 3;
        const z = foe ? uToM(foe.z) : -8 - (k % 5);
        const target = foe ? { kind: "enemy" as const, slot: foe.slot, serial: foe.serial } : { kind: "enemy" as const, slot: 0, serial: 0 };
        fake.push({ type: "hit", tick: world.tick, target, source: { kind: "hero" }, amount: 60 + k, damageType: "word", tier: k % 2 === 0 ? 5 : 4, grade: "perfect", x, z, hpLeft: 1 });
      }
      run.fx.onEvents(fake, world);
      return fake.length;
    },
    setView: (next, snap = true) => map.rig.setView(next, snap),
    project: (x, y, z) => map.worldToScreen(x, y, z),
  };
  if (dev || new URLSearchParams(view.location.search).get("debug") === "1") view.__dh = handle;

  return {
    dispose(): void {
      disposed = true;
      learning.flush();
      loop?.stop();
      router?.dispose();
      disposeRun();
      paceCard.dispose();
      heroes.dispose();
      audio.dispose();
      learning.dispose();
      stopMusicWatch();
      bridge.dispose();
      view.removeEventListener("blur", onBlur);
      doc.removeEventListener("visibilitychange", onVisibility);
      view.removeEventListener("pointerdown", onPointerDown, { capture: true });
      canvasHost.removeEventListener("pointerdown", onCanvasDown);
      canvasHost.removeEventListener("pointerup", onCanvasUp);
      map.dispose();
      overlay.replaceChildren();
      if (view.__dh === handle) delete view.__dh;
    },
  };
}
