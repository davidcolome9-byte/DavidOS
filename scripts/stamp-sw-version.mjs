// Stamps dist/sw.js after every build with:
//   1. __SW_VERSION__ — a deterministic SHA-256 identity of the complete
//      app shell (every dist/ file except sw.js, plus the unstamped worker
//      source). A changed shell always produces a changed worker file, so
//      browsers detect and install the new release; an identical rebuild
//      keeps the same identity and triggers no pointless update.
//   2. __SW_PRECACHE__ — the app-shell asset URLs derived from the actual
//      dist/ output (hashed JS/CSS, index.html, manifest, icons). Hashed
//      filenames change every build and must never be hardcoded (OL-001).
//
// Pure logic is exported for unit tests; the CLI body runs only when
// invoked as `node scripts/stamp-sw-version.mjs [distDir]` (same guard
// pattern as the validators).
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname, resolve, relative, sep } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createHash } from 'crypto';

const VERSION_PLACEHOLDER = '__SW_VERSION__';
const PRECACHE_PLACEHOLDER = "['__SW_PRECACHE__']";

/**
 * Every file in dist/ except the service worker itself IS the app shell:
 * index.html, hashed assets, the manifest, and icons. Deriving the list
 * from the real build output (instead of parsing HTML or hardcoding
 * names) guarantees nothing the shell needs is missing and nothing
 * nonexistent is listed. Returned as sorted, forward-slash paths relative
 * to dist/.
 */
export function collectShellAssets(distDir) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(relative(distDir, full).split(sep).join('/'));
    }
  };
  walk(distDir);
  return files.filter((f) => f !== 'sw.js').sort();
}

/**
 * Deterministic build identity: SHA-256 over the sorted shell files
 * (path + length-prefixed content) plus the unstamped worker source.
 * Including the worker source ensures a worker-only change still gets its
 * own cache instead of writing into the previous release's. Length
 * prefixes prevent ambiguous concatenation.
 */
export function computeBuildId(distDir, files, swSource) {
  const hash = createHash('sha256');
  for (const file of [...files].sort()) {
    const content = readFileSync(join(distDir, file));
    hash.update(`${file}\n${content.length}\n`);
    hash.update(content);
  }
  hash.update(`sw.js\n${Buffer.byteLength(swSource)}\n`);
  hash.update(swSource);
  return hash.digest('hex').slice(0, 20);
}

/** Stamp both placeholders. Throws if either is missing (double-stamp or a
 * broken public/sw.js) so a build can never ship a worker that would try to
 * precache the literal placeholder string. */
export function stampServiceWorker(swSource, buildId, files) {
  if (!swSource.includes(VERSION_PLACEHOLDER)) {
    throw new Error(`sw.js is missing the ${VERSION_PLACEHOLDER} placeholder — check public/sw.js.`);
  }
  if (!swSource.includes(PRECACHE_PLACEHOLDER)) {
    throw new Error(`sw.js is missing the ${PRECACHE_PLACEHOLDER} placeholder — check public/sw.js.`);
  }
  const manifest = files.map((f) => `./${f}`);
  return swSource
    .replaceAll(PRECACHE_PLACEHOLDER, JSON.stringify(manifest))
    .replaceAll(VERSION_PLACEHOLDER, buildId);
}

/** Stamp the service worker inside a built dist directory. */
export function stampDist(distDir) {
  const swPath = join(distDir, 'sw.js');
  const swSource = readFileSync(swPath, 'utf8');
  const files = collectShellAssets(distDir);
  const buildId = computeBuildId(distDir, files, swSource);
  writeFileSync(swPath, stampServiceWorker(swSource, buildId, files));
  return { buildId, files };
}

const invokedDirectly =
  !!process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  const distDir = process.argv[2]
    ? resolve(process.argv[2])
    : join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const { buildId, files } = stampDist(distDir);
  console.log(`Stamped service worker: build ${buildId}, ${files.length} precached shell assets`);
}
