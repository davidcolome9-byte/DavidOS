// DavidOS service worker — app-shell caching for offline use.
// Navigations (the HTML shell) are network-first so updates are visible
// immediately; other same-origin GETs (content-hashed JS/CSS) are
// cache-first with background refresh, which is safe since their filenames
// change whenever their content does.
//
// A version placeholder below is stamped at build time
// (scripts/stamp-sw-version.mjs). Without a version that changes every
// build, browsers never detect this file as different and never install
// the new service worker — which is exactly what happened between v0.1
// and v0.2.
const CACHE = 'davidos-__SW_VERSION__';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['./', './manifest.webmanifest'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;

  if (request.mode === 'navigate') {
    // Network-first: always try to get the latest app shell. Only fall
    // back to the cache when there's no connection.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./'))),
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
