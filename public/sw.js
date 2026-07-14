// DavidOS service worker — app-shell caching for offline use.
//
// Cache-safety sequence (OL-001): install fetches every asset of the NEW
// build into a fresh versioned cache and confirms each one landed before
// the install may succeed; activate deletes superseded caches only after
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
// __SW_VERSION__ — unique per build so browsers detect the byte-different
// worker and install the update (without it, installed PWAs stop updating
// forever), and __SW_PRECACHE_MANIFEST__ — the built app-shell asset URLs
// parsed from dist/index.html (hashed filenames can't be known in advance).
const CACHE = 'davidos-__SW_VERSION__';

// Stamped to e.g. "./assets/index-<hash>.js", "./assets/index-<hash>.css",
// "./manifest.webmanifest", "./icons/icon-192.png". If served unstamped,
// the placeholder fails to fetch, install fails, and no broken service
// worker ever activates.
const PRECACHE_MANIFEST = ['__SW_PRECACHE_MANIFEST__'];

// The app-shell document (scope root, works under any base path — e.g.
// GitHub Pages /DavidOS/); also the offline fallback for navigations.
const SHELL_URL = new URL('./', self.location.href).toString();

const PRECACHE_URLS = [
  SHELL_URL,
  ...PRECACHE_MANIFEST.map((path) => new URL(path, self.location.href).toString()),
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
      if (await precacheComplete(cache)) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;

  if (request.mode === 'navigate') {
    // Network-first: always try to get the latest app shell. Offline, fall
    // back to the install-time shell, whose asset references are guaranteed
    // to be precached in this same cache. Deliberately NOT cached at
    // runtime: overwriting the shell with newer HTML would let it reference
    // assets this cache doesn't hold (white screen offline).
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached || caches.match(SHELL_URL)),
      ),
    );
    return;
  }

  // Content-hashed assets (JS/CSS) are effectively immutable per URL, so
  // cache-first with a background refresh is safe and fast.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
