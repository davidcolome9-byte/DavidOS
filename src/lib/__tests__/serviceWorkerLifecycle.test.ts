import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
// @ts-expect-error — plain .mjs module without type declarations
import { stampServiceWorker } from '../../../scripts/stamp-sw-version.mjs';

// OL-001 cache-safety sequence, proven against the REAL public/sw.js source
// (stamped with the real stamp function, executed with mocked service-worker
// globals). The critical failure paths — a failed precache must reject the
// install and must never cost the previous working cache — cannot be forced
// deterministically in a browser, so they are proven here; the happy paths
// are additionally covered end-to-end in tests/smoke/offline.spec.ts.

const SW_SOURCE = readFileSync('public/sw.js', 'utf8'); // vitest runs from the repo root

const BASE = 'https://example.test/app/';
const SHELL_URL = BASE; // sw.js resolves './' against its own location
const DEFAULT_MANIFEST = [
  './manifest.webmanifest',
  './icons/icon-192.png',
  './assets/index-AbC123.js',
  './assets/index-DeF456.css',
];
const abs = (path: string) => new URL(path, BASE).toString();
const ALL_PRECACHE_URLS = [SHELL_URL, ...DEFAULT_MANIFEST.map(abs)];

interface MockResponse {
  ok: boolean;
  status: number;
  url: string;
  clone: () => MockResponse;
}

function makeResponse(url: string, ok = true, status = 200): MockResponse {
  const response: MockResponse = { ok, status, url, clone: () => response };
  return response;
}

type RequestLike = string | { url: string };
const urlOf = (input: RequestLike) => (typeof input === 'string' ? input : input.url);

class MockCache {
  store = new Map<string, MockResponse>();
  /** URLs whose put is silently dropped — simulates a failed/evicted write. */
  dropPuts = new Set<string>();

  async match(request: RequestLike): Promise<MockResponse | undefined> {
    return this.store.get(urlOf(request));
  }

  async put(request: RequestLike, response: MockResponse): Promise<void> {
    const url = urlOf(request);
    if (!this.dropPuts.has(url)) this.store.set(url, response);
  }
}

class MockCacheStorage {
  map = new Map<string, MockCache>();
  deleted: string[] = [];

  async open(name: string): Promise<MockCache> {
    if (!this.map.has(name)) this.map.set(name, new MockCache());
    return this.map.get(name)!;
  }

  async keys(): Promise<string[]> {
    return [...this.map.keys()];
  }

  async delete(name: string): Promise<boolean> {
    this.deleted.push(name);
    return this.map.delete(name);
  }

  async match(request: RequestLike): Promise<MockResponse | undefined> {
    for (const cache of this.map.values()) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    return undefined;
  }
}

interface FetchEventLike {
  request: { url: string; method: string; mode: string };
  respondWith: (response: Promise<MockResponse | undefined>) => void;
}

function createHarness(options?: { version?: string; manifest?: string[]; cacheStorage?: MockCacheStorage }) {
  const version = options?.version ?? 'V1';
  const cacheStorage = options?.cacheStorage ?? new MockCacheStorage();

  const network = {
    down: false,
    notFound: new Set<string>(),
    requested: [] as string[],
  };
  const fetchMock = async (input: RequestLike): Promise<MockResponse> => {
    const url = urlOf(input);
    network.requested.push(url);
    if (network.down) throw new Error('network unavailable');
    if (network.notFound.has(url)) return makeResponse(url, false, 404);
    return makeResponse(url);
  };

  const listeners = new Map<string, (event: never) => void>();
  const selfMock = {
    location: { href: `${BASE}sw.js`, origin: 'https://example.test' },
    addEventListener: (type: string, handler: (event: never) => void) => listeners.set(type, handler),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
  };

  const code = stampServiceWorker(SW_SOURCE, version, options?.manifest ?? DEFAULT_MANIFEST);
  new Function('self', 'caches', 'fetch', code)(selfMock, cacheStorage, fetchMock);

  const dispatchLifecycle = (type: 'install' | 'activate'): Promise<unknown> => {
    let waited: Promise<unknown> = Promise.resolve();
    const event = { waitUntil: (p: Promise<unknown>) => (waited = p) };
    listeners.get(type)!(event as never);
    return waited;
  };

  const dispatchFetch = (request: FetchEventLike['request']): Promise<MockResponse | undefined> | undefined => {
    let responded: Promise<MockResponse | undefined> | undefined;
    const event: FetchEventLike = {
      request,
      respondWith: (response) => (responded = Promise.resolve(response)),
    };
    listeners.get('fetch')!(event as never);
    return responded;
  };

  return {
    cacheStorage,
    network,
    selfMock,
    install: () => dispatchLifecycle('install'),
    activate: () => dispatchLifecycle('activate'),
    dispatchFetch,
  };
}

async function seedOldWorkingCache(cacheStorage: MockCacheStorage, name = 'davidos-OLD') {
  const old = await cacheStorage.open(name);
  await old.put(SHELL_URL, makeResponse(SHELL_URL));
  await old.put(abs('./assets/index-Old111.js'), makeResponse(abs('./assets/index-Old111.js')));
  return old;
}

describe('service worker install (precache safety)', () => {
  it('populates the versioned cache with the shell and every manifest asset', async () => {
    const h = createHarness();
    await h.install();
    const cache = await h.cacheStorage.open('davidos-V1');
    for (const url of ALL_PRECACHE_URLS) {
      expect(await cache.match(url), url).toBeTruthy();
    }
    expect(h.selfMock.skipWaiting).toHaveBeenCalled();
  });

  it('fetches with HTTP-cache revalidation and rejects install on a 404 asset', async () => {
    const h = createHarness();
    await seedOldWorkingCache(h.cacheStorage);
    h.network.notFound.add(abs('./assets/index-AbC123.js'));

    await expect(h.install()).rejects.toThrow(/HTTP 404/);
    // The previous working cache is untouched and nothing was deleted.
    expect(await h.cacheStorage.keys()).toContain('davidos-OLD');
    expect(h.cacheStorage.deleted).toEqual([]);
    expect(h.selfMock.skipWaiting).not.toHaveBeenCalled();
  });

  it('rejects install on a network failure without touching the old cache', async () => {
    const h = createHarness();
    await seedOldWorkingCache(h.cacheStorage);
    h.network.down = true;

    await expect(h.install()).rejects.toThrow();
    expect(await h.cacheStorage.keys()).toContain('davidos-OLD');
    expect(h.cacheStorage.deleted).toEqual([]);
    expect(h.selfMock.skipWaiting).not.toHaveBeenCalled();
  });

  it('verifies assets actually landed: a silently dropped write still fails the install', async () => {
    const h = createHarness();
    const cache = await h.cacheStorage.open('davidos-V1');
    cache.dropPuts.add(abs('./assets/index-DeF456.css')); // every fetch succeeds, one write is lost

    await expect(h.install()).rejects.toThrow(/precache incomplete/);
    expect(h.selfMock.skipWaiting).not.toHaveBeenCalled();
  });
});

describe('service worker activate (superseded-cache cleanup)', () => {
  it('deletes superseded caches only once the new cache is complete', async () => {
    const h = createHarness();
    await seedOldWorkingCache(h.cacheStorage);
    await h.install();
    await h.activate();

    expect(await h.cacheStorage.keys()).toEqual(['davidos-V1']);
    expect(h.selfMock.clients.claim).toHaveBeenCalled();
  });

  it('preserves old caches when the new cache lost entries between install and activate', async () => {
    const h = createHarness();
    await seedOldWorkingCache(h.cacheStorage);
    await h.install();
    const cache = await h.cacheStorage.open('davidos-V1');
    cache.store.delete(abs('./assets/index-AbC123.js')); // simulate storage eviction

    await h.activate();
    expect(await h.cacheStorage.keys()).toContain('davidos-OLD');
    expect(h.cacheStorage.deleted).toEqual([]);
    expect(h.selfMock.clients.claim).toHaveBeenCalled(); // still takes control
  });

  it('a full version-update cycle replaces the old cache only after the new one is ready', async () => {
    const shared = new MockCacheStorage();
    const v1 = createHarness({ version: 'V1', cacheStorage: shared });
    await v1.install();
    await v1.activate();
    expect(await shared.keys()).toEqual(['davidos-V1']);

    const v2Manifest = ['./manifest.webmanifest', './assets/index-New999.js', './assets/index-New888.css'];
    const v2 = createHarness({ version: 'V2', cacheStorage: shared, manifest: v2Manifest });
    await v2.install();
    // Between install and activate BOTH caches exist — the old one is never
    // deleted before the new one is fully populated.
    expect((await shared.keys()).sort()).toEqual(['davidos-V1', 'davidos-V2']);

    await v2.activate();
    expect(await shared.keys()).toEqual(['davidos-V2']);
    const v2cache = await shared.open('davidos-V2');
    expect(await v2cache.match(abs('./assets/index-New999.js'))).toBeTruthy();
  });
});

describe('service worker fetch routing', () => {
  const navigateRequest = (url: string) => ({ url, method: 'GET', mode: 'navigate' });
  const assetRequest = (url: string) => ({ url, method: 'GET', mode: 'no-cors' });

  async function installedHarness() {
    const h = createHarness();
    await h.install();
    await h.activate();
    return h;
  }

  it('serves the precached shell for navigations while offline', async () => {
    const h = await installedHarness();
    h.network.down = true;
    const response = await h.dispatchFetch(navigateRequest(SHELL_URL));
    expect(response).toBeTruthy();
    expect(response!.url).toBe(SHELL_URL);
    expect(response!.ok).toBe(true);
  });

  it('falls back to the shell for offline navigations to uncached in-scope URLs', async () => {
    const h = await installedHarness();
    h.network.down = true;
    const response = await h.dispatchFetch(navigateRequest(`${BASE}?source=pwa`));
    expect(response).toBeTruthy();
    expect(response!.url).toBe(SHELL_URL);
  });

  it('serves precached hashed assets from cache while offline', async () => {
    const h = await installedHarness();
    h.network.down = true;
    const response = await h.dispatchFetch(assetRequest(abs('./assets/index-AbC123.js')));
    expect(response).toBeTruthy();
    expect(response!.url).toBe(abs('./assets/index-AbC123.js'));
  });

  it('online navigations pass through WITHOUT overwriting the pinned shell', async () => {
    const h = await installedHarness();
    const cache = await h.cacheStorage.open('davidos-V1');
    const pinnedShell = await cache.match(SHELL_URL);

    const response = await h.dispatchFetch(navigateRequest(SHELL_URL));
    expect(response!.ok).toBe(true);
    // The install-time shell stays pinned: runtime HTML (which may reference
    // assets this cache doesn't hold) must never replace it.
    expect(await cache.match(SHELL_URL)).toBe(pinnedShell);
  });

  it('caches not-yet-cached same-origin assets at runtime (background refresh intact)', async () => {
    const h = await installedHarness();
    const extra = abs('./assets/chunk-Lazy777.js');
    const response = await h.dispatchFetch(assetRequest(extra));
    expect(response!.ok).toBe(true);
    await Promise.resolve(); // let the fire-and-forget cache.put settle
    const cache = await h.cacheStorage.open('davidos-V1');
    expect(await cache.match(extra)).toBeTruthy();
  });

  it('ignores non-GET and cross-origin requests', async () => {
    const h = await installedHarness();
    expect(h.dispatchFetch({ url: SHELL_URL, method: 'POST', mode: 'cors' })).toBeUndefined();
    expect(h.dispatchFetch({ url: 'https://other.example/x.js', method: 'GET', mode: 'no-cors' })).toBeUndefined();
  });
});
