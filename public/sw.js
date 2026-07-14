// DavidOS service worker — app-shell caching for offline use.
//
// Cache-safety sequence (OL-001): install fetches every asset of the NEW
// build into a content-addressed, scope-specific cache and confirms each
// one landed before the install may succeed; activate deletes superseded
// same-scope caches only after
// re-confirming the new cache is complete. A failed or partial install
// therefore rejects, the browser discards the new service worker, and the
// previous working version keeps serving offline launches.
//
// Navigations (the HTML shell) are network-first so updates are visible
// immediately, falling back to the precached shell offline. The shell
// document is pinned at install time — never overwritten by runtime
// navigations — so the cached HTML always references assets that were
// precached alongside it. Other same-origin GETs (content-hashed JS/CSS)
// are cache-first with background refresh, which is safe since their
// filenames change whenever their content does.
//
// Two placeholders are stamped at build time (scripts/stamp-sw-version.mjs):
// __SW_VERSION__ — a SHA-256 identity of this build's complete app shell,
// and __SW_PRECACHE_MANIFEST__ — the built app-shell asset URLs parsed from
// dist/index.html (hashed filenames can't be known in advance).
const BUILD_ID = '__SW_VERSION__';

// Stamped to e.g. "./assets/index-<hash>.js", "./assets/index-<hash>.css",
// "./manifest.webmanifest", "./icons/icon-192.png". If served unstamped,
// the placeholder fails to fetch, install fails, and no broken service
// worker ever activates.
const PRECACHE_MANIFEST = ['__SW_PRECACHE_MANIFEST__'];

// CacheStorage is origin-wide, while a service worker owns one registration
// scope. Encode the normalized origin+path into the namespace so activation
// cannot delete another app's cache or another DavidOS scope's cache.
const CACHE_PREFIX = 'davidos-app-shell::';
const SCOPE_URL = new URL(self.registration.scope);
const SCOPE_ID = encodeURIComponent(`${SCOPE_URL.origin}${SCOPE_URL.pathname}`);
const CACHE_NAMESPACE = `${CACHE_PREFIX}${SCOPE_ID}::`;
const CACHE = `${CACHE_NAMESPACE}${BUILD_ID}`;

// The app-shell document is the scope root (e.g. GitHub Pages /DavidOS/)
// and the offline fallback for navigations.
const SHELL_URL = SCOPE_URL.toString();

const PRECACHE_URLS = [
  SHELL_URL,
  ...PRECACHE_MANIFEST.map((path) => new URL(path, SCOPE_URL).toString()),
];

async function precacheComplete(cache) {
  const entries = await Promise.all(PRECACHE_URLS.map((url) => cache.match(url)));
  return entries.every(Boolean);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          // no-cache: revalidate with the server so a stale HTTP-cache copy
          // can't poison the new version's cache.
          const response = await fetch(url, { cache: 'no-cache' });
          if (!response.ok) {
            throw new Error(`DavidOS precache failed for ${url}: HTTP ${response.status}`);
          }
          await cache.put(url, response);
        }),
      );
      // Confirm every required asset actually landed before this version is
      // allowed to proceed toward activation. Throwing fails the install and
      // leaves the previous service worker + its cache in control.
      if (!(await precacheComplete(cache))) {
        throw new Error('DavidOS precache incomplete after install');
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete superseded caches ONLY after re-confirming the new cache is
      // still complete (storage pressure could have evicted entries between
      // install and activate). Keeping an extra cache generation around is
      // always safer than deleting the only working one.
      const cache = await caches.open(CACHE);
      if (!(await precacheComplete(cache))) return;
      const keys = await caches.keys();
      const superseded = keys.filter((key) => key.startsWith(CACHE_NAMESPACE) && key !== CACHE);
      await Promise.all(superseded.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);
  if (request.method !== 'GET' || requestUrl.origin !== SCOPE_URL.origin) return;

  if (request.mode === 'navigate') {
    // Network-first: always try to get the latest app shell. Offline, fall
    // back to the install-time shell, whose asset references are guaranteed
    // to be precached in this same cache. Deliberately NOT cached at
    // runtime: overwriting the shell with newer HTML would let it reference
    // assets this cache doesn't hold (white screen offline).
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .open(CACHE)
          .then((cache) => cache.match(request).then((cached) => cached || cache.match(SHELL_URL))),
      ),
    );
    return;
  }

  // Content-hashed assets (JS/CSS) are effectively immutable per URL, so
  // cache-first with a background refresh is safe and fast.
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              cache.put(request, copy);
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    ),
  );
});
