import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
