// Stamps dist/sw.js after every build with:
//   1. A unique version — so the browser sees a byte-different service
//      worker and actually installs the update. Without this, a service
//      worker whose source never changes is permanently stuck once
//      installed — the browser has no other signal that a new app version
//      exists.
//   2. The precache manifest — the app-shell asset URLs (hashed JS/CSS,
//      manifest, icons) parsed from the built dist/index.html, so the
//      service worker deterministically caches the assets THIS build
//      actually needs for an offline launch (OL-001). Hashed filenames
//      change every build and must never be hardcoded.
//
// Pure logic is exported for unit tests; the CLI body runs only when
// invoked as `node scripts/stamp-sw-version.mjs` (same guard pattern as
// the validators — DAV-004-A).
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

/**
 * Extract the local app-shell asset URLs referenced by the built
 * index.html: <script src> and <link href> targets, deduplicated,
 * external URLs excluded. Returned as-is (relative, './'-prefixed) so the
 * service worker can resolve them against its own scope — this keeps the
 * build portable across base paths (GitHub Pages subpath, any static host).
 */
export function extractPrecacheAssets(html) {
  const urls = new Set();
  for (const tag of html.matchAll(/<(?:script|link)\b[^>]*\s(?:src|href)="([^"]+)"[^>]*>/g)) {
    const url = tag[1].trim();
    if (/^(?:https?:|data:|\/\/)/i.test(url)) continue;
    urls.add(url);
  }
  return [...urls];
}

/**
 * Replace both placeholders in the service-worker source. Throws if either
 * placeholder is missing (a build without them would ship a worker that
 * never updates or never precaches) or if the asset list is empty.
 */
export function stampServiceWorker(source, version, assets) {
  if (!source.includes('__SW_VERSION__')) {
    throw new Error('sw.js is missing the __SW_VERSION__ placeholder — check public/sw.js.');
  }
  if (!source.includes("'__SW_PRECACHE_MANIFEST__'")) {
    throw new Error("sw.js is missing the '__SW_PRECACHE_MANIFEST__' placeholder — check public/sw.js.");
  }
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error('refusing to stamp an empty precache manifest — offline launch would break.');
  }
  return source
    .replaceAll('__SW_VERSION__', version)
    .replace("'__SW_PRECACHE_MANIFEST__'", assets.map((a) => JSON.stringify(a)).join(', '));
}

const invokedAsCli =
  !!process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedAsCli) {
  const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const version = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14); // e.g. 20260708225530

  const assets = extractPrecacheAssets(readFileSync(join(dist, 'index.html'), 'utf8'));

  // Guardrails: the manifest must name real files of THIS build, and a
  // build without a JS + CSS entry means extraction broke — fail loudly
  // rather than ship a service worker that precaches a useless shell.
  const missing = assets.filter((a) => !existsSync(join(dist, a)));
  if (missing.length) {
    throw new Error(`precache manifest references files missing from dist/: ${missing.join(', ')}`);
  }
  if (!assets.some((a) => a.endsWith('.js'))) {
    throw new Error('no JS asset found in dist/index.html — precache extraction is broken.');
  }
  if (!assets.some((a) => a.endsWith('.css'))) {
    throw new Error('no CSS asset found in dist/index.html — precache extraction is broken.');
  }

  const swPath = join(dist, 'sw.js');
  writeFileSync(swPath, stampServiceWorker(readFileSync(swPath, 'utf8'), version, assets));
  console.log(`Stamped service worker cache version ${version}; precache manifest: ${assets.join(', ')}`);
}
