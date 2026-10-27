import { afterEach, describe, expect, it, vi } from "vitest";
import type { FrameInfo } from "../../src/app/contracts";
import type { SimEvent } from "../../src/content/types";
import type { LiveWord } from "../../src/sim/words";
import { createTags } from "../../src/ui/tags";
import { fakeWorld } from "./fake-world";

// Record the presenter's HTML in Node; layout and CSS animation are left to browser QA.
class ElementStub {
  className = "";
  innerHTML = "";
  textContent = "";
  hidden = false;
  dataset: Record<string, string> = {};
  style = { opacity: "", display: "", visibility: "", transform: "", width: "", setProperty: vi.fn() };
  offsetWidth = 80;
  offsetHeight = 32;
  children: ElementStub[] = [];
  private selected = new Map<string, ElementStub>();
  classList = {
    contains: (name: string) => this.className.split(" ").includes(name),
    add: (name: string) => { this.className = [...new Set([...this.className.split(" "), name])].join(" "); },
    remove: (name: string) => { this.className = this.className.split(" ").filter((part) => part !== name).join(" "); },
    toggle: (name: string, on: boolean) => { if (on) this.classList.add(name); else this.classList.remove(name); },
  };

  constructor(readonly ownerDocument: DocumentStub) {}
  get firstElementChild(): ElementStub { return this.querySelector(".dh-tag__body"); }
  querySelector(selector: string): ElementStub {
    let node = this.selected.get(selector);
    if (!node) { node = new ElementStub(this.ownerDocument); this.selected.set(selector, node); }
    return node;
  }
  append(...nodes: ElementStub[]): void { this.children.push(...nodes); }
  setAttribute(): void {}
  remove(): void {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
}

class DocumentStub {
  head = new ElementStub(this);
  elements: ElementStub[] = [];
  getElementById() { return null; }
  createElement(): ElementStub {
    const node = new ElementStub(this);
    this.elements.push(node);
    return node;
  }
  createElementNS(): ElementStub { return this.createElement(); }
}

function fixture() {
  const doc = new DocumentStub();
  const root = new ElementStub(doc);
  const world = fakeWorld({ phase: "wave", wave: 1 });
  const word: LiveWord = {
    text: "cat", kind: "enemy", group: "new", index: 0, target: null, cluster: -1, source: 0,
    tier: 1, typed: 0, errors: 0, firstKeyTick: -1, bornTick: 1, hint: false, asleep: false,
  };
  Object.assign(world.words, { live: [word], deck: { words: [] } });
  Object.assign(world, { enemies: { list: [] } });
  const tags = createTags(root as unknown as HTMLElement, (_x, _y, _z, out) => out, { avoid: () => [] });
  const frame = (now: number) => tags.frame(world, { now, dt: 1 / 60, worldDt: 1 / 60, alpha: 0 } satisfies FrameInfo);
  frame(900);
  const node = doc.elements.find((el) => el.dataset.word === "cat")!;
  const html = () => node.firstElementChild.querySelector(".dh-tag__word").innerHTML;
  const key = (now: number, typed: number, result: "lock" | "advance" | "wrong") => {
    vi.spyOn(performance, "now").mockReturnValue(now);
    word.typed = typed;
    if (result === "wrong") word.errors += 1;
    tags.onEvents([{ tick: world.tick, type: "word-progress", word: 0, typed, key: result, letter: 0 } satisfies SimEvent], world);
    frame(now);
  };
  return { tags, frame, html, key };
}

afterEach(() => vi.restoreAllMocks());

describe("word tag letter animation", () => {
  it("continues the right letter's pop when a wrong key rebuilds its span 100 ms later", () => {
    const f = fixture();
    try {
      f.key(1000, 1, "lock");
      expect(f.html()).toContain('class="t f j" style="--dh-letter-delay:0.0ms">c</span>');
      const right = f.html();
      f.frame(1050);
      expect(f.html()).toBe(right);

      f.key(1100, 1, "wrong");
      expect(f.html()).toContain('class="p">a</span>');
      const pop = f.html().match(/<span class="[^"]*\bj" style="--dh-letter-delay:([\d.-]+)ms">c<\/span>/);
      expect(pop).not.toBeNull();
      expect(Number(pop![1])).toBeCloseTo(-100, 1);
    } finally { f.tags.dispose(); }
  });

  it("starts a fresh pop on the next right key and never revives it after 170 ms", () => {
    const f = fixture();
    try {
      f.key(1000, 1, "lock");
      f.key(1080, 2, "advance");
      expect(f.html()).toContain('class="t f">c</span>');
      expect(f.html()).toContain('class="t j" style="--dh-letter-delay:0.0ms">a</span>');
      f.key(1251, 2, "wrong");
      expect(f.html()).toContain('class="p">t</span>');
      expect(f.html()).not.toContain(" j");
      expect(f.html()).not.toContain("--dh-letter-delay");
    } finally { f.tags.dispose(); }
  });
});
