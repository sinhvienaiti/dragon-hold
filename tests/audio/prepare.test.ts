import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudio } from "../../src/audio";

/** A Web Audio node or param that takes any call (connect chains, params, curves). */
function node(): unknown {
  return new Proxy(function stub() {}, {
    get: (_target, key) => (typeof key === "symbol" || key === "then" ? undefined : key === "value" ? 0 : node()),
    set: () => true,
    apply: () => node(),
  });
}

/** A context that records every node built on it; it stays suspended until resume(). */
function fakeContext() {
  const made: string[] = [];
  const base: Record<string, unknown> & { state: AudioContextState } = {
    state: "suspended",
    currentTime: 0,
    sampleRate: 48000,
    destination: node(),
    resume: vi.fn(async () => { base.state = "running"; }),
    close: vi.fn(async () => { base.state = "closed"; }),
    createBuffer: (channels: number, length: number, sampleRate: number) => ({ numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: () => new Float32Array(length) }),
  };
  const ctx = new Proxy(base, {
    get: (target, key) => {
      if (typeof key === "string" && key in target) return target[key];
      if (typeof key === "string" && key.startsWith("create")) return () => { made.push(key); return node(); };
      return undefined;
    },
  });
  return { ctx: ctx as unknown as AudioContext, base, made };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the page's AudioContext before and after the first gesture (keyboard samples decode on it, parent TYPING_FEEL_SERVICE.md §5.4)", () => {
  it("prepare() makes the context without a gesture, suspended and bare; unlock() builds the mixer on that same context and resumes it", () => {
    const fake = fakeContext();
    const createContext = vi.fn(() => fake.ctx);
    const audio = createAudio({ createContext, autoUnlock: false, events: null });
    const ctx = audio.prepare();
    expect(ctx).toBe(fake.ctx);
    expect(audio.prepare()).toBe(ctx);
    expect(createContext).toHaveBeenCalledTimes(1);
    // No mixer, voice or music waits on the suspended context, so nothing queues to burst out on the first gesture.
    expect(audio.unlocked).toBe(false);
    expect(audio.stats().unlocked).toBe(false);
    expect(fake.made).toEqual([]);
    expect(fake.base.resume).not.toHaveBeenCalled();
    audio.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(audio.unlocked).toBe(true);
    expect(fake.made).toContain("createGain");
    expect(fake.base.resume).toHaveBeenCalledTimes(1);
    expect(audio.context()).toBe(ctx);
    expect(audio.prepare()).toBe(ctx);
    audio.dispose();
    expect(() => audio.prepare()).toThrow("Audio is disposed");
  });

  it("unlock() first (a gesture before any keyboard set) still makes one context, which prepare() then returns", () => {
    const fake = fakeContext();
    const createContext = vi.fn(() => fake.ctx);
    const audio = createAudio({ createContext, autoUnlock: false, events: null });
    audio.unlock();
    expect(audio.unlocked).toBe(true);
    expect(audio.prepare()).toBe(fake.ctx);
    expect(createContext).toHaveBeenCalledTimes(1);
    audio.dispose();
  });

  it("without Web Audio, prepare() throws (the keyboard's load fails and Dragonhold stands in) and unlock() does nothing", () => {
    vi.stubGlobal("AudioContext", undefined);
    const audio = createAudio({ autoUnlock: false, events: null });
    expect(() => audio.prepare()).toThrow("Audio is unavailable");
    audio.unlock();
    expect(audio.unlocked).toBe(false);
    audio.dispose();
  });
});
