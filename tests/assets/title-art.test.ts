import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const MAGICK = process.env.ART_MAGICK || "/opt/homebrew/bin/magick";
const hash = (bytes: Buffer) => createHash("md5").update(bytes).digest("hex");
it("packages accepted art only, preserves alpha, never enlarges, and checks selection/source/output drift", () => {
  mkdirSync(join(ROOT, "tmp/title-art-test"), { recursive: true });
  const dir = mkdtempSync(join(ROOT, "tmp/title-art-test/run-"));
  try {
    const input = join(dir, "source"), out = join(dir, "ui/icons"), title = join(dir, "ui/title"); mkdirSync(input);
    for (const size of [64, 128, 256]) writeFileSync(join(input, `icon.${size}.png`), execFileSync(MAGICK, ["-size", `${size}x${size}`, "xc:#eebb8880", "png:-"]));
    const source = join(input, "logo.alpha.png");
    writeFileSync(source, execFileSync(MAGICK, ["-size", "80x40", "xc:#bbaadd80", "png:-"]));
    const entry = { name: "logo", alt: "Dragonhold", source: "logo.alpha", width: 40, accepted: "119" as string | null };
    const table = { version: 1, icons: [{ name: "icon", keys: [], source: "icon", sizes: [64, 128, 256], interim: false }], art: [entry, { ...entry, name: "pending", source: "missing", accepted: null }] };
    const run = (check = false) => spawnSync(process.execPath, ["--input-type=module", "-e", `import {prepareUiArt} from './scripts/ui-art/prepare.mjs'; try { await prepareUiArt(${JSON.stringify({ artSrc: input, out, check, table })}); } catch(e) { console.error(e.message); process.exitCode=1; }`], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ART_MAGICK: MAGICK } });
    expect(run().stderr).toBe(""); expect(readdirSync(title)).toEqual(["logo.webp"]);
    const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")); const packed = manifest.art.logo;
    expect(Object.keys(manifest.art)).toEqual(["logo"]); expect(packed.accepted).toBe("119");
    expect([packed.width, packed.height]).toEqual([40, 20]); expect(packed.file).toBe("../title/logo.webp");
    expect(packed.sources["logo.alpha.png"]).toBe(hash(readFileSync(source)));
    expect(execFileSync(MAGICK, [join(title, "logo.webp"), "-format", "%w %h %[opaque]", "info:"], { encoding: "utf8" }).toLowerCase()).toBe("40 20 false");
    const actual = execFileSync(MAGICK, [join(title, "logo.webp"), "-depth", "8", "rgba:-"]);
    const expected = execFileSync(MAGICK, [source, "-filter", "Lanczos", "-resize", "40x>", "-depth", "8", "rgba:-"]);
    for (let i = 3; i < actual.length; i += 4) expect(actual[i]).toBe(expected[i]);
    expect(run(true).status).toBe(0);
    const bytes = readFileSync(join(title, "logo.webp")); writeFileSync(join(title, "logo.webp"), Buffer.concat([bytes, Buffer.from([0])]));
    expect(run(true).stderr).toContain("logo.webp"); writeFileSync(join(title, "logo.webp"), bytes);
    const original = readFileSync(source); writeFileSync(source, Buffer.concat([original, Buffer.from([0])]));
    expect(run(true).stderr).toContain("logo.alpha.png"); writeFileSync(source, original);
    entry.accepted = null; expect(run(true).stderr).toContain("logo");
    entry.accepted = "119"; entry.width = 160;
    expect(run().status).toBe(0); const small = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")).art.logo;
    expect([small.width, small.height]).toEqual([80, 40]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 30000);
