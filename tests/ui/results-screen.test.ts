import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { portalHome } from "../../src/app/portal";
import { KEYS } from "../../src/content/rules";
import type { SimEvent } from "../../src/content/types";
import { createResults, VICTORY_HOLD_MS } from "../../src/ui/results";
import { keyLabel } from "../../src/ui/skin";
import { fakeWorld } from "./fake-world";

// Source: tests/app/pace-card.test.ts. Node DOM stub; layout stays with browser QA.
class ElementStub {
  className = "";
  innerHTML = "";
  textContent = "";
  hidden = false;
  disabled = false;
  href = "";
  target = "";
  dataset: Record<string, string> = {};
  children: ElementStub[] = [];
  private listeners = new Map<string, ((event: unknown) => void)[]>();
  classList = {
    contains: (name: string) => this.className.split(" ").includes(name),
    toggle: (name: string, on: boolean) => {
      const classes = new Set(this.className.split(" "));
      if (on) classes.add(name); else classes.delete(name);
      this.className = [...classes].join(" ");
    },
  };
  scrollIntoView = vi.fn();
  click = vi.fn(() => this.fire("click"));

  constructor(readonly ownerDocument: DocumentStub, readonly tagName: string) {}
  append(...nodes: ElementStub[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: ElementStub[]): void { this.children = nodes; }
  remove(): void {}
  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  fire(type: string): { preventDefault: ReturnType<typeof vi.fn> } {
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }
}

class DocumentStub {
  elements: ElementStub[] = [];
  createElement(tag: string): ElementStub {
    const node = new ElementStub(this, tag.toUpperCase());
    this.elements.push(node);
    return node;
  }
}

const assigned = (word: number, text: string): SimEvent => ({
  tick: word, type: "word-assigned", word, text, kind: "enemy", group: "known", target: null, firstTier: 1,
});

function fixture() {
  const doc = new DocumentStub();
  const world = fakeWorld({ wave: 10 });
  const actions = { retry: vi.fn(), listen: vi.fn(), easierOffer: vi.fn<() => string | null>(() => null), easier: vi.fn() };
  const results = createResults(doc.createElement("div") as unknown as HTMLElement, actions);
  const node = (name: string) => doc.elements.find((el) => el.classList.contains(name))!;
  const key = (code: string) => results.handleAction(KEYS.find((binding) => binding.code === code && binding.mod === "none")!.action);
  const open = (outcome: "victory" | "defeat") => {
    results.onEvents([assigned(0, "cat"), assigned(1, "dog"), outcome === "victory"
      ? { tick: 2, type: "victory", stars: 3 }
      : { tick: 2, type: "defeat", wave: 10 }], world);
    if (outcome === "victory") key("Escape");
  };
  const frame = (now: number) => results.frame(world, { now, dt: 1 / 60, worldDt: 1 / 60, alpha: 0 });
  return { doc, world, actions, results, node, key, open, frame };
}

beforeEach(() => vi.stubEnv("VITE_PORTAL_URL", "https://portal.example/"));
afterEach(() => vi.unstubAllEnvs());

describe("results portal action (105b, DH-24 / G5)", () => {
  it.each([undefined, "", "   "])("omits the portal action when the URL is empty (%j)", (url) => {
    vi.stubEnv("VITE_PORTAL_URL", url);
    for (const outcome of ["victory", "defeat"] as const) {
      const f = fixture();
      f.open(outcome);
      const retry = f.node("dh-retry");
      expect(f.node("dh-results__actions").children).toHaveLength(1);
      expect(f.node("dh-results__actions").children[0]).toBe(retry);
      expect(f.node("dh-results__portal")).toBeUndefined();
      for (const code of ["ArrowRight", "ArrowLeft", "ArrowRight"]) {
        expect(f.key(code)).toBe(true);
        expect(retry.classList.contains("is-focused")).toBe(true);
        f.key("Enter");
      }
      expect(f.actions.retry).toHaveBeenCalledTimes(3);
      expect(f.node("dh-results__keys").innerHTML).not.toContain("buttons");
    }
  });

  it.each(["https://portal.example/", " https://portal.example/learn/?game=dragon-hold#home "])("renders two matching actions with portalHome(%s) and target _top", (url) => {
    vi.stubEnv("VITE_PORTAL_URL", url);
    const f = fixture();
    f.open("defeat");
    const retry = f.node("dh-retry");
    const portal = f.node("dh-results__portal");
    expect(f.node("dh-results__actions").children).toEqual([retry, portal]);
    expect(retry.tagName).toBe("BUTTON");
    expect(portal.tagName).toBe("A");
    expect(portal.classList.contains("dh-btn")).toBe(true);
    expect(portal.href).toBe(portalHome(url));
    expect(portal.target).toBe("_top");
    expect(portal.innerHTML).toBe(`<span class="dh-key">${keyLabel("enter")}</span>Back to portal`);
    // A pointer click must keep the anchor's native navigation.
    expect(portal.fire("click").preventDefault).not.toHaveBeenCalled();
  });

  it.each(["victory", "defeat"] as const)("starts %s on retry; right + Enter clicks the portal, left + Enter retries", (outcome) => {
    const f = fixture();
    f.open(outcome);
    const retry = f.node("dh-retry");
    const portal = f.node("dh-results__portal");
    expect(retry.classList.contains("is-focused")).toBe(true);
    f.key("Enter");
    expect(f.actions.retry).toHaveBeenCalledOnce();
    f.actions.retry.mockClear();
    expect(f.key("ArrowRight")).toBe(true);
    expect(portal.classList.contains("is-focused")).toBe(true);
    expect(retry.classList.contains("is-focused")).toBe(false);
    f.key("Enter");
    expect(portal.click).toHaveBeenCalledOnce();
    expect(f.actions.retry).not.toHaveBeenCalled();
    expect(f.key("ArrowLeft")).toBe(true);
    expect(retry.classList.contains("is-focused")).toBe(true);
    expect(portal.classList.contains("is-focused")).toBe(false);
    f.key("Enter");
    expect(f.actions.retry).toHaveBeenCalledOnce();
  });

  it("keeps up/down word selection and Tab listening independent of the selected action", () => {
    const f = fixture();
    f.open("defeat");
    const rows = f.node("dh-book__list").children;
    expect(rows[0]!.classList.contains("is-sel")).toBe(true);
    f.key("ArrowRight");
    f.key("ArrowDown");
    expect(rows[1]!.classList.contains("is-sel")).toBe(true);
    expect(rows[0]!.classList.contains("is-sel")).toBe(false);
    f.key("Tab");
    expect(f.actions.listen).toHaveBeenLastCalledWith("dog");
    f.key("ArrowUp");
    expect(rows[0]!.classList.contains("is-sel")).toBe(true);
    expect(rows[1]!.classList.contains("is-sel")).toBe(false);
    f.key("Tab");
    expect(f.actions.listen).toHaveBeenLastCalledWith("cat");
    expect(f.node("dh-results__portal").classList.contains("is-focused")).toBe(true);
    f.key("Escape");
    expect(f.node("dh-results").hidden).toBe(false);
    expect(f.actions.retry).not.toHaveBeenCalled();
  });

  it.each(["Escape", "Enter"])("%s skips the 2.6 s victory hold without activating an action", (skip) => {
    const f = fixture();
    expect(f.key("ArrowRight")).toBe(false);
    expect(f.key("Enter")).toBe(false);
    f.results.onEvents([{ tick: 0, type: "victory", stars: 3 }], f.world);
    f.frame(100);
    expect(VICTORY_HOLD_MS).toBe(2600);
    f.frame(100 + VICTORY_HOLD_MS - 1);
    expect(f.node("dh-results").hidden).toBe(true);
    f.key("ArrowRight");
    f.key(skip);
    expect(f.node("dh-results").hidden).toBe(false);
    expect(f.node("dh-victory").hidden).toBe(true);
    expect(f.node("dh-retry").classList.contains("is-focused")).toBe(true);
    expect(f.actions.retry).not.toHaveBeenCalled();
    expect(f.node("dh-results__portal").click).not.toHaveBeenCalled();
  });

  it("opens automatically after the hold and resets the selected action for a new run", () => {
    const f = fixture();
    f.open("defeat");
    f.key("ArrowRight");
    const next = fakeWorld({ wave: 10 });
    f.results.onEvents([{ tick: 0, type: "victory", stars: 2 }], next);
    f.results.frame(next, { now: 100, dt: 0, worldDt: 0, alpha: 0 });
    f.results.frame(next, { now: 100 + VICTORY_HOLD_MS, dt: 0, worldDt: 0, alpha: 0 });
    expect(f.node("dh-results").hidden).toBe(false);
    f.key("Enter");
    expect(f.actions.retry).toHaveBeenCalledOnce();
    expect(f.node("dh-results__portal").click).not.toHaveBeenCalled();
  });

  it("preserves the optional easier replay shortcut alongside the two actions", () => {
    const f = fixture();
    f.actions.easierOffer.mockReturnValue("Easy");
    f.open("defeat");
    expect(f.node("dh-retry--easier").hidden).toBe(false);
    f.key("ArrowRight");
    f.results.handleAction("call-early");
    expect(f.actions.easier).toHaveBeenCalledOnce();
    f.key("Enter");
    expect(f.node("dh-results__portal").click).toHaveBeenCalledOnce();
    expect(f.actions.retry).not.toHaveBeenCalled();
  });
});
