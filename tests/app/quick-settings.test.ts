// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
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
import { LIST_ROW_VARS, PLATE_MARGIN, PLATE_SLICE, QUICK_ICONS } from "../../src/app/quick";
import { QUICK_ICON_NAMES } from "../../src/kit/ui";

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
/** Rule bodies by selector (comments dropped, whitespace folded; each selector of a list gets the body) and every head. */
function cssRules(source: string): { rules: Map<string, string>; heads: string[] } {
  const rules = new Map<string, string>();
  const heads: string[] = [];
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, head, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    heads.push(head!.trim());
    for (const selector of head!.split(",").map((part) => part.trim()).filter(Boolean)) {
      rules.set(selector, (rules.get(selector) ?? "") + body!.replace(/\s+/g, " ").trim() + " ");
    }
  }
  return { rules, heads };
}
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
/** Straight into a run (?title=0) unless a test boots the 197 title itself. */
const IN_RUN = { typistWpm: 35, prelearn: false, keysBase: FEEL_BASE, title: false };
const boot = async (given: Record<string, unknown> = IN_RUN) => {
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

  it("sliders draw the 241 groove as the empty part and the 244 ember fill clipped at the 225 knob, every groove one length", () => {
    const root = document.querySelector<HTMLElement>(".dh-quick")!;
    expect(root.classList.contains("kit-qs--skin-slider")).toBe(true);
    // The fill layer runs on real art: the 241 groove right of the knob, the 244 fill (accepted 31/10) left of it.
    expect(root.classList.contains("kit-qs--slider-fill")).toBe(true);
    expect(root.classList.contains("kit-qs--fill-art")).toBe(true);
    for (const name of ["--kit-qs-skin-track", "--kit-qs-skin-empty"]) {
      expect(root.style.getPropertyValue(name), name).toContain("/assets/dragon-hold/ui/quick-settings/slider-track.png");
    }
    expect(root.style.getPropertyValue("--kit-qs-skin-fill")).toContain("/assets/dragon-hold/ui/quick-settings/slider-fill.png");
    expect(root.style.getPropertyValue("--kit-qs-skin-thumb")).toContain("/assets/dragon-hold/ui/quick-settings/slider-thumb.128.png");
    press(window, "F2");
    // Every slider row: the range over the groove and fill layers, and the Mute column after the number (empty but for
    // Master), so all grooves have one length.
    for (const id of ["master", "music", "effects", "keyboardVolume", "voice", "ui"]) {
      const slider = row(id).querySelector(".kit-qs__slider")!;
      expect(slider.querySelector(".kit-qs__groove"), id).not.toBeNull();
      expect(slider.querySelector(".kit-qs__fill"), id).not.toBeNull();
      expect(slider.querySelector("input.kit-qs__range"), id).not.toBeNull();
      expect(row(id).querySelector(".kit-qs__aside"), id).not.toBeNull();
    }
    expect(row("master").querySelector('.kit-qs__aside [data-toggle="muted"]')).not.toBeNull();
    // The fill follows the value (the kit clips it at the knob's centre through --kit-qs-v).
    const music = row("music").querySelector<HTMLElement>(".kit-qs__slider")!;
    for (const [value, v] of [[0, "0.0000"], [50, "0.5000"], [100, "1.0000"]] as const) {
      slide("music", value);
      expect(music.style.getPropertyValue("--kit-qs-v"), String(value)).toBe(v);
    }
    // A DOM stub has no cascade: read the sheet. Knob 32 px, the 64 px chevron caps 10 px (groove and fill share the
    // cut), Mute's column 90 px; both parts drawn as painted, no filter standing in for art.
    const { rules, heads } = cssRules(readFileSync("src/app/app.css", "utf8"));
    const layer = rules.get(".dh-quick.kit-qs") ?? "";
    for (const line of [
      "--kit-qs-knob: calc(32px * var(--kit-qs-s));",
      "--kit-qs-groove-slice: 0 64;",
      "--kit-qs-groove-cap: calc(10px * var(--kit-qs-s));",
      "--kit-qs-aside-w: calc(90px * var(--kit-qs-s));",
    ]) expect(layer, line).toContain(line);
    expect(layer).not.toContain("--kit-qs-empty-filter");
    expect(layer).not.toContain("--kit-qs-fill-filter");
    const at = (pseudo: string) => rules.get(`.dh-quick.kit-qs--skin-slider .kit-qs__range${pseudo}`) ?? "";
    // The knob art only: the kit's --kit-qs-text square under it is cleared.
    for (const thumb of ["::-webkit-slider-thumb", "::-moz-range-thumb"]) expect(at(thumb), thumb).toContain("background-color: transparent;");
    expect(at("")).toContain("height: calc(32px * var(--kit-qs-s));");
    // The old track rules and the 6em basis on the range are gone (the kit's fill layer draws the groove now).
    expect(at("::-webkit-slider-runnable-track")).toBe("");
    expect(rules.get(".dh-quick .kit-qs__control .kit-qs__range")).toBeUndefined();
    // One unknown pseudo-element drops a whole rule: WebKit and Gecko never share one.
    expect(heads.filter((head) => head.includes("::-webkit-") && head.includes("::-moz-"))).toEqual([]);
  });

  it("the Sound panel is 640 px wide, so the grooves take the room Mute's column costs", () => {
    const { rules } = cssRules(readFileSync("src/app/app.css", "utf8"));
    expect(rules.get('.dh-quick .kit-qs__dialog[data-panel="sound"] .kit-qs__panel')).toContain("width: min(calc(640px * var(--kit-qs-s)), calc(100% - 32px));");
  });

  it("the frame's stone is one picture: the stretched centre covers the edge slices' inner stone, the corners keep their claws (judges 31/10)", () => {
    const { rules } = cssRules(readFileSync("src/app/app.css", "utf8"));
    const panel = rules.get(".dh-quick.kit-qs--skin-panel .kit-qs__panel") ?? "";
    expect(panel).toContain("isolation: isolate;");
    expect(panel).toContain("background: var(--dh-qs-stone);");
    const stone = rules.get(".dh-quick.kit-qs--skin-panel .kit-qs__panel::before") ?? "";
    // One square copy of the art scaled by the width (its middle 630 of 1254 px across the box): never squashed per
    // axis, so the frame's own gold band never lands inside a short panel.
    expect(stone).toContain("background: var(--kit-qs-skin-panel) center / 199.05% auto no-repeat transparent;");
    expect(stone).toContain("z-index: -1;");
    expect(stone).toContain("pointer-events: none;");
    // A cross: full height between the corners (bar the bottom band's 10 px deeper gold) and full width between them,
    // so only the 83 px corner squares (125 - 42 px of the drawn edge, inside the gold) show the frame's own slices.
    expect(stone).toContain("mask: linear-gradient(#000 0 0) center top / calc(100% - 166px * var(--kit-qs-s)) calc(100% - 10px * var(--kit-qs-s)) no-repeat, linear-gradient(#000 0 0) center / 100% calc(100% - 166px * var(--kit-qs-s)) no-repeat;");
  });

  it("labels, headings, buttons, chips and keyboard rows are in Cormorant; numbers and notes keep Be Vietnam Pro; a hovered keyboard row lights", () => {
    const { rules } = cssRules(readFileSync("src/app/app.css", "utf8"));
    const layer = rules.get(".dh-quick.kit-qs") ?? "";
    for (const line of [
      "--kit-qs-button-font: var(--dh-font-title);",
      "--kit-qs-label-font: var(--dh-font-title);",
      "--kit-qs-note-font: var(--dh-font);",
      "--kit-qs-list-hover-filter: brightness(1.3) drop-shadow(",
    ]) expect(layer, line).toContain(line);
    expect(rules.get(".dh-quick .kit-qs__label")).toContain("font-size: calc(19px * var(--kit-qs-s));");
    expect(rules.get(".dh-quick .kit-qs__btn")).toContain("font-size: calc(18px * var(--kit-qs-s));");
    expect(rules.get(".dh-quick .kit-qs__chip")).toContain("font-size: calc(18px * var(--kit-qs-s));");
  });

  it("the knob answers hover, press and keyboard focus with its own light, and the range shows a hand", () => {
    const { rules } = cssRules(readFileSync("src/app/app.css", "utf8"));
    const at = (state: string) => rules.get(`.dh-quick.kit-qs--skin-slider .kit-qs__range${state}`) ?? "";
    expect(at("")).toContain("cursor: pointer;");
    expect(at(":active")).toContain("cursor: grabbing;");
    // The kit's flat 2 px box around the whole range gives way to the ember-gold glow on the knob and a warm groove.
    expect(at(":focus-visible")).toContain("outline: none;");
    expect(rules.get(".dh-quick.kit-qs")).toContain("--kit-qs-glow: #ffc14d;");
    for (const thumb of ["::-webkit-slider-thumb", "::-moz-range-thumb"]) {
      expect(at(`:hover${thumb}`), thumb).toMatch(/filter: brightness\(1\.15\) drop-shadow\(/);
      expect(at(`:active${thumb}`), thumb).toContain("transform: scale(1.08);");
      expect(at(`:focus-visible${thumb}`), thumb).toContain("filter: brightness(1.12) var(--kit-qs-glow-filter);");
    }
    const warm = rules.get(".dh-quick .kit-qs__slider:has(.kit-qs__range:focus-visible)") ?? "";
    expect(warm).toMatch(/--kit-qs-empty-filter: drop-shadow\(/);
    expect(warm).toMatch(/--kit-qs-fill-filter: brightness\(1\.1\) drop-shadow\(/);
  });

  it("muted, the Master row dims and strikes its number, shows the muted speaker and the button reads Unmute", async () => {
    const root = document.querySelector<HTMLElement>(".dh-quick")!;
    expect(root.style.getPropertyValue("--dh-qs-icon-muted")).toContain("/assets/dragon-hold/ui/quick-settings/hud-sound-muted.64.png");
    // The button-active plate now comes through the kit's skin field.
    expect(root.classList.contains("kit-qs--skin-button-active")).toBe(true);
    expect(root.style.getPropertyValue("--kit-qs-skin-button-active")).toContain("/assets/dragon-hold/ui/quick-settings/button-active.alpha.png");
    press(window, "F2");
    const master = row("master");
    const mute = master.querySelector<HTMLButtonElement>('[data-toggle="muted"]')!;
    expect(mute.textContent).toBe("Mute");
    expect(master.classList.contains("dh-quick__row--muted")).toBe(false);
    mute.click();
    await flush();
    expect(mute.getAttribute("aria-pressed")).toBe("true");
    expect(mute.textContent).toBe("Unmute");
    expect(master.classList.contains("dh-quick__row--muted")).toBe(true);
    expect(master.classList.contains("dh-quick__row--silent")).toBe(true);
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).muted).toBe(true);
    mute.click();
    await flush();
    expect(mute.textContent).toBe("Mute");
    expect(master.classList.contains("dh-quick__row--muted")).toBe(false);
    expect(master.classList.contains("dh-quick__row--silent")).toBe(false);
    // Master at 0 is silent too (the corner speaker shows muted then), without the dimmed groove.
    slide("master", 0);
    await flush();
    expect(master.classList.contains("dh-quick__row--silent")).toBe(true);
    expect(master.classList.contains("dh-quick__row--muted")).toBe(false);
    const { rules } = cssRules(readFileSync("src/app/app.css", "utf8"));
    // The whole slider dims (both groove layers and the knob), not only the range (which would leave the fill lit).
    expect(rules.get(".dh-quick .dh-quick__row--muted .kit-qs__slider")).toContain("filter: grayscale(0.7) brightness(0.6);");
    expect(rules.get(".dh-quick .dh-quick__row--muted .kit-qs__range")).toBeUndefined();
    expect(rules.get(".dh-quick .dh-quick__row--muted .kit-qs__num")).toContain("text-decoration: line-through;");
    expect(rules.get(".dh-quick .dh-quick__row--silent .kit-qs__icon-cell")).toContain("background: var(--dh-qs-icon-muted) center / contain no-repeat;");
    expect(rules.get(".dh-quick .dh-quick__row--silent .kit-qs__icon")).toContain("opacity: 0;");
    // One width for "Mute" and "Unmute": the toggle fills the 90 px column.
    expect(rules.get(".dh-quick.kit-qs--skin-button .kit-qs__btn[data-toggle]")).toContain("min-width: calc(90px * var(--kit-qs-s));");
  });

  it("buttons and chips are 32 px 162 plates whose transparent margins sit outside the box; Resume, a pressed Mute and the chosen chip wear the lit active plate", () => {
    press(window, "F1");
    const resume = document.querySelector<HTMLButtonElement>('.kit-qs__dialog[data-panel="settings"] [data-action="resume"]')!;
    expect(resume.classList.contains("kit-qs__btn--primary")).toBe(true);
    const { rules } = cssRules(readFileSync("src/app/app.css", "utf8"));
    // The frame is a 9-slice of the 162 slice data (312 px corners, edges round) at one scale; the centre is one
    // stretched copy of the art's middle (1254/630), clipped inside the gold edge, never tiled.
    const panel = rules.get(".dh-quick.kit-qs--skin-panel .kit-qs__panel") ?? "";
    expect(panel).toContain("border: calc(42px * var(--kit-qs-s)) solid transparent;");
    expect(panel).toContain("border-image: var(--kit-qs-skin-panel) 312 / calc(125px * var(--kit-qs-s)) / 0 round;");
    expect(rules.get(".dh-quick .kit-qs__panel")).toContain(
      "padding: calc(10px * var(--kit-qs-s)) calc(20px * var(--kit-qs-s)) calc(22px * var(--kit-qs-s));",
    );
    // The plate: cut at the margin plus the corner ornament (PLATE_SLICE), drawn at 32/433 of the art, the margins
    // (PLATE_MARGIN) pushed outside the box by the outset, so the 433 px plate fills the 32 px box.
    const k = 32 / 433;
    const len = (n: number) => `calc(${Math.round(n * k * 10) / 10}px * var(--kit-qs-s))`;
    const [t, r, b] = PLATE_SLICE;
    const [mt, mr, mb] = PLATE_MARGIN;
    const plate = `border-image: var(--kit-qs-skin-button) ${PLATE_SLICE.join(" ")} fill / ${len(t)} ${len(r)} ${len(b)} / ${len(mt)} ${len(mr)} ${len(mb)} stretch;`;
    for (const selector of [".dh-quick.kit-qs--skin-button .kit-qs__btn", ".dh-quick.kit-qs--skin-button .kit-qs__chip"]) {
      const body = rules.get(selector) ?? "";
      expect(body, selector).toContain(plate);
      expect(body, selector).toContain("min-height: calc(32px * var(--kit-qs-s));");
      expect(body, selector).toContain("border: 0 solid transparent;");
      // No flat colour or rounded web border under the art.
      expect(body, selector).toContain("background: none;");
      expect(body, selector).toContain("border-radius: 0;");
    }
    for (const state of [".kit-qs__btn--primary", '.kit-qs__btn[aria-pressed="true"]', '.kit-qs__btn[aria-checked="true"]', ".kit-qs__opt input:checked + .kit-qs__chip"]) {
      const body = rules.get(`.dh-quick.kit-qs--skin-button ${state}`) ?? "";
      expect(body, state).toContain("border-image-source: var(--kit-qs-skin-button-active, var(--kit-qs-skin-button));");
      expect(body, state).toContain("color: var(--kit-qs-active-text);");
      // Brighter rim and an ember glow; keyboard focus adds the gold glow to that light.
      expect(body, state).toMatch(/filter: var\(--dh-qs-lit\) drop-shadow\(/);
      expect(body, state).toMatch(/--kit-qs-glow-filter: var\(--dh-qs-lit\) drop-shadow\(/);
    }
    expect(rules.get(".dh-quick.kit-qs")).toContain("--kit-qs-active-text: #f2c14e;");
    // Hover: a clear brighten plus glow on every plate.
    for (const selector of [".dh-quick.kit-qs--skin-button .kit-qs__btn:hover", ".dh-quick.kit-qs--skin-button .kit-qs__opt:hover input:not(:disabled) + .kit-qs__chip"]) {
      expect(rules.get(selector), selector).toMatch(/filter: brightness\(1\.3\) drop-shadow\(/);
    }
  });

  it("the plate cut holds the 162 art's margins and its corner ornaments", () => {
    // Visible plate 2102 x 433 at (35, 143) of 2172 x 724; the ornaments reach 195 px across and 185 px down.
    expect(PLATE_MARGIN).toEqual([143, 35, 724 - 143 - 433, 2172 - 35 - 2102]);
    expect(PLATE_SLICE).toEqual([143 + 185, 35 + 195, 148 + 185, 35 + 195]);
  });

  it("Quality is one short label with its chips on one line, on the plates, the chosen one on the active plate", () => {
    press(window, "F1");
    const settings = document.querySelector<HTMLElement>('.kit-qs__dialog[data-panel="settings"]')!;
    expect(settings.querySelector(".kit-qs__heading")!.textContent).toBe("Graphics · next launch");
    expect(row("quality").querySelector(".kit-qs__label")!.textContent).toBe("Quality");
    expect([...row("quality").querySelectorAll(".kit-qs__chip")].map((chip) => chip.textContent)).toEqual(["Low", "Medium", "High", "Ultra"]);
    const { rules } = cssRules(readFileSync("src/app/app.css", "utf8"));
    expect(rules.get('.dh-quick .kit-qs__dialog[data-panel="settings"] .kit-qs__row')).toContain("grid-template-columns: var(--kit-qs-icon-size) auto minmax(0, 1fr);");
    expect(rules.get(".dh-quick.kit-qs--skin-button .kit-qs__chip")).toContain("display: inline-flex;");
  });

  it("keyboard sound rows are 162 plates, the chosen row the lit button-active plate in gold; the list scales with the panel", () => {
    const root = document.querySelector<HTMLElement>(".dh-quick")!;
    expect(root.classList.contains("kit-qs--skin-list")).toBe(true);
    // Real active art exists, so the kit does not tint the row plate.
    expect(root.classList.contains("kit-qs--list-tint")).toBe(false);
    expect(root.style.getPropertyValue("--kit-qs-list-row")).toContain("/assets/dragon-hold/ui/quick-settings/button.alpha.png");
    expect(root.style.getPropertyValue("--kit-qs-list-row-active")).toContain("/assets/dragon-hold/ui/quick-settings/button-active.alpha.png");
    expect(root.style.getPropertyValue("--kit-qs-list-slice")).toBe(PLATE_SLICE.join(" "));
    for (const [name, value] of Object.entries(LIST_ROW_VARS)) expect(root.style.getPropertyValue(name), name).toBe(value);
    // The art's margins pulled outside each row: inset + margin at the row's scale leaves 2 px above and below, 0 aside.
    const k = 30 / 433;
    const inset = [...LIST_ROW_VARS["--kit-qs-list-inset"]!.matchAll(/calc\((-?[\d.]+)px \* var\(--kit-qs-s\)\)/g)].map((m) => Number(m[1]));
    expect(inset).toHaveLength(4);
    PLATE_MARGIN.forEach((margin, side) => expect(inset[side]! + margin * k, String(side)).toBeCloseTo(side % 2 === 0 ? 2 : 0, 0));
    press(window, "F2");
    const selected = document.querySelector('[role="option"][aria-selected="true"]');
    expect(selected?.textContent).toBe("Bright Clack Velvet");
    const { rules } = cssRules(readFileSync("src/app/app.css", "utf8"));
    expect(rules.get(".dh-quick.kit-qs")).toContain("--kit-qs-list-pad: calc(8px * var(--kit-qs-s));");
    const chosen = '.dh-quick.kit-qs.kit-qs--skin-list .kit-keyboards button.kit-keyboards__option[aria-selected="true"]';
    expect(rules.get(`${chosen}::before`)).toMatch(/filter: brightness\(1\.15\) saturate\(1\.2\) drop-shadow\(/);
    expect(rules.get(chosen)).toMatch(/--kit-qs-glow-filter: brightness\(1\.15\) saturate\(1\.2\) drop-shadow\(/);
    // Rows, headings and listen icons scale; 7.5 rows show, so the panel fits its frame; touch keeps 44 px.
    expect(rules.get(".dh-quick .kit-qs__row--keyboards .kit-keyboards")).toContain("max-height: calc(252px * var(--kit-qs-s));");
    const rowsRule = rules.get(".dh-quick .kit-qs__row--keyboards .kit-keyboards button") ?? "";
    expect(rowsRule).toContain("height: calc(34px * var(--kit-qs-s));");
    expect(rowsRule).toContain("height: max(44px, calc(34px * var(--kit-qs-s)));");
    expect(rules.get(".dh-quick .kit-qs__row--keyboards .kit-keyboards__family")).toContain("height: calc(28px * var(--kit-qs-s));");
    expect(rules.get(".dh-quick .kit-qs__row--keyboards .kit-keyboards__listen img")).toContain("width: calc(24px * var(--kit-qs-s));");
  });

  it("every Sound row has its 180 icon (Keyboard volume the keyboard's), the Quality cell stays empty, and the title is in Cormorant", () => {
    press(window, "F2");
    const icon = (id: string) => row(id).querySelector(".kit-qs__icon")?.getAttribute("src") ?? null;
    const expected: Record<string, string> = { master: "vol-master", music: "vol-music", effects: "vol-effects", keyboard: "vol-keyboard", keyboardVolume: "vol-keyboard", voice: "vol-voice", ui: "vol-interface" };
    for (const [id, name] of Object.entries(expected)) expect(icon(id), id).toContain(`/assets/dragon-hold/ui/quick-settings/${name}.64.png`);
    // Only files the game has: every URL is one of the 180 icons.
    for (const url of Object.values(QUICK_ICONS)) expect(QUICK_ICON_NAMES.some((name) => url!.endsWith(`/${name}.64.png`)), url).toBe(true);
    // No graphics icon is accepted yet: the cell keeps its width and holds nothing.
    press(window, "F1");
    const cell = row("quality").querySelector(".kit-qs__icon-cell")!;
    expect(cell.children).toHaveLength(0);
    const { rules } = cssRules(readFileSync("src/app/app.css", "utf8"));
    expect(rules.get(".dh-quick.kit-qs")).toContain("--kit-qs-title-font: var(--dh-font-title);");
    expect(rules.get(".dh-quick .kit-qs__title")).toContain("color: #f2c14e;");
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
    // ?title=0 skipped the 197 title at boot: Quit to title makes it, ready, with Start focused.
    expect(document.querySelector<HTMLElement>(".dh-title-screen")!.hidden).toBe(false);
    expect(window.__dh!.state().title).toBe("ready");
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

describe("the 197 title hosts the shared panels, Quit to title and the keyboard gate", () => {
  const screen = () => document.querySelector<HTMLElement>(".dh-title-screen")!;
  const titleBoot = async (route?: (url: string) => Promise<Response> | Response | undefined) => {
    app?.dispose();
    app = null;
    h.loops.length = 0;
    fetched = [];
    feelHost(route);
    await boot({ typistWpm: 35, prelearn: false, keysBase: FEEL_BASE });
  };

  it("opens on the title with the gear and speaker; Esc closes a panel back to the title; Start runs; Quit to title brings the same title back", async () => {
    await titleBoot();
    expect(screen().hidden).toBe(false);
    expect(window.__dh!.state().title).toBe("ready");
    expect(window.__dh!.panel()).toBe("title");
    expect(window.__dh!.ready).toBe(false);
    expect(h.loops).toHaveLength(0);
    corner("settings").click();
    expect(window.__dh!.panel()).toBe("settings");
    press(window, "Escape");
    expect(window.__dh!.panel()).toBe("title");
    press(window, "F2");
    expect(window.__dh!.panel()).toBe("sound");
    // Enter belongs to the open panel, not to the title's Start.
    press(window, "Enter");
    expect(screen().hidden).toBe(false);
    press(window, "Escape");
    expect(window.__dh!.panel()).toBe("title");
    // ?wpm= gave the speed: Start begins the run (197).
    press(window, "Enter");
    await flush();
    expect(screen().hidden).toBe(true);
    expect(window.__dh!.ready).toBe(true);
    expect(h.loops).toHaveLength(1);
    press(window, "F1");
    document.querySelector<HTMLButtonElement>('[data-action="quit"]')!.click();
    expect(h.loops[0]!.stop).toHaveBeenCalled();
    expect(document.querySelectorAll(".dh-title-screen")).toHaveLength(1);
    expect(screen().hidden).toBe(false);
    expect(window.__dh!.panel()).toBe("title");
    expect(window.__dh!.state().title).toBe("ready");
    expect(window.__dh!.ready).toBe(false);
    // After Quit to title the speed card asks again (192).
    press(window, "Enter");
    expect(document.querySelector<HTMLElement>(".dh-pacecard")!.hidden).toBe(false);
    press(window, "Enter");
    await flush();
    expect(window.__dh!.ready).toBe(true);
    expect(h.loops).toHaveLength(2);
  });

  it("Settings on the title shows no Resume and no Quit to title; in a run both are back (judges 31/10)", async () => {
    await titleBoot();
    const settings = () => document.querySelector<HTMLElement>('.kit-qs__dialog[data-panel="settings"]')!;
    const shown = (action: string) => !settings().querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.hidden;
    press(window, "F1");
    expect(window.__dh!.panel()).toBe("settings");
    expect(document.querySelector<HTMLElement>(".dh-quick")!.dataset.context).toBe("title");
    expect(shown("resume")).toBe(false);
    expect(shown("quit")).toBe(false);
    // Tab never lands on a hidden button: the Settings rows and Close only.
    expect(settings().contains(document.activeElement)).toBe(true);
    press(window, "Escape");
    press(window, "Enter");
    await flush();
    expect(window.__dh!.ready).toBe(true);
    press(window, "F1");
    expect(document.querySelector<HTMLElement>(".dh-quick")!.dataset.context).toBe("play");
    expect(shown("resume")).toBe(true);
    expect(shown("quit")).toBe(true);
    document.querySelector<HTMLButtonElement>('[data-action="quit"]')!.click();
    press(window, "F1");
    expect(window.__dh!.panel()).toBe("settings");
    expect(shown("resume")).toBe(false);
    expect(shown("quit")).toBe(false);
  });

  it("Start on the title before the keyboard sound is playable: the run begins at the 1.5 s gate (B4)", async () => {
    let answer!: () => void;
    const held = new Promise<void>((resolve) => { answer = resolve; });
    await titleBoot((url) => (url === FEEL_BASE + "keys-manifest.json" ? held.then(() => respond(url, serve(url, catalogue()))) : undefined));
    expect(window.__dh!.state().title).toBe("ready");
    press(window, "Enter");
    await flush();
    expect(screen().hidden).toBe(true);
    expect(window.__dh!.ready).toBe(false);
    await vi.advanceTimersByTimeAsync(KEYBOARD_GATE_MS);
    expect(window.__dh!.ready).toBe(true);
    expect(h.loops).toHaveLength(1);
    answer();
    await decodeAll();
  });
});

describe("Typing Feel keyboard sounds in the app (parent TYPING_FEEL_SERVICE.md §5.1–5.3)", () => {
  /** Boots again on a fresh page: the save, then the host (`route` answers first). */
  const reboot = async (save: Record<string, unknown> | null, route?: (url: string) => Promise<Response> | Response | undefined, given: Record<string, unknown> = IN_RUN) => {
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
    await reboot(null, undefined, { ...IN_RUN, keysBase: null });
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
      await reboot({ music: 0.5 }, route, { ...IN_RUN, keysBase });
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
