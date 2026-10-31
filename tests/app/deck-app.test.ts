import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WORDS_100 } from "../typing-helpers";

// Keep the real app, loader, deck builder and world; replace graphics/audio and frame scheduling only.
const h = vi.hoisted(() => {
  // The audio stub also takes main's Settings/Sound and keyboard calls (192, B4).
  const presenter = { dispose() {}, reset() {}, setLocator() {}, isOpen: false, setMuted() {}, setVolumes() {}, setKeyboardEnabled() {} };
  return { load: vi.fn(), presenter, openPace: vi.fn(), startLoop: vi.fn(), stopLoop: vi.fn(), models: undefined as Promise<void> | undefined, ground: undefined as Promise<void> | undefined, dragons: undefined as Promise<void> | undefined };
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
  groundBaked: h.ground, rig: {}, render() {}, useModels() {}, dispose() {},
}) }));
vi.mock("../../src/view/models", () => ({ loadCrowdModels: () => ({ ...h.presenter, ready: h.models }) }));
vi.mock("../../src/view/heroes", () => ({ createHeroes: () => ({ ...h.presenter, ready: h.dragons }) }));
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
import { createWorld } from "../../src/sim/world";
import { createLoop } from "../../src/app/loop";
import { createInputRouter } from "../../src/app/input-router";

class ElementStub {
  className = ""; textContent = ""; innerHTML = ""; hidden = false; disabled = false; id = "";
  dataset = {}; attributes: Record<string, string> = {}; children: ElementStub[] = [];
  classList = { toggle() {}, add() {}, remove() {} };
  events = new Map<string, Set<(e: any) => void>>();
  constructor(readonly ownerDocument: DocumentStub) {}
  append(...nodes: ElementStub[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: ElementStub[]) { this.children = nodes; }
  remove() { this.ownerDocument.removed.add(this); }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  addEventListener(key: string, fn: (e: any) => void) { if (!this.events.has(key)) this.events.set(key, new Set()); this.events.get(key)!.add(fn); }
  removeEventListener(key: string, fn: (e: any) => void) { this.events.get(key)?.delete(fn); }
  focus() {}
  click() { if (!this.disabled) this.events.get("click")?.forEach(fn => fn({ preventDefault() {}, stopPropagation() {} })); }
}
class DocumentStub {
  nodes: ElementStub[] = []; removed = new Set<ElementStub>();
  defaultView: any = Object.assign(new ElementStub(this), { location: { search: "" }, performance: { now: () => 0 } });
  overlay = this.createElement(); canvas = this.createElement();
  createElement() { const node = new ElementStub(this); this.nodes.push(node); return node; }
  getElementById(id: string) { return id === "dh-overlay" ? this.overlay : this.canvas; }
  addEventListener() {} removeEventListener() {} hasFocus() { return true; }
  node(cls: string) { return this.nodes.find(node => node.className.split(" ").includes(cls))!; }
}
const entries = WORDS_100.map(en => ({ id: en, en, vi: "", ipa: "" }));
const apps: ReturnType<typeof startApp>[] = [];
async function settle() { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }
beforeEach(() => { vi.clearAllMocks(); h.load.mockReset(); h.models = h.ground = h.dragons = undefined; vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { apps.splice(0).forEach(app => app.dispose()); vi.restoreAllMocks(); });

it.each(["load-failed", "empty", "too-small"])("the bypassed app cannot create a run, loop or wave after %s", async reason => {
  h.load.mockImplementation(async () => { if (reason === "load-failed") throw Error("network"); return reason === "empty" ? [] : entries.slice(0, 69); });
  const doc = new DocumentStub(); apps.push(startApp(doc as unknown as Document, { title: false })); await settle();
  expect(doc.node("dh-deck-notice").attributes.role).toBe("alertdialog");
  expect(createWorld).not.toHaveBeenCalled(); expect(createLoop).not.toHaveBeenCalled(); expect(createInputRouter).toHaveBeenCalledOnce();
  expect(h.openPace).not.toHaveBeenCalled(); expect(h.startLoop).not.toHaveBeenCalled();
  expect(doc.defaultView.__dh.state().ready).toBe(false);
  expect(doc.defaultView.__dh.events().tally["wave-start"] ?? 0).toBe(0);
});
it("the actual app boots exactly one run/router/loop after recovery, and removes its error keys", async () => {
  h.load.mockRejectedValueOnce(Error("network")).mockResolvedValueOnce(entries);
  const doc = new DocumentStub(); apps.push(startApp(doc as unknown as Document, { title: false, typistWpm: 35 }));
  // The app's own keydown listeners before the deck fails (B4: the keyboard sound's preload on a key).
  const appKeys = doc.defaultView.events.get("keydown")?.size ?? 0;
  await settle();
  const retry = doc.node("dh-deck-notice__retry"); retry.click(); retry.click(); await settle(); retry.click(); await settle();
  expect(createWorld).toHaveBeenCalledOnce(); expect(createInputRouter).toHaveBeenCalledOnce(); expect(createLoop).toHaveBeenCalledOnce();
  expect(h.startLoop).toHaveBeenCalledOnce(); expect(h.load).toHaveBeenCalledTimes(2);
  expect(doc.defaultView.__dh.state().ready).toBe(true);
  expect(doc.removed.has(doc.node("dh-deck-notice"))).toBe(true);
  expect(doc.defaultView.events.get("keydown")?.size ?? 0).toBe(appKeys);
});


it.each(["load-failed", "empty", "too-small"])("title blocks %s, owns early input, and never opens pace or a run", async reason => {
  h.load.mockImplementation(async () => { if (reason === "load-failed") throw Error("network"); return reason === "empty" ? [] : entries.slice(0, 69); });
  const doc = new DocumentStub(); apps.push(startApp(doc as unknown as Document));
  expect(createInputRouter).toHaveBeenCalledOnce();
  const intercept = vi.mocked(createInputRouter).mock.calls[0]![2]!.intercept!;
  expect(intercept({} as KeyboardEvent, null, "a")).toBe(true);
  expect(intercept({} as KeyboardEvent, "enter", null)).toBe(true);
  await settle();
  expect(doc.defaultView.__dh.state().title).toBe("blocked");
  expect(doc.node("dh-title__error").textContent).toBe("Words could not load");
  expect(doc.node("dh-title__start").disabled).toBe(true);
  expect(intercept({} as KeyboardEvent, "enter", null)).toBe(true);
  expect(intercept({} as KeyboardEvent, "escape", null)).toBe(true);
  expect(createWorld).not.toHaveBeenCalled(); expect(h.openPace).not.toHaveBeenCalled(); expect(h.startLoop).not.toHaveBeenCalled();
});

it.each([true, false])("title waits for all four sources, then Start precedes pace (URL WPM %s)", async urlWpm => {
  let words!: (value: typeof entries) => void, models!: () => void, ground!: () => void, dragons!: () => void;
  h.load.mockReturnValue(new Promise(resolve => { words = resolve; }));
  h.models = new Promise(resolve => { models = resolve; }); h.ground = new Promise(resolve => { ground = resolve; }); h.dragons = new Promise(resolve => { dragons = resolve; });
  const doc = new DocumentStub(); apps.push(startApp(doc as unknown as Document, urlWpm ? { typistWpm: 35 } : {}));
  const intercept = vi.mocked(createInputRouter).mock.calls[0]![2]!.intercept!;
  await settle(); words(entries); models(); ground(); await settle();
  expect(doc.defaultView.__dh.state().title).toBe("loading");
  intercept({} as KeyboardEvent, "enter", null); expect(createWorld).not.toHaveBeenCalled(); expect(h.openPace).not.toHaveBeenCalled();
  dragons(); await settle(); expect(doc.defaultView.__dh.state().title).toBe("ready");
  expect(createWorld).not.toHaveBeenCalled(); expect(h.openPace).not.toHaveBeenCalled();
  intercept({} as KeyboardEvent, "enter", null); doc.node("dh-title__start").click();
  expect(doc.defaultView.__dh.state().title).toBe("started");
  if (urlWpm) { expect(h.openPace).not.toHaveBeenCalled(); }
  else {
    expect(createWorld).not.toHaveBeenCalled(); expect(h.openPace).toHaveBeenCalledOnce();
    h.openPace.mock.calls[0]![2]({ typistWpm: 35, source: "preset" });
  }
  expect(createWorld).toHaveBeenCalledOnce(); expect(createLoop).toHaveBeenCalledOnce();
});

it("title settles each rejected optional promise once and ignores completions after dispose", async () => {
  h.load.mockResolvedValue(entries);
  h.models = Promise.reject(Error("models")); h.ground = Promise.reject(Error("ground")); h.dragons = Promise.reject(Error("dragons"));
  const doc = new DocumentStub(); const app = startApp(doc as unknown as Document); apps.push(app); await settle();
  expect(doc.defaultView.__dh.state().title).toBe("ready");
  expect(vi.mocked(console.warn).mock.calls.filter(call => call[0] === "title: load failed")).toHaveLength(3);
  app.dispose(); doc.node("dh-title__start").click(); expect(createWorld).not.toHaveBeenCalled();
});
