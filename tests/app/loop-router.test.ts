import { describe, expect, it } from "vitest";
import { actionFor, createInputRouter, type KeyPanel } from "../../src/app/input-router";
import { createLoop, MAX_STEPS } from "../../src/app/loop";
import type { SimCommand } from "../../src/content/types";

/** A manual frame source: run(now) calls the pending frame. */
function manualFrames() {
  let pending: ((now: number) => void) | null = null;
  return {
    scheduler: { request: (cb: (now: number) => void) => ((pending = cb), 1), cancel: () => (pending = null) },
    run(now: number) {
      const cb = pending;
      pending = null;
      cb?.(now);
    },
  };
}

describe("app loop", () => {
  it("steps the sim at 60 Hz from real time, at most 5 steps a frame at speed 1", () => {
    const frames = manualFrames();
    let steps = 0;
    const loop = createLoop({ step: () => (steps += 1), frame: () => {} }, { scheduler: frames.scheduler });
    loop.start();
    frames.run(0);
    frames.run(1000 / 60);
    expect(steps).toBe(1);
    frames.run(1000 / 60 + 50); // 3 ticks
    expect(steps).toBe(4);
    frames.run(1000); // clamped to 0.1 s → 6 ticks due, 5 run, the backlog is dropped
    expect(steps).toBe(4 + MAX_STEPS);
  });

  it("runs no step while paused and slows the world with the time scale (hit-stop)", () => {
    const frames = manualFrames();
    let steps = 0;
    let scale = 0.05;
    const loop = createLoop({ step: () => (steps += 1), frame: () => {}, timeScale: () => scale }, { scheduler: frames.scheduler });
    loop.start();
    frames.run(0);
    for (let k = 1; k <= 10; k += 1) frames.run((k * 1000) / 60);
    expect(steps).toBe(0); // 10 frames × 0.05 = half a tick
    scale = 1;
    loop.setPaused(true);
    for (let k = 11; k <= 20; k += 1) frames.run((k * 1000) / 60);
    expect(steps).toBe(0);
    loop.setPaused(false);
    for (let k = 21; k <= 26; k += 1) frames.run((k * 1000) / 60);
    expect(steps).toBe(6);
  });
});

describe("key router", () => {
  it("maps command keys by event.code, Shift + digit as Alt + digit (Linux, 00 §6)", () => {
    expect(actionFor("Digit1", "alt")).toBe("skill-1");
    expect(actionFor("Digit1", "shift")).toBe("skill-1");
    expect(actionFor("Digit7", "shift")).toBe("consumable-1");
    expect(actionFor("Digit1", "none")).toBe("carry-1");
    expect(actionFor("Enter", "shift")).toBe("call-early");
    expect(actionFor("Digit0", "alt")).toBe("camera-reset");
    expect(actionFor("F5", "none")).toBeNull();
  });

  function fakeWindow() {
    let handler: ((event: KeyboardEvent) => void) | null = null;
    const target = {
      addEventListener: (_type: string, h: (event: KeyboardEvent) => void) => (handler = h),
      removeEventListener: () => (handler = null),
      performance: { now: () => 1234 },
    } as unknown as Window;
    const press = (init: Partial<KeyboardEvent> & { key: string; code: string }) => {
      let prevented = false;
      handler?.({ altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, repeat: false, isComposing: false, timeStamp: 5, preventDefault: () => (prevented = true), ...init } as KeyboardEvent);
      return prevented;
    };
    return { target, press };
  }

  it("sends letters to the sim, never to handlers; ignores Ctrl/Cmd, repeats and IME composing", () => {
    const { target, press } = fakeWindow();
    const sent: SimCommand[] = [];
    const router = createInputRouter(target, (c) => sent.push(c));
    const seen: string[] = [];
    router.handlers.push({ handleAction: (a) => (seen.push(a), true) });
    expect(press({ key: "a", code: "KeyA" })).toBe(true);
    press({ key: "b", code: "KeyB", repeat: true });
    press({ key: "c", code: "KeyC", ctrlKey: true });
    press({ key: "Process", code: "KeyD", isComposing: true });
    expect(sent).toEqual([{ type: "key", letter: 0, ms: 1234 }]);
    expect(seen).toEqual([]);
    expect(press({ key: "Tab", code: "Tab" })).toBe(true); // Tab never moves focus
    expect(seen).toEqual(["replay"]);
  });

  it("gives a learning panel the letters and enter/backspace/escape; Esc releases a lock first", () => {
    const { target, press } = fakeWindow();
    const sent: SimCommand[] = [];
    const letters: string[] = [];
    let open = true;
    const panel: KeyPanel = { get isOpen() { return open; }, handleLetter: (l) => (letters.push(l), true), handleAction: () => true };
    let locked = true;
    const fallbacks: string[] = [];
    const router = createInputRouter(target, (c) => sent.push(c), { panel: () => panel, locked: () => locked, fallback: (a) => (fallbacks.push(a), true) });
    router.handlers.push({ handleAction: () => false });
    press({ key: "x", code: "KeyX" });
    press({ key: "1", code: "Digit1", altKey: true }); // swallowed while the panel is open
    expect(letters).toEqual(["x"]);
    expect(sent).toEqual([]);
    open = false;
    press({ key: "Escape", code: "Escape" });
    expect(sent).toEqual([{ type: "release" }]);
    locked = false;
    press({ key: "Escape", code: "Escape" });
    expect(fallbacks).toEqual(["escape"]); // no handler took it: the pause menu
    press({ key: "Backspace", code: "Backspace" });
    expect(sent.at(-1)).toEqual({ type: "backspace" });
  });

  it("lets the intercept swallow a press (pause veil, countdown, menu)", () => {
    const { target, press } = fakeWindow();
    const sent: SimCommand[] = [];
    let swallow = true;
    const router = createInputRouter(target, (c) => sent.push(c), { intercept: () => swallow });
    press({ key: "a", code: "KeyA" });
    swallow = false;
    press({ key: "a", code: "KeyA" });
    expect(sent.length).toBe(1);
    expect(router.stats.swallowed).toBe(1);
  });
});
