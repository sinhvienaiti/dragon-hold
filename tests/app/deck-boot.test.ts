import { afterEach, describe, expect, it, vi } from "vitest";
import { startDeckBoot } from "../../src/app/deck-boot";
import { createLearningClient, DeckBuildError } from "../../src/app/learning";
import { STAGE_M0 } from "../../src/content/data/stages";
import type { LearningBridge } from "../../src/kit/learning";
import { WORDS_100 } from "../typing-helpers";
import { clearVocabularyRuntimeCache } from "../../src/kit/vocab";

class NodeStub {
  className = ""; textContent = ""; innerHTML = ""; hidden = false; disabled = false;
  href = ""; target = ""; tabIndex = 0; id = "";
  dataset = {}; attributes: Record<string, string> = {}; children: NodeStub[] = [];
  listeners = new Map<string, Set<(e: any) => void>>();
  constructor(readonly ownerDocument: DocStub) {}
  append(...nodes: NodeStub[]) { this.children.push(...nodes); }
  remove() { this.ownerDocument.removed.add(this); }
  setAttribute(k: string, v: string) { this.attributes[k] = v; }
  focus() { this.ownerDocument.activeElement = this; }
  addEventListener(k: string, f: (e: any) => void) { if (!this.listeners.has(k)) this.listeners.set(k, new Set()); this.listeners.get(k)!.add(f); }
  removeEventListener(k: string, f: (e: any) => void) { this.listeners.get(k)?.delete(f); }
  click() { if (!this.disabled) this.listeners.get("click")?.forEach(f => f({ preventDefault() {}, stopPropagation() {} })); }
}
class DocStub {
  nodes: NodeStub[] = []; removed = new Set<NodeStub>(); activeElement: NodeStub | null = null;
  defaultView = new NodeStub(this);
  createElement() { const n = new NodeStub(this); this.nodes.push(n); return n; }
}
const entries = WORDS_100.map(en => ({ id: en, en, vi: "", ipa: "" }));
function learning(loadEntries?: () => Promise<typeof entries>) {
  return createLearningClient({ loadEntries, bridge: { lookup: async () => { throw Error("offline"); }, dispose() {} } as unknown as LearningBridge,
    storage: { readJson: () => null, writeJson: () => true }, every: () => () => {},
  });
}
async function settle() { for (let i = 0; i < 12; i += 1) await Promise.resolve(); }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); clearVocabularyRuntimeCache(); });
function fixture(load: () => Promise<typeof entries>, portal = "") {
  vi.stubEnv("VITE_PORTAL_URL", portal); vi.spyOn(console, "warn").mockImplementation(() => {});
  const doc = new DocStub(); const root = doc.createElement(); const notice = doc.createElement();
  const client = learning(load); const ready = vi.fn();
  const boot = startDeckBoot(root as unknown as HTMLElement, notice as unknown as HTMLElement, client, STAGE_M0, ready);
  const node = (cls: string) => doc.nodes.find(n => n.className.split(" ").includes(cls))!;
  const key = (code: string, shiftKey = false) => doc.defaultView.listeners.get("keydown")?.forEach(f => f({ code, shiftKey, preventDefault() {}, stopPropagation() {} }));
  return { doc, client, ready, boot, node, key };
}
describe("deck failures and boot gate", () => {
  it.each([0, 69])("retries the real vocabulary adapter after %i cached usable words", async count => {
    clearVocabularyRuntimeCache();
    const index = { version: 1, plannedLevels: 100, availableLevels: 1, totalEntries: 100,
      levels: [{ level: 1, label: "Level 1", file: "level-1.json", count: 100 }] };
    let repaired = false;
    const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith("index.json") ? index : { entries: repaired ? entries : entries.slice(0, count) } }));
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = learning();
    try {
      await expect(client.buildDeck(STAGE_M0)).rejects.toMatchObject({ reason: count === 0 ? "empty" : "too-small", count });
      repaired = true;
      expect((await client.buildDeck(STAGE_M0)).words).toHaveLength(90);
      expect(fetcher.mock.calls.filter(([url]) => !url.endsWith("index.json"))).toHaveLength(2);
    } finally { client.dispose(); }
  });
  it.each(["load-failed", "empty", "too-small"] as const)("reports %s and never starts a run/wave/router/loop/pace card", async reason => {
    const load = async () => { if (reason === "load-failed") throw Error("network"); return reason === "empty" ? [] : entries.slice(0, 69); };
    const c = learning(load); const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(c.buildDeck(STAGE_M0)).rejects.toMatchObject({ reason, count: reason === "too-small" ? 69 : 0 });
    expect(c.deck).toBeNull(); expect(warn).toHaveBeenCalled();
    const f = fixture(load); await settle();
    expect(f.ready).not.toHaveBeenCalled();
    const panel = f.node("dh-deck-notice");
    expect(panel.attributes.role).toBe("alertdialog"); expect(panel.attributes["aria-labelledby"]).toBe(f.node("dh-deck-notice__title").id);
    expect(f.node("dh-deck-notice__title").textContent).toBe("Words could not load");
    expect(f.node("dh-deck-notice__lead").textContent).toBe(reason === "load-failed" ? "Check your connection and try again." : "Not enough words arrived for this stage.");
    expect(f.doc.activeElement).toBe(f.node("dh-deck-notice__retry"));
    f.boot.dispose(); c.dispose(); f.client.dispose();
  });
  it("retries once while loading, then closes and boots once with no key listener left", async () => {
    let resolve!: (value: typeof entries) => void;
    const load = vi.fn().mockRejectedValueOnce(new DeckBuildError("load-failed", 0)).mockImplementationOnce(() => new Promise(r => resolve = r));
    const f = fixture(load); await settle();
    f.key("Enter"); f.key("Enter"); await settle();
    const retry = f.node("dh-deck-notice__retry");
    expect(retry.disabled).toBe(true); expect(retry.textContent).toBe("Loading words…"); expect(load).toHaveBeenCalledTimes(2);
    resolve(entries); await settle();
    expect(f.ready).toHaveBeenCalledOnce(); expect(f.doc.removed.has(f.node("dh-deck-notice"))).toBe(true);
    expect(f.doc.defaultView.listeners.get("keydown")?.size ?? 0).toBe(0);
    f.boot.dispose(); f.client.dispose();
  });
  it("keeps the panel and re-enables retry after a second failure; dispose cancels late boot", async () => {
    const f = fixture(async () => []); await settle(); f.key("Enter"); await settle();
    expect(f.ready).not.toHaveBeenCalled(); expect(f.node("dh-deck-notice__retry").disabled).toBe(false);
    expect(f.doc.removed.has(f.node("dh-deck-notice"))).toBe(false); f.boot.dispose(); f.client.dispose();
    let resolve!: (value: typeof entries) => void;
    const late = fixture(() => new Promise(r => resolve = r)); late.boot.dispose(); resolve(entries); await settle();
    expect(late.ready).not.toHaveBeenCalled(); late.client.dispose();
  });
  it.each(["", "https://portal.example/learn/?game=dh#home"])("conditionally links portal and cycles native focus: %s", async portal => {
    const f = fixture(async () => [], portal); await settle(); const retry = f.node("dh-deck-notice__retry");
    const link = f.node("dh-deck-notice__portal");
    if (!portal) { expect(link).toBeUndefined(); f.key("Tab"); expect(f.doc.activeElement).toBe(retry); }
    else {
      expect(link.href).toBe(portal); expect(link.target).toBe("_top");
      f.key("Tab"); expect(f.doc.activeElement).toBe(link);
      f.key("ArrowLeft"); expect(f.doc.activeElement).toBe(retry);
      f.key("ArrowRight"); expect(f.doc.activeElement).toBe(link);
      f.key("Tab", true); expect(f.doc.activeElement).toBe(retry);
      const click = vi.spyOn(link, "click"); f.key("ArrowRight"); f.key("Enter"); expect(click).toHaveBeenCalledOnce();
    }
    f.boot.dispose(); f.client.dispose();
  });
});
