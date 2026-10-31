import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTitle } from "../../src/ui/title";
import { initialTitleState, reopenTitle, settleTitle, titleAction, type TitleSource } from "../../src/ui/title-state";

// Quit to title (192) on the 197 title: show() refuses a started title, reopen() brings it back ready.
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
  click() { if (!this.disabled) this.events.get("click")?.forEach(fn => fn({ preventDefault() {}, stopPropagation() {} })); }
  remove() {}
}
class DocumentStub {
  nodes: ElementStub[] = [];
  createElement() { const node = new ElementStub(this); this.nodes.push(node); return node; }
  node(cls: string) { return this.nodes.find(node => node.className.split(" ").includes(cls))!; }
}
const sources: TitleSource[] = ["words", "models", "ground", "dragons"];
beforeEach(() => { vi.stubEnv("VITE_PORTAL_URL", ""); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("title reopen (Quit to title)", () => {
  it("a started state comes back ready with every source settled and Start focused, without mutating its input", () => {
    const started = titleAction({ ...sources.reduce((s, source) => settleTitle(s, source), initialTitleState(true)), focus: 1 }, "rotate-left").state;
    const run = titleAction(started, "enter").state;
    expect(run.status).toBe("started");
    const snapshot = structuredClone(run);
    const back = reopenTitle(run);
    expect(run).toEqual(snapshot);
    expect(back).toMatchObject({ status: "ready", focus: 0, portal: true });
    expect([...back.completed].sort()).toEqual([...sources].sort());
    expect(titleAction(back, "enter").command).toBe("start");
  });

  it("a title the boot skipped (?title=0) opens ready on its first reopen", () => {
    const back = reopenTitle(initialTitleState(false));
    expect(back.status).toBe("ready");
    expect(back.completed).toHaveLength(4);
  });

  it("reopens the started screen, Start enabled, and starts again on Enter", () => {
    const doc = new DocumentStub(); const start = vi.fn();
    const title = createTitle(doc.createElement() as unknown as HTMLElement, { onStart: start });
    title.show();
    for (const source of sources) title.settle(source);
    expect(title.handleAction("enter")).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
    expect(title.isOpen).toBe(false);
    title.show();
    expect(title.isOpen).toBe(false);
    title.reopen();
    expect(title.isOpen).toBe(true);
    expect(title.state).toBe("ready");
    expect(doc.node("dh-title-screen").hidden).toBe(false);
    expect(doc.node("dh-title__start").disabled).toBe(false);
    expect(doc.node("dh-title__status").textContent).toBe("Press Enter to start");
    title.handleAction("enter");
    expect(start).toHaveBeenCalledTimes(2);
    title.dispose();
    title.reopen();
    expect(title.isOpen).toBe(false);
  });
});
