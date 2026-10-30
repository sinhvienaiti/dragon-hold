import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameKeyboard, KEYS_BASE, loadGameKeyboards } from "../../src/app/keyboard";
import { SETTINGS_DEFAULTS, BUILT_IN_KEYS, applyQuick, audioVolumes, keyboardChoice, keyboardLevel, loadSettings, quickValues, voiceLevel } from "../../src/app/settings";
import { volumeFor } from "../../src/audio/mix";
import { keyboardFiles } from "../../src/kit/feedback/typing-fx";
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
    expect(loadSettings({ master: NaN, music: -1, voice: 2, keyboard: "../bad", muted: 1, quality: "bad" })).toMatchObject({ master: 0.8, music: 0, voice: 1, keyboard: "deep", muted: false, quality: "high" });
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
  it("reads Off + seven Firefly sets + Dragonhold from the kit catalogue, with lazy samples", async () => {
    const catalog = await loadGameKeyboards();
    expect(catalog.state).toBe("ready");
    expect(catalog.options.map((p) => p.value)).toEqual(["off", "deep", "warm", "rounded", "solid", "crisp", "clear", "bright-clack", BUILT_IN_KEYS]);
    expect(fetchLocal).toHaveBeenCalledTimes(1);
    expect(keyboardChoice("gone", catalog.options)).toBe("deep");
    expect(keyboardChoice("off", catalog.options)).toBe("off");
  });

  it("ships all 91 distinct key/space samples and seven previews, without WAV", async () => {
    const catalog = await loadGameKeyboards();
    let samples = 0;
    for (const option of catalog.options) {
      if (!option.manifest) continue;
      const manifest = JSON.parse(readFileSync(publicFile(option.manifest), "utf8"));
      const files = keyboardFiles(manifest, option.manifest.slice(0, option.manifest.lastIndexOf("/") + 1));
      expect(files.key).toHaveLength(10);
      expect(files.space).toHaveLength(3);
      for (const url of [...files.key, ...files.space, option.preview!]) {
        expect(url).toMatch(/\.ogg$/);
        expect(existsSync(publicFile(url))).toBe(true);
      }
      expect(readdirSync(publicFile(option.manifest.slice(0, option.manifest.lastIndexOf("/"))))).not.toContain("key-01.wav");
      samples += files.key.length + files.space.length;
    }
    expect(samples).toBe(91);
  });

  it("preloads only the saved set, plays its key/space files with variation at Master × Keyboard", async () => {
    const catalog = await loadGameKeyboards();
    const settings = { ...loadSettings(null), keyboard: "warm", master: 0.4, keyboardVolume: 0.5, effects: 0 };
    const ctx = new TestContext();
    const keyboard = new GameKeyboard(() => settings, catalog.options, () => ctx as unknown as AudioContext);
    await keyboard.preload();
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(13);
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

  it("has no fake legacy Firefly packs when the catalogue is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("missing"); }));
    expect((await loadGameKeyboards()).options.map((p) => p.value)).toEqual(["off", BUILT_IN_KEYS]);
    expect(KEYS_BASE).toBe("/assets/dragon-hold/audio/keys/");
  });
});
