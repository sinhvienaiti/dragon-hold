import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTitle, type TitleArtTable } from "../../src/ui/title";
import table from "../../src/ui/ui-art.json";

class ElementStub {
  className = ""; textContent = ""; hidden = false; disabled = false; src = ""; alt = ""; href = ""; target = "";
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
  remove() { this.ownerDocument.removed.add(this); }
}
class DocumentStub {
  nodes: ElementStub[] = []; clicked: ElementStub[] = []; removed = new Set<ElementStub>();
  createElement() { const node = new ElementStub(this); this.nodes.push(node); return node; }
  node(cls: string) { return this.nodes.find(node => node.className.split(" ").includes(cls))!; }
}
function fixture(art?: TitleArtTable) {
  const doc = new DocumentStub(); const start = vi.fn();
  const title = createTitle(doc.createElement() as unknown as HTMLElement, { onStart: start, art });
  title.show();
  const ready = () => { for (const source of ["words", "models", "ground", "dragons"] as const) title.settle(source); };
  return { doc, title, start, ready };
}
const accepted = (): TitleArtTable => ({ version: 7, art: ["title-backdrop", "logo", "emblem"].map(name => ({ name, alt: name === "logo" ? "Dragonhold" : name, source: name, width: 512, accepted: "119" })) });
beforeEach(() => { vi.stubEnv("VITE_PORTAL_URL", ""); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("title DOM", () => {
  it.each([undefined, { version: 1, art: [] }])("requests no unaccepted/missing art and warns once per name", art => {
    const f = fixture(art); f.title.show(); f.title.settle("models");
    expect(f.doc.nodes.filter(node => node.src)).toEqual([]);
    expect(f.doc.node("dh-title__logo-text").textContent).toBe("Dragonhold");
    expect(f.doc.node("dh-title__logo-text").hidden).toBe(false);
    expect(f.doc.node("dh-title__emblem")).toBeUndefined();
    expect(f.doc.node("dh-title").dataset.backdrop).toBe("art");
    expect(console.warn).toHaveBeenCalledTimes(3);
    for (const name of ["title-backdrop", "logo", "emblem"]) expect(console.warn).toHaveBeenCalledWith("title: missing art", name);
    expect(table.art.map(entry => entry.accepted)).toEqual([null, null, null]);
  });
  it("uses accepted versioned art, and handles repeated image errors once with the required fallbacks", () => {
    const f = fixture(accepted());
    for (const name of ["title-backdrop", "logo", "emblem"]) {
      const node = f.doc.nodes.find(node => node.src.includes(`/title/${name}.webp?v=7`))!;
      expect(node).toBeDefined(); node.fire("error"); node.fire("error"); expect(node.hidden).toBe(true);
    }
    expect(console.warn).toHaveBeenCalledTimes(3);
    expect(f.doc.node("dh-title__logo-text").hidden).toBe(false);
    expect(f.doc.node("dh-title__logo").alt).toBe("Dragonhold");
  });
  it("shows four-source progress, keeps focus on disabled Start, and starts exactly once", () => {
    const f = fixture(); const button = f.doc.node("dh-title__start");
    expect(button.disabled).toBe(true); expect(button.className).toContain("is-focused");
    f.title.handleAction("enter"); expect(f.start).not.toHaveBeenCalled();
    f.title.settle("ground"); expect(f.doc.node("dh-title__status").textContent).toBe("Loading 1 of 4 · ground");
    expect(f.doc.node("dh-title__status").attributes.role).toBe("status");
    f.ready(); expect(button.disabled).toBe(false);
    expect(f.doc.node("dh-title__status").textContent).toBe("Press Enter to start");
    f.title.handleAction("enter"); f.title.handleAction("enter"); button.click();
    expect(f.start).toHaveBeenCalledOnce(); expect(f.title.state).toBe("started"); expect(f.title.isOpen).toBe(false);
  });
  it.each(["load-failed", "empty", "too-small"] as const)("shows the 195 notice for %s and keeps Start disabled", reason => {
    const f = fixture(); f.title.settle("words", reason); f.ready();
    expect(f.title.state).toBe("blocked"); expect(f.doc.node("dh-title__start").disabled).toBe(true);
    expect(f.doc.node("dh-title__error").textContent).toBe("Words could not load");
    expect(f.doc.node("dh-title__status").textContent).toBe(reason === "load-failed" ? "Check your connection and try again." : "Not enough words arrived for this stage.");
    f.title.handleAction("enter"); expect(f.start).not.toHaveBeenCalled();
  });
  it("omits an unset portal entirely, and keeps a configured portal usable while blocked", () => {
    expect(fixture().doc.node("dh-title__portal")).toBeUndefined();
    vi.stubEnv("VITE_PORTAL_URL", "https://portal.example/games"); const f = fixture();
    const portal = f.doc.node("dh-title__portal"); expect(portal.href).toBe("https://portal.example/games"); expect(portal.target).toBe("_top");
    f.title.settle("words", "empty"); f.title.handleAction("rotate-right");
    expect(portal.className).toContain("is-focused"); f.title.handleAction("enter"); expect(f.doc.clicked).toContain(portal);
    f.title.handleAction("escape"); expect(f.title.isOpen).toBe(true);
    f.doc.node("dh-title__start").fire("pointerenter"); expect(f.doc.node("dh-title__start").className).toContain("is-focused");
    portal.fire("mouseenter"); expect(portal.className).toContain("is-focused");
  });
  it("tracks pointer focus, and Start click follows the same transition", () => {
    vi.stubEnv("VITE_PORTAL_URL", "https://portal.example/"); const f = fixture(); f.ready();
    f.doc.node("dh-title__portal").fire("pointerenter"); f.doc.node("dh-title__start").fire("mouseenter");
    f.title.handleAction("enter"); expect(f.start).toHaveBeenCalledOnce();
  });
  it("exposes reversible show/hide subscriptions, a live backdrop switch and an empty quick slot", () => {
    const f = fixture(accepted()); f.title.hide();
    const show = vi.fn(), hide = vi.fn(); const offShow = f.title.onShow(show), offHide = f.title.onHide(hide);
    f.title.show(); f.title.show(); f.title.setBackdrop("live");
    expect(f.doc.node("dh-title").dataset.backdrop).toBe("live");
    expect(f.title.quickSlot).toBe(f.doc.node("dh-title__quick")); expect(f.doc.node("dh-title__quick").children).toEqual([]);
    f.title.hide(); f.title.hide(); expect(show).toHaveBeenCalledOnce(); expect(hide).toHaveBeenCalledOnce();
    offShow(); offHide(); f.title.setBackdrop("art"); f.title.show(); f.title.dispose();
    expect(show).toHaveBeenCalledOnce(); expect(hide).toHaveBeenCalledOnce(); expect(f.title.isOpen).toBe(false);
  });
});
