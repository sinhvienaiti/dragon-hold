// Run with: ART_MAGICK=/opt/homebrew/bin/magick node --test tests/assets/prepare-ground.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareTextures } from '../../scripts/assets/prepare-ground.mjs';
import { prepareDecals } from '../../scripts/assets/prepare-decals.mjs';
import { GROUND_MANIFEST_URLS, loadGroundManifest, parseGroundManifest } from '../../src/view/ground-manifest.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MAGICK = process.env.ART_MAGICK || 'magick';
const hash = (bytes, algorithm = 'md5') => createHash(algorithm).update(bytes).digest('hex');
let temporary;

before(async () => {
  const base = join(tmpdir(), 'dh-080');
  await mkdir(base, { recursive: true });
  temporary = await mkdtemp(join(base, 'prepare-'));
});
after(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }); });

function magick(args, input) {
  return execFileSync(MAGICK, args, { input, maxBuffer: 64 * 1024 * 1024 });
}

async function image(file, width, height, alpha = false) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 50 + (i / 4 % 31);
    pixels[i + 1] = 104;
    pixels[i + 2] = 65;
    pixels[i + 3] = alpha ? [0, 64, 128, 255][i / 4 % 4] : 255;
  }
  const png = magick(['-size', width + 'x' + height, '-depth', '8', 'rgba:-', '-strip', 'png:-'], pixels);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, png);
  return pixels;
}

async function filesUnder(dir, prefix = '') {
  const files = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const key = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(files, await filesUnder(join(dir, entry.name), key + '/'));
    else files[key] = await readFile(join(dir, entry.name));
  }
  return files;
}

function run(kind, input, out, extra = []) {
  return execFileSync(process.execPath, [
    join(ROOT, 'scripts/assets/prepare-' + kind + '.mjs'), '--input', input, '--out', out, ...extra,
  ], { cwd: temporary, env: { ...process.env, ART_MAGICK: MAGICK }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

for (const kind of ['ground', 'decals']) test(kind + ': separate processes produce identical production assets and manifest', async () => {
  const input = join(temporary, kind + ' input');
  // Create in reverse name order to exercise stable ordering.
  await image(join(input, 'z-kit', 'moss.png'), 12, 8);
  await image(join(input, 'pine-river', 'soil.png'), 1536, 768);
  const original = await image(join(input, 'pine-river', 'edge.png'), 16, 8, true);
  await image(join(input, 'pine-river', 'edge.try1.png'), 8, 8);
  await writeFile(join(input, 'pine-river', 'edge.prompt.txt'), 'Synthetic fixture');
  await writeFile(join(input, 'pine-river', 'edge.json'), '{"grid":{"columns":2,"rows":2}}');
  const before = await filesUnder(input);
  const first = join(temporary, kind + ' first');
  const second = join(temporary, kind + ' second');
  assert.match(run(kind, input, first), /3 textures; manifest md5=[0-9a-f]{32}/);
  run(kind, input, second);
  assert.deepEqual(await filesUnder(first), await filesUnder(second));
  const manifestBytes = await readFile(join(first, 'manifest.json'));
  const manifest = parseGroundManifest(JSON.parse(manifestBytes), kind);
  assert.deepEqual(Object.keys(manifest.textures), ['pine-river/edge', 'pine-river/soil', 'z-kit/moss']);
  for (const [key, entry] of Object.entries(manifest.textures)) {
    const bytes = await readFile(join(first, key + '.webp'));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.equal(entry.bytes, bytes.length);
    assert.equal(entry.md5, hash(bytes));
    assert.equal(entry.url, '/assets/dragon-hold/' + kind + '/' + key + '.webp?v=' + hash(bytes));
    const actualSize = magick(['identify', '-format', '%w %h', 'webp:-'], bytes).toString();
    assert.equal(actualSize, entry.width + ' ' + entry.height);
  }
  assert.equal(manifest.textures['pine-river/soil'].width, 1024);
  assert.equal(manifest.textures['pine-river/soil'].height, 512);
  assert.equal(manifest.textures['pine-river/edge'].width, 16);
  assert.equal(manifest.textures['pine-river/edge'].height, 8);
  const decoded = magick(['webp:-', '-depth', '8', 'rgba:-'], await readFile(join(first, 'pine-river/edge.webp')));
  for (let i = 3; i < original.length; i += 4) assert.equal(decoded[i], original[i], 'alpha at pixel ' + (i - 3) / 4);
  run(kind, input, first);
  assert.deepEqual(await readFile(join(first, 'manifest.json')), manifestBytes, 'same-directory rerun');
  assert.deepEqual(await filesUnder(input), before, 'sources are unchanged');
  console.log(kind + ' manifest sha256 (both processes): ' + hash(manifestBytes, 'sha256'));
});

test('explicit size/quality and JPEG/WebP input; decal wrapper keeps its kind', async () => {
  const input = join(temporary, 'formats');
  const pngFile = join(input, 'kit', 'grass.png');
  await image(pngFile, 80, 40);
  const png = await readFile(pngFile);
  await writeFile(join(input, 'kit', 'soil.jpg'), magick(['png:-', 'jpeg:-'], png));
  await writeFile(join(input, 'kit', 'moss.webp'), magick(['png:-', 'webp:-'], png));
  const out = join(temporary, 'format-output');
  run('ground', input, out, ['--size', '32', '--quality', '84']);
  const manifest = JSON.parse(await readFile(join(out, 'manifest.json')));
  assert.equal(Object.keys(manifest.textures).length, 3);
  for (const entry of Object.values(manifest.textures)) assert.deepEqual([entry.width, entry.height], [32, 16]);
  const decals = await prepareDecals({ input, out: join(temporary, 'wrapper'), size: 16 });
  assert.equal(decals.kind, 'decals');
  for (const entry of Object.values(decals.textures)) assert.deepEqual([entry.width, entry.height], [16, 8]);
});

test('bad input and duplicate names fail before replacing published files', async () => {
  const input = join(temporary, 'bad-input');
  const out = join(temporary, 'preserved-output');
  await image(join(input, 'kit', 'grass.png'), 8, 8);
  await prepareTextures({ input, out });
  const before = await filesUnder(out);
  await writeFile(join(input, 'kit', 'zz-broken.png'), 'not an image');
  assert.throws(() => run('ground', input, out));
  assert.deepEqual(await filesUnder(out), before);
  await rm(join(input, 'kit', 'zz-broken.png'));
  await writeFile(join(input, 'kit', 'grass.webp'), 'duplicate');
  await assert.rejects(prepareTextures({ input, out }), /Duplicate texture name/);
  assert.deepEqual(await filesUnder(out), before);
  const empty = join(temporary, 'empty');
  await mkdir(empty);
  await assert.rejects(prepareTextures({ input: empty, out }), /No named textures/);
  await assert.rejects(prepareTextures({ input: join(temporary, 'missing'), out }), /ENOENT/);
  await assert.rejects(prepareTextures({ input, out: input }), /must not overlap/);
  await assert.rejects(prepareTextures({ input, out: join(input, 'nested') }), /must not overlap/);
  await assert.rejects(prepareTextures({ input, out, size: 0 }), /size must/);
  await assert.rejects(prepareTextures({ input, out, quality: 101 }), /quality must/);
  assert.throws(() => run('ground', input, out, ['--size', 'oops']));
  assert.throws(() => run('decals', input, out, ['--unknown', '1']));
  assert.deepEqual(await filesUnder(out), before);
});

test('runtime reader fetches production URLs, validates entries and reports missing media', async () => {
  const md5 = 'a'.repeat(32);
  const entry = { name: 'moss', kit: 'pine-river', width: 16, height: 8, bytes: 100, md5,
    url: '/assets/dragon-hold/ground/pine-river/moss.webp?v=' + md5 };
  const good = { version: 1, kind: 'ground', textures: { 'pine-river/moss': entry } };
  const requests = [];
  const loaded = await loadGroundManifest('ground', async (url) => {
    requests.push(url);
    return new Response(JSON.stringify(good));
  });
  assert.deepEqual(loaded, good);
  assert.deepEqual(requests, [GROUND_MANIFEST_URLS.ground]);
  await loadGroundManifest('decals', async (url) => {
    assert.equal(url, '/assets/dragon-hold/decals/manifest.json');
    return new Response('{"version":1,"kind":"decals","textures":{}}');
  });
  for (const patch of [{ width: 0 }, { bytes: -1 }, { height: 1.5 }, { md5: 'wrong' },
    { name: '../moss' }, { kit: '../pine-river' }, { url: '/art-src/ground/moss.png' }]) {
    assert.throws(() => parseGroundManifest({ ...good, textures: { 'pine-river/moss': { ...entry, ...patch } } }, 'ground'), /Invalid/);
  }
  for (const bad of [null, [], { ...good, version: 2 }, { ...good, textures: [] }, { ...good, kind: 'decals' }]) {
    assert.throws(() => parseGroundManifest(bad, 'ground'), /Invalid/);
  }
  await assert.rejects(loadGroundManifest('ground', async () => new Response('', { status: 404 })), /HTTP 404/);
  await assert.rejects(loadGroundManifest('ground', async () => { throw new Error('offline'); }), /offline/);
});

test('runtime output paths are ignored using the unchanged worktree ignore rules', async () => {
  // Git refuses paths below the real public/assets symlink. Use a temporary
  // directory tree with the exact same rules and Git metadata (read-only).
  const shadow = join(temporary, 'ignore-check');
  await mkdir(shadow);
  await writeFile(join(shadow, '.gitignore'), await readFile(join(ROOT, '.gitignore')));
  const paths = ['public/assets/dragon-hold/ground/pine-river/moss.webp',
    'public/assets/dragon-hold/ground/manifest.json', 'public/assets/dragon-hold/decals/pine-river/edge.webp',
    'public/assets/dragon-hold/decals/manifest.json'];
  const ignored = execFileSync('git', ['--work-tree=' + shadow, 'check-ignore', '--no-index', '--', ...paths],
    { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(ignored, paths);
});
