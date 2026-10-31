import { afterEach, describe, expect, it, vi } from "vitest";
import { createPortalBridge, portalHome } from "../../src/app/portal";
import { LEARNING_ATTEMPT_MESSAGE, SHARED_MUSIC_MESSAGE, type BridgeHost } from "../../src/kit/learning";
import { typedWordEvent } from "../../src/app/learning";

afterEach(() => vi.unstubAllEnvs());

describe("portalHome", () => {
  it.each([undefined, "", "   "])("has no portal for %j", (url) => {
    expect(portalHome(url)).toBeNull();
  });

  it.each([
    [" https://portal.example ", "https://portal.example/"],
    ["https://portal.example/learn/?game=dragon-hold#home", "https://portal.example/learn/?game=dragon-hold#home"],
    ["http://localhost:8080/portal/", "http://localhost:8080/portal/"],
  ])("keeps the configured HTTP(S) destination %s", (url, home) => {
    expect(portalHome(url)).toBe(home);
  });

  it.each(["/portal/", "https://a.example , https://b.example", "javascript:alert(1)", "data:text/html,portal", "ftp://portal.example", "https://user:secret@portal.example"])("rejects an invalid portal URL %s", (url) => {
    expect(() => portalHome(url)).toThrow(/VITE_PORTAL_URL/);
  });
});

function fixture() {
  const parent = { postMessage: vi.fn() };
  let receive = (_event: MessageEvent) => {};
  const host: BridgeHost = {
    parent,
    addEventListener: (_type, listener) => { receive = listener; },
    removeEventListener: vi.fn(),
    setTimeout: vi.fn(), clearTimeout: vi.fn(), now: () => 1234,
  };
  const data = new Map<string, unknown>();
  const storage = {
    readJson: (key: string) => data.get(key) ?? null,
    writeJson: (key: string, value: unknown) => { data.set(key, value); return true; },
  };
  const event = typedWordEvent({
    type: "word-complete", tick: 1, word: 0, text: "river", kind: "enemy", grade: "perfect", errors: 0,
    keyTicks: 40, responseMs: 640, target: null, activity: "typing-enemy", scored: true, hintUsed: false,
  }, false, "2026-10-29T00:00:00.000Z");
  return { host, parent, storage, event, receive: (origin: string) => receive({
    origin, source: parent, data: { type: SHARED_MUSIC_MESSAGE, playing: true },
  } as unknown as MessageEvent) };
}

describe("configured learning bridge", () => {
  it.each([undefined, "", "   "])("keeps events local without a portal URL (%j), even in a frame", (url) => {
    vi.stubEnv("VITE_PORTAL_URL", url);
    const f = fixture();
    const bridge = createPortalBridge({ host: f.host, storage: f.storage });
    expect(bridge.parentOrigin).toBe("");
    expect(bridge.embedded).toBe(false);
    bridge.sendAttempt(f.event);
    expect(bridge.queued()).toEqual([f.event]);
    expect(bridge.requestFocus()).toBe(false);
    expect(f.parent.postMessage).not.toHaveBeenCalled();
    bridge.dispose();
  });

  it("posts only to the configured origin and accepts messages only from it", () => {
    vi.stubEnv("VITE_PORTAL_URL", " https://portal.example/learn/?game=dragon-hold#home ");
    const f = fixture();
    const bridge = createPortalBridge({ host: f.host, storage: f.storage });
    const music = vi.fn();
    bridge.onSharedMusic(music);
    bridge.sendAttempt(f.event);
    expect(bridge.embedded).toBe(true);
    expect(bridge.parentOrigin).toBe("https://portal.example");
    expect(f.parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: LEARNING_ATTEMPT_MESSAGE, event: f.event }), "https://portal.example");
    f.receive("https://wrong.example");
    expect(music).not.toHaveBeenCalled();
    f.receive("https://portal.example");
    expect(music).toHaveBeenCalledWith(true);
    bridge.dispose();
  });

  it("flushes events kept without a portal when a configured portal is available", () => {
    const f = fixture();
    vi.stubEnv("VITE_PORTAL_URL", "");
    const alone = createPortalBridge({ host: f.host, storage: f.storage });
    alone.sendAttempt(f.event);
    alone.dispose();
    vi.stubEnv("VITE_PORTAL_URL", "https://portal.example/");
    const embedded = createPortalBridge({ host: f.host, storage: f.storage });
    expect(f.parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({ event: f.event }), "https://portal.example");
    expect(embedded.queued()).toEqual([]);
    embedded.dispose();
  });
});
