#!/usr/bin/env node
// Firefly flipbooks → runtime (VFX round 8; docs/games/vfx/FIREFLY_VFX_LIST.md in the parent repo).
// For each id with a cut in ~/VFXLab/out/dragon-hold/<id>/ (an atlas PNG and its JSON from tools/vfx-flipbook):
//   - copies the chosen cut to art-src/vfx/firefly/<id>/ (source media, never in Git; media:push carries it);
//   - writes the runtime atlas to public/assets/dragon-hold/vfx/firefly/<id>.webp (WebP q92, alpha kept);
//   - writes public/assets/dragon-hold/vfx/firefly/manifest.json, which src/view/flipbook.ts reads at load.
// An id without a cut is left out: the game keeps its code-drawn layer for it. Re-run after dropping a new cut in.
// Which cut of an id: --pick <id>=vN, else FXV's own pick (<id>/pick.json `{ "version": "vN" }` or a clip marked
// `best`/`picked` in summary.json), else this lane's pick (PICKS, after looking at the sheets), else the newest.
//   node scripts/assets/prepare-firefly.mjs [--from <dir>] [--max <px>] [--pick id=vN ...] [--dry]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const IDS = ['charge-orb', 'muzzle-flash', 'fireball-head', 'flame-trail', 'impact-burst', 'impact-big', 'smoke-roll', 'embers', 'ground-fire', 'fire-burst'];
/** What a cut's JSON may leave out, per id (the coordinator's quick fire-burst cut opens on five frames of a dot). */
const DEFAULTS = { 'fire-burst': { start: 5 }, 'muzzle-flash': { pivot: [0.06, 0.5] } };
/** This lane's picks from FXV's sheets (29/10, round 8), used when FXV has not named one. */
const PICKS = { 'impact-burst': 'v1', 'impact-big': 'v1', 'muzzle-flash': 'v2', 'fireball-head': 'v1', 'charge-orb': 'v1', embers: 'v1', 'flame-trail': 'v2', 'fire-burst': 'v1' };
/** Which way the effect travels in its cell (degrees, 0 = to the right), when the cut's JSON does not say. */
const HEADINGS = { 'fireball-head/v1': 180 };
const md5 = (bytes) => createHash('md5').update(bytes).digest('hex');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

function magick(args) {
  return execFileSync(process.env.ART_MAGICK || 'magick', args, { maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

async function atlasOf(dir, id, json) {
  for (const key of ['atlas', 'file', 'image']) {
    if (typeof json[key] === 'string' && /^[a-z0-9][a-z0-9._-]*\.(png|webp)$/i.test(json[key]) && existsSync(join(dir, json[key]))) return join(dir, json[key]);
  }
  const files = (await readdir(dir)).filter((name) => name.startsWith(id + '.atlas') && /\.(png|webp)$/i.test(name)).sort();
  return files.length > 0 ? join(dir, files[files.length - 1]) : null;
}

/** The cut to use for `id` in `dir`: { json path, version } or null. */
async function pickCut(dir, id, summary, forced) {
  if (!existsSync(dir)) return null;
  const names = await readdir(dir);
  const versions = names.map((name) => new RegExp('^' + id + '__(v\\d+)\\.json$').exec(name)?.[1]).filter(Boolean).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  let version = forced;
  if (version === undefined && existsSync(join(dir, 'pick.json'))) version = JSON.parse(await readFile(join(dir, 'pick.json'), 'utf8')).version;
  if (version === undefined) version = summary.find((clip) => clip.id === id && (clip.best === true || clip.picked === true || clip.pick === true))?.version;
  if (version === undefined && versions.includes(PICKS[id])) version = PICKS[id];
  if (version === undefined) version = versions[versions.length - 1];
  if (version !== undefined && names.includes(id + '__' + version + '.json')) return { json: join(dir, id + '__' + version + '.json'), version };
  if (names.includes(id + '.json')) return { json: join(dir, id + '.json'), version: 'v0' };
  return null;
}

async function main() {
  const from = resolve(arg('--from', join(homedir(), 'VFXLab/out/dragon-hold')));
  const max = Number(arg('--max', '4096'));
  const dry = process.argv.includes('--dry');
  const assets = await realpath(join(ROOT, 'public/assets'));
  const out = join(assets, 'dragon-hold/vfx/firefly');
  const art = resolve(assets, '../../art-src/vfx/firefly');
  const flipbooks = {};
  const missing = [];
  const summaryPath = join(from, 'summary.json');
  const summary = existsSync(summaryPath) ? JSON.parse(await readFile(summaryPath, 'utf8')).clips ?? [] : [];
  const forced = {};
  process.argv.forEach((value, i) => {
    if (process.argv[i - 1] === '--pick' && /^[a-z-]+=v\d+$/.test(value)) forced[value.split('=')[0]] = value.split('=')[1];
  });
  for (const id of IDS) {
    const dir = join(from, id);
    const cut = await pickCut(dir, id, summary, forced[id]);
    if (cut === null) {
      missing.push(id);
      continue;
    }
    const jsonPath = cut.json;
    const json = JSON.parse(await readFile(jsonPath, 'utf8'));
    const atlas = await atlasOf(dir, id, json);
    if (atlas === null) {
      missing.push(id);
      continue;
    }
    const [width, height, channels] = magick(['identify', '-format', '%w %h %[channels]', atlas]).toString().trim().split(' ');
    const cols = json.cols;
    const rows = json.rows;
    if (!Number.isInteger(cols) || !Number.isInteger(rows)) throw new Error(id + ': no cols/rows in ' + jsonPath);
    const cellW = Number(width) / cols;
    const cellH = Number(height) / rows;
    const scale = Math.min(1, max / Math.max(Number(width), Number(height)));
    const extra = DEFAULTS[id] ?? {};
    const entry = {
      file: id + '.webp',
      cols,
      rows,
      frames: Number.isInteger(json.frames) ? json.frames : cols * rows,
      fps: typeof json.fps === 'number' ? json.fps : 24,
      loop: json.loop === true,
      blend: json.blend === 'normal' ? 'normal' : 'additive',
      cell: [Math.round(cellW * scale), Math.round(cellH * scale)],
      pivot: Array.isArray(json.pivot) ? json.pivot : cut.version === 'v0' ? extra.pivot ?? [0.5, 0.5] : [0.5, 0.5],
      start: Number.isInteger(json.start) ? json.start : cut.version === 'v0' ? extra.start ?? 0 : 0,
      heading: typeof json.heading === 'number' ? json.heading : json.flies === 'left' ? 180 : HEADINGS[id + '/' + cut.version] ?? 0,
      version: cut.version,
      source: typeof json.source === 'string' ? json.source : 'Adobe Firefly Video',
      alpha: /a/.test(channels ?? ''),
    };
    // A pivot in source pixels follows the scale.
    if (entry.pivot.some((v) => v > 1)) entry.pivot = entry.pivot.map((v) => Math.round(v * scale));
    if (dry) {
      console.log(id, atlas, width + 'x' + height, '→', entry);
      continue;
    }
    await mkdir(out, { recursive: true });
    await mkdir(join(art, id), { recursive: true });
    // The chosen cut only (its atlas, JSON, metrics, sheet) as source media.
    const stem = cut.version === 'v0' ? id + '.' : id + '__' + cut.version + '.';
    for (const name of await readdir(dir)) {
      if (name.startsWith(stem) && /\.(png|webp|json|jpg)$/i.test(name)) await copyFile(join(dir, name), join(art, id, name));
    }
    const target = join(out, entry.file);
    const temp = target + '.tmp.webp';
    const resize = scale < 1 ? ['-resize', Math.round(Number(width) * scale) + 'x' + Math.round(Number(height) * scale) + '!'] : [];
    magick([atlas, ...resize, '-quality', '92', '-define', 'webp:alpha-quality=100', temp]);
    await rename(temp, target);
    const bytes = await readFile(target);
    entry.md5 = md5(bytes);
    entry.bytes = bytes.length;
    entry.width = Math.round(Number(width) * scale);
    entry.height = Math.round(Number(height) * scale);
    flipbooks[id] = entry;
    console.log(id + ' ' + cut.version + ': ' + entry.width + '×' + entry.height + ', ' + cols + '×' + rows + ' (' + entry.frames + ' frames, ' + entry.fps + ' fps' + (entry.loop ? ', loop' : '') + '), ' + Math.round(entry.bytes / 1024) + ' KB');
  }
  if (!dry) {
    const manifest = { version: 1, kind: 'firefly', flipbooks };
    await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log('manifest: ' + join(out, 'manifest.json') + ' (' + Object.keys(flipbooks).length + ' flipbooks)');
  }
  if (missing.length > 0) console.log('no cut yet (code-drawn layer stays): ' + missing.join(', '));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
