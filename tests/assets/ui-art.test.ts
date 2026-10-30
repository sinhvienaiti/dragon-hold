import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const MAGICK = process.env.ART_MAGICK || "/opt/homebrew/bin/magick";
const hash = (bytes: Buffer) => createHash("md5").update(bytes).digest("hex");
let dir: string;
let input: string;
let out: string;
let launcher: string;
const table = { version: 1, icons: ["full", "interim"].map((name) => ({ name, keys: [], alt: name, source: name, sizes: [64, 128, 256], accepted: name === "full" ? "137" : null, interim: name === "interim" })) };
const run = (...args: string[]) => spawnSync(process.execPath, [launcher, "--art-src", input, "--out", out, ...args], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ART_MAGICK: MAGICK } });
const snapshot = () => Object.fromEntries(readdirSync(out).sort().map((name) => [name, hash(readFileSync(join(out, name)))]));

beforeAll(() => {
  mkdirSync(join(ROOT, "tmp/ui-art-test"), { recursive: true });
  dir = mkdtempSync(join(ROOT, "tmp/ui-art-test/run-"));
  input = join(dir, "source"); out = join(dir, "out"); launcher = join(dir, "run.mjs");
  mkdirSync(input);
  for (const entry of table.icons) for (const size of entry.sizes) {
    if (entry.interim && size === 128) continue;
    // RGBA with hard colour edges, transparent and half-transparent pixels.
    const pixels = Buffer.alloc(size * size * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = (i * 13) % 251; pixels[i + 1] = 104; pixels[i + 2] = 65;
      pixels[i + 3] = [0, 64, 128, 255][(i / 4) % 4]!;
    }
    writeFileSync(join(input, `${entry.name}.${size}.png`), execFileSync(MAGICK, ["-size", `${size}x${size}`, "-depth", "8", "rgba:-", "-strip", "png:-"], { input: pixels }));
  }
  writeFileSync(launcher, `import { runPrepare } from ${JSON.stringify(join(ROOT, "scripts/ui-art/prepare.mjs"))};\ntry { await runPrepare(process.argv.slice(2), ${JSON.stringify(table)}); } catch (e) { console.error(e.message); process.exitCode=1; }\n`);
});
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe("UI art packaging CLI", () => {
  it("converts exact sizes and downsamples only the missing 128, preserving alpha and manifest hashes", () => {
    const result = run();
    expect(result.stderr, result.stdout).toBe("");
    expect(result.status).toBe(0);
    const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    expect(readdirSync(out)).toHaveLength(7);
    expect(manifest.version).toBe(1);
    for (const entry of table.icons) {
      const packed = manifest.icons[entry.name];
      expect(packed.interim).toBe(entry.interim);
      expect(packed.source).toBe(entry.source);
      for (const [file, md5] of Object.entries(packed.sources)) expect(md5).toBe(hash(readFileSync(join(input, file))));
      for (const size of entry.sizes) {
        const meta = packed.sizes[size]; const file = join(out, meta.file); const bytes = readFileSync(file);
        expect(meta.file).toBe(`${entry.name}.${size}.webp`);
        expect([meta.width, meta.height]).toEqual([size, size]);
        expect(meta.bytes).toBe(bytes.length); expect(meta.md5).toBe(hash(bytes));
        expect(execFileSync(MAGICK, ["identify", "-format", "%w %h %[opaque]", file], { encoding: "utf8" }).toLowerCase()).toBe(`${size} ${size} false`);
        const rgba = execFileSync(MAGICK, [file, "-depth", "8", "rgba:-"]);
        const expected = execFileSync(MAGICK, [join(input, `${entry.name}.${size === 128 && entry.interim ? 256 : size}.png`), ...(size === 128 && entry.interim ? ["-filter", "Lanczos", "-resize", "128x128"] : []), "-depth", "8", "rgba:-"]);
        for (let i = 3; i < rgba.length; i += 4) expect(rgba[i]).toBe(expected[i]);
        expect(meta.psnr === "Infinity" || meta.psnr >= 35).toBe(true);
      }
    }
    expect(Object.keys(manifest.icons.interim.sources)).toEqual(["interim.64.png", "interim.256.png"]);
    const before = snapshot();
    expect(run("--check").status).toBe(0);
    expect(snapshot()).toEqual(before);
  }, 30000);

  it("fails check on byte/size drift and names the affected WebP without writing", () => {
    const file = join(out, "full.64.webp"); const original = readFileSync(file);
    const changed = Buffer.from(original); changed[changed.length - 1] = changed[changed.length - 1]! ^ 1; writeFileSync(file, changed);
    const before = snapshot(); const result = run("--check");
    expect(result.status).toBe(1); expect(result.stderr).toContain("full.64.webp"); expect(snapshot()).toEqual(before);
    writeFileSync(file, original);
  });

  it("detects changed/missing sources, extra manifest names, and never upscales or replaces old output on failure", () => {
    const before = snapshot(); const source = join(input, "interim.256.png"); const original = readFileSync(source);
    writeFileSync(source, Buffer.concat([original, Buffer.from([0])]));
    expect(run("--check").stderr).toContain("interim.256.png");
    rmSync(source);
    const check = run("--check"); expect(check.status).toBe(1); expect(check.stderr).toContain("interim.128.png");
    const result = run(); expect(result.status).toBe(1); expect(result.stderr).toContain("interim.128.png"); expect(snapshot()).toEqual(before);
    writeFileSync(source, original);
    const file = join(out, "manifest.json"); const manifest = readFileSync(file); const extra = JSON.parse(manifest.toString()); extra.icons.unknown = {};
    writeFileSync(file, JSON.stringify(extra));
    expect(run("--check").status).toBe(1); expect(run("--check").stderr).toContain("unknown");
    writeFileSync(file, manifest);
    expect(run("--check").status).toBe(0);
  }, 30000);

  it("offers help without requiring sources or writing output", () => {
    const result = spawnSync(process.execPath, [join(ROOT, "scripts/ui-art/prepare.mjs"), "--help"], { encoding: "utf8" });
    expect(result.status).toBe(0); expect(result.stdout).toContain("--art-src"); expect(result.stdout).toContain("--check");
  });
});
