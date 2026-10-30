import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameKeyboard, KEYS_BASE, loadGameKeyboards } from "../../src/app/keyboard";
import { SETTINGS_DEFAULTS, BUILT_IN_KEYS, applyQuick, audioVolumes, keyboardChoice, keyboardLevel, loadSettings, quickValues, voiceLevel } from "../../src/app/settings";
import { volumeFor } from "../../src/audio/mix";
import { KEYBOARD_DECODE_BATCH_SIZE, keyboardFiles } from "../../src/kit/feedback/typing-fx";
import { TestContext, TestGain, TestSource, flush } from "./keyboard-audio-fixture";

const publicFile = (url: string) => resolve("public", url.replace(/^\//, ""));
const fetchLocal = vi.fn(async (url: string) => ({ ok: true, json: async () => JSON.parse(readFileSync(publicFile(url), "utf8")), arrayBuffer: async () => new TextEncoder().encode(url).buffer }));
beforeEach(() => {
  vi.stubGlobal("fetch", fetchLocal);
  vi.stubGlobal("GainNode", TestGain);
  vi.stubGlobal("AudioBufferSourceNode", TestSource);
  fetchLocal.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

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
});

describe("192 shipped Firefly media and player", () => {
  it("reads Off, Dragonhold and the 33 Firefly sets in seven families from the kit catalogue, with lazy samples", async () => {
    const catalog = await loadGameKeyboards();
    expect(catalog.state).toBe("ready");
    expect(catalog.options.slice(0, 2).map((p) => p.value)).toEqual(["off", BUILT_IN_KEYS]);
    const firefly = catalog.options.slice(2);
    expect(firefly).toHaveLength(33);
    // Each family is one contiguous run, so the kit list draws one heading per family.
    expect(firefly.map((p) => p.family).filter((family, i, all) => family !== all[i - 1])).toEqual(["Deep", "Warm", "Rounded", "Solid", "Crisp", "Clear", "Bright Clack"]);
    // Owner pick 30/10: Raindrop Tile closes the Crisp family. It has no 218 score (null), and the kit still lists it.
    const raindrop = firefly.findIndex((p) => p.value === "raindrop-tile");
    expect(firefly.slice(raindrop - 1, raindrop + 2).map((p) => p.value)).toEqual(["crisp-silk", "raindrop-tile", "clear"]);
    expect(firefly[raindrop]).toEqual({ value: "raindrop-tile", label: "Raindrop Tile", family: "Crisp", manifest: KEYS_BASE + "raindrop-tile/keys-manifest.json", preview: KEYS_BASE + "raindrop-tile/preview.ogg" });
    const rows = (JSON.parse(readFileSync(publicFile(KEYS_BASE + "keys-manifest.json"), "utf8")) as { profiles: Record<string, unknown>[] }).profiles;
    expect(rows.find((row) => row.id === "raindrop-tile")).toMatchObject({ score: null, ownerPick: true, order: 18 });
    expect(rows.filter((row) => typeof row.score !== "number").map((row) => row.id)).toEqual(["raindrop-tile"]);
    // The seven earlier ids stay, so a save from the first release keeps its set.
    for (const id of ["deep", "warm", "rounded", "solid", "crisp", "clear", "bright-clack"]) expect(firefly.map((p) => p.value)).toContain(id);
    expect(fetchLocal).toHaveBeenCalledTimes(1);
    expect(loadSettings(null).keyboard).toBe("bright-clack");
    expect(keyboardChoice("gone", catalog.options)).toBe("bright-clack");
    expect(keyboardChoice("off", catalog.options)).toBe("off");
  });

  it("ships 70-80 key variants (17 for Raindrop Tile), 8 space variants and a preview per set, OGG only", async () => {
    const catalog = await loadGameKeyboards();
    let keys = 0;
    let spaces = 0;
    for (const option of catalog.options) {
      if (!option.manifest) continue;
      const folder = option.manifest.slice(0, option.manifest.lastIndexOf("/") + 1);
      const files = keyboardFiles(JSON.parse(readFileSync(publicFile(option.manifest), "utf8")), folder);
      if (option.value === "raindrop-tile") expect(files.key).toHaveLength(17);
      else {
        expect(files.key.length).toBeGreaterThanOrEqual(70);
        expect(files.key.length).toBeLessThanOrEqual(80);
      }
      expect(files.space).toHaveLength(8);
      expect(new Set([...files.key, ...files.space]).size).toBe(files.key.length + files.space.length);
      for (const url of [...files.key, ...files.space, option.preview!]) {
        expect(url).toMatch(/\.ogg$/);
        expect(existsSync(publicFile(url))).toBe(true);
      }
      expect(readdirSync(publicFile(folder)).filter((name) => !name.endsWith(".ogg") && name !== "keys-manifest.json")).toEqual([]);
      keys += files.key.length;
      spaces += files.space.length;
    }
    expect([keys, spaces]).toEqual([2413, 264]);
  });

  it("lists every shipped keyboard OGG in media.md5 with its hash, and nothing else under audio/keys", () => {
    const root = publicFile(KEYS_BASE);
    const shipped = (readdirSync(root, { recursive: true }) as string[]).filter((name) => name.endsWith(".ogg")).map((name) => "public" + KEYS_BASE + name.split(sep).join("/")).sort();
    const listed = new Map(readFileSync("media.md5", "utf8").split("\n").filter((line) => line.includes(" public" + KEYS_BASE)).map((line) => {
      const [hash, path] = line.split(/ {2}/);
      return [path!, hash!] as const;
    }));
    expect(shipped).toHaveLength(2710);
    expect([...listed.keys()].sort()).toEqual(shipped);
    for (const path of shipped) expect(createHash("md5").update(readFileSync(path)).digest("hex"), path).toBe(listed.get(path));
  });

  it("lets Raindrop Tile's long stereo tails (keys up to 450 ms) ring out at 10 keys and 2 spaces a second", async () => {
    const catalog = await loadGameKeyboards();
    const settings = { ...loadSettings(null), keyboard: "raindrop-tile" };
    const manifest = JSON.parse(readFileSync(publicFile(KEYS_BASE + "raindrop-tile/keys-manifest.json"), "utf8")) as { schema: string; files: { file: string; set: string; durationMs: number }[]; preview: string };
    expect(manifest.schema).toBe("typing-keys-firefly/2");
    expect(manifest.preview).toBe("preview.ogg");
    const ms = new Map(manifest.files.map((f) => [f.file, f.durationMs]));
    expect(Math.max(...manifest.files.filter((f) => f.set === "key").map((f) => f.durationMs))).toBe(450);
    const ctx = new TestContext();
    // Decoded buffers carry the real lengths, so the voice pool sees the natural tails.
    ctx.decodeAudioData.mockImplementation(async (bytes: ArrayBuffer) => {
      const url = new TextDecoder().decode(bytes);
      return { duration: ms.get(url.slice(url.lastIndexOf("/") + 1))! / 1000, numberOfChannels: 2, url } as unknown as AudioBuffer;
    });
    const keyboard = new GameKeyboard(() => settings, catalog.options, () => ctx as unknown as AudioContext);
    await keyboard.preload();
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(25);
    expect(keyboard.sounds.profile?.id).toBe("raindrop-tile");
    // 4 s at 10 keys a second (every 100 ms) plus 2 spaces a second between them: 48 plays.
    const strokes = [
      ...Array.from({ length: 40 }, (_, i) => ({ at: i / 10, kind: "key" as const })),
      ...Array.from({ length: 8 }, (_, i) => ({ at: 0.25 + i / 2, kind: "space" as const })),
    ].sort((a, b) => a.at - b.at);
    for (const stroke of strokes) {
      ctx.currentTime = stroke.at;
      keyboard.type(stroke.kind);
    }
    expect(ctx.sources).toHaveLength(48);
    expect(ctx.sources.filter((source) => (source.buffer as unknown as { url: string }).url.includes("/space-"))).toHaveLength(8);
    // No voice was stolen: nothing cut a sample before its tail ended.
    expect(keyboard.sounds.stolen).toBe(0);
    for (const source of ctx.sources) expect(source.stop).not.toHaveBeenCalled();
    keyboard.dispose();
  });

  it("preloads only the saved set, plays its key/space files with variation at Master × Keyboard", async () => {
    const catalog = await loadGameKeyboards();
    const settings = { ...loadSettings(null), keyboard: "warm", master: 0.4, keyboardVolume: 0.5, effects: 0 };
    const ctx = new TestContext();
    const keyboard = new GameKeyboard(() => settings, catalog.options, () => ctx as unknown as AudioContext);
    await keyboard.preload();
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(88);
    keyboard.type("key");
    keyboard.type("key");
    keyboard.type("space");
    const urls = ctx.sources.map((s) => (s.buffer as unknown as { url: string }).url);
    expect(urls[0]).toMatch(/\/warm\/key-\d\d.ogg$/);
    expect(urls[1]).not.toBe(urls[0]);
    expect(urls[2]).toMatch(/\/warm\/space-\d\d.ogg$/);
    const voice = ctx.sources[0]!.target as TestGain;
    expect((voice.target as TestGain).gain.value).toBe(0.2);
    expect(fetchLocal.mock.calls.some(([url]) => url.includes("/deep/"))).toBe(false);
    keyboard.dispose();
  });

  it("plays the first decoded batch while the other variants load, and drops a superseded load", async () => {
    const catalog = await loadGameKeyboards();
    const settings = { ...loadSettings(null), keyboard: "warm" };
    const ctx = new TestContext();
    const keyboard = new GameKeyboard(() => settings, catalog.options, () => ctx as unknown as AudioContext);
    const pending = keyboard.preload();
    await flush();
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(KEYBOARD_DECODE_BATCH_SIZE);
    keyboard.type("key");
    expect(ctx.sources).toHaveLength(1);
    expect((ctx.sources[0]!.buffer as unknown as { url: string }).url).toMatch(/\/warm\/key-\d\d.ogg$/);
    settings.keyboard = "off";
    keyboard.changed();
    await pending;
    expect(keyboard.sounds.profile).toBeNull();
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(KEYBOARD_DECODE_BATCH_SIZE);
    keyboard.dispose();
  });

  it.each(["off", "mute", "master-zero", "keyboard-zero", "original"])("blocks gameplay key/space playback for %s", async (condition) => {
    const catalog = await loadGameKeyboards();
    const settings = loadSettings(null);
    const ctx = new TestContext();
    const keyboard = new GameKeyboard(() => settings, catalog.options, () => ctx as unknown as AudioContext);
    await keyboard.preload();
    if (condition === "off") settings.keyboard = "off";
    if (condition === "mute") settings.muted = true;
    if (condition === "master-zero") settings.master = 0;
    if (condition === "keyboard-zero") settings.keyboardVolume = 0;
    if (condition === "original") settings.keyboard = BUILT_IN_KEYS;
    keyboard.refresh();
    keyboard.type("key");
    keyboard.type("space");
    expect(ctx.sources).toHaveLength(0);
    keyboard.dispose();
  });

  it("cannot reactivate a delayed saved set after selecting Off or disposal", async () => {
    const catalog = await loadGameKeyboards();
    const settings = loadSettings(null);
    const ctx = new TestContext();
    const keyboard = new GameKeyboard(() => settings, catalog.options, () => ctx as unknown as AudioContext);
    const pending = keyboard.preload();
    settings.keyboard = "off";
    keyboard.changed();
    await pending;
    expect(keyboard.sounds.profile).toBeNull();
    settings.keyboard = "warm";
    const next = keyboard.preload();
    keyboard.dispose();
    await next;
    keyboard.type("key");
    expect(ctx.sources).toHaveLength(0);
    await flush();
  });

  it.each([
    ["samples", (url: string) => url.endsWith(".ogg")],
    ["manifest and samples", (url: string) => !url.endsWith("/keys/keys-manifest.json")],
  ])("does not refetch a set whose %s cannot be fetched on every key, until the player picks again or the page reloads", async (_, missing) => {
    const catalog = await loadGameKeyboards();
    const fetchSome = vi.fn(async (url: string) => missing(url)
      ? { ok: false, status: 404, json: async () => { throw new Error("404"); }, arrayBuffer: async () => { throw new Error("404"); } }
      : { ok: true, json: async () => JSON.parse(readFileSync(publicFile(url), "utf8")), arrayBuffer: async () => new TextEncoder().encode(url).buffer });
    vi.stubGlobal("fetch", fetchSome);
    const settings = loadSettings(null);
    const ctx = new TestContext();
    const choice = catalog.options.find((p) => p.value === settings.keyboard)!;
    const files = keyboardFiles(JSON.parse(readFileSync(publicFile(choice.manifest!), "utf8")), "");
    const perLoad = missing(choice.manifest!) ? 1 : 1 + files.key.length + files.space.length;
    const settle = async (): Promise<void> => { for (let i = 0; i < 12; i += 1) { await flush(); await new Promise((r) => setTimeout(r, 0)); } };
    let keyboard = new GameKeyboard(() => settings, catalog.options, () => ctx as unknown as AudioContext);
    const typeLetters = async (): Promise<void> => { for (let i = 0; i < 10; i += 1) { keyboard.type("key"); await settle(); } };
    await typeLetters();
    expect(fetchSome).toHaveBeenCalledTimes(perLoad);
    expect(ctx.sources).toHaveLength(0);
    // Picking the set again retries once.
    keyboard.changed();
    await typeLetters();
    expect(fetchSome).toHaveBeenCalledTimes(2 * perLoad);
    // So does a page reload (a new player).
    keyboard.dispose();
    keyboard = new GameKeyboard(() => settings, catalog.options, () => ctx as unknown as AudioContext);
    await typeLetters();
    expect(fetchSome).toHaveBeenCalledTimes(3 * perLoad);
    expect(ctx.sources).toHaveLength(0);
    keyboard.dispose();
  });

  it("has no fake legacy Firefly packs when the catalogue is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("missing"); }));
    const missing = await loadGameKeyboards();
    expect(missing.options.map((p) => p.value)).toEqual(["off", BUILT_IN_KEYS]);
    // A save for a set that is not on disk keeps a typing sound: the original one.
    expect(keyboardChoice("deep", missing.options)).toBe(BUILT_IN_KEYS);
    expect(KEYS_BASE).toBe("/assets/dragon-hold/audio/keys/");
  });
});
