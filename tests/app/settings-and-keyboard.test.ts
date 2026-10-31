import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GameKeyboard, KEYBOARD_GATE_MS, KEYS_BASE, ORIGINAL_KEYBOARD, catalogueJson, manifestJson, requestKeyboardCatalogue, sampleBytes, savedKeyboardId, settleKeyboard, startKeyboard,
  type KeyboardHost,
} from "../../src/app/keyboard";
import { quickOptions } from "../../src/app/quick";
import { SETTINGS_DEFAULTS, BUILT_IN_KEYS, DEFAULT_KEYBOARD_SOUND, applyQuick, audioVolumes, builtInKeys, keyboardLevel, loadSettings, quickValues, storedSettings, voiceLevel, type Settings } from "../../src/app/settings";
import { volumeFor } from "../../src/audio/mix";
import {
  KEYBOARD_DECODE_BATCH_SIZE, KEYBOARD_SAMPLE_TIMEOUT_MS, KeyboardSoundPreview, pendingKeyboardChoices, TypingSounds,
  type KeyboardCatalog, type KeyboardSoundChoice,
} from "../../src/kit/feedback/typing-fx";
import type { QuickChoiceRow, QuickSettingsOptions, QuickValue } from "../../src/kit/ui";
import { readChoice } from "../../src/kit/ui/quick-settings/logic";
import { TestContext, TestGain, TestSource, flush as microtasks } from "./keyboard-audio-fixture";
import { catalogue, FEEL_BASE, SAMPLE_FAMILIES, SAMPLE_IDS, SAMPLE_SETS, sampleFiles, serve, setDir, type Reply } from "./feel-fixture";

/**
 * Keyboard sounds from Typing Feel (parent docs/games/TYPING_FEEL_SERVICE.md
 * §5.1–5.3, §8.1): the catalogue and the sets come from the sample host in
 * tests/app/feel-fixture.ts through a stubbed fetch; no network, no parent
 * repo, no copied set. Sample bytes are their own URL, so a decoded buffer
 * names its file (TestContext).
 */
let ctx: TestContext;
/** Every fetch: its URL and the cache mode it asked for. */
let calls: { url: string; cache: RequestCache | undefined }[];
/** The catalogue the sample host answers with. */
let root: Record<string, unknown>;
const keyboards: GameKeyboard[] = [];
const previews: KeyboardSoundPreview[] = [];
const urls = (): string[] => calls.map((call) => call.url);
const oggs = (): string[] => urls().filter((url) => url.endsWith(".ogg"));
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await microtasks(); };
/** A set decodes in batches of 16 with a macrotask between them: run the fake clock dry. */
const settle = async (): Promise<void> => { await flush(); await vi.runAllTimersAsync(); await flush(); };
const settled = async <T>(work: Promise<T>): Promise<T> => { await settle(); return work; };
/** While a test holds a file: run the macrotasks between decode batches, well short of the samples' 8 s limit. */
const tick = async (): Promise<void> => { await flush(); await vi.advanceTimersByTimeAsync(50); await flush(); };
/** A fetch answer as timedJson, timedBytes and the kit read it; sample bytes are the file's URL. */
function respond(url: string, reply: Reply): Response {
  return {
    ok: reply.status >= 200 && reply.status < 300,
    status: reply.status,
    headers: new Headers(reply.type ? { "content-type": reply.type } : {}),
    text: async () => reply.text ?? "",
    json: async () => JSON.parse(reply.text ?? ""),
    arrayBuffer: async () => new TextEncoder().encode(url).buffer,
  } as unknown as Response;
}
/** The sample host behind fetch; `route` may answer first (a failing host, a held file). */
function host(route?: (url: string) => Promise<Response> | Response | undefined): void {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, cache: init?.cache });
    const routed = route?.(url);
    return routed !== undefined ? routed : respond(url, serve(url, root));
  }));
}
const catalogueOf = async (rootJson: Record<string, unknown> = catalogue()): Promise<KeyboardCatalog> => {
  root = rootJson;
  const catalog = await requestKeyboardCatalogue(FEEL_BASE).catalog;
  calls.length = 0;
  return catalog;
};
let choices: readonly KeyboardSoundChoice[];
const choiceIn = (list: readonly KeyboardSoundChoice[], id: string): KeyboardSoundChoice => list.find((c) => c.value === id)!;
const decodedUrl = (source: TestSource): string => (source.buffer as unknown as { url: string }).url;
/** A gameplay player on the settled sample catalogue (as after startKeyboard). */
function player(settings: () => Settings, options: ConstructorParameters<typeof GameKeyboard>[3] = {}): GameKeyboard {
  const keyboard = new GameKeyboard(settings, choices, () => ctx as unknown as AudioContext, options);
  keyboard.setChoices(choices);
  keyboards.push(keyboard);
  return keyboard;
}

/**
 * QuickSettings' keyboard row as app.ts drives it, without a DOM: it opens
 * with a list, setChoiceOptions swaps the list and reads the values again,
 * and a value the list lacks is repaired through onChange, which saves (the
 * kit's readValues and readChoice). A pick is the player's choice (onChange),
 * then the kit's select (KeyboardSoundPreview, built from quick.ts options).
 */
class Panel {
  repairs: string[] = [];
  constructor(public options: readonly KeyboardSoundChoice[], private readonly raw: () => string, private readonly change: (id: string, value: QuickValue) => void, private readonly preview: KeyboardSoundPreview) {
    this.read();
  }
  setChoiceOptions(options: readonly KeyboardSoundChoice[]): void {
    this.options = options;
    this.read();
  }
  pick(value: string): void {
    const choice = choiceIn(this.options, value);
    expect(choice.disabled).not.toBe(true);
    this.change("keyboard", value);
    this.preview.select(choice);
  }
  private read(): void {
    const raw = this.raw();
    const row = quickOptions({ getValues: () => ({}), onChange: () => {} }, this.options).soundRows!.find((r) => r.id === "keyboard") as QuickChoiceRow;
    const value = readChoice(row, raw);
    if (value === raw) return;
    this.repairs.push(value);
    this.change("keyboard", value);
  }
}

/**
 * A page as app.ts builds it from a stored save: the settings, the raw
 * keyboard field, whether the save owns a keyboard sound, the gameplay
 * player and the Sound panel at once (the pending list), the panel's
 * onChange, the startup signal and startKeyboard's hooks. The player decodes
 * on the test context at once, as app.ts's does on the page's context made
 * suspended before any gesture (audio.prepare()).
 */
function page(stored: unknown) {
  const raw = JSON.parse(JSON.stringify(stored ?? null)) as unknown;
  const settings = loadSettings(raw);
  const saved = savedKeyboardId(raw);
  let owned = saved !== null;
  const startup = new AbortController();
  /** The keyboard id of each write to the save (null: written without one). */
  const saves: (string | null)[] = [];
  /** The save as the page last wrote it (JSON). */
  let storage = JSON.stringify(stored ?? null);
  const store = (): void => {
    storage = JSON.stringify(storedSettings(settings, owned));
    saves.push(savedKeyboardId(JSON.parse(storage)));
  };
  const seen = { playable: [] as number[], unavailable: 0, chosen: [] as string[], standIn: null as string | null, fails: [] as string[] };
  const keyboard = new GameKeyboard(() => settings, pendingKeyboardChoices(settings.keyboard, ORIGINAL_KEYBOARD), () => ctx as unknown as AudioContext, {
    onFail: (id) => {
      seen.fails.push(id);
      seen.standIn = id;
    },
  });
  keyboards.push(keyboard);
  // The panel's options as app.ts passes them to createQuickSettings (quick.ts adds the timed fetchers).
  const options: QuickSettingsOptions = quickOptions({
    getValues: () => quickValues(settings), onChange: () => {},
    onKeyboardLoad: (result) => keyboard.pickLoaded(result),
    onKeyboardFail: (choice) => keyboard.pickFailed(choice.value),
  }, []);
  const preview = new KeyboardSoundPreview({
    sounds: keyboard.sounds, levels: () => ({ master: settings.master, keyboard: settings.keyboardVolume, muted: settings.muted }),
    fetchJson: options.keyboardFetch?.fetchJson, fetchBytes: options.keyboardFetch?.fetchBytes, onLoad: options.onKeyboardLoad, onFail: options.onKeyboardFail,
  });
  previews.push(preview);
  /** app.ts onChange: applied, then saved; a keyboard sound is the player's own (owned, no stand-in, the startup has no say, the player changed). */
  const change = (id: string, value: QuickValue): void => {
    expect(applyQuick(settings, id, value)).toBe(true);
    if (id === "keyboard") {
      owned = true;
      seen.standIn = null;
      startup.abort();
      keyboard.changed();
    }
    store();
  };
  const panel = new Panel(pendingKeyboardChoices(settings.keyboard, ORIGINAL_KEYBOARD), () => settings.keyboard, change, preview);
  const hooks: KeyboardHost = {
    current: () => settings.keyboard,
    choose: (id, save) => {
      settings.keyboard = id;
      seen.chosen.push(id);
      if (save) owned = true;
      if (save) store();
    },
    list: (list) => panel.setChoiceOptions(list),
    unavailable: () => { seen.unavailable += 1; },
    playable: () => { seen.playable.push(Date.now()); },
  };
  const start = (base: string | null = FEEL_BASE): Promise<void> => startKeyboard(keyboard, requestKeyboardCatalogue(base), saved, hooks, { signal: startup.signal });
  /** The audio engine's Dragonhold key sound now (the choice, or standing in). */
  const builtIn = (): boolean => builtInKeys(settings, seen.standIn);
  return { settings, saved, saves, panel, preview, seen, hooks, change, start, keyboard, builtIn, storage: () => storage };
}
const savedSound = (id: string): KeyboardSoundChoice => ({ value: id, label: "Saved sound", note: "unavailable", disabled: true });

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  ctx = new TestContext();
  calls = [];
  root = catalogue();
  vi.stubGlobal("GainNode", TestGain);
  vi.stubGlobal("AudioBufferSourceNode", TestSource);
  host();
  choices = (await catalogueOf()).options;
});
afterEach(() => {
  for (const preview of previews.splice(0)) preview.destroy();
  for (const keyboard of keyboards.splice(0)) keyboard.dispose();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("192 settings", () => {
  it("loads defaults, partial saves, invalid fields and all four real quality levels", () => {
    expect(loadSettings(null)).toEqual(SETTINGS_DEFAULTS);
    expect(loadSettings({ master: NaN, music: -1, voice: 2, keyboard: "../bad", muted: 1, quality: "bad" })).toMatchObject({ master: 0.8, music: 0, voice: 1, keyboard: "bright-clack", muted: false, quality: "high" });
    for (const quality of ["low", "medium", "high", "ultra"]) expect(loadSettings({ quality }).quality).toBe(quality);
  });

  it("round-trips changes as the save with no shared typing-effect stand-ins", () => {
    const settings = loadSettings(null);
    for (const [id, value] of Object.entries({ master: 25, music: 30, effects: 40, keyboardVolume: 50, voice: 60, ui: 70, keyboard: "warm", muted: true, quality: "low" })) expect(applyQuick(settings, id, value)).toBe(true);
    const restored = loadSettings(JSON.parse(JSON.stringify(settings)));
    expect(quickValues(restored)).toMatchObject({ master: 25, music: 30, effects: 40, keyboardVolume: 50, voice: 60, ui: 70, keyboard: "warm", muted: true, quality: "low" });
    expect(applyQuick(settings, "master", "50")).toBe(false);
    expect(applyQuick(settings, "master", NaN)).toBe(false);
    expect(applyQuick(settings, "reducedMotion", true)).toBe(false);
  });

  it("maps Master, Music, Effects, Voice, Interface and original keys to independent buses", () => {
    const settings = { ...loadSettings(null), master: 0.4, effects: 0.2, ui: 0.3, keyboardVolume: 0.7, voice: 0.5 };
    let volumes = audioVolumes(settings);
    expect(volumes.master).toBe(0.4);
    expect(volumeFor("music", volumes)).toBe(settings.music);
    expect(volumeFor("enemies", volumes)).toBe(0.2);
    expect(volumeFor("voice", volumes)).toBe(0.5);
    expect(volumeFor("ui", volumes)).toBe(0.3);
    expect(volumeFor("learning", volumes)).toBe(0.3);
    expect(volumeFor("typing", volumes)).toBe(0);
    expect(keyboardLevel(settings)).toBeCloseTo(0.28);
    expect(voiceLevel(settings)).toBe(0.2);
    settings.keyboard = BUILT_IN_KEYS;
    volumes = audioVolumes(settings);
    expect(volumeFor("typing", volumes)).toBe(0.7);
    expect(keyboardLevel(settings)).toBe(0);
    settings.muted = true;
    expect(voiceLevel(settings)).toBe(0);
  });

  it("the Dragonhold sound also plays while it stands in for the chosen set, and only for that set", () => {
    const settings = { ...loadSettings(null), keyboard: "hail-stone", keyboardVolume: 0.6 };
    expect(builtInKeys(settings, "hail-stone")).toBe(true);
    expect(volumeFor("typing", audioVolumes(settings, "hail-stone"))).toBe(0.6);
    expect(builtInKeys(settings, "deep")).toBe(false);
    expect(volumeFor("typing", audioVolumes(settings, "deep"))).toBe(0);
    expect(builtInKeys(settings, null)).toBe(false);
    settings.keyboard = "off";
    expect(builtInKeys(settings, "off")).toBe(false);
  });

  it("the save holds the keyboard sound only once it owns one; the rest of the settings always", () => {
    const settings = { ...loadSettings({ effects: 0.4 }), keyboard: BUILT_IN_KEYS };
    const unowned = JSON.parse(JSON.stringify(storedSettings(settings, false))) as Record<string, unknown>;
    expect(unowned).toMatchObject({ effects: 0.4, quality: "high" });
    expect(unowned).not.toHaveProperty("keyboard");
    // The next page fills the hard default in and lets the catalogue settle it.
    expect(savedKeyboardId(unowned)).toBeNull();
    expect(loadSettings(unowned).keyboard).toBe(DEFAULT_KEYBOARD_SOUND);
    expect(storedSettings(settings, true)).toBe(settings);
    expect(settings.keyboard).toBe(BUILT_IN_KEYS);
  });
});

describe("Dragonhold keyboard catalogue from Typing Feel", () => {
  it("has no keys base without VITE_TYPING_FEEL_ORIGIN (tests, CI, a clone), and the catalogue revalidates within 3 s", async () => {
    expect(KEYS_BASE).toBeNull();
    const feed = requestKeyboardCatalogue(FEEL_BASE);
    const catalog = await feed.catalog;
    expect(feed.base).toBe(FEEL_BASE);
    expect(calls).toEqual([{ url: FEEL_BASE + "keys-manifest.json", cache: "no-cache" }]);
    expect(catalogueJson).not.toBe(manifestJson);
    expect(catalog).toMatchObject({ state: "ready", revision: "r-test", defaultId: "bright-clack" });
  });

  it("reads Off, Dragonhold, then the sets in catalogue order, one run per family, files resolved under each set's folder", () => {
    expect(choices.map((c) => c.value)).toEqual(["off", BUILT_IN_KEYS, ...SAMPLE_IDS]);
    expect(choices.slice(0, 2)).toEqual([{ value: "off", label: "Off" }, ORIGINAL_KEYBOARD]);
    for (const set of SAMPLE_SETS) {
      expect(choiceIn(choices, set.id)).toEqual({
        value: set.id, label: set.name, family: set.family, manifest: setDir(set.id) + "keys-manifest.json", preview: setDir(set.id) + "preview.ogg",
        // An owner pick has no score; none is invented.
        ...(set.score === null ? {} : { score: set.score }),
      });
    }
    const sets = choices.slice(2);
    expect(sets.filter((c, i) => i === 0 || sets[i - 1]!.family !== c.family).map((c) => c.family)).toEqual(SAMPLE_FAMILIES);
  });

  it("settles a save without a keyboard field to the catalogue's default, then Bright Clack, then the first set, then Dragonhold; none of them is saved", async () => {
    expect(settleKeyboard(null, await catalogueOf(catalogue({ default: "solid" })))).toMatchObject({ id: "solid", repaired: false });
    expect(settleKeyboard(null, await catalogueOf(catalogue({ default: null })))).toMatchObject({ id: DEFAULT_KEYBOARD_SOUND, repaired: false });
    expect(settleKeyboard(null, await catalogueOf(catalogue({ default: null, sets: SAMPLE_SETS.filter((s) => s.id !== DEFAULT_KEYBOARD_SOUND) })))).toMatchObject({ id: "deep", repaired: false });
    // A catalogue that lists no usable set is "invalid", not ready: Dragonhold, and nothing repaired.
    const empty = await catalogueOf(catalogue({ sets: [] }));
    expect(empty.state).toBe("invalid");
    expect(settleKeyboard(null, empty)).toMatchObject({ id: BUILT_IN_KEYS, repaired: false });
    expect(settleKeyboard("hail-stone", empty)).toMatchObject({ id: "hail-stone", repaired: false });
  });

  it("reads the save's own keyboard field before the hard default fills it in", () => {
    expect(savedKeyboardId(null)).toBeNull();
    expect(savedKeyboardId({ music: 0.5 })).toBeNull();
    expect(savedKeyboardId({ keyboard: 3 })).toBeNull();
    expect(savedKeyboardId({ keyboard: "hail-stone" })).toBe("hail-stone");
    expect(savedKeyboardId({ keyboard: "Bad Id" })).toBe("Bad Id");
    // loadSettings fills the hard default in: the raw field is what tells "no choice yet" from Bright Clack.
    expect(loadSettings({ music: 0.5 }).keyboard).toBe(DEFAULT_KEYBOARD_SOUND);
  });

  it("no origin (a clone, CI): nothing is fetched; Off and Dragonhold; a saved set stays in the save as \"Saved sound · unavailable\" while Dragonhold stands in for it; no notice; play at once", async () => {
    const p = page({ keyboard: "hail-stone", keyboardVolume: 0.4 });
    const done = p.start(null);
    await flush();
    expect(p.seen.playable).toEqual([0]);
    await settled(done);
    expect(calls).toEqual([]);
    expect(p.seen).toEqual({ playable: [0], unavailable: 0, chosen: ["hail-stone"], standIn: "hail-stone", fails: ["hail-stone"] });
    expect(p.panel.options).toEqual([{ value: "off", label: "Off" }, ORIGINAL_KEYBOARD, savedSound("hail-stone")]);
    expect(p.panel.repairs).toEqual([]);
    expect(p.saves).toEqual([]);
    expect(p.keyboard.sounds.profile).toBeNull();
    // The Dragonhold sound plays the keys, the save still names Hail Stone, and an unrelated change keeps it.
    expect(p.builtIn()).toBe(true);
    p.change("muted", true);
    expect(p.saves).toEqual(["hail-stone"]);
    expect(loadSettings(JSON.parse(p.storage()))).toMatchObject({ keyboard: "hail-stone", keyboardVolume: 0.4, muted: true });
    // Typing never asks the network either.
    p.keyboard.type("key");
    await settle();
    expect(calls).toEqual([]);
    // Off and Dragonhold stay choosable; the player's pick ends the stand-in and is saved as ever.
    p.panel.pick("off");
    expect(p.seen.standIn).toBeNull();
    expect(p.builtIn()).toBe(false);
    p.panel.pick(BUILT_IN_KEYS);
    expect(p.builtIn()).toBe(true);
    expect(p.saves).toEqual(["hail-stone", "off", BUILT_IN_KEYS]);
  });

  it("no origin and no save: Dragonhold plays, Off and Dragonhold are the whole list, nothing is saved", async () => {
    const p = page(null);
    await settled(p.start(null));
    expect(calls).toEqual([]);
    expect(p.settings.keyboard).toBe(BUILT_IN_KEYS);
    expect(p.panel.options.map((c) => c.value)).toEqual(["off", BUILT_IN_KEYS]);
    expect(p.saves).toEqual([]);
    expect(p.seen.unavailable).toBe(0);
    // Dragonhold is the choice itself here, not a stand-in.
    expect(p.seen.standIn).toBeNull();
    expect(p.builtIn()).toBe(true);
  });

  const FAILURES: [string, (url: string) => Promise<Response> | Response][] = [
    ["404", (url) => respond(url, { status: 404, type: "text/html", text: "<h1>404</h1>" })],
    ["HTML with status 200 (an SPA fallback)", (url) => respond(url, { status: 200, type: "text/html", text: "<!doctype html><html><body>app</body></html>" })],
    ["text that is not JSON, status 200", (url) => respond(url, { status: 200, type: "application/json", text: "<!doctype html>" })],
    ["CORS (fetch rejects)", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["no answer (hung for 10 s and more)", () => new Promise<Response>(() => {})],
  ];
  it.each(FAILURES)("a host that fails (%s): the saved set is kept, play within 1.5 s, Off and Dragonhold (standing in for the set), the notice once, nothing left pending", async (kind, fail) => {
    host(fail);
    const p = page({ keyboard: "hail-stone" });
    const done = p.start();
    await vi.advanceTimersByTimeAsync(KEYBOARD_GATE_MS - 1);
    const hung = kind.startsWith("no answer");
    // A quick failure lets play start at once; a hung host, at the gate.
    expect(p.seen.playable).toEqual(hung ? [] : [0]);
    await vi.advanceTimersByTimeAsync(1);
    expect(p.seen.playable).toHaveLength(1);
    expect(p.seen.playable[0]).toBeLessThanOrEqual(KEYBOARD_GATE_MS);
    // The catalogue gives up after 3 s at most.
    await vi.advanceTimersByTimeAsync(3000 - KEYBOARD_GATE_MS);
    await flush();
    expect(p.seen.unavailable).toBe(1);
    await expect(settled(done)).resolves.toBeUndefined();
    expect(p.seen.chosen).toEqual(["hail-stone"]);
    expect(p.panel.options).toEqual([{ value: "off", label: "Off" }, ORIGINAL_KEYBOARD, savedSound("hail-stone")]);
    expect(p.panel.repairs).toEqual([]);
    expect(p.saves).toEqual([]);
    expect(p.settings.keyboard).toBe("hail-stone");
    // Typing on the set does not ask again: one catalogue request in all.
    p.keyboard.type("key");
    await settle();
    expect(urls()).toEqual([FEEL_BASE + "keys-manifest.json"]);
    expect(p.keyboard.sounds.profile).toBeNull();
    // §5.1 step 5, §5.3: the Dragonhold sound plays in the set's place, unsaved.
    expect(p.seen.standIn).toBe("hail-stone");
    expect(p.builtIn()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a catalogue without the saved set moves it to the catalogue's default and saves once; the panel takes the list without repairing again", async () => {
    const p = page({ keyboard: "thock", music: 0.3 });
    expect(p.panel.options.map((c) => c.value)).toEqual(["off", BUILT_IN_KEYS, "thock"]);
    root = catalogue({ default: "solid" });
    await settled(p.start());
    expect(p.seen.chosen).toEqual(["solid"]);
    expect(p.saves).toEqual(["solid"]);
    expect(p.panel.repairs).toEqual([]);
    expect(p.panel.options.map((c) => c.value)).toEqual(["off", BUILT_IN_KEYS, ...SAMPLE_IDS]);
    expect(p.settings).toMatchObject({ keyboard: "solid", music: 0.3 });
    expect(p.seen.unavailable).toBe(0);
    expect(p.keyboard.sounds.profile?.id).toBe("solid");
  });

  it("an id that can never name a set is repaired even before the catalogue loads; a save without the field follows the catalogue's default unsaved", async () => {
    const bad = page({ keyboard: "Bad Id" });
    await settled(bad.start());
    expect(bad.saves).toEqual(["bright-clack"]);
    root = catalogue({ default: "raindrop-tile" });
    const fresh = page({ music: 0.5 });
    await settled(fresh.start());
    expect(fresh.seen.chosen).toEqual(["raindrop-tile"]);
    expect(fresh.saves).toEqual([]);
    expect(fresh.panel.repairs).toEqual([]);
  });

  it("a late catalogue: the open Sound panel shows Off, Dragonhold and the saved set \"Loading…\", then takes the full list; Dragonhold picked meanwhile stands and is not overwritten", async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    host((url) => (url === FEEL_BASE + "keys-manifest.json" ? gate.then(() => respond(url, serve(url, root))) : undefined));
    const p = page({ keyboard: "hail-stone" });
    expect(p.panel.options).toEqual([{ value: "off", label: "Off" }, ORIGINAL_KEYBOARD, { value: "hail-stone", label: "Loading…", note: "", disabled: true }]);
    expect(p.panel.repairs).toEqual([]);
    const done = p.start();
    await vi.advanceTimersByTimeAsync(500);
    // Keys typed before the catalogue load nothing: the pending list has no set to load.
    p.keyboard.type("key");
    p.panel.pick(BUILT_IN_KEYS);
    expect(p.saves).toEqual([BUILT_IN_KEYS]);
    open();
    await settled(done);
    expect(p.panel.options.map((c) => c.value)).toEqual(["off", BUILT_IN_KEYS, ...SAMPLE_IDS]);
    expect(p.seen.chosen).toEqual([BUILT_IN_KEYS]);
    expect(p.saves).toEqual([BUILT_IN_KEYS]);
    expect(p.panel.repairs).toEqual([]);
    expect(p.settings.keyboard).toBe(BUILT_IN_KEYS);
    expect(p.builtIn()).toBe(true);
    // The saved set the player left is never fetched.
    expect(urls().filter((url) => url.includes("/hail-stone/"))).toEqual([]);
  });

  it("a late catalogue: Off picked meanwhile stands too; no set loads", async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    host((url) => (url === FEEL_BASE + "keys-manifest.json" ? gate.then(() => respond(url, serve(url, root))) : undefined));
    const p = page(null);
    expect(p.panel.options.map((c) => c.value)).toEqual(["off", BUILT_IN_KEYS, DEFAULT_KEYBOARD_SOUND]);
    const done = p.start();
    p.panel.pick("off");
    await vi.advanceTimersByTimeAsync(KEYBOARD_GATE_MS);
    expect(p.seen.playable).toEqual([KEYBOARD_GATE_MS]);
    open();
    await settled(done);
    expect(p.seen.chosen).toEqual(["off"]);
    expect(p.saves).toEqual(["off"]);
    expect(urls()).toEqual([FEEL_BASE + "keys-manifest.json"]);
    expect(p.keyboard.sounds.profile).toBeNull();
  });

  it("the saved set loads from the feel origin: its manifest HTTP-cached through a 3 s limit, then its samples; play starts once the first batch is in", async () => {
    const p = page({ keyboard: "raindrop-tile" });
    let decodedAtPlayable = -1;
    const playable = p.hooks.playable;
    p.hooks.playable = () => {
      decodedAtPlayable = ctx.decodeAudioData.mock.calls.length;
      playable();
    };
    await settled(p.start());
    const files = sampleFiles("raindrop-tile");
    expect(calls.slice(0, 2)).toEqual([{ url: FEEL_BASE + "keys-manifest.json", cache: "no-cache" }, { url: setDir("raindrop-tile") + "keys-manifest.json", cache: "default" }]);
    expect(urls().slice(2).sort()).toEqual([...files.key, ...files.space].sort());
    // Play opened once the first 16 files had decoded, while the rest of the set still loaded.
    expect(decodedAtPlayable).toBe(KEYBOARD_DECODE_BATCH_SIZE);
    expect(files.key.length + files.space.length).toBeGreaterThan(KEYBOARD_DECODE_BATCH_SIZE);
    expect(p.seen.playable).toEqual([0]);
    expect(p.keyboard.sounds.profile?.id).toBe("raindrop-tile");
    expect(p.saves).toEqual([]);
    expect(p.seen.standIn).toBeNull();
  });

  it("the settled set loads before any key, with no gesture: the very first key plays a decoded sample and fetches nothing more (§5.4, §8.4)", async () => {
    // A suspended context, as the page's before its first gesture: decoding needs no gesture.
    ctx.state = "suspended";
    const p = page({ keyboard: "deep" });
    await settled(p.start());
    const files = sampleFiles("deep");
    expect(oggs()).toHaveLength(files.key.length + files.space.length);
    expect(p.keyboard.sounds.profile?.id).toBe("deep");
    expect(p.seen.standIn).toBeNull();
    const asked = calls.length;
    p.keyboard.type("key");
    expect(decodedUrl(ctx.sources.at(-1)!)).toMatch(/\/deep\/[0-9a-f]{12}\/key-\d{2}\.ogg$/);
    await settle();
    expect(calls).toHaveLength(asked);
  });

  it("a set whose samples hang: play starts at 1.5 s; each sample is given up after 8 s, a first batch that all failed stops the set, and Dragonhold stands in", async () => {
    host((url) => (url.endsWith(".ogg") ? new Promise<Response>(() => {}) : undefined));
    const p = page({ keyboard: "deep" });
    let ended = false;
    void p.start().then(() => { ended = true; });
    await vi.advanceTimersByTimeAsync(KEYBOARD_GATE_MS);
    expect(p.seen.playable).toEqual([KEYBOARD_GATE_MS]);
    expect(p.seen.standIn).toBeNull();
    await vi.advanceTimersByTimeAsync(KEYBOARD_SAMPLE_TIMEOUT_MS - KEYBOARD_GATE_MS);
    await flush();
    expect(ended).toBe(true);
    // One batch was asked for, never the rest of the set.
    expect(oggs()).toHaveLength(KEYBOARD_DECODE_BATCH_SIZE);
    expect(p.seen.standIn).toBe("deep");
    expect(p.builtIn()).toBe(true);
    expect(p.keyboard.sounds.profile).toBeNull();
    expect(p.saves).toEqual([]);
    expect(p.settings.keyboard).toBe("deep");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a set whose manifest hangs is given up after 3 s: play starts at 1.5 s, no sample is asked for, Dragonhold stands in, the save keeps the set", async () => {
    host((url) => (url.endsWith("/keys-manifest.json") && url !== FEEL_BASE + "keys-manifest.json" ? new Promise<Response>(() => {}) : undefined));
    const p = page({ keyboard: "solid" });
    const done = p.start();
    await vi.advanceTimersByTimeAsync(3000);
    await expect(settled(done)).resolves.toBeUndefined();
    expect(p.seen.playable).toEqual([KEYBOARD_GATE_MS]);
    expect(p.keyboard.sounds.profile).toBeNull();
    expect(oggs()).toEqual([]);
    expect(p.seen.standIn).toBe("solid");
    expect(p.builtIn()).toBe(true);
    expect(p.saves).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a set that cannot be fetched is not fetched again on every key; picking it again retries once, as does a reload", async () => {
    host((url) => (url.endsWith(".ogg") ? respond(url, { status: 404 }) : undefined));
    const perLoad = 1 + KEYBOARD_DECODE_BATCH_SIZE;
    /** The set's manifest and samples asked for so far (a panel pick's preview clip aside). */
    const setFiles = (): string[] => urls().filter((url) => url.startsWith(setDir("solid")) && !url.endsWith("/preview.ogg"));
    const typeLetters = async (keyboard: GameKeyboard): Promise<void> => { for (let i = 0; i < 10; i += 1) { keyboard.type("key"); await tick(); } };
    const p = page({ keyboard: "solid" });
    await settled(p.start());
    await typeLetters(p.keyboard);
    expect(setFiles()).toHaveLength(perLoad);
    expect(p.seen.fails).toEqual(["solid"]);
    expect(ctx.sources).toHaveLength(0);
    // Picking the set again (the panel's load) retries once, then typing leaves it alone.
    p.panel.pick("solid");
    await settle();
    await typeLetters(p.keyboard);
    expect(setFiles()).toHaveLength(2 * perLoad);
    expect(p.seen.fails).toEqual(["solid", "solid"]);
    expect(p.seen.standIn).toBe("solid");
    // A reload is a new page.
    const q = page({ keyboard: "solid" });
    await settled(q.start());
    await typeLetters(q.keyboard);
    expect(setFiles()).toHaveLength(3 * perLoad);
    expect(ctx.sources).toHaveLength(0);
  });

  it("a set whose samples all 404 stops after its first batch; one good file in that batch keeps the set loading", async () => {
    const good = sampleFiles("solid").key[3]!;
    host((url) => (url.endsWith(".ogg") && url !== good ? respond(url, { status: 404 }) : undefined));
    const p = page({ keyboard: "solid" });
    await settled(p.start());
    const files = sampleFiles("solid");
    expect(oggs()).toHaveLength(files.key.length + files.space.length);
    expect(p.seen.standIn).toBeNull();
    expect(p.keyboard.sounds.profile?.id).toBe("solid");
  });

  it("a save without a keyboard sound stays without one through unrelated changes: Dragonhold while the host is down, the catalogue's default once it is back", async () => {
    host((url) => respond(url, { status: 404 }));
    const down = page({ music: 0.5 });
    // A change while the catalogue loads writes no keyboard sound (not the hard default either).
    down.change("muted", true);
    await settled(down.start());
    expect(down.settings.keyboard).toBe(BUILT_IN_KEYS);
    expect(down.seen.standIn).toBeNull();
    down.change("muted", false);
    expect(down.saves).toEqual([null, null]);
    const stored = JSON.parse(down.storage()) as Record<string, unknown>;
    expect(stored).toMatchObject({ music: 0.5, muted: false });
    expect(stored).not.toHaveProperty("keyboard");
    host();
    root = catalogue({ default: "raindrop-tile" });
    const up = page(stored);
    expect(up.saved).toBeNull();
    await settled(up.start());
    expect(up.settings.keyboard).toBe("raindrop-tile");
    expect(up.saves).toEqual([]);
    // The player's own pick is saved from then on, and stays through unrelated changes.
    up.panel.pick("deep");
    up.change("muted", true);
    expect(up.saves).toEqual(["deep", "deep"]);
  });

  it("re-picking the saved set while its startup load runs hands it to the Sound panel's load: the startup load stops and never silences it", async () => {
    let openFirst!: () => void;
    const first = new Promise<void>((resolve) => { openFirst = resolve; });
    let openSecond!: () => void;
    const second = new Promise<void>((resolve) => { openSecond = resolve; });
    const asked = new Set<string>();
    // The startup load's samples wait for `first`; the same files asked again (the panel's load) wait for `second`.
    host((url) => {
      if (!url.endsWith(".ogg") || url.endsWith("/preview.ogg")) return undefined;
      const again = asked.has(url);
      asked.add(url);
      return (again ? second : first).then(() => respond(url, serve(url, root)));
    });
    const p = page({ keyboard: "hail-stone" });
    let ended = false;
    void p.start().then(() => { ended = true; });
    await tick();
    expect(oggs()).toHaveLength(KEYBOARD_DECODE_BATCH_SIZE);
    p.panel.pick("hail-stone");
    await tick();
    openFirst();
    await tick();
    expect(ended).toBe(true);
    expect(p.keyboard.sounds.profile?.id).toBe("hail-stone");
    expect(p.seen.standIn).toBeNull();
    openSecond();
    await settle();
    expect(p.keyboard.sounds.profile?.id).toBe("hail-stone");
    p.keyboard.type("key");
    expect(decodedUrl(ctx.sources.at(-1)!)).toMatch(/\/hail-stone\/[0-9a-f]{12}\/key-\d{2}\.ogg$/);
    expect(p.saves).toEqual(["hail-stone"]);
    expect(p.seen.fails).toEqual([]);
  });
});

describe("Dragonhold Sound panel picks (QuickSettings keyboardFetch, onKeyboardLoad and onKeyboardFail)", () => {
  const manifest = (id: string): string => setDir(id) + "keys-manifest.json";
  const settledPage = async (stored: unknown) => {
    const p = page(stored);
    await settled(p.start());
    calls.length = 0;
    return p;
  };

  it("the Sound panel hands the kit Dragonhold's timed fetchers: the manifest HTTP-cached within 3 s, samples and previews within 8 s", () => {
    const options = quickOptions({ getValues: () => ({}), onChange: () => {} }, []);
    expect(options.keyboardFetch).toEqual({ fetchJson: manifestJson, fetchBytes: sampleBytes });
  });

  it("a set picked in the panel whose manifest 404s: Dragonhold stands in for it, the save keeps the pick, the next pick ends it", async () => {
    host((url) => (url === manifest("solid") ? respond(url, { status: 404 }) : undefined));
    const p = await settledPage({ keyboard: "deep" });
    p.panel.pick("solid");
    await settle();
    expect(calls.find((call) => call.url === manifest("solid"))?.cache).toBe("default");
    expect(p.seen.standIn).toBe("solid");
    expect(p.builtIn()).toBe(true);
    expect(p.keyboard.sounds.profile).toBeNull();
    expect(p.settings.keyboard).toBe("solid");
    expect(p.saves).toEqual(["solid"]);
    // Typing on it asks nothing more.
    p.keyboard.type("key");
    await settle();
    expect(urls().filter((url) => url === manifest("solid"))).toHaveLength(1);
    p.panel.pick("deep");
    await settle();
    expect(p.seen.standIn).toBeNull();
    expect(p.builtIn()).toBe(false);
    expect(p.keyboard.sounds.profile?.id).toBe("deep");
    expect(p.saves).toEqual(["solid", "deep"]);
  });

  it("a picked set whose samples hang: Dragonhold stands in after one 8 s sample timeout, with one batch asked for; no timer is left", async () => {
    host((url) => (url.startsWith(setDir("solid")) && /\/(key|space)-\d+\.ogg$/.test(url) ? new Promise<Response>(() => {}) : undefined));
    const p = await settledPage({ keyboard: "deep" });
    const files = sampleFiles("solid");
    // More than one batch: without the first-batch rule the second would cost another 8 s.
    expect(files.key.length + files.space.length).toBeGreaterThan(KEYBOARD_DECODE_BATCH_SIZE);
    p.panel.pick("solid");
    await vi.advanceTimersByTimeAsync(KEYBOARD_SAMPLE_TIMEOUT_MS - 1);
    expect(p.seen.standIn).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(p.seen.standIn).toBe("solid");
    expect(oggs().filter((url) => /\/(key|space)-\d+\.ogg$/.test(url))).toHaveLength(KEYBOARD_DECODE_BATCH_SIZE);
    await settle();
    expect(p.builtIn()).toBe(true);
    expect(p.keyboard.sounds.profile).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keys and clicks while the panel loads a pick never start a second load of it", async () => {
    let answer!: () => void;
    host((url) => (url === manifest("solid") ? new Promise<Response>((resolve) => { answer = () => resolve(respond(url, serve(url, root))); }) : undefined));
    const p = await settledPage({ keyboard: "deep" });
    p.panel.pick("solid");
    await tick();
    // The gesture listeners and typing (GameKeyboard.preload) while the manifest is out.
    for (let i = 0; i < 5; i += 1) {
      void p.keyboard.preload();
      p.keyboard.type("key");
    }
    await tick();
    expect(urls().filter((url) => url === manifest("solid"))).toHaveLength(1);
    answer();
    await settle();
    const files = sampleFiles("solid");
    expect(oggs().filter((url) => /\/(key|space)-\d+\.ogg$/.test(url))).toHaveLength(files.key.length + files.space.length);
    expect(p.keyboard.sounds.profile?.id).toBe("solid");
    expect(p.seen.standIn).toBeNull();
    p.keyboard.type("key");
    expect(decodedUrl(ctx.sources.at(-1)!)).toMatch(/\/solid\/[0-9a-f]{12}\/key-\d{2}\.ogg$/);
  });

  it("a pick the player left before it failed never stands in", async () => {
    let answer!: () => void;
    host((url) => (url === manifest("solid") ? new Promise<Response>((resolve) => { answer = () => resolve(respond(url, { status: 404 })); }) : undefined));
    const p = await settledPage({ keyboard: "deep" });
    p.panel.pick("solid");
    await tick();
    p.panel.pick("off");
    answer();
    await settle();
    expect(p.seen.standIn).toBeNull();
    expect(p.seen.fails).toEqual([]);
    expect(p.builtIn()).toBe(false);
  });

  it("pickFailed stands Dragonhold in only for the page's current keyboard sound, never for Off or Dragonhold", () => {
    const fail = vi.fn();
    const settings = { ...loadSettings(null), keyboard: "warm" };
    const keyboard = player(() => settings, { onFail: fail });
    keyboard.pickFailed("deep");
    expect(fail).not.toHaveBeenCalled();
    for (const id of ["off", BUILT_IN_KEYS]) {
      settings.keyboard = id;
      keyboard.changed();
      keyboard.pickFailed(id);
    }
    expect(fail).not.toHaveBeenCalled();
    settings.keyboard = "deep";
    keyboard.changed();
    keyboard.pickFailed("deep");
    expect(fail).toHaveBeenCalledOnce();
    expect(fail).toHaveBeenCalledWith("deep");
  });
});

describe("192 Firefly player (GameKeyboard)", () => {
  it("lets Hail Stone's long stereo tails (keys to 450 ms, spaces to 535 ms) ring out at 10 keys and 2 spaces a second", async () => {
    const settings = { ...loadSettings(null), keyboard: "hail-stone" };
    // Decoded buffers carry the natural lengths, so the voice pool sees the tails.
    ctx.decodeAudioData.mockImplementation(async (bytes: ArrayBuffer) => {
      const url = new TextDecoder().decode(bytes);
      return { duration: url.includes("/space-") ? 0.535 : 0.45, numberOfChannels: 2, url } as unknown as AudioBuffer;
    });
    const keyboard = player(() => settings);
    await settled(keyboard.preload());
    const files = sampleFiles("hail-stone");
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(files.key.length + files.space.length);
    expect(keyboard.sounds.profile?.id).toBe("hail-stone");
    // 4 s: a key every 100 ms (10 a second, 40 keys) and a space every 500 ms between them (2 a second, 8 spaces): 48 plays.
    const strokes = [
      ...Array.from({ length: 40 }, (_, i) => ({ at: i / 10, kind: "key" as const })),
      ...Array.from({ length: 8 }, (_, i) => ({ at: 0.25 + i / 2, kind: "space" as const })),
    ].sort((a, b) => a.at - b.at);
    for (const stroke of strokes) {
      ctx.currentTime = stroke.at;
      keyboard.type(stroke.kind);
    }
    const played = ctx.sources.map(decodedUrl);
    expect(played).toHaveLength(48);
    expect(played.filter((url) => url.includes("/hail-stone/") && url.includes("/key-"))).toHaveLength(40);
    expect(played.filter((url) => url.includes("/hail-stone/") && url.includes("/space-"))).toHaveLength(8);
    // No voice was stolen: nothing cut a sample before its tail ended.
    expect(keyboard.sounds.stolen).toBe(0);
    for (const source of ctx.sources) expect(source.stop).not.toHaveBeenCalled();
  });

  it("preloads only the current set, plays its key/space files with variation at Master × Keyboard", async () => {
    const settings = { ...loadSettings(null), keyboard: "deep", master: 0.4, keyboardVolume: 0.5, effects: 0 };
    const keyboard = player(() => settings);
    await settled(keyboard.preload());
    const files = sampleFiles("deep");
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(files.key.length + files.space.length);
    keyboard.type("key");
    keyboard.type("key");
    keyboard.type("space");
    const played = ctx.sources.map(decodedUrl);
    expect(played[0]).toMatch(/\/deep\/[0-9a-f]{12}\/key-\d\d.ogg$/);
    expect(played[1]).not.toBe(played[0]);
    expect(played[2]).toMatch(/\/deep\/[0-9a-f]{12}\/space-\d\d.ogg$/);
    const voice = ctx.sources[0]!.target as TestGain;
    expect((voice.target as TestGain).gain.value).toBe(0.2);
    expect(urls().some((url) => url.includes("/deep-amber/") || url.includes("/solid/"))).toBe(false);
  });

  it("plays the first decoded batch (keys and spaces) while the other variants load, and drops a superseded load", async () => {
    const settings = { ...loadSettings(null), keyboard: "deep" };
    const keyboard = player(() => settings);
    const pending = keyboard.preload();
    await flush();
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(KEYBOARD_DECODE_BATCH_SIZE);
    keyboard.type("key");
    keyboard.type("space");
    expect(ctx.sources).toHaveLength(2);
    expect(decodedUrl(ctx.sources[0]!)).toMatch(/\/deep\/[0-9a-f]{12}\/key-\d\d.ogg$/);
    expect(decodedUrl(ctx.sources[1]!)).toMatch(/\/deep\/[0-9a-f]{12}\/space-\d\d.ogg$/);
    settings.keyboard = "off";
    keyboard.changed();
    await expect(settled(pending)).resolves.toBe("other");
    expect(keyboard.sounds.profile).toBeNull();
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(KEYBOARD_DECODE_BATCH_SIZE);
  });

  it.each(["off", "mute", "master-zero", "keyboard-zero", "original"])("blocks gameplay key/space playback for %s", async (condition) => {
    const settings = loadSettings(null);
    const keyboard = player(() => settings);
    await settled(keyboard.preload());
    if (condition === "off") settings.keyboard = "off";
    if (condition === "mute") settings.muted = true;
    if (condition === "master-zero") settings.master = 0;
    if (condition === "keyboard-zero") settings.keyboardVolume = 0;
    if (condition === "original") settings.keyboard = BUILT_IN_KEYS;
    keyboard.refresh();
    keyboard.type("key");
    keyboard.type("space");
    expect(ctx.sources).toHaveLength(0);
  });

  it("cannot reactivate a delayed saved set after selecting Off or disposal", async () => {
    const settings = loadSettings(null);
    const keyboard = player(() => settings);
    const pending = keyboard.preload();
    settings.keyboard = "off";
    keyboard.changed();
    await settled(pending);
    expect(keyboard.sounds.profile).toBeNull();
    settings.keyboard = "solid";
    const next = keyboard.preload();
    keyboard.dispose();
    await expect(settled(next)).resolves.toBe("other");
    keyboard.type("key");
    expect(ctx.sources).toHaveLength(0);
  });

  it("loads nothing until the settled list is in, and never a set the list cannot load", async () => {
    const settings = { ...loadSettings(null), keyboard: "deep" };
    const fail = vi.fn();
    const keyboard = new GameKeyboard(() => settings, pendingKeyboardChoices("deep", ORIGINAL_KEYBOARD), () => ctx as unknown as AudioContext, { onFail: fail });
    keyboards.push(keyboard);
    await expect(settled(keyboard.preload())).resolves.toBe("other");
    expect(urls()).toEqual([]);
    expect(fail).not.toHaveBeenCalled();
    keyboard.setChoices([...choices.filter((c) => c.value !== "deep"), savedSound("deep")]);
    await expect(settled(keyboard.preload())).resolves.toBe("silent");
    await expect(settled(keyboard.preload())).resolves.toBe("silent");
    expect(urls()).toEqual([]);
    expect(fail).toHaveBeenCalledTimes(1);
  });
});
