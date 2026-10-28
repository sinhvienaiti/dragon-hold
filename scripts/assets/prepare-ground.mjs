#!/usr/bin/env node
// Shared ground/decal packaging; defaults are relative to this game, never cwd.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const FORMATS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const md5 = (bytes) => createHash('md5').update(bytes).digest('hex');

function magick(args, input) {
  return execFileSync(process.env.ART_MAGICK || 'magick', args, {
    input, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function contains(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('../'));
}

async function sourcesIn(input) {
  const sources = [];
  const keys = new Set();
  const kits = await readdir(input, { withFileTypes: true });
  for (const kit of kits.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (!kit.isDirectory() || !NAME.test(kit.name)) continue;
    const files = await readdir(join(input, kit.name), { withFileTypes: true });
    for (const file of files.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const extension = extname(file.name).toLowerCase();
      const name = file.name.slice(0, -extension.length);
      // Review tries, prompts and sidecars are source material, not runtime textures.
      if (!file.isFile() || !FORMATS.has(extension) || !NAME.test(name)) continue;
      const key = kit.name + '/' + name;
      if (keys.has(key)) throw new Error('Duplicate texture name: ' + key);
      keys.add(key);
      sources.push({ key, kit: kit.name, name, file: join(input, kit.name, file.name) });
    }
  }
  if (sources.length === 0) throw new Error('No named textures in ' + input + '/<kit>/');
  return sources;
}

/** Max dimension 1024 by default; preserve aspect, alpha and small originals. */
export async function prepareTextures({ kind = 'ground', input, out, size = 1024, quality = 90 } = {}) {
  if (kind !== 'ground' && kind !== 'decals') throw new Error('Unknown texture kind: ' + kind);
  if (!Number.isInteger(size) || size < 1 || size > 16383) throw new Error('size must be an integer from 1 to 16383');
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error('quality must be an integer from 1 to 100');
  input = resolve(input ?? join(ROOT, 'art-src', kind));
  out = resolve(out ?? join(ROOT, 'public/assets/dragon-hold', kind));
  if (contains(input, out) || contains(out, input)) throw new Error('Input and output directories must not overlap');

  const sources = await sourcesIn(input);
  const manifest = { version: 1, kind, textures: {} };
  const pending = [];
  // Finish every conversion before replacing any output or the previous manifest.
  for (const source of sources) {
    const bytes = magick([
      '-limit', 'thread', '1', source.file + '[0]', '-colorspace', 'sRGB',
      '-resize', size + 'x' + size + '>', '-strip', '-quality', String(quality),
      '-define', 'webp:alpha-quality=100', '-define', 'webp:thread-level=0', 'webp:-',
    ]);
    const [width, height] = magick(['identify', '-format', '%w %h', 'webp:-'], bytes)
      .toString().trim().split(/\s+/).map(Number);
    const hash = md5(bytes);
    manifest.textures[source.key] = {
      name: source.name, kit: source.kit, width, height,
      url: '/assets/dragon-hold/' + kind + '/' + source.key + '.webp?v=' + hash,
      md5: hash, bytes: bytes.length,
    };
    pending.push({ file: join(out, source.key + '.webp'), bytes });
  }
  for (const { file, bytes } of pending) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  const manifestFile = join(out, 'manifest.json');
  const temporary = manifestFile + '.tmp-' + process.pid;
  await writeFile(temporary, JSON.stringify(manifest, null, 2) + '\n');
  await rename(temporary, manifestFile);
  return manifest;
}

export async function runPrepare(kind, args = process.argv.slice(2)) {
  const usage = `node scripts/assets/prepare-${kind}.mjs [--input <dir>] [--out <dir>] [--size <px>] [--quality <1..100>]
Input: art-src/${kind}/<kit>/<name>.{png,jpg,jpeg,webp}
Output: public/assets/dragon-hold/${kind}/<kit>/<name>.webp and ${kind}/manifest.json
Defaults: --size 1024 (no upscale), --quality 90. Set ART_MAGICK for ImageMagick 7.
JSON sidecars, prompts and review tries are excluded; manifest contains runtime images only.`;
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    console.log(usage);
    return;
  }
  const options = { kind };
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (!['--input', '--out', '--size', '--quality'].includes(flag) || seen.has(flag)
      || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Invalid option: ' + flag + '\n' + usage);
    seen.add(flag);
    const key = flag.slice(2);
    options[key] = key === 'size' || key === 'quality' ? Number(args[i + 1]) : args[i + 1];
  }
  const manifest = await prepareTextures(options);
  console.log(kind + ': ' + Object.keys(manifest.textures).length + ' textures; manifest md5=' +
    md5(await readFile(resolve(options.out ?? join(ROOT, 'public/assets/dragon-hold', kind), 'manifest.json'))));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runPrepare('ground');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
