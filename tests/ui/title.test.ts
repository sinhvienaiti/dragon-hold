import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUICK_SKIN } from "../../src/app/quick";
import { HOW_TO_PLAY } from "../../src/ui/wave-card";
import { createTitle, TITLE_PLATE_STYLE, type TitleArtTable } from "../../src/ui/title";
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
  it.each([{ version: 1, art: [] }, { version: 1, art: table.art.map(entry => ({ ...entry, accepted: null })) }])("requests no unaccepted/missing art and warns once per name", art => {
    const f = fixture(art); f.title.show(); f.title.settle("models");
    expect(f.doc.nodes.filter(node => node.src)).toEqual([]);
    expect(f.doc.node("dh-title__logo-text").textContent).toBe("Dragonhold");
    expect(f.doc.node("dh-title__logo-text").hidden).toBe(false);
    expect(f.doc.node("dh-title__emblem")).toBeUndefined();
    expect(f.doc.node("dh-title").dataset.backdrop).toBe("art");
    expect(console.warn).toHaveBeenCalledTimes(2);
    for (const name of ["title-backdrop", "logo"]) expect(console.warn).toHaveBeenCalledWith("title: missing art", name);
  });
  it("ships the 119 backdrop and logo: the default table requests both, no emblem, and warns about none", () => {
    // The 119 emblem stays accepted in the table, but the title no longer draws it (judges 01/11: a stray marker).
    expect(table.art.map(entry => [entry.name, entry.source, entry.width, entry.accepted])).toEqual([
      ["title-backdrop", "ui/title-epic/title-backdrop", 1536, "119"],
      ["logo", "ui/title-epic/logo.alpha", 1024, "119"],
      ["emblem", "ui/title-epic/emblem.alpha", 512, "119"],
    ]);
    const f = fixture();
    expect(f.doc.nodes.filter(node => node.src).map(node => node.src)).toEqual(
      ["title-backdrop", "logo"].map(name => `/assets/dragon-hold/ui/title/${name}.webp?v=${table.version}`));
    expect(f.doc.node("dh-title__emblem")).toBeUndefined();
    expect(f.doc.node("dh-title__logo").alt).toBe("Dragonhold");
    expect(f.doc.node("dh-title__logo-text").hidden).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });
  it("uses accepted versioned art, and handles repeated image errors once with the required fallbacks", () => {
    const f = fixture(accepted());
    expect(f.doc.nodes.some(node => node.src.includes("/title/emblem."))).toBe(false);
    for (const name of ["title-backdrop", "logo"]) {
      const node = f.doc.nodes.find(node => node.src.includes(`/title/${name}.webp?v=7`))!;
      expect(node).toBeDefined(); node.fire("error"); node.fire("error"); expect(node.hidden).toBe(true);
    }
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(f.doc.node("dh-title__logo-text").hidden).toBe(false);
    expect(f.doc.node("dh-title__logo").alt).toBe("Dragonhold");
  });
  it("puts the Settings panel's button plates on the title root for Start (judges 01/11)", () => {
    expect(QUICK_SKIN.button).toMatch(/\/assets\/dragon-hold\/ui\/quick-settings\/button\.alpha\.png$/);
    expect(QUICK_SKIN.buttonActive).toMatch(/\/assets\/dragon-hold\/ui\/quick-settings\/button-active\.alpha\.png$/);
    expect(TITLE_PLATE_STYLE).toBe(`--dh-title-plate: url("${QUICK_SKIN.button}"); --dh-title-plate-active: url("${QUICK_SKIN.buttonActive}")`);
    const f = fixture();
    expect(f.doc.node("dh-title").attributes.style).toBe(TITLE_PLATE_STYLE);
    const start = f.doc.node("dh-title__start");
    expect(start.className.split(" ")).toEqual(expect.arrayContaining(["dh-btn", "dh-title__start"]));
    expect(start.textContent).toBe("Start");
  });
  it("keeps one prompt line on the title: no how-to lines, a scrim under the menu (judges 01/11)", () => {
    const f = fixture(); f.ready();
    const menu = f.doc.node("dh-title__menu");
    expect(f.doc.node("dh-title__help")).toBeUndefined();
    const texts = f.doc.nodes.map(node => node.textContent);
    for (const line of HOW_TO_PLAY) expect(texts).not.toContain(line);
    // What the menu shows once ready: Start and the one prompt; the error and progress lines are hidden.
    const shown = menu.children.filter(node => !node.hidden);
    expect(shown.map(node => node.className.split(" ").find(name => name.startsWith("dh-title__")))).toEqual(["dh-title__start", "dh-title__status"]);
    expect(f.doc.node("dh-title__status").textContent).toBe("Press Enter to start");
    // The scrim sits right under the menu, above the backdrop and logo, and holds nothing.
    const screen = f.doc.node("dh-title-screen").children.map(node => node.className.split(" ")[0]);
    expect(screen.indexOf("dh-title__scrim")).toBe(screen.indexOf("dh-title__menu") - 1);
    expect(screen.indexOf("dh-title__scrim")).toBeGreaterThan(screen.indexOf("dh-title__backdrop"));
    expect(f.doc.node("dh-title__scrim").children).toEqual([]);
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
