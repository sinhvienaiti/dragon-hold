import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { icon } from "../../src/ui/skin";
import { createTitle } from "../../src/ui/title";

// Reads the real stylesheets: a DOM stub has no cascade, which is how the title layout leaked (222 F2).
interface Rule { readonly file: string; readonly selectors: readonly string[]; readonly decls: Readonly<Record<string, string>> }
const SHEETS = ["src/ui/styles/dh.css", "src/ui/styles/title.css"];

const splitTop = (text: string, sep: string): string[] => {
  const out: string[] = []; let depth = 0, from = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (ch === sep && depth === 0) { out.push(text.slice(from, i)); from = i + 1; }
  }
  out.push(text.slice(from));
  return out.map(part => part.trim()).filter(Boolean);
};
function parseCss(file: string): Rule[] {
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  const walk = (src: string): void => {
    let i = 0;
    for (;;) {
      const open = src.indexOf("{", i);
      if (open < 0) return;
      const raw = src.slice(i, open);
      const prelude = raw.slice(raw.lastIndexOf(";") + 1).trim();
      let depth = 1, j = open + 1;
      for (; j < src.length && depth > 0; j += 1) depth += src[j] === "{" ? 1 : src[j] === "}" ? -1 : 0;
      const body = src.slice(open + 1, j - 1);
      if (/^@(media|supports|layer)\b/.test(prelude)) walk(body);
      else if (!prelude.startsWith("@")) {
        const decls: Record<string, string> = {};
        for (const decl of splitTop(body, ";")) {
          const colon = decl.indexOf(":");
          if (colon > 0) decls[decl.slice(0, colon).trim().toLowerCase()] = decl.slice(colon + 1).trim();
        }
        rules.push({ file, selectors: splitTop(prelude, ","), decls });
      }
      i = j;
    }
  };
  walk(css);
  return rules;
}
/** The rightmost compound of a selector: the element the rule styles. */
const subject = (selector: string): string => {
  let depth = 0, from = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const ch = selector[i]!;
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (depth === 0 && /[\s>+~]/.test(ch)) from = i + 1;
  }
  return selector.slice(from);
};
/** Conservative: ancestors and pseudo-classes may match; ids, attributes and pseudo-elements never do. */
function mayStyle(selector: string, tag: string, classes: readonly string[]): boolean {
  const compound = subject(selector);
  if (compound.includes("::") || compound.includes(":root") || /[\[#]/.test(compound.replace(/\([^)]*\)/g, ""))) return false;
  const bare = compound.replace(/:[\w-]+(\([^)]*\))?/g, "");
  const name = bare.match(/^[a-z][\w-]*|^\*/i)?.[0];
  if (name && name !== "*" && name.toLowerCase() !== tag) return false;
  return [...bare.matchAll(/\.([\w-]+)/g)].every(m => classes.includes(m[1]!));
}
const RULES = SHEETS.flatMap(parseCss);
function declsFor(tag: string, classes: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of RULES) if (rule.selectors.some(s => mayStyle(s, tag, classes))) Object.assign(out, rule.decls);
  return out;
}

/** Every shared heading the UI builds: `el(doc, "<tag>", "… dh-title …")` outside the title screen. */
function headings(): { file: string; line: number; tag: string; classes: string[] }[] {
  const out: { file: string; line: number; tag: string; classes: string[] }[] = [];
  for (const dir of ["src/ui", "src/app"]) {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (!name.endsWith(".ts") || file === join("src/ui", "title.ts")) continue;
      readFileSync(file, "utf8").split("\n").forEach((text, index) => {
        for (const m of text.matchAll(/el\(doc,\s*"(\w+)",\s*"([^"]*)"/g)) {
          const classes = m[2]!.split(/\s+/).filter(Boolean);
          if (classes.includes("dh-title")) out.push({ file, line: index + 1, tag: m[1]!, classes });
        }
      });
    }
  }
  return out;
}
const FULL_SCREEN = ["position", "inset", "z-index", "background", "background-color", "background-image", "pointer-events"];

// ── A small resting-state cascade: ancestors, `>` and specificity, for an enabled, unhovered element. ──
interface Node { readonly tag: string; readonly classes: readonly string[] }
/** Compounds of a selector and the combinators between them (" " or ">"). */
function compounds(selector: string): { parts: string[]; joins: string[] } {
  const parts: string[] = [], joins: string[] = [];
  let depth = 0, current = "", join: string | null = null;
  for (const ch of selector) {
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    if (depth === 0 && /[\s>+~]/.test(ch)) {
      if (current) { parts.push(current); current = ""; join = " "; }
      if (!/\s/.test(ch)) join = ch;
      continue;
    }
    if (join !== null) { joins.push(join); join = null; }
    current += ch;
  }
  if (current) parts.push(current);
  return { parts, joins };
}
/** States (:hover, :disabled), attributes, ids and pseudo-elements never match a resting element. */
function compoundMatches(compound: string, node: Node): boolean {
  const rest = compound.replace(/:not\(:disabled\)/g, "");
  if (/[:[#]/.test(rest)) return false;
  const name = rest.match(/^[a-z][\w-]*|^\*/i)?.[0];
  if (name && name !== "*" && name.toLowerCase() !== node.tag) return false;
  return [...rest.matchAll(/\.([\w-]+)/g)].every(m => node.classes.includes(m[1]!));
}
function selectorMatches(selector: string, path: readonly Node[]): boolean {
  const { parts, joins } = compounds(selector);
  const at = (part: number, node: number): boolean => {
    if (!compoundMatches(parts[part]!, path[node]!)) return false;
    if (part === 0) return true;
    const join = joins[part - 1];
    if (join === ">") return node > 0 && at(part - 1, node - 1);
    if (join === " ") { for (let k = node - 1; k >= 0; k -= 1) if (at(part - 1, k)) return true; }
    return false; // sibling combinators are not modelled
  };
  return parts.length > 0 && at(parts.length - 1, path.length - 1);
}
function specificity(selector: string): number {
  const ids = (selector.match(/#[\w-]+/g) ?? []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]*\]|:(?!not\()[\w-]+/g) ?? []).length;
  const types = compounds(selector).parts.filter(part => /^[a-z]/i.test(part)).length;
  return ids * 10_000 + classes * 100 + types;
}
/** Declared values on the last node of `path`; the font shorthand also sets line-height. */
function computed(path: readonly Node[], sheets: readonly string[] = SHEETS): Record<string, string> {
  const rules = sheets.flatMap(parseCss);
  const hits = rules.flatMap((rule, order) => {
    const matched = rule.selectors.filter(s => selectorMatches(s, path));
    return matched.length ? [{ rule, order, spec: Math.max(...matched.map(specificity)) }] : [];
  });
  hits.sort((a, b) => a.spec - b.spec || a.order - b.order);
  const out: Record<string, string> = {};
  for (const { rule } of hits) {
    for (const [key, value] of Object.entries(rule.decls)) {
      if (key === "font") out["line-height"] = value.match(/\/\s*([\d.]+)/)?.[1] ?? "normal";
      out[key] = value;
    }
  }
  return out;
}
const pick = (decls: Record<string, string>, keys: readonly string[]): Record<string, string | undefined> =>
  Object.fromEntries(keys.map(key => [key, decls[key]]));

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("title screen CSS stays on its own root (222 F2)", () => {
  it("leaves HUD, shop, wave card and results headings without the full-screen layer", () => {
    const found = headings();
    const count = (file: string) => found.filter(h => h.file === file).length;
    // The six headings 222 named: hud 291, shop-strip 177, wave-card 145/161, results 232/249.
    expect([count("src/ui/hud.ts"), count("src/ui/shop-strip.ts"), count("src/ui/wave-card.ts"), count("src/ui/results.ts")]).toEqual([1, 1, 2, 2]);
    const leaks = found.flatMap(h => {
      const decls = declsFor(h.tag, h.classes);
      return FULL_SCREEN.filter(key => key in decls).map(key => `${h.file}:${h.line} ${key}: ${decls[key]}`);
    });
    expect(leaks).toEqual([]);
  });

  it("keeps .dh-title a typography class only (dh.css 87–95)", () => {
    const typography = new Set(["font-family", "font-variant-numeric", "font-weight", "letter-spacing", "color", "text-shadow"]);
    const keys = RULES.filter(rule => rule.selectors.includes(".dh-title")).flatMap(rule => Object.keys(rule.decls));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter(key => !typography.has(key))).toEqual([]);
    const titleCss = readFileSync("src/ui/styles/title.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(titleCss.match(/\.dh-title(?![\w-])/g) ?? []).toEqual([]);
  });

  it("still gives the title screen its own full-screen root", () => {
    const root = declsFor("section", ["dh-title-screen"]);
    expect(root).toMatchObject({ position: "absolute", inset: "0", "z-index": "40", "pointer-events": "auto" });
    vi.stubEnv("VITE_PORTAL_URL", ""); vi.spyOn(console, "warn").mockImplementation(() => {});
    const made: { className: string }[] = [];
    const doc = { createElement: (): object => {
      const node = { ownerDocument: doc, className: "", textContent: "", hidden: false, dataset: {}, children: [] as unknown[], classList: { toggle() {} },
        append(...n: unknown[]) { this.children.push(...n); }, setAttribute() {}, addEventListener() {}, remove() {} };
      made.push(node); return node;
    } };
    const title = createTitle(doc.createElement() as HTMLElement, { onStart: () => {} });
    expect(made.filter(node => node.className.split(" ").includes("dh-title-screen"))).toHaveLength(1);
    title.dispose();
  });
});

describe("title menu buttons keep icon and label in one row (235 browser nit)", () => {
  // The DOM title.ts builds: section.dh-title-screen > div.dh-title__menu > Start | Retry | portal link.
  const screen: Node = { tag: "section", classes: ["dh-title-screen", "dh-title"] };
  const menu: Node = { tag: "div", classes: ["dh-title__menu"] };
  const start = [screen, menu, { tag: "button", classes: ["dh-btn", "dh-title__start"] }];
  const retry = [screen, menu, { tag: "button", classes: ["dh-btn", "dh-title__retry"] }];
  const portal = [screen, menu, { tag: "a", classes: ["dh-btn", "dh-title__portal"] }];
  const retryIcon = [...retry, { tag: "img", classes: ["dh-art"] }];
  const BOX = ["display", "align-items", "justify-content", "gap", "min-height", "padding", "border", "font-size", "line-height", "box-sizing"];
  const ORDERS = [SHEETS, [...SHEETS].reverse()]; // dh.css and title.css load in either order

  it("lays Start, Retry and Back to portal out as one centred row with the same box", () => {
    for (const sheets of ORDERS) {
      for (const path of [start, retry, portal]) {
        const decls = computed(path, sheets);
        expect(pick(decls, ["display", "align-items"])).toEqual({ display: "inline-flex", "align-items": "center" });
        expect(decls.gap).toBeTruthy();
        expect(decls["flex-direction"] ?? "row").toBe("row");
        expect(decls["flex-wrap"] ?? "nowrap").toBe("nowrap");
        // Start and Retry share a line while words are blocked; an inline-flex baseline is the first
        // item's (Retry: the icon's bottom, Start: the text), so baseline alignment shifts their tops.
        expect(decls["vertical-align"]).toBe("top");
      }
      const box = (path: readonly Node[]) => pick(computed(path, sheets), BOX);
      expect(box(retry)).toEqual(box(start));
      expect(box(portal)).toEqual(box(start));
    }
  });

  it("sizes the Retry icon to the label line, so Retry is never taller than Start", () => {
    // Retry is `icon("retry") + "Retry"` (title.ts); the icon is authored art, an <img class="dh-art">.
    expect(icon("retry")).toMatch(/^<img class="dh-art"/);
    for (const sheets of ORDERS) {
      const lineHeight = Number(computed(retry, sheets)["line-height"]);
      expect(lineHeight).toBeGreaterThan(0);
      const img = computed(retryIcon, sheets);
      for (const key of ["width", "height"]) {
        const em = /^([\d.]+)em$/.exec(img[key] ?? "");
        expect(em, `${key}: ${img[key]}`).not.toBeNull();
        expect(Number(em![1])).toBeLessThanOrEqual(lineHeight);
      }
    }
  });

  it("leaves the other screens' buttons as they were", () => {
    const loose = RULES.filter(rule => rule.file.endsWith("title.css")).flatMap(rule => rule.selectors)
      .filter(selector => !/^\.dh-title(-screen|__[\w-]+)(?![\w-])/.test(selector));
    expect(loose).toEqual([]);
    const bare: Node = { tag: "button", classes: ["dh-btn"] };
    const art: Node = { tag: "img", classes: ["dh-art"] };
    expect(computed([bare]).display).toBeUndefined();
    expect(pick(computed([bare, art]), ["display", "width", "height"])).toEqual({
      display: "block", width: "calc(var(--dh-art-box, 20px) * var(--ui))", height: "calc(var(--dh-art-box, 20px) * var(--ui))",
    });
    expect(pick(computed([{ tag: "div", classes: ["dh-results__foot"] }, bare]), ["display", "gap", "padding"])).toEqual({
      display: "inline-flex", gap: "calc(8px * var(--ui))", padding: "calc(8px * var(--ui)) calc(20px * var(--ui))",
    });
    expect(pick(computed([{ tag: "div", classes: ["dh-wave-card__foot"] }, bare]), ["display", "gap"])).toEqual({
      display: "inline-flex", gap: "calc(7px * var(--ui))",
    });
  });
});
