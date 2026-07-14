// Stamps dist/sw.js after every build with:
//   1. A deterministic SHA-256 build identity derived from the complete
//      app shell — so different shell content cannot reuse a cache while
//      identical build content intentionally keeps the same identity.
//   2. The precache manifest — the app-shell asset URLs (hashed JS/CSS,
//      manifest, icons) parsed from the built dist/index.html, so the
//      service worker deterministically caches the assets THIS build
//      actually needs for an offline launch (OL-001). Hashed filenames
//      change every build and must never be hardcoded.
//
// Pure logic is exported for unit tests; the CLI body runs only when
// invoked as `node scripts/stamp-sw-version.mjs` (same guard pattern as
// the validators — DAV-004-A).
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join, dirname, resolve, relative, isAbsolute } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createHash } from 'crypto';

const VALIDATION_BASE = new URL('https://davidos.invalid/__davidos_scope__/');

/**
 * Extract the local app-shell asset URLs referenced by the built
 * index.html: <script src> and <link href> targets, deduplicated, with
 * absolute/protocol-relative external URLs excluded. Internal shell assets
 * are required to use relative URLs by the portable static-host contract;
 * resolvePrecacheAsset() validates and normalizes those URLs.
 */
export function extractPrecacheAssets(html) {
  const urls = new Set();
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const attribute = match[0].match(/\b(?:src|href)\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
    if (!attribute) continue;
    const url = (attribute[1] ?? attribute[2]).trim();
    if (!url) continue;
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) continue;
    urls.add(url);
  }
  return [...urls];
}

/**
 * Normalize a relative app-shell URL and map it to the corresponding file
 * under dist/. Query strings remain part of the request/cache key but are
 * deliberately excluded from filesystem lookup. Fragments are rejected
 * because they are not part of an HTTP request or CacheStorage key.
 */
export function resolvePrecacheAsset(dist, input) {
  const value = String(input).trim();
  if (!value) throw new Error('precache URL must not be empty.');
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) {
    throw new Error(`absolute precache URL is unsupported (${value}); use a relative ./ URL.`);
  }
  if (value.startsWith('/')) {
    throw new Error(`root-relative precache URL is unsupported (${value}); use a relative ./ URL.`);
  }
  if (value.includes('\\')) {
    throw new Error(`precache URL must use URL path separators, not backslashes (${value}).`);
  }

  // Validate raw path segments before URL parsing can normalize dot segments
  // away. The leading "./" marker is the only permitted dot segment.
  const rawPath = value.split(/[?#]/, 1)[0];
  rawPath.split('/').forEach((segment, index) => {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new Error(`precache URL has invalid percent encoding (${value}).`);
    }
    const leadingRelativeMarker = index === 0 && decoded === '.';
    if (!decoded || decoded === '..' || (decoded === '.' && !leadingRelativeMarker) || /[\\/\0]/.test(decoded)) {
      throw new Error(`precache URL contains an unsafe path segment (${value}).`);
    }
  });

  let parsed;
  try {
    parsed = new URL(value, VALIDATION_BASE);
  } catch {
    throw new Error(`invalid precache URL (${value}).`);
  }
  if (parsed.hash) {
    throw new Error(`precache URL fragments are unsupported (${value}); remove the fragment.`);
  }
  if (parsed.origin !== VALIDATION_BASE.origin || !parsed.pathname.startsWith(VALIDATION_BASE.pathname)) {
    throw new Error(`precache URL escapes the application directory (${value}).`);
  }

  const encodedPath = parsed.pathname.slice(VALIDATION_BASE.pathname.length);
  if (!encodedPath) throw new Error(`precache URL does not name a file (${value}).`);
  const decodedSegments = encodedPath.split('/').map((segment) => {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new Error(`precache URL has invalid percent encoding (${value}).`);
    }
    if (!decoded || decoded === '.' || decoded === '..' || /[\\/\0]/.test(decoded)) {
      throw new Error(`precache URL contains an unsafe path segment (${value}).`);
    }
    return decoded;
  });

  const filePath = resolve(dist, ...decodedSegments);
  const relativePath = relative(resolve(dist), filePath);
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`precache URL escapes dist/ (${value}).`);
  }
  return {
    url: `./${encodedPath}${parsed.search}`,
    filePath,
  };
}

/**
 * Hash a length-delimited, URL-sorted set of app-shell entries plus the
 * unstamped service-worker source. Including the worker source ensures a
 * worker-only release cannot write into the preceding release's cache.
 * Length prefixes prevent ambiguous concatenation; the full SHA-256 digest
 * keeps practical collision risk negligible without adding a dependency.
 */
export function computeBuildIdentity(entries, serviceWorkerSource = '') {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('cannot compute a build identity from an empty app shell.');
  }
  const hash = createHash('sha256');
  hash.update('davidos-app-shell-v1\0');
  for (const entry of [...entries].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))) {
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content);
    hash.update(`${Buffer.byteLength(entry.url)}:`);
    hash.update(entry.url);
    hash.update(`:${content.length}:`);
    hash.update(content);
    hash.update('\0');
  }
  const workerContent = Buffer.isBuffer(serviceWorkerSource)
    ? serviceWorkerSource
    : Buffer.from(serviceWorkerSource);
  hash.update(`service-worker:${workerContent.length}:`);
  hash.update(workerContent);
  hash.update('\0');
  return hash.digest('hex');
}

/**
 * Replace both placeholders in the service-worker source. Throws if either
 * placeholder is missing (a build without them would ship a worker that
 * never updates or never precaches) or if the asset list is empty.
 */
export function stampServiceWorker(source, buildIdentity, assets) {
  if (!source.includes('__SW_VERSION__')) {
    throw new Error('sw.js is missing the __SW_VERSION__ placeholder — check public/sw.js.');
  }
  if (!source.includes("'__SW_PRECACHE_MANIFEST__'")) {
    throw new Error("sw.js is missing the '__SW_PRECACHE_MANIFEST__' placeholder — check public/sw.js.");
  }
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error('refusing to stamp an empty precache manifest — offline launch would break.');
  }
  if (source.split("'__SW_PRECACHE_MANIFEST__'").length !== 2) {
    throw new Error('sw.js must contain exactly one runtime precache-manifest placeholder.');
  }
  return source
    .replaceAll('__SW_VERSION__', buildIdentity)
    .replace("'__SW_PRECACHE_MANIFEST__'", assets.map((a) => JSON.stringify(a)).join(', '));
}

const invokedAsCli =
  !!process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedAsCli) {
  const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const indexPath = join(dist, 'index.html');
  const indexContent = readFileSync(indexPath);
  const extracted = extractPrecacheAssets(indexContent.toString('utf8'));
  const resolvedAssets = [];
  const seenUrls = new Set();
  for (const candidate of extracted) {
    const asset = resolvePrecacheAsset(dist, candidate);
    if (!seenUrls.has(asset.url)) {
      seenUrls.add(asset.url);
      resolvedAssets.push(asset);
    }
  }

  // Guardrails: the manifest must name real files of THIS build, and a
  // build without a JS + CSS entry means extraction broke — fail loudly
  // rather than ship a service worker that precaches a useless shell.
  const missing = resolvedAssets.filter((asset) => !existsSync(asset.filePath) || !statSync(asset.filePath).isFile());
  if (missing.length) {
    throw new Error(
      `precache manifest references files missing from dist/: ${missing.map((asset) => asset.url).join(', ')}`,
    );
  }
  if (!resolvedAssets.some((asset) => asset.filePath.endsWith('.js'))) {
    throw new Error('no JS asset found in dist/index.html — precache extraction is broken.');
  }
  if (!resolvedAssets.some((asset) => asset.filePath.endsWith('.css'))) {
    throw new Error('no CSS asset found in dist/index.html — precache extraction is broken.');
  }

  const swPath = join(dist, 'sw.js');
  const swSource = readFileSync(swPath, 'utf8');
  const buildIdentity = computeBuildIdentity([
    { url: './', content: indexContent },
    ...resolvedAssets.map((asset) => ({ url: asset.url, content: readFileSync(asset.filePath) })),
  ], swSource);
  const assets = resolvedAssets.map((asset) => asset.url);

  writeFileSync(swPath, stampServiceWorker(swSource, buildIdentity, assets));
  console.log(`Stamped service worker build identity ${buildIdentity}; precache manifest: ${assets.join(', ')}`);
}
