import { describe, expect, it } from "vitest";
import { initialTitleState, settleTitle, titleAction, type TitleSource } from "../../src/ui/title-state";

const sources: TitleSource[] = ["words", "models", "ground", "dragons"];
const ready = (portal = true) => sources.reduce((s, source) => settleTitle(s, source), initialTitleState(portal));

describe("title state", () => {
  it("waits for all four distinct sources, including rejected optional assets", () => {
    let state = initialTitleState(true);
    for (const source of sources.slice(0, 3)) {
      state = settleTitle(state, source);
      expect(state.status).toBe("loading");
    }
    expect(settleTitle(state, "words")).toEqual(state);
    expect(settleTitle(state, "dragons").status).toBe("ready");
  });
  it.each(["load-failed", "empty", "too-small"] as const)("blocks permanently for words %s", reason => {
    let state = settleTitle(initialTitleState(true), "words", reason);
    for (const source of sources) state = settleTitle(state, source);
    expect(state.status).toBe("blocked"); expect(state.reason).toBe(reason);
    expect(titleAction(state, "enter").command).toBeNull();
  });
  it("starts once and never mutates its input", () => {
    const state = ready(); const snapshot = structuredClone(state);
    const next = titleAction(state, "enter");
    expect(state).toEqual(snapshot); expect(next.command).toBe("start");
    expect(next.state.status).toBe("started");
    expect(titleAction(next.state, "enter").command).toBeNull();
    expect(titleAction(initialTitleState(true), "enter").command).toBeNull();
  });
  it("wraps arrows through Start and portal, and allows the portal while blocked", () => {
    const state = settleTitle(initialTitleState(true), "words", "empty");
    for (const action of ["rotate-left", "rotate-right", "tilt-up", "tilt-down"]) {
      const next = titleAction(state, action).state;
      expect(next.focus).toBe(1); expect(titleAction(next, action).state.focus).toBe(0);
      expect(titleAction(next, "enter").command).toBe("portal");
    }
  });
  it("stays on the title for Esc and on Start without a portal", () => {
    expect(titleAction(ready(), "escape").state).toEqual(ready());
    for (const action of ["rotate-left", "rotate-right", "tilt-up", "tilt-down"]) {
      expect(titleAction(initialTitleState(false), action).state.focus).toBe(0);
    }
  });
});
