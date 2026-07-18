// DavidOS service worker — atomic app-shell caching for offline use (OL-001).
//
// Update-safety sequence: install fetches EVERY asset of the new build into
// a build-specific cache and verifies each one landed before the install
// may succeed. A failed or partial precache rejects the install, the
// browser discards the candidate worker, and the previous working version
// keeps serving offline launches. Superseded DavidOS caches are deleted
// only during activate, after re-verifying the new cache is complete —
// never during install, and never caches outside this app's namespace.
//
// The precache list is NOT hardcoded: Vite's hashed filenames change every
// build, so scripts/stamp-sw-version.mjs derives the manifest from the
// real dist/ output and stamps it in, together with a deterministic
// build identity. If this file is ever served unstamped, the placeholder
// "URL" fails to fetch, install fails, and no broken worker activates.
const BUILD_ID = '__SW_VERSION__';
const PRECACHE_MANIFEST = ['__SW_PRECACHE__'];

// CacheStorage is origin-wide, but this worker owns one registration scope
// (e.g. GitHub Pages /DavidOS/). Namespacing caches by scope means cleanup
// can never touch another app's caches — and other DavidOS scopes' caches
// survive too.
const SCOPE_URL = new URL(self.registration.scope);
const CACHE_NAMESPACE = `davidos-shell::${encodeURIComponent(SCOPE_URL.origin + SCOPE_URL.pathname)}::`;
const CACHE_NAME = `${CACHE_NAMESPACE}${BUILD_ID}`;

// Manifest paths are relative ('./assets/index-<hash>.js') so they resolve
// against the deployed scope — /DavidOS/ in production, / in local preview.
const PRECACHE_URLS = PRECACHE_MANIFEST.map((path) => new URL(path, SCOPE_URL).href);
const PRECACHE_SET = new Set(PRECACHE_URLS);
const SHELL_URL = new URL('./index.html', SCOPE_URL).href;

async function precacheComplete(cache) {
  const entries = await Promise.all(PRECACHE_URLS.map((url) => cache.match(url)));
  return entries.every(Boolean);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          // no-cache: revalidate with the server so a stale HTTP-cache copy
          // cannot poison the new build's cache.
          const response = await fetch(url, { cache: 'no-cache' });
          if (!response.ok) {
            throw new Error(`DavidOS precache failed for ${url}: HTTP ${response.status}`);
          }
          await cache.put(url, response);
        }),
      );
      // Verify every required asset actually landed. Throwing here fails
      // the install: the previous worker and its complete cache stay in
      // control, so a broken deploy can never destroy offline launch.
      if (!(await precacheComplete(cache))) {
        throw new Error('DavidOS precache incomplete after install');
      }
      // Only a fully-cached candidate may replace the prior version.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Re-verify before deleting anything (storage pressure could have
      // evicted entries between install and activate). Keeping an extra
      // cache generation is always safer than deleting the only working one.
      const cache = await caches.open(CACHE_NAME);
      if (!(await precacheComplete(cache))) return;
      const keys = await caches.keys();
      const superseded = keys.filter((key) => key.startsWith(CACHE_NAMESPACE) && key !== CACHE_NAME);
      await Promise.all(superseded.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Only same-origin requests inside this app's scope. Everything else —
  // OAuth, Google Identity, Google Drive, any API — passes straight through
  // to the network and is never inspected or cached.
  if (url.origin !== SCOPE_URL.origin || !url.pathname.startsWith(SCOPE_URL.pathname)) return;

  if (request.mode === 'navigate') {
    // Network-first so updates are visible immediately; offline, serve the
    // install-time shell. The shell is pinned at install — never
    // overwritten at runtime — so the cached HTML always references assets
    // precached alongside it in the same build cache.
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.match(request).then((cached) => cached || cache.match(SHELL_URL))),
      ),
    );
    return;
  }

  url.hash = '';
  if (!PRECACHE_SET.has(url.href)) return;
  // Precached build assets are content-hashed and immutable per URL:
  // cache-first, falling back to the network. A miss is a real network
  // error — never index.html masquerading as JS or CSS.
  event.respondWith(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.match(url.href))
      .then((cached) => cached || fetch(request)),
  );
});
