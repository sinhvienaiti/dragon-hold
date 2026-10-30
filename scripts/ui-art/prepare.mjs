#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DEFAULT_OUT = join(ROOT, 'public/assets/dragon-hold/ui/icons');
const TABLE = join(ROOT, 'src/ui/ui-art.json');
const md5 = (bytes) => createHash('md5').update(bytes).digest('hex');
const magick = (args, input) => execFileSync(process.env.ART_MAGICK || 'magick', (args[0] === 'identify' ? ['identify', '-limit', 'thread', '1', ...args.slice(1)] : ['-limit', 'thread', '1', ...args]), { input, maxBuffer: 16 * 1024 * 1024 });
const within = (parent, child) => { const p = relative(parent, child); return !isAbsolute(p) && p !== '..' && !p.startsWith('../'); };

function validateTable(table) {
  if (!Number.isInteger(table.version) || table.version < 1 || !Array.isArray(table.icons) || !table.icons.length) throw new Error('Invalid UI art table');
  const names = new Set();
  for (const entry of table.icons) {
    if (!/^[a-z0-9-]+$/.test(entry.name) || !Array.isArray(entry.keys) || !entry.source || isAbsolute(entry.source)
      || entry.source.split(/[\\/]/).includes('..') || JSON.stringify(entry.sizes) !== '[64,128,256]') throw new Error('Invalid icon: ' + entry.name);
    for (const name of [entry.name, ...entry.keys]) {
      if (names.has(name)) throw new Error('Duplicate icon name/key: ' + name);
      names.add(name);
    }
  }
}

async function sourceSet(artSrc, entry) {
  const sources = {};
  for (const size of entry.sizes) {
    const file = entry.source + '.' + size + '.png';
    try { sources[size] = { file, bytes: await readFile(join(artSrc, file)) }; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const size of entry.sizes) if (!entry.sizes.some((candidate) => candidate >= size && sources[candidate])) {
    throw new Error('Missing source: ' + entry.source + '.' + size + '.png (no larger source; never upscale)');
  }
  return sources;
}

async function check(table, artSrc, out) {
  const file = join(out, 'manifest.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  if (manifest.version !== table.version) throw new Error(file + ': version mismatch');
  const expected = new Set(table.icons.map((entry) => entry.name));
  for (const name of Object.keys(manifest.icons ?? {})) if (!expected.has(name)) throw new Error(file + ': unknown icon ' + name);
  for (const entry of table.icons) {
    const packed = manifest.icons?.[entry.name];
    if (!packed || packed.source !== entry.source || packed.interim !== entry.interim) throw new Error(file + ': selection mismatch for ' + entry.name);
    const sources = await sourceSet(artSrc, entry);
    const sourceHashes = Object.fromEntries(Object.values(sources).map((source) => [source.file, md5(source.bytes)]));
    for (const name of new Set([...Object.keys(sourceHashes), ...Object.keys(packed.sources ?? {})])) {
      if (sourceHashes[name] !== packed.sources?.[name]) throw new Error('Source md5 mismatch: ' + name);
    }
    for (const size of entry.sizes) {
      const meta = packed.sizes?.[size];
      const name = entry.name + '.' + size + '.webp';
      if (meta?.file !== name || meta.width !== size || meta.height !== size) throw new Error(name + ': invalid manifest size/file');
      const bytes = await readFile(join(out, name));
      if (bytes.length !== meta.bytes || md5(bytes) !== meta.md5) throw new Error(name + ': bytes/md5 mismatch');
    }
  }
  return manifest;
}

function psnr(png, webp, stage) {
  const source = join(stage, 'compare.png'); const target = join(stage, 'compare.webp');
  return Promise.all([writeFile(source, png), writeFile(target, webp)]).then(() => {
    const result = spawnSync(process.env.ART_MAGICK || 'magick', ['compare', '-limit', 'thread', '1', '-metric', 'PSNR', source, target, 'null:'], { encoding: 'utf8' });
    if (result.error) throw result.error;
    const score = result.stderr.trim().split(/\s+/)[0];
    if (![0, 1].includes(result.status) || (!/^inf(?:inity)?$/i.test(score) && !Number.isFinite(Number(score)))) throw new Error('PSNR comparison failed: ' + result.stderr);
    return /^inf(?:inity)?$/i.test(score) ? Infinity : Number(score);
  });
}

/** Convert everything before publishing; roll back originals on a publication error. */
async function publish(out, pending, stage) {
  const previous = new Map();
  for (const [name, bytes] of pending) {
    await writeFile(join(stage, name), bytes);
    try { previous.set(name, await readFile(join(out, name))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; previous.set(name, null); }
  }
  await mkdir(out, { recursive: true });
  const published = [];
  try {
    // Manifest is inserted last and renamed only after all images succeed.
    for (const [name] of pending) {
      await rename(join(stage, name), join(out, name));
      published.push(name);
    }
  } catch (error) {
    for (const name of published.reverse()) {
      const bytes = previous.get(name);
      if (bytes === null) await rm(join(out, name), { force: true });
      else {
        await writeFile(join(stage, name), bytes);
        await rename(join(stage, name), join(out, name));
      }
    }
    throw error;
  }
}

export async function prepareUiArt({ artSrc, out = DEFAULT_OUT, check: checkOnly = false, table } = {}) {
  if (!artSrc) throw new Error('--art-src <dir> is required');
  table ??= JSON.parse(await readFile(TABLE, 'utf8'));
  validateTable(table);
  artSrc = resolve(artSrc); out = resolve(out);
  if (within(artSrc, out) || within(out, artSrc)) throw new Error('Source and output must not overlap');
  if (checkOnly) return check(table, artSrc, out);
  // All scratch files stay in the worktree, including production conversions.
  const tempRoot = join(ROOT, 'tmp/ui-art');
  await mkdir(tempRoot, { recursive: true });
  const stage = await mkdtemp(join(tempRoot, '.prepare-'));
  try {
    const manifest = { version: table.version, icons: {} };
    const pending = new Map();
    for (const entry of table.icons) {
      const sources = await sourceSet(artSrc, entry);
      const packed = { interim: entry.interim, source: entry.source, sources: Object.fromEntries(Object.values(sources).map((s) => [s.file, md5(s.bytes)])), sizes: {} };
      for (const size of entry.sizes) {
        const from = entry.sizes.find((candidate) => candidate >= size && sources[candidate]);
        const original = sources[from];
        const dimensions = magick(['identify', '-format', '%w %h', 'png:-'], original.bytes).toString().trim();
        if (dimensions !== from + ' ' + from) throw new Error(original.file + ': expected ' + from + 'x' + from + ', got ' + dimensions);
        const png = from === size ? original.bytes : magick(['png:-', '-filter', 'Lanczos', '-resize', size + 'x' + size, '-strip', 'png:-'], original.bytes);
        const sourceFile = join(stage, 'input.png');
        await writeFile(sourceFile, magick(['png:-', '-strip', 'png:-'], png));
        const encode = (lossless) => execFileSync(process.env.ART_CWEBP || 'cwebp', ['-quiet', ...(lossless ? ['-lossless'] : ['-q', '90']), '-alpha_q', '100', '-exact', '-metadata', 'none', sourceFile, '-o', '-'], { maxBuffer: 16 * 1024 * 1024 });
        let bytes = encode(false);
        let score = await psnr(png, bytes, stage);
        const lossless = score < 35;
        if (lossless) { bytes = encode(true); score = await psnr(png, bytes, stage); }
        if (score < 35) throw new Error(entry.name + '.' + size + ': lossless PSNR below 35');
        const file = entry.name + '.' + size + '.webp';
        packed.sizes[size] = { file, width: size, height: size, bytes: bytes.length, md5: md5(bytes), psnr: Number.isFinite(score) ? score : 'Infinity', lossless, sourceSize: from };
        pending.set(file, bytes);
      }
      manifest.icons[entry.name] = packed;
    }
    pending.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
    await publish(out, pending, stage);
    return manifest;
  } finally { await rm(stage, { recursive: true, force: true }); }
}

export async function runPrepare(args = process.argv.slice(2), table) {
  const usage = 'pnpm prepare-ui-art --art-src <dir> [--out <dir>] [--check]\nOutput: public/assets/dragon-hold/ui/icons/<name>.{64,128,256}.webp and manifest.json\nMissing sizes use the nearest larger PNG with Lanczos; never upscale. Quality 90, alpha 100; PSNR <35 dB uses lossless.\nSet ART_MAGICK for ImageMagick 7 and ART_CWEBP for cwebp.';
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(usage); return; }
  const options = { table }; const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!['--art-src', '--out', '--check'].includes(flag) || seen.has(flag)) throw new Error('Invalid option: ' + flag + '\n' + usage);
    seen.add(flag);
    if (flag === '--check') options.check = true;
    else {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('Missing value: ' + flag);
      options[flag === '--art-src' ? 'artSrc' : 'out'] = value;
    }
  }
  const manifest = await prepareUiArt(options);
  console.log('ui-art: ' + Object.keys(manifest.icons).length + ' icons; ' + (options.check ? 'check OK' : 'prepared'));
  if (!options.check) for (const size of [64, 128, 256]) {
    const entries = Object.values(manifest.icons).map((entry) => entry.sizes[size]);
    const min = Math.min(...entries.map((entry) => entry.psnr === 'Infinity' ? Infinity : entry.psnr));
    console.log(size + ': files=' + entries.length + ' bytes=' + entries.reduce((sum, entry) => sum + entry.bytes, 0) + ' minPSNR=' + min + ' lossless=' + JSON.stringify(entries.filter((entry) => entry.lossless).map((entry) => entry.file)));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runPrepare(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
