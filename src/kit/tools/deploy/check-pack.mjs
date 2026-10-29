import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_IDS = [
  'space-typing', 'dragon-hold', 'typing-defense', 'typing-survival', 'immortality-cultivation',
];
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json']);
const DEFAULT_BUDGETS = { maxFileBytes: 25 * 1024 * 1024, maxFiles: 20_000 };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const remote = (url) => /^(?:https?:)?\/\//i.test(url);

// Resolve local URLs inside the package; query strings and fragments are not filenames.
function localPath(url, base) {
  if (typeof url !== 'string' || !url || remote(url) || /^[a-z][\w+.-]*:/i.test(url)) return null;
  let path;
  try { path = decodeURIComponent(url.split(/[?#]/, 1)[0]); } catch { return null; }
  if (!path || /[\\\0]/.test(path)) return null;
  const target = posix.normalize(path.startsWith('/') ? path.slice(1) : posix.join(base, path));
  if (target === '..' || target.startsWith('../') || posix.isAbsolute(target)) return null;
  return target;
}

/** Check a package synchronously. maxFiles is exclusive; maxFileBytes is inclusive. */
export function checkPack(dir, { gameId, budgets = {}, allowLocalHost = false } = {}) {
  if (!GAME_IDS.includes(gameId)) throw new TypeError(`Unknown game id: ${gameId}`);
  if (!object(budgets)) throw new TypeError('budgets must be an object');
  const limits = { ...DEFAULT_BUDGETS, ...budgets };
  for (const key of Object.keys(limits)) {
    if (!(key in DEFAULT_BUDGETS) || !Number.isSafeInteger(limits[key]) || limits[key] <= 0) {
      throw new TypeError(`Invalid budget: ${key}`);
    }
  }
  const root = resolve(dir);
  if (!lstatSync(root).isDirectory()) throw new TypeError(`Not a package directory: ${root}`);
  const files = new Map();
  const directories = new Set();
  const problems = [];
  const external = new Map();
  let localHost = 0;
  const vocabularyNotShipped = new Set();
  let bytes = 0;
  const problem = (code, path, detail) => problems.push({ code, path, detail });

  function walk(relative = '') {
    const entries = readdirSync(join(root, relative), { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const path = posix.join(relative, entry.name);
      if (entry.isDirectory()) {
        directories.add(path);
        walk(path);
      } else if (entry.isFile()) {
        const size = lstatSync(join(root, path)).size;
        files.set(path, size);
        bytes += size;
      } else {
        // A symlink must not pull bytes from outside the deployment package.
        throw new TypeError(`Unsupported package entry (expected regular file or directory): ${path}`);
      }
    }
  }
  walk();

  if (files.size >= limits.maxFiles) {
    problem('too-many-files', '.', `${files.size} files; must be fewer than ${limits.maxFiles}`);
  }
  const privatePath = /(?:^|\/)(?:local-assets|art-src|Dota-Sounds)(?:\/|$)|(?:^|\/)shared\/music(?:\/|$)/;
  for (const path of directories) {
    if (privatePath.test(path) && ![...files.keys()].some((file) => file.startsWith(`${path}/`))) {
      problem('private-media', path, 'Private media directory in package');
    }
  }
  for (const [path, size] of files) {
    if (size > limits.maxFileBytes) {
      problem('file-too-big', path, `${size} bytes; maximum ${limits.maxFileBytes}`);
    }
    if (privatePath.test(path) || posix.basename(path) === '.DS_Store') {
      problem('private-media', path, 'Private media or .DS_Store in package');
    }
    if (!TEXT_EXTENSIONS.has(posix.extname(path).toLowerCase())) continue;
    const text = readFileSync(join(root, path), 'utf8');
    for (const id of GAME_IDS) {
      if (id !== gameId && text.includes(`/assets/${id}/`)) {
        problem('foreign-asset', path, `References /assets/${id}/ from ${gameId}`);
      }
    }
    const localHostCount = [...text.matchAll(/typing-game\.local/gi)].length;
    localHost += localHostCount;
    if (localHostCount && !allowLocalHost) {
      problem('local-host', path, 'Contains typing-game.local');
    }
    if (/["']\.\.\/(?:assets|vocabulary|shared)\//.test(text)) {
      problem('parent-path', path, 'References a parent assets/, vocabulary/ or shared/ directory');
    }
    for (const match of text.matchAll(/https?:\/\/[^\s"'`<>\\)]+/gi)) {
      let host;
      try { host = new URL(match[0].replace(/[.,;!?]+$/, '')).hostname; } catch { continue; }
      if (host === 'www.w3.org' || host === 'typing-game.local' || host.endsWith('.typing-game.local')) continue;
      external.set(host, (external.get(host) ?? 0) + 1);
    }
  }

  function json(path, code) {
    try {
      const parsed = JSON.parse(readFileSync(join(root, path), 'utf8'));
      if (!object(parsed)) throw new TypeError('Expected a JSON object');
      return parsed;
    } catch (error) {
      problem(code, path, `Invalid JSON: ${error.message}`);
      return null;
    }
  }

  const vocabManifest = 'vocabulary/vocab-manifest.json';
  const hasVocabManifest = files.has(vocabManifest);
  const manifestTargets = new Set();
  if (hasVocabManifest) {
    const manifest = json(vocabManifest, 'missing-vocabulary');
    if (manifest && !object(manifest.files)) {
      problem('missing-vocabulary', vocabManifest, 'Expected files: { path: sha256 }');
    } else if (manifest) {
      for (const [file, expected] of Object.entries(manifest.files)) {
        const target = localPath(file, 'vocabulary');
        if (target) manifestTargets.add(target);
        if (!target || !files.has(target)) {
          problem('missing-vocabulary', vocabManifest, `Missing sha256 file: ${file}`);
          continue;
        }
        const actual = createHash('sha256').update(readFileSync(join(root, target))).digest('hex');
        if (typeof expected !== 'string' || actual !== expected.toLowerCase()) {
          problem('missing-vocabulary', target, `sha256 mismatch: expected ${expected}, got ${actual}`);
        }
      }
    }
  }

  const indexPath = 'vocabulary/index.json';
  if (files.has(indexPath)) {
    const index = json(indexPath, 'missing-vocabulary');
    if (index && !Array.isArray(index.levels)) {
      problem('missing-vocabulary', indexPath, 'Expected levels[]');
    } else if (index) {
      for (const level of index.levels) {
        const target = localPath(level?.file, 'vocabulary');
        if (!target || (!hasVocabManifest && !files.has(target))) {
          problem('missing-vocabulary', indexPath, `Missing level file: ${level?.file ?? '(no file)'}`);
        } else if (!files.has(target) && !manifestTargets.has(target)) {
          // A pinned index may describe more levels than this game ships.
          vocabularyNotShipped.add(level.file);
        }
      }
    }
  }
  if (directories.has('vocabulary') && !files.has('vocabulary/ATTRIBUTION.md')) {
    problem('missing-attribution', 'vocabulary/ATTRIBUTION.md', 'Vocabulary requires ATTRIBUTION.md');
  }

  const modelsRoot = `assets/${gameId}/models/`;
  for (const path of files.keys()) {
    if (!path.startsWith(modelsRoot) || posix.basename(path) !== 'manifest.json') continue;
    const manifest = json(path, 'missing-model');
    if (!manifest || !Object.hasOwn(manifest, 'models')) continue;
    if (!object(manifest.models)) {
      problem('missing-model', path, 'Expected models: { id: entry }');
      continue;
    }
    for (const [id, entry] of Object.entries(manifest.models)) {
      if (!object(entry?.tiers)) {
        problem('missing-model', path, `Missing model tiers: ${id}`);
        continue;
      }
      for (const [tier, value] of Object.entries(entry.tiers)) {
        const url = value?.url;
        // Remote sources are reported above and do not block this gate.
        if (typeof url === 'string' && remote(url)) continue;
        const target = localPath(url, posix.dirname(path));
        if (!target || !files.has(target)) {
          problem('missing-model', path, `Missing model ${id} (${tier}): ${url ?? '(no URL)'}`);
        }
      }
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    report: {
      files: files.size,
      bytes,
      localHost,
      vocabularyNotShipped: {
        count: vocabularyNotShipped.size,
        examples: [...vocabularyNotShipped].slice(0, 5),
      },
      external: [...external].sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([host, count]) => ({ host, count })),
    },
  };
}

function main(args) {
  const usage = 'Usage: node check-pack.mjs <package-dir> --game <id> [--json] [--allow-local-host]';
  try {
    let dir;
    let gameId;
    let asJson = false;
    let allowLocalHost = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--game' && gameId === undefined) {
        gameId = args[++i];
        if (!gameId || gameId.startsWith('--')) throw new TypeError('Missing --game value');
      } else if (arg === '--json' && !asJson) {
        asJson = true;
      } else if (arg === '--allow-local-host' && !allowLocalHost) {
        allowLocalHost = true;
      } else if (!arg.startsWith('-') && dir === undefined) {
        dir = arg;
      } else {
        throw new TypeError(`Unexpected argument: ${arg}`);
      }
    }
    if (!dir || !gameId) throw new TypeError('Package directory and --game are required');
    const checked = checkPack(dir, { gameId, allowLocalHost });
    if (asJson) process.stdout.write(`${JSON.stringify(checked, null, 2)}\n`);
    else for (const { code, path, detail } of checked.problems) {
      process.stdout.write(`${code}: ${path}: ${detail.replace(/[\r\n]/g, ' ')}\n`);
    }
    return checked.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage}\n`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
