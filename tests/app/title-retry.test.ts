import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORDS_100 } from "../typing-helpers";

// The real app, title, loader, deck builder and world, as in deck-app.test.ts; graphics, audio and frames are stubbed.
const h = vi.hoisted(() => {
  // The audio stub also takes main's Settings/Sound and keyboard calls (192, B4).
  const presenter = { dispose() {}, reset() {}, setLocator() {}, isOpen: false, setMuted() {}, setVolumes() {}, setKeyboardEnabled() {} };
  return { load: vi.fn(), presenter, openPace: vi.fn(), startLoop: vi.fn(), stopLoop: vi.fn() };
});
vi.mock("../../src/app/learning", async original => {
  const actual = await original<typeof import("../../src/app/learning")>();
  return { ...actual, createLearningClient: (options: any) => actual.createLearningClient({ ...options, loadEntries: h.load,
    storage: { readJson: () => null, writeJson: () => true }, every: () => () => {} }) };
});
vi.mock("../../src/sim/world", async original => {
  const actual = await original<typeof import("../../src/sim/world")>();
  return { ...actual, createWorld: vi.fn(actual.createWorld) };
});
vi.mock("../../src/ui/skin", async original => ({ ...await original<typeof import("../../src/ui/skin")>(), installSkin: vi.fn() }));
vi.mock("../../src/app/portal", async original => ({ ...await original<typeof import("../../src/app/portal")>(), createPortalBridge: () => ({
  lookup: async () => { throw Error("offline"); }, requestFocus() {}, onSharedMusic: () => () => {}, dispose() {},
}) }));
// Settings/Sound panels (192) need a real DOM; quick-settings.test.ts covers them with happy-dom.
vi.mock("../../src/app/quick", () => ({ createQuickSettings: () => ({ blocking: false, panel: null, destroy() {}, setChoiceOptions() {} }) }));
// Quit and dispose stop speech (192); the kit's stopSpeech reads window, which this node stub has not.
vi.mock("../../src/kit/speech", async original => ({ ...await original<typeof import("../../src/kit/speech")>(), stopSpeech: vi.fn() }));
vi.mock("../../src/app/pace-card", () => ({ createPaceCard: () => ({ ...h.presenter, open: h.openPace }) }));
vi.mock("../../src/app/loop", () => ({ createLoop: vi.fn(() => ({ start: h.startLoop, stop: h.stopLoop })) }));
vi.mock("../../src/app/input-router", () => ({ createInputRouter: vi.fn(() => ({ handlers: [], stats: {}, dispose() {} })) }));
vi.mock("../../src/view/stage", () => ({ createMapStage: () => ({
  stage: { layers: { ground: { children: [] }, actors: { children: [] }, fx: { children: [] } } },
  groundBaked: undefined, rig: {}, render() {}, useModels() {}, dispose() {},
}) }));
vi.mock("../../src/view/models", () => ({ loadCrowdModels: () => ({ ...h.presenter, ready: undefined }) }));
vi.mock("../../src/view/heroes", () => ({ createHeroes: () => ({ ...h.presenter, ready: undefined }) }));
vi.mock("../../src/audio", () => ({ createAudio: () => h.presenter }));
vi.mock("../../src/view/actors", () => ({ createActors: () => h.presenter }));
vi.mock("../../src/view/telegraphs", () => ({ createTelegraphs: () => h.presenter }));
vi.mock("../../src/view/banners", () => ({ createBanners: () => h.presenter }));
vi.mock("../../src/view/hpbars", () => ({ createHpBars: () => h.presenter }));
vi.mock("../../src/view/fx", () => ({ createFx: () => h.presenter }));
vi.mock("../../src/view/lane-cue", () => ({ createLaneCue: () => h.presenter }));
vi.mock("../../src/ui/tags", () => ({ createTags: () => h.presenter }));
vi.mock("../../src/ui/hud", () => ({ createHud: () => h.presenter }));
vi.mock("../../src/ui/learning-frame", () => ({ createLearningFrame: () => h.presenter, createPrelearn: () => h.presenter, createReviewCard: () => h.presenter }));
vi.mock("../../src/ui/placement-ui", () => ({ createPlacementUi: () => h.presenter }));
vi.mock("../../src/ui/wave-card", () => ({ createWaveCard: () => h.presenter }));
vi.mock("../../src/ui/shop-strip", () => ({ createShopStrip: () => h.presenter }));
vi.mock("../../src/ui/debut-card", () => ({ createDebutCard: () => h.presenter }));
vi.mock("../../src/ui/results", () => ({ createResults: () => h.presenter, VICTORY_HOLD_MS: 2600 }));

import { startApp } from "../../src/app/app";
import { createDeckLoader } from "../../src/app/deck-boot";
import { DeckBuildError } from "../../src/app/learning";
import { STAGE_M0 } from "../../src/content/data/stages";
import { createWorld } from "../../src/sim/world";
import { createLoop } from "../../src/app/loop";
import { createInputRouter } from "../../src/app/input-router";
import type { WordDeck } from "../../src/content/types";

class ElementStub {
  className = ""; textContent = ""; innerHTML = ""; hidden = false; disabled = false; id = ""; href = ""; target = "";
  dataset = {}; attributes: Record<string, string> = {}; children: ElementStub[] = [];
  classList = { toggle() {}, add() {}, remove() {} };
  events = new Map<string, Set<(e: any) => void>>();
  constructor(readonly ownerDocument: DocumentStub) {}
  append(...nodes: ElementStub[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: ElementStub[]) { this.children = nodes; }
  remove() {}
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  addEventListener(key: string, fn: (e: any) => void) { if (!this.events.has(key)) this.events.set(key, new Set()); this.events.get(key)!.add(fn); }
  removeEventListener(key: string, fn: (e: any) => void) { this.events.get(key)?.delete(fn); }
  focus() {}
  click() { if (!this.disabled) this.events.get("click")?.forEach(fn => fn({ preventDefault() {}, stopPropagation() {} })); }
}
class DocumentStub {
  nodes: ElementStub[] = [];
  defaultView: any = Object.assign(new ElementStub(this), { location: { search: "" }, performance: { now: () => 0 } });
  overlay = this.createElement(); canvas = this.createElement();
  createElement() { const node = new ElementStub(this); this.nodes.push(node); return node; }
  getElementById(id: string) { return id === "dh-overlay" ? this.overlay : this.canvas; }
  addEventListener() {} removeEventListener() {} hasFocus() { return true; }
  node(cls: string) { return this.nodes.find(node => node.className.split(" ").includes(cls))!; }
}
const entries = WORDS_100.map(en => ({ id: en, en, vi: "", ipa: "" }));
const failure = (reason: string) => async () => { if (reason === "load-failed") throw Error("network"); return reason === "empty" ? [] : entries.slice(0, 69); };
const apps: ReturnType<typeof startApp>[] = [];
async function settle() { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }
function boot() {
  const doc = new DocumentStub(); const app = startApp(doc as unknown as Document, { typistWpm: 35 }); apps.push(app);
  const intercept = vi.mocked(createInputRouter).mock.calls[0]![2]!.intercept!;
  const key = (action: string) => intercept({} as KeyboardEvent, action, null);
  return { doc, app, key, state: () => doc.defaultView.__dh.state().title, retry: () => doc.node("dh-title__retry"), start: () => doc.node("dh-title__start") };
}
beforeEach(() => { vi.clearAllMocks(); h.load.mockReset(); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { apps.splice(0).forEach(app => app.dispose()); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("default title recovers from a deck error (222 F3)", () => {
  it.each(["load-failed", "empty", "too-small"])("after %s, Enter on Retry reloads once and Start opens the run", async reason => {
    h.load.mockImplementationOnce(failure(reason)).mockResolvedValueOnce(entries);
    const f = boot(); await settle();
    expect(f.state()).toBe("blocked"); expect(f.start().disabled).toBe(true);
    expect(f.retry().hidden).toBe(false); expect(f.retry().disabled).toBe(false);
    // Two Retry presses in a row (keys and mouse) run one load.
    expect(f.key("enter")).toBe(true); expect(h.load).toHaveBeenCalledTimes(2);
    f.key("enter"); f.retry().click();
    expect(h.load).toHaveBeenCalledTimes(2);
    await settle();
    expect(f.state()).toBe("ready"); expect(f.start().disabled).toBe(false); expect(f.retry().hidden).toBe(true);
    f.retry().click(); f.key("enter"); await settle();
    expect(h.load).toHaveBeenCalledTimes(2);
    expect(f.state()).toBe("started");
    expect(createWorld).toHaveBeenCalledOnce(); expect(createLoop).toHaveBeenCalledOnce(); expect(h.startLoop).toHaveBeenCalledOnce();
    expect(f.doc.defaultView.__dh.state().ready).toBe(true);
  });

  it("blocks again after a second failure, then a mouse Retry succeeds", async () => {
    let resolve!: (value: typeof entries) => void;
    h.load.mockImplementationOnce(failure("load-failed")).mockImplementationOnce(failure("too-small"))
      .mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const f = boot(); await settle();
    f.retry().click(); await settle();
    expect(f.state()).toBe("blocked"); expect(f.start().disabled).toBe(true); expect(f.retry().disabled).toBe(false);
    f.retry().click(); f.retry().click(); await settle();
    expect(h.load).toHaveBeenCalledTimes(3); expect(f.state()).toBe("loading"); expect(f.start().disabled).toBe(true);
    expect(f.doc.node("dh-title__status").textContent).toBe("Loading words…");
    resolve(entries); await settle();
    expect(f.doc.node("dh-title__status").textContent).toBe("Press Enter to start");
    expect(f.state()).toBe("ready"); f.start().click();
    expect(createWorld).toHaveBeenCalledOnce(); expect(h.load).toHaveBeenCalledTimes(3);
  });

  it("keeps a configured portal usable on the blocked title", async () => {
    vi.stubEnv("VITE_PORTAL_URL", "https://portal.example/games");
    h.load.mockImplementation(failure("empty"));
    const f = boot(); await settle();
    const portal = f.doc.node("dh-title__portal"); const click = vi.spyOn(portal, "click");
    f.key("rotate-right"); f.key("enter");
    expect(click).toHaveBeenCalledOnce(); expect(h.load).toHaveBeenCalledOnce(); expect(f.state()).toBe("blocked");
  });

  it("never settles or boots a deck that arrives after dispose", async () => {
    let resolve!: (value: typeof entries) => void;
    h.load.mockImplementationOnce(failure("load-failed")).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const f = boot(); await settle();
    const retry = f.retry(); retry.click(); f.app.dispose(); resolve(entries); await settle();
    retry.click(); await settle();
    expect(h.load).toHaveBeenCalledTimes(2); expect(createWorld).not.toHaveBeenCalled(); expect(h.startLoop).not.toHaveBeenCalled();
  });
});

describe("deck loader: the 195 recovery path shared by both boots", () => {
  const deck = { words: [] } as unknown as WordDeck;
  function loader(build: () => Promise<WordDeck>) {
    const learning = { buildDeck: vi.fn(build) }; const ready = vi.fn(), failed = vi.fn(), started = vi.fn();
    return { learning, ready, failed, started, loader: createDeckLoader(learning, STAGE_M0, { ready, failed, started }) };
  }
  it("runs one build at a time and none after a delivered deck", async () => {
    let resolve!: (value: WordDeck) => void;
    const f = loader(() => new Promise(r => { resolve = r; }));
    expect(f.loader.load()).toBe(true); expect(f.loader.load()).toBe(false); expect(f.loader.busy).toBe(true);
    resolve(deck); await settle();
    expect(f.ready).toHaveBeenCalledExactlyOnceWith(deck); expect(f.loader.load()).toBe(false);
    expect(f.learning.buildDeck).toHaveBeenCalledOnce(); expect(f.started).toHaveBeenCalledOnce();
  });
  it("reports failures as DeckBuildError, allows the next try, and stops after dispose", async () => {
    const f = loader(async () => { throw Error("network"); });
    f.loader.load(); await settle();
    expect(f.failed).toHaveBeenCalledOnce(); expect(f.failed.mock.calls[0]![0]).toBeInstanceOf(DeckBuildError);
    expect(f.failed.mock.calls[0]![0].reason).toBe("load-failed"); expect(f.loader.busy).toBe(false);
    expect(f.loader.load()).toBe(true); f.loader.dispose(); await settle();
    expect(f.failed).toHaveBeenCalledOnce(); expect(f.loader.load()).toBe(false);
    expect(f.learning.buildDeck).toHaveBeenCalledTimes(2); expect(f.ready).not.toHaveBeenCalled();
  });
});
