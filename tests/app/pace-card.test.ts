import { describe, expect, it, vi } from "vitest";
import { createPaceCard } from "../../src/app/pace-card";
import { offerEasy, paceOptions } from "../../src/app/typing-pace";

// Source: tests/ui/tags-animation.test.ts. Node DOM stub; layout stays with browser QA.
class ElementStub {
  className = "";
  hidden = false;
  disabled = false;
  dataset: Record<string, string> = {};
  children: (ElementStub | string)[] = [];
  private text = "";
  private listeners = new Map<string, (() => void)[]>();
  classList = {
    toggle: (name: string, on: boolean) => {
      const classes = new Set(this.className.split(" "));
      if (on) classes.add(name); else classes.delete(name);
      this.className = [...classes].join(" ");
    },
  };

  constructor(readonly ownerDocument: DocumentStub) {}
  get textContent(): string {
    return this.text + this.children.map((child) => typeof child === "string" ? child : child.textContent).join("");
  }
  set textContent(value: string) { this.text = value; this.children = []; }
  append(...nodes: (ElementStub | string)[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: ElementStub[]): void { this.text = ""; this.children = nodes; }
  setAttribute(): void {}
  remove(): void {}
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  fire(type: string): void {
    const event = { preventDefault() {}, stopPropagation() {} };
    for (const listener of this.listeners.get(type) ?? []) (listener as (event: unknown) => void)(event);
  }
}

class DocumentStub {
  elements: ElementStub[] = [];
  createElement(): ElementStub {
    const node = new ElementStub(this);
    this.elements.push(node);
    return node;
  }
}

const hint = "Mới tập gõ: nên chơi mức Dễ, quái thưa và chậm hơn. ⇧↵ chọn tốc độ này và chơi mức Dễ.";

function fixture() {
  const doc = new DocumentStub();
  const card = createPaceCard(new ElementStub(doc) as unknown as HTMLElement);
  const { options } = paceOptions({ measured: null, lastPick: null });
  const onPick = vi.fn();
  const rowIndex = (wpm: number) => options.findIndex((option) => option.header.typistWpm === wpm);
  const node = (name: string) => doc.elements.find((el) => el.className.split(" ").includes(name))!;
  const note = node("dh-pacecard__note");
  const button = node("dh-pacecard__easy");
  const row = (wpm: number) => doc.elements.find((el) => el.dataset.wpm === String(wpm))!;
  const open = (wpm = 15, easy: ((wpm: number) => boolean) | undefined = (speed) => offerEasy(speed, "normal", false), note?: string) =>
    card.open(options, rowIndex(wpm), onPick, undefined, undefined, note, easy);
  return { card, options, onPick, rowIndex, note, button, row, open };
}

describe("speed card Easy suggestion (00 D33 (6))", () => {
  it("shows the exact hint and button at 15 and 20, hides at 25 and 35, and updates on arrows and hover", () => {
    const f = fixture();
    f.open();
    expect(f.note.hidden).toBe(false);
    expect(f.note.textContent).toBe(hint + " Chơi mức Dễ ở 15 WPM");
    expect(f.note.children).toContain(f.button);
    f.card.handleAction("tilt-down");
    expect(f.note.hidden).toBe(false);
    f.card.handleAction("tilt-down");
    expect(f.note.hidden).toBe(false); // reserved, empty: the rows keep their place
    expect(f.note.textContent).toBe("");
    expect(f.note.children).not.toContain(f.button);
    expect(f.card.handleAction("call-early")).toBe(false);
    expect(f.onPick).not.toHaveBeenCalled();
    f.row(15).fire("pointerenter");
    expect(f.note.hidden).toBe(false);
    f.row(35).fire("pointerenter");
    expect(f.note.hidden).toBe(false); // reserved, empty: the rows keep their place
    expect(f.note.textContent).toBe("");
    expect(f.card.handleAction("call-early")).toBe(false);
    f.card.handleAction("tilt-up");
    expect(f.note.hidden).toBe(false); // reserved, empty: the rows keep their place
    expect(f.note.textContent).toBe("");
  });

  it.each(["call-early", "button"])("accepts Easy explicitly through %s and closes the card", (action) => {
    const f = fixture();
    f.open();
    if (action === "button") f.button.fire("click"); else expect(f.card.handleAction(action)).toBe(true);
    expect(f.onPick).toHaveBeenCalledExactlyOnceWith(f.options[f.rowIndex(15)]!.header, { easy: true });
    expect(f.card.isOpen).toBe(false);
    expect(f.card.handleAction("call-early")).toBe(false);
  });

  it.each(["enter", "carry-1", "click"])("keeps the level for %s even with the hint visible", (action) => {
    const f = fixture();
    f.open();
    if (action === "click") f.row(15).fire("click"); else f.card.handleAction(action);
    expect(f.onPick).toHaveBeenCalledExactlyOnceWith(f.options[f.rowIndex(15)]!.header, { easy: false });
  });

  it("chooses the digit's row with the old level and restores the original note above 20 WPM", () => {
    const f = fixture();
    f.open(15, (wpm) => offerEasy(wpm, "normal", false), "Ghi chú cũ");
    f.row(35).fire("pointerenter");
    expect(f.note.hidden).toBe(false);
    expect(f.note.textContent).toBe("Ghi chú cũ");
    expect(f.card.handleAction("call-early")).toBe(false);
    f.card.handleAction("carry-2");
    expect(f.onPick).toHaveBeenCalledExactlyOnceWith(f.options[f.rowIndex(20)]!.header, { easy: false });
    expect(f.note.textContent).toContain(hint);
  });

  it("reopens without a suggestion or stale Easy action from the pause menu", () => {
    const f = fixture();
    f.open();
    f.card.close();
    const onBack = vi.fn();
    f.card.open(f.options, f.rowIndex(15), f.onPick, onBack, undefined, "Chọn tốc độ khác thì ải chơi lại từ đầu.");
    expect(f.note.textContent).toBe("Chọn tốc độ khác thì ải chơi lại từ đầu.");
    expect(f.note.children).not.toContain(f.button);
    expect(f.card.handleAction("call-early")).toBe(false);
    f.button.fire("click");
    expect(f.onPick).not.toHaveBeenCalled();
    expect(f.card.isOpen).toBe(true);
    f.card.handleAction("escape");
    expect(onBack).toHaveBeenCalledOnce();
  });

  it.each(["easy", "hard"] as const)("does not suggest when the URL already chose %s", (difficulty) => {
    const f = fixture();
    f.open(15, (wpm) => offerEasy(wpm, difficulty, false));
    expect(f.note.hidden).toBe(true);
    expect(f.card.handleAction("call-early")).toBe(false);
    expect(f.onPick).not.toHaveBeenCalled();
  });
});
