// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestContext, TestGain, TestSource, flush } from "./keyboard-audio-fixture";
import { catalogue, FEEL_BASE, serve, setDir, type Reply } from "./feel-fixture";
import { SETTINGS_KEY, loadSettings } from "../../src/app/settings";
import { KEYBOARD_GATE_MS } from "../../src/app/keyboard";
import { TypingSounds } from "../../src/kit/feedback/typing-fx";

const h = vi.hoisted(() => ({
  presenter: () => ({ onEvents() {}, frame() {}, dispose: vi.fn(), handleAction: () => false }),
  audio: { setVolumes: vi.fn(), setMuted: vi.fn(), setKeyboardEnabled: vi.fn(), setPaused: vi.fn(), preview: vi.fn(), resetRun: vi.fn() },
  context: null as unknown as AudioContext,
  loops: [] as { paused: boolean; advance(): void; stop: ReturnType<typeof vi.fn> }[],
}));
// No gesture reaches this audio: the keyboard set decodes on prepare()'s context (suspended until a gesture, parent
// TYPING_FEEL_SERVICE.md §5.4) as soon as the catalogue settles; context() is the gesture path that builds the mixer.
vi.mock("../../src/audio", () => ({ createAudio: () => ({
  ...h.presenter(), ...h.audio, unlocked: false, unlock() {}, prepare: () => h.context,
  context: () => { throw new Error("context() builds the mixer and needs a gesture: keyboard samples decode on prepare()"); },
  speechBlocked: () => false, setSharedMusic() {}, setListener() {},
}) }));
vi.mock("../../src/app/learning", async () => {
  const { makeDeck } = await import("../typing-helpers");
  return { createLearningClient: () => ({ buildDeck: async () => makeDeck(), gloss: () => null, speak: vi.fn(), flush() {}, dispose() {}, onEvents() {} }) };
});
vi.mock("../../src/kit/learning", () => ({ createLearningBridge: () => ({ onSharedMusic: () => () => {}, requestFocus() {}, dispose() {} }) }));
vi.mock("../../src/kit/speech", () => ({ setSpeechGate() {}, speakEnglish: vi.fn(), stopSpeech: vi.fn() }));
vi.mock("../../src/view/stage", () => ({ createMapStage: () => ({
  stage: { layers: { ground: { children: [] }, actors: { children: [] }, fx: { children: [] } } }, terrain: {}, paths: {},
  render() {}, update() {}, dispose() {}, useModels() {},
  rig: { ...h.presenter(), target: { x: 0, z: 0 }, yawDeg: 0, reset() {}, setView() {}, shake() {} },
}) }));
vi.mock("../../src/view/heroes", () => ({ createHeroes: () => ({ ...h.presenter(), reset() {}, setLocator() {} }) }));
vi.mock("../../src/view/models", () => ({ loadCrowdModels: () => ({ dispose() {} }) }));
vi.mock("../../src/view/actors", () => ({ createActors: h.presenter }));
vi.mock("../../src/view/banners", () => ({ createBanners: h.presenter }));
vi.mock("../../src/view/telegraphs", () => ({ createTelegraphs: h.presenter }));
vi.mock("../../src/view/hpbars", () => ({ createHpBars: h.presenter }));
vi.mock("../../src/view/fx", () => ({ createFx: h.presenter }));
vi.mock("../../src/view/lane-cue", () => ({ createLaneCue: h.presenter }));
vi.mock("../../src/ui/tags", () => ({ createTags: h.presenter }));
vi.mock("../../src/ui/learning-frame", () => ({ createLearningFrame: () => ({ ...h.presenter(), setCovered() {} }), createPrelearn: () => ({ ...h.presenter(), isOpen: false }), createReviewCard: () => ({ ...h.presenter(), isOpen: false }) }));
vi.mock("../../src/ui/hud", () => ({ createHud: h.presenter }));
vi.mock("../../src/ui/placement-ui", () => ({ createPlacementUi: h.presenter }));
vi.mock("../../src/ui/wave-card", () => ({ createWaveCard: h.presenter }));
vi.mock("../../src/ui/shop-strip", () => ({ createShopStrip: h.presenter }));
vi.mock("../../src/ui/debut-card", () => ({ createDebutCard: h.presenter }));
vi.mock("../../src/ui/results", () => ({ createResults: h.presenter, VICTORY_HOLD_MS: 2600 }));
vi.mock("../../src/app/loop", () => ({ createLoop: (hooks: { step(): void }) => {
  const loop = { paused: false, start() {}, stop: vi.fn(), setPaused(p: boolean) { loop.paused = p; }, advance() { if (!loop.paused) hooks.step(); } };
  h.loops.push(loop);
  return loop;
} }));

import { startApp, type App } from "../../src/app/app";

let app: App | null = null;
let ctx: TestContext;
const press = (target: EventTarget, key: string, code = key): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};
const row = (id: string) => document.querySelector<HTMLElement>(`[data-row="${id}"]`)!;
const corner = (panel: string) => document.querySelector<HTMLButtonElement>(`.kit-qs__corner[data-panel="${panel}"]`)!;
const choose = (value: string) => document.querySelector<HTMLButtonElement>(`[role="option"][data-value="${value}"]`)!;
const slide = (id: string, value: number) => {
  const input = row(id).querySelector<HTMLInputElement>('input[type="range"]')!;
  input.value = String(value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
/** Every fetch the page made. */
let fetched: string[];
/** A fetch answer as timedJson, timedBytes and the kit read it; sample bytes are the file's URL (TestContext). */
const respond = (url: string, reply: Reply): Response => ({
  ok: reply.status >= 200 && reply.status < 300, status: reply.status, headers: new Headers(reply.type ? { "content-type": reply.type } : {}),
  text: async () => reply.text ?? "", json: async () => JSON.parse(reply.text ?? ""), arrayBuffer: async () => new TextEncoder().encode(url).buffer,
}) as unknown as Response;
/** The sample Typing Feel host (feel-fixture.ts) behind fetch; `route` may answer first. */
const feelHost = (route?: (url: string) => Promise<Response> | Response | undefined): void => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    fetched.push(url);
    return route?.(url) ?? respond(url, serve(url, catalogue()));
  }));
};
/** Microtasks and the macrotask turns between decode batches: the catalogue, the saved set's first batches, the gate. */
const decodeAll = async (): Promise<void> => {
  for (let batch = 0; batch < 8; batch += 1) {
    await vi.advanceTimersByTimeAsync(1);
    await flush();
  }
};
const boot = async (given: Record<string, unknown> = { typistWpm: 35, prelearn: false, keysBase: FEEL_BASE }) => {
  app = startApp(document, given);
  await flush();
  await decodeAll();
};
beforeEach(async () => {
  vi.useFakeTimers();
  h.loops.length = 0;
  vi.clearAllMocks();
  localStorage.clear();
  document.body.innerHTML = '<div id="dh-canvas"></div><div id="dh-overlay"></div>';
  ctx = new TestContext();
  h.context = ctx as unknown as AudioContext;
  vi.stubGlobal("GainNode", TestGain);
  vi.stubGlobal("AudioBufferSourceNode", TestSource);
  fetched = [];
  feelHost();
  await boot();
});
afterEach(async () => {
  app?.dispose();
  app = null;
  // Drain in-flight pack loads before restoring the real fetch implementation.
  await flush();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("192 app and shared panels", () => {
  it("opens/switches/closes with mouse, F1, F2 and Esc; uses the real 180 images and a tag keepout", () => {
    expect(corner("settings").querySelector("img")!.getAttribute("src")).toContain("hud-settings.64.png");
    expect(corner("sound").closest("[data-keepout]")).not.toBeNull();
    corner("settings").click();
    expect(window.__dh!.panel()).toBe("settings");
    corner("settings").click();
    expect(window.__dh!.panel()).toBeNull();
    press(window, "F2");
    expect(window.__dh!.panel()).toBe("sound");
    press(window, "F1");
    expect(window.__dh!.panel()).toBe("settings");
    press(window, "Escape");
    expect(window.__dh!.panel()).toBeNull();
    press(window, "F1");
    press(window, "F1");
    expect(window.__dh!.panel()).toBeNull();
  });

  it("pauses immediately, preserves the word/hash, blocks letters and counts 3–2–1 before another tick", () => {
    const world = window.__dh!.world();
    world.phase = "wave";
    const hash = window.__dh!.hash();
    press(window, "F2");
    const loop = h.loops.at(-1)!;
    expect(loop.paused).toBe(true);
    const tick = world.tick;
    press(window, "a", "KeyA");
    loop.advance();
    expect(world.tick).toBe(tick);
    expect(window.__dh!.hash()).toBe(hash);
    expect(window.__dh!.state().commands).toBe(0);
    expect(document.querySelector("#dh-overlay")!.classList.contains("is-hushed")).toBe(true);
    press(window, "Escape");
    for (const digit of [3, 2, 1]) {
      expect(document.querySelector(".kit-qs__count")!.textContent).toBe(String(digit));
      press(window, "a", "KeyA");
      loop.advance();
      expect(world.tick).toBe(tick);
      vi.advanceTimersByTime(1000);
    }
    expect(loop.paused).toBe(false);
    press(window, "a", "KeyA");
    expect(window.__dh!.state().commands).toBe(1);
  });

  it("leaves modal controls and Tab native, and blocks their letters from the simulation", () => {
    press(window, "F2");
    const input = row("master").querySelector("input")!;
    expect(press(input, "ArrowRight").defaultPrevented).toBe(false);
    press(input, "a", "KeyA");
    expect(window.__dh!.state().commands).toBe(0);
    choose("deep").focus();
    press(choose("deep"), "ArrowDown");
    expect(document.activeElement).toBe(choose("deep-amber"));
    // PageDown/PageUp move between families in the kit's grouped list.
    press(choose("deep-amber"), "PageDown");
    expect(document.activeElement).toBe(choose("solid"));
    press(choose("solid"), "PageDown");
    expect(document.activeElement).toBe(choose("raindrop-tile"));
    press(choose("raindrop-tile"), "PageUp");
    expect(document.activeElement).toBe(choose("solid"));
    expect(press(choose("solid"), "Tab").defaultPrevented).toBe(false);
    press(choose("solid"), "Enter");
    expect(loadSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).keyboard).toBe("solid");
  });

  it("persists every channel and graphics; mute/zero Master uses the muted speaker", async () => {
    press(window, "F2");
    for (const [id, value] of Object.entries({ master: 40, music: 30, effects: 20, keyboardVolume: 50, voice: 60, ui: 70 })) slide(id, value);
    expect(h.audio.setVolumes).toHaveBeenLastCalledWith(expect.objectContaining({ master: 0.4, music: 0.3, sfx: 0.2, voice: 0.6, ui: 0.7 }));
    slide("master", 0);
    expect(corner("sound").querySelector("img")!.getAttribute("src")).toContain("hud-sound-muted.64.png");
    slide("master", 40);
    row("master").querySelector<HTMLButtonElement>("button")!.click();
    expect(h.audio.setMuted).toHaveBeenLastCalledWith(true);
    expect(corner("sound").getAttribute("aria-label")).toBe("Sound off");
    press(window, "F1");
    row("quality").querySelector<HTMLInputElement>('input[value="low"]')!.click();
    const saved = loadSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)!));
    expect(saved).toMatchObject({ master: 0.4, music: 0.3, effects: 0.2, keyboardVolume: 0.5, voice: 0.6, ui: 0.7, muted: true, quality: "low" });
    app!.dispose();
    await boot();
    expect(h.audio.setMuted).toHaveBeenLastCalledWith(true);
    press(window, "F2");
    expect(row("master").querySelector<HTMLInputElement>("input")!.value).toBe("40");
  });

  it("offers real settings only, all seven audio rows, and Off, Dragonhold and the Typing Feel sets under their family headings", () => {
    expect([...document.querySelectorAll<HTMLElement>('[data-row]')].map((r) => r.dataset.row)).toEqual(expect.arrayContaining(["quality", "master", "music", "effects", "keyboard", "keyboardVolume", "voice", "ui"]));
    for (const id of ["fxStyle", "fxIntensity", "fxSize", "reducedMotion", "learnMeaning", "learnIpa"]) expect(row(id)).toBeNull();
    const labels = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(labels).toEqual(["Off", "Dragonhold", "Deep Velvet", "Deep Amber", "Solid Velvet", "Hail Stone", "Raindrop Tile", "Bright Clack Velvet", "Bright Clack Amber"]);
    expect([...document.querySelectorAll(".kit-keyboards__family[id]")].map((heading) => heading.textContent)).toEqual(["Deep", "Solid", "Crisp", "Bright Clack"]);
    // A first launch follows the catalogue's default without writing it into the save (parent TYPING_FEEL_SERVICE.md §4.5).
    expect(window.__dh!.keyboard()).toMatchObject({ id: "bright-clack", saved: null, owned: false, profile: "bright-clack" });
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
  });

  it("previews after 150 ms for exactly one second, cancels when closed and loads the chosen pack into gameplay", async () => {
    press(window, "F2");
    // The list was rebuilt when the catalogue came: rows under a resting pointer preview nothing until it moves (the kit's settle).
    choose("deep").dispatchEvent(new PointerEvent("pointermove", { pointerType: "mouse", clientX: 10, clientY: 10, bubbles: true }));
    choose("deep").dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse", clientX: 40, clientY: 60 }));
    vi.advanceTimersByTime(149);
    await flush();
    expect(ctx.sources).toHaveLength(0);
    vi.advanceTimersByTime(1);
    await flush();
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0]!.start).toHaveBeenCalledWith(0, 0, 1);
    choose("deep").click();
    // Many-variant sets decode in batches with a timer turn between them (16 per batch).
    await decodeAll();
    expect(h.audio.setKeyboardEnabled).toHaveBeenLastCalledWith(false);
    press(window, "Escape");
    expect(ctx.sources.at(-1)!.stop).toHaveBeenLastCalledWith(0.03);
    vi.advanceTimersByTime(3000);
    press(window, "a", "KeyA");
    expect((ctx.sources.at(-1)!.buffer as unknown as { url: string }).url).toMatch(/\/deep\/[0-9a-f]{12}\/key-\d\d.ogg$/);
    press(window, " ", "Space");
    expect((ctx.sources.at(-1)!.buffer as unknown as { url: string }).url).toMatch(/\/deep\/[0-9a-f]{12}\/space-\d\d.ogg$/);
    press(window, "F2");
    choose("off").click();
    await flush();
    press(window, "Escape");
    vi.advanceTimersByTime(3000);
    const count = ctx.sources.length;
    press(window, "b", "KeyB");
    press(window, " ", "Space");
    expect(ctx.sources).toHaveLength(count);
  });

  it("keeps exactly one set decoded while the player switches sets, and still previews each pick", async () => {
    const load = vi.spyOn(TypingSounds.prototype, "loadKeyboardManifest");
    // The catalogue's default loaded once it settled (on the page's prepared context, no gesture) and plays on a key.
    press(window, "a", "KeyA");
    await decodeAll();
    expect(load).not.toHaveBeenCalled();
    expect((ctx.sources.at(-1)!.buffer as unknown as { url: string }).url).toMatch(/\/bright-clack\/[0-9a-f]{12}\/key-\d\d.ogg$/);
    press(window, "F2");
    let sounds: TypingSounds | undefined;
    const held = () => [...(sounds as unknown as { loaded: Map<string, unknown> }).loaded.keys()];
    for (const id of ["deep", "solid", "hail-stone", "raindrop-tile", "bright-clack-amber"]) {
      choose(id).click();
      await decodeAll();
      // The gameplay player the panel loads into (the one that held Bright Clack).
      sounds ??= load.mock.contexts[0] as TypingSounds;
      expect(held()).toEqual([id]);
      expect(sounds.profile?.id).toBe(id);
      const preview = ctx.sources.find((s) => (s.buffer as unknown as { url: string } | null)?.url === setDir(id) + "preview.ogg")!;
      expect(preview.start).toHaveBeenCalledWith(expect.any(Number), 0, 1);
      // Releasing the old set never cuts the new preview (a release stops with no time).
      expect(preview.stop).not.toHaveBeenCalledWith();
    }
    // The same set picked again keeps playing.
    choose("bright-clack-amber").click();
    await decodeAll();
    expect(held()).toEqual(["bright-clack-amber"]);
    expect(sounds?.profile?.id).toBe("bright-clack-amber");
    choose("dragonhold").click();
    await flush();
    expect(held()).toEqual([]);
    choose("solid").click();
    await decodeAll();
    expect(held()).toEqual(["solid"]);
    choose("off").click();
    await flush();
    expect(held()).toEqual([]);
    load.mockRestore();
  });

  it("keeps the original keyboard as a reversible option", async () => {
    press(window, "F2");
    choose("dragonhold").click();
    await flush();
    expect(h.audio.setKeyboardEnabled).toHaveBeenLastCalledWith(true);
    expect(h.audio.setVolumes).toHaveBeenLastCalledWith(expect.objectContaining({ keyboard: 1 }));
    choose("off").click();
    expect(h.audio.setKeyboardEnabled).toHaveBeenLastCalledWith(false);
    expect(h.audio.setVolumes).toHaveBeenLastCalledWith(expect.objectContaining({ keyboard: 0 }));
  });

  it("quits to an actual title and starts again, with both buttons available on title", async () => {
    press(window, "F1");
    document.querySelector<HTMLButtonElement>('[data-action="quit"]')!.click();
    expect(window.__dh!.panel()).toBe("title");
    expect(h.loops[0]!.stop).toHaveBeenCalled();
    expect(document.querySelector<HTMLElement>(".dh-title")!.hidden).toBe(false);
    corner("sound").click();
    expect(window.__dh!.panel()).toBe("sound");
    press(window, "Escape");
    expect(document.querySelector<HTMLElement>(".kit-qs__count")!.hidden).toBe(true);
    press(window, "Enter");
    expect(document.querySelector<HTMLElement>(".dh-pacecard")!.hidden).toBe(false);
    press(window, "Enter");
    await flush();
    expect(window.__dh!.ready).toBe(true);
    expect(h.loops).toHaveLength(2);
  });
});

describe("Typing Feel keyboard sounds in the app (parent TYPING_FEEL_SERVICE.md §5.1–5.3)", () => {
  /** Boots again on a fresh page: the save, then the host (`route` answers first). */
  const reboot = async (save: Record<string, unknown> | null, route?: (url: string) => Promise<Response> | Response | undefined, given: Record<string, unknown> = { typistWpm: 35, prelearn: false, keysBase: FEEL_BASE }) => {
    app?.dispose();
    app = null;
    localStorage.clear();
    if (save) localStorage.setItem(SETTINGS_KEY, JSON.stringify(save));
    fetched = [];
    vi.clearAllMocks();
    feelHost(route);
    await boot(given);
  };
  const labels = () => [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent);
  const feelUrls = () => fetched.filter((url) => url.startsWith(FEEL_BASE));

  it("builds both panels at once and starts the run by 1.5 s while the catalogue is out; the late catalogue fills the open list in place, unsaved", async () => {
    let answer!: () => void;
    const held = new Promise<void>((resolve) => { answer = resolve; });
    await reboot(null, (url) => (url === FEEL_BASE + "keys-manifest.json" ? held.then(() => respond(url, serve(url, catalogue()))) : undefined));
    expect(corner("settings")).not.toBeNull();
    press(window, "F2");
    expect(labels()).toEqual(["Off", "Dragonhold", "Loading…"]);
    expect(choose("bright-clack").disabled).toBe(true);
    expect(window.__dh!.ready).toBe(false);
    await vi.advanceTimersByTimeAsync(KEYBOARD_GATE_MS - 20);
    expect(window.__dh!.ready).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(window.__dh!.ready).toBe(true);
    answer();
    await decodeAll();
    expect(labels()).toEqual(["Off", "Dragonhold", "Deep Velvet", "Deep Amber", "Solid Velvet", "Hail Stone", "Raindrop Tile", "Bright Clack Velvet", "Bright Clack Amber"]);
    expect(choose("bright-clack").getAttribute("aria-selected")).toBe("true");
    expect(window.__dh!.keyboard()).toMatchObject({ state: "ready", sets: 7, id: "bright-clack", owned: false, standIn: null, notice: "none" });
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
  });

  it("a host that fails (404): the saved set stays in the save as \"Saved sound · unavailable\", Dragonhold stands in for it, the notice is due, no set is fetched", async () => {
    await reboot({ keyboard: "hail-stone", music: 0.3 }, (url) => respond(url, { status: 404, type: "text/html", text: "<h1>404</h1>" }));
    expect(window.__dh!.ready).toBe(true);
    expect(window.__dh!.keyboard()).toMatchObject({ state: "missing", id: "hail-stone", saved: "hail-stone", standIn: "hail-stone", builtIn: true, notice: "due" });
    expect(h.audio.setKeyboardEnabled).toHaveBeenLastCalledWith(true);
    expect(h.audio.setVolumes).toHaveBeenLastCalledWith(expect.objectContaining({ keyboard: 1 }));
    expect(feelUrls()).toEqual([FEEL_BASE + "keys-manifest.json"]);
    press(window, "F2");
    expect(labels()).toEqual(["Off", "Dragonhold", expect.stringContaining("Saved sound")]);
    expect(choose("hail-stone").disabled).toBe(true);
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).toEqual({ keyboard: "hail-stone", music: 0.3 });
    // Typing asks nothing more of the host.
    press(window, "Escape");
    vi.advanceTimersByTime(3000);
    press(window, "a", "KeyA");
    await decodeAll();
    expect(feelUrls()).toHaveLength(1);
  });

  it("no origin: nothing is fetched from a feel host; Off and Dragonhold, which plays; no notice", async () => {
    await reboot(null, undefined, { typistWpm: 35, prelearn: false, keysBase: null });
    expect(feelUrls()).toEqual([]);
    expect(window.__dh!.ready).toBe(true);
    expect(window.__dh!.keyboard()).toMatchObject({ base: null, state: "missing", id: "dragonhold", standIn: null, notice: "none" });
    expect(h.audio.setKeyboardEnabled).toHaveBeenLastCalledWith(true);
    press(window, "F2");
    expect(labels()).toEqual(["Off", "Dragonhold"]);
  });

  it("a save without a keyboard sound gets none from unrelated Sound panel changes, host up, down or absent; the player's pick writes it (§4.5, §5.1 step 5)", async () => {
    const stored = (): Record<string, unknown> => JSON.parse(localStorage.getItem(SETTINGS_KEY)!) as Record<string, unknown>;
    const cases: [string, ((url: string) => Response | undefined) | undefined, string | null, string][] = [
      ["host up", undefined, FEEL_BASE, "deep"],
      ["host down", (url) => respond(url, { status: 404 }), FEEL_BASE, "off"],
      ["no origin", undefined, null, "off"],
    ];
    for (const [name, route, keysBase, pick] of cases) {
      await reboot({ music: 0.5 }, route, { typistWpm: 35, prelearn: false, keysBase });
      press(window, "F2");
      row("master").querySelector<HTMLButtonElement>("button")!.click();
      slide("keyboardVolume", 40);
      expect(stored(), name).toMatchObject({ music: 0.5, muted: true, keyboardVolume: 0.4 });
      // Neither the catalogue's default, the hard default nor Dragonhold (the host down) is written as the player's choice.
      expect(stored(), name).not.toHaveProperty("keyboard");
      choose(pick).click();
      await decodeAll();
      expect(stored().keyboard, name).toBe(pick);
      slide("keyboardVolume", 50);
      expect(stored(), name).toMatchObject({ keyboard: pick, keyboardVolume: 0.5 });
    }
  });

  it("decodes the saved set before any gesture on the page's prepared (suspended) context: the first run waits for its first batch, and the first key plays it (§5.4, §8.4)", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    // Before a gesture the browser keeps the context suspended, whatever resume() asks.
    ctx.state = "suspended";
    ctx.resume.mockImplementation(async () => {});
    await reboot({ keyboard: "raindrop-tile" }, (url) => (url.endsWith(".ogg") ? held.then(() => respond(url, serve(url, catalogue()))) : undefined));
    expect(feelUrls().filter((url) => url.endsWith(".ogg")).length).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(KEYBOARD_GATE_MS - 100);
    expect(window.__dh!.ready).toBe(false);
    expect(window.__dh!.keyboard()).toMatchObject({ state: "ready", id: "raindrop-tile", unlocked: false, context: "suspended", playable: false });
    release();
    await decodeAll();
    expect(window.__dh!.ready).toBe(true);
    expect(window.__dh!.keyboard()).toMatchObject({ profile: "raindrop-tile", standIn: null, context: "suspended", playable: true });
    press(window, "a", "KeyA");
    expect((ctx.sources.at(-1)!.buffer as unknown as { url: string }).url).toMatch(/\/raindrop-tile\/[0-9a-f]{12}\/key-\d\d.ogg$/);
  });

  it("a set picked in the panel that cannot sound (manifest 404): Dragonhold stands in, the save keeps the pick, the next pick ends it", async () => {
    await reboot({ keyboard: "deep" }, (url) => (url === setDir("solid") + "keys-manifest.json" ? respond(url, { status: 404 }) : undefined));
    press(window, "F2");
    choose("solid").click();
    await decodeAll();
    expect(h.audio.setKeyboardEnabled).toHaveBeenLastCalledWith(true);
    expect(window.__dh!.keyboard()).toMatchObject({ id: "solid", standIn: "solid", owned: true, profile: null });
    expect(loadSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).keyboard).toBe("solid");
    choose("deep").click();
    await decodeAll();
    expect(h.audio.setKeyboardEnabled).toHaveBeenLastCalledWith(false);
    expect(window.__dh!.keyboard()).toMatchObject({ id: "deep", standIn: null, profile: "deep" });
  });
});
