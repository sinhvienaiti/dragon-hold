import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTitle } from "../../src/ui/title";
import { initialTitleState, retryTitle, settleTitle, wantsRetry, type TitleSource } from "../../src/ui/title-state";

// Same DOM stub shape as title.test.ts: classes, hidden/disabled, events, clicks.
class ElementStub {
  className = ""; textContent = ""; innerHTML = ""; hidden = false; disabled = false; src = ""; alt = ""; href = ""; target = "";
  dataset: Record<string, string> = {}; attributes: Record<string, string> = {}; children: ElementStub[] = [];
  events = new Map<string, ((e: any) => void)[]>();
  classList = { toggle: (name: string, on: boolean) => {
    const names = new Set(this.className.split(" ")); if (on) names.add(name); else names.delete(name); this.className = [...names].join(" ");
  } };
  constructor(readonly ownerDocument: DocumentStub) {}
  append(...nodes: ElementStub[]) { this.children.push(...nodes); }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  addEventListener(key: string, fn: (e: any) => void) { this.events.set(key, [...this.events.get(key) ?? [], fn]); }
  fire(key: string) { this.events.get(key)?.forEach(fn => fn({ preventDefault() {}, stopPropagation() {} })); }
  click() { if (!this.disabled) { this.ownerDocument.clicked.push(this); this.fire("click"); } }
  remove() {}
}
class DocumentStub {
  nodes: ElementStub[] = []; clicked: ElementStub[] = [];
  createElement() { const node = new ElementStub(this); this.nodes.push(node); return node; }
  node(cls: string) { return this.nodes.find(node => node.className.split(" ").includes(cls))!; }
}
const others: TitleSource[] = ["models", "ground", "dragons"];
function fixture(onRetry = vi.fn(() => true)) {
  const doc = new DocumentStub(); const start = vi.fn();
  const title = createTitle(doc.createElement() as unknown as HTMLElement, { onStart: start, onRetry });
  title.show();
  return { doc, title, start, onRetry, retry: () => doc.node("dh-title__retry"), startButton: () => doc.node("dh-title__start") };
}
beforeEach(() => { vi.stubEnv("VITE_PORTAL_URL", ""); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("title Retry (222 F3)", () => {
  it("resets only the words source, and only from a blocked title", () => {
    let state = settleTitle(initialTitleState(true), "words", "too-small");
    for (const source of others) state = settleTitle(state, source);
    const next = retryTitle(state);
    expect(next).toMatchObject({ status: "loading", completed: others, portal: true, focus: 0 });
    expect(next.reason).toBeUndefined();
    expect(settleTitle(next, "words").status).toBe("ready");
    expect(retryTitle(next)).toBe(next);
    const ready = settleTitle(next, "words");
    expect(retryTitle(ready)).toBe(ready);
    expect(wantsRetry(state, "enter")).toBe(true);
    expect([wantsRetry(state, "escape"), wantsRetry({ ...state, focus: 1 }, "enter"), wantsRetry(next, "enter"), wantsRetry(ready, "enter")]).toEqual([false, false, false, false]);
  });

  it.each(["load-failed", "empty", "too-small"] as const)("shows Retry for %s, with keys and mouse, and keeps Start off until words are valid", reason => {
    const f = fixture();
    expect(f.retry().hidden).toBe(true);
    for (const source of others) f.title.settle(source);
    f.title.settle("words", reason);
    expect(f.retry().hidden).toBe(false); expect(f.retry().disabled).toBe(false);
    expect(f.retry().innerHTML).toContain("Retry"); expect(f.retry().className).toContain("is-focused");
    expect(f.startButton().disabled).toBe(true);
    f.title.handleAction("enter"); expect(f.onRetry).toHaveBeenCalledOnce();
    f.title.handleAction("enter"); f.retry().click();
    expect(f.onRetry).toHaveBeenCalledOnce(); expect(f.start).not.toHaveBeenCalled();
    expect(f.title.state).toBe("loading"); expect(f.startButton().disabled).toBe(true);
    expect(f.retry().disabled).toBe(true); expect(f.retry().textContent).toBe("Loading words…");
    f.title.settle("words", reason);
    expect(f.title.state).toBe("blocked"); expect(f.retry().disabled).toBe(false);
    f.retry().fire("pointerenter"); f.retry().click();
    expect(f.onRetry).toHaveBeenCalledTimes(2);
    f.title.settle("words");
    expect(f.title.state).toBe("ready"); expect(f.retry().hidden).toBe(true);
    expect(f.startButton().disabled).toBe(false); expect(f.startButton().className).toContain("is-focused");
    f.title.handleAction("enter");
    expect(f.start).toHaveBeenCalledOnce(); expect(f.onRetry).toHaveBeenCalledTimes(2);
  });

  it("keeps the portal reachable while blocked, and a refused retry leaves the title blocked", () => {
    vi.stubEnv("VITE_PORTAL_URL", "https://portal.example/games");
    const f = fixture(vi.fn(() => false));
    f.title.settle("words", "load-failed");
    f.title.handleAction("rotate-right"); f.title.handleAction("enter");
    expect(f.doc.clicked).toContain(f.doc.node("dh-title__portal")); expect(f.onRetry).not.toHaveBeenCalled();
    f.title.handleAction("rotate-left"); f.title.handleAction("enter");
    expect(f.onRetry).toHaveBeenCalledOnce(); expect(f.title.state).toBe("blocked"); expect(f.retry().disabled).toBe(false);
  });

  it("says Loading words… on the status line while words reload after Retry, not the source count", () => {
    const f = fixture(); const status = () => f.doc.node("dh-title__status").textContent;
    // Words fail early, while the other sources still load.
    f.title.settle("models"); f.title.settle("words", "load-failed");
    expect(status()).toBe("Check your connection and try again.");
    f.title.handleAction("enter");
    expect(f.title.state).toBe("loading"); expect(status()).toBe("Loading words…");
    // Other sources settling during the reload do not bring the count back.
    f.title.settle("ground"); f.title.settle("dragons");
    expect(status()).toBe("Loading words…");
    f.title.settle("words", "too-small");
    expect(status()).toBe("Not enough words arrived for this stage.");
    f.retry().click(); expect(status()).toBe("Loading words…");
    f.title.settle("words");
    expect(f.title.state).toBe("ready"); expect(status()).toBe("Press Enter to start");
  });

  it("goes back to the source count once the reloaded words settle before the rest", () => {
    const f = fixture(); const status = () => f.doc.node("dh-title__status").textContent;
    f.title.settle("words", "empty"); f.title.handleAction("enter");
    expect(status()).toBe("Loading words…");
    f.title.settle("words");
    expect(status()).toBe("Loading 1 of 4 · words");
    f.title.settle("ground");
    expect(status()).toBe("Loading 2 of 4 · ground");
  });

  it("keeps the blocked message when the loader refuses the retry", () => {
    const f = fixture(vi.fn(() => false)); const status = () => f.doc.node("dh-title__status").textContent;
    f.title.settle("words", "load-failed"); f.title.handleAction("enter");
    expect(f.onRetry).toHaveBeenCalledOnce(); expect(status()).toBe("Check your connection and try again.");
  });

  it("ignores Retry after dispose", () => {
    const f = fixture(); f.title.settle("words", "empty"); const retry = f.retry();
    f.title.dispose(); retry.click(); f.title.handleAction("enter");
    expect(f.onRetry).not.toHaveBeenCalled();
  });
});
