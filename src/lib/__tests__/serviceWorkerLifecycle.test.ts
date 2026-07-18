import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
// @ts-expect-error — plain .mjs module without type declarations
import { stampServiceWorker } from '../../../scripts/stamp-sw-version.mjs';

// OL-001 behavior contract for public/sw.js, proven against a mock
// service-worker environment: install is atomic (all-or-nothing), a failed
// candidate never destroys the prior working cache, cleanup stays inside
// the DavidOS namespace, and the fetch policy never caches private or
// dynamic responses and never serves HTML for a missing asset.

const SW_SOURCE = readFileSync(fileURLToPath(new URL('../../../public/sw.js', import.meta.url)), 'utf8');

const SCOPE = 'https://example.github.io/DavidOS/';
const MANIFEST = ['index.html', 'manifest.webmanifest', 'assets/index-Ab12.js', 'assets/index-Cd34.css', 'icons/icon-192.png'];

interface MockResponse {
  ok: boolean;
  status: number;
  body: string;
}

function res(body: string, status = 200): MockResponse {
  return { ok: status >= 200 && status < 300, status, body };
}

class MockCache {
  store = new Map<string, MockResponse>();
  private key(reqOrUrl: unknown): string {
    const url = typeof reqOrUrl === 'string' ? reqOrUrl : (reqOrUrl as { url: string }).url;
    return url.split('#')[0];
  }
  async match(reqOrUrl: unknown) {
    return this.store.get(this.key(reqOrUrl));
  }
  async put(reqOrUrl: unknown, response: MockResponse) {
    this.store.set(this.key(reqOrUrl), response);
  }
}

class MockCaches {
  map = new Map<string, MockCache>();
  async open(name: string) {
    if (!this.map.has(name)) this.map.set(name, new MockCache());
    return this.map.get(name)!;
  }
  async keys() {
    return [...this.map.keys()];
  }
  async delete(name: string) {
    return this.map.delete(name);
  }
}

type Handler = (event: unknown) => void;

interface Harness {
  caches: MockCaches;
  fetchLog: Array<{ url: string; init?: { cache?: string } }>;
  skipWaitingCalls: number;
  claimCalls: number;
  install: () => Promise<void>;
  activate: () => Promise<void>;
  /** Dispatch a fetch event; resolves to the respondWith result, or
   * undefined when the worker passed the request through untouched. */
  request: (req: { url: string; method?: string; mode?: string }) => Promise<MockResponse | undefined>;
  setNetwork: (fn: (url: string) => MockResponse) => void;
  goOffline: () => void;
}

function loadWorker({ buildId = 'build-a', manifest = MANIFEST, scope = SCOPE, caches = new MockCaches() } = {}): Harness {
  const stamped = stampServiceWorker(SW_SOURCE, buildId, manifest) as string;
  const handlers = new Map<string, Handler>();
  let network: (url: string) => MockResponse = (url) => res(`content of ${url}`);
  const fetchLog: Array<{ url: string; init?: { cache?: string } }> = [];

  const harness: Harness = {
    caches,
    fetchLog,
    skipWaitingCalls: 0,
    claimCalls: 0,
    async install() {
      let pending: Promise<unknown> | undefined;
      handlers.get('install')!({ waitUntil: (p: Promise<unknown>) => (pending = p) });
      await pending;
    },
    async activate() {
      let pending: Promise<unknown> | undefined;
      handlers.get('activate')!({ waitUntil: (p: Promise<unknown>) => (pending = p) });
      await pending;
    },
    async request(req) {
      let responded: Promise<MockResponse> | undefined;
      handlers.get('fetch')!({
        request: { method: 'GET', mode: 'no-cors', ...req },
        respondWith: (p: Promise<MockResponse>) => (responded = p),
      });
      return responded ? await responded : undefined;
    },
    setNetwork(fn) {
      network = fn;
    },
    goOffline() {
      network = () => {
        throw new Error('offline');
      };
    },
  };

  const self = {
    registration: { scope },
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
    skipWaiting: async () => void harness.skipWaitingCalls++,
    clients: { claim: async () => void harness.claimCalls++ },
  };
  const fetchMock = async (reqOrUrl: unknown, init?: { cache?: string }) => {
    const url = typeof reqOrUrl === 'string' ? reqOrUrl : (reqOrUrl as { url: string }).url;
    fetchLog.push({ url, init });
    return network(url);
  };

  new Function('self', 'caches', 'fetch', stamped)(self, caches, fetchMock);
  return harness;
}

const CACHE_A = `davidos-shell::${encodeURIComponent('https://example.github.io/DavidOS/')}::build-a`;
const CACHE_B = `davidos-shell::${encodeURIComponent('https://example.github.io/DavidOS/')}::build-b`;

async function installedWorker(opts = {}) {
  const sw = loadWorker(opts);
  await sw.install();
  await sw.activate();
  return sw;
}

describe('install', () => {
  it('caches every manifest asset under the /DavidOS/ base and only then skips waiting', async () => {
    const sw = loadWorker();
    await sw.install();
    const cache = await sw.caches.open(CACHE_A);
    for (const path of MANIFEST) {
      expect(await cache.match(`${SCOPE}${path}`)).toBeTruthy();
    }
    expect(sw.skipWaitingCalls).toBe(1);
    // Precache revalidates with the server instead of trusting HTTP cache.
    expect(sw.fetchLog.every((f) => f.init?.cache === 'no-cache')).toBe(true);
  });

  it('fails the install when any asset returns an error status, without skipping waiting', async () => {
    const sw = loadWorker();
    sw.setNetwork((url) => (url.endsWith('.css') ? res('missing', 404) : res(`ok ${url}`)));
    await expect(sw.install()).rejects.toThrow(/precache failed .*: HTTP 404/);
    expect(sw.skipWaitingCalls).toBe(0);
  });

  it('fails the install when the network drops mid-precache', async () => {
    const sw = loadWorker();
    sw.goOffline();
    await expect(sw.install()).rejects.toThrow();
    expect(sw.skipWaitingCalls).toBe(0);
  });

  it('an unstamped worker can never install (placeholder fetch fails)', async () => {
    const handlers = new Map<string, Handler>();
    const self = {
      registration: { scope: SCOPE },
      addEventListener: (t: string, fn: Handler) => handlers.set(t, fn),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    };
    const fetchMock = async (url: string) =>
      String(url).includes('__SW_PRECACHE__') ? res('not found', 404) : res('ok');
    new Function('self', 'caches', 'fetch', SW_SOURCE)(self, new MockCaches(), fetchMock);
    let pending: Promise<unknown> | undefined;
    handlers.get('install')!({ waitUntil: (p: Promise<unknown>) => (pending = p) });
    await expect(pending).rejects.toThrow(/HTTP 404/);
  });

  it('a failed candidate install leaves the previous build cache untouched', async () => {
    const caches = new MockCaches();
    await installedWorker({ caches, buildId: 'build-a' });
    const before = [...(await caches.open(CACHE_A)).store.keys()];

    const b = loadWorker({ caches, buildId: 'build-b', manifest: ['index.html', 'assets/index-New9.js'] });
    b.setNetwork((url) => (url.includes('index-New9') ? res('missing', 404) : res('ok')));
    await expect(b.install()).rejects.toThrow();

    expect([...(await caches.open(CACHE_A)).store.keys()]).toEqual(before);
    // The incomplete candidate cache must never be treated as a release:
    // its install rejected, so the browser discards the worker and the
    // old worker (bound to CACHE_A) keeps serving.
    expect(b.skipWaitingCalls).toBe(0);
    expect(b.claimCalls).toBe(0);
  });
});

describe('activate', () => {
  it('removes only superseded DavidOS caches for this scope, then claims', async () => {
    const caches = new MockCaches();
    await installedWorker({ caches, buildId: 'build-a' });
    // Unrelated caches that cleanup must never touch:
    await caches.open('someone-elses-cache');
    const otherScope = `davidos-shell::${encodeURIComponent('https://example.github.io/OtherApp/')}::v1`;
    await caches.open(otherScope);

    const b = await installedWorker({ caches, buildId: 'build-b' });
    const keys = await caches.keys();
    expect(keys).not.toContain(CACHE_A);
    expect(keys).toContain(CACHE_B);
    expect(keys).toContain('someone-elses-cache');
    expect(keys).toContain(otherScope);
    expect(b.claimCalls).toBe(1);
  });

  it('deletes nothing and does not claim when the new cache lost entries (eviction)', async () => {
    const caches = new MockCaches();
    await installedWorker({ caches, buildId: 'build-a' });
    const b = loadWorker({ caches, buildId: 'build-b' });
    await b.install();
    (await caches.open(CACHE_B)).store.delete(`${SCOPE}assets/index-Ab12.js`);
    await b.activate();
    expect(await caches.keys()).toContain(CACHE_A);
    expect(b.claimCalls).toBe(0);
  });
});

describe('fetch policy', () => {
  it('ignores non-GET requests entirely', async () => {
    const sw = await installedWorker();
    expect(await sw.request({ url: `${SCOPE}index.html`, method: 'POST' })).toBeUndefined();
    expect(await sw.request({ url: `${SCOPE}index.html`, method: 'PUT' })).toBeUndefined();
  });

  it('ignores cross-origin requests (OAuth, Google Identity, Drive, APIs)', async () => {
    const sw = await installedWorker();
    for (const url of [
      'https://accounts.google.com/gsi/client',
      'https://www.googleapis.com/drive/v3/files',
      'https://oauth2.googleapis.com/token',
    ]) {
      expect(await sw.request({ url })).toBeUndefined();
    }
  });

  it('ignores same-origin requests outside the /DavidOS/ scope', async () => {
    const sw = await installedWorker();
    expect(await sw.request({ url: 'https://example.github.io/OtherApp/data.json' })).toBeUndefined();
  });

  it('passes through in-scope requests that are not precached shell assets, without caching them', async () => {
    const sw = await installedWorker();
    const before = (await sw.caches.open(CACHE_A)).store.size;
    expect(await sw.request({ url: `${SCOPE}api/audit-export.json` })).toBeUndefined();
    expect((await sw.caches.open(CACHE_A)).store.size).toBe(before);
  });

  it('serves precached assets cache-first without hitting the network', async () => {
    const sw = await installedWorker();
    const installFetches = sw.fetchLog.length;
    const response = await sw.request({ url: `${SCOPE}assets/index-Ab12.js` });
    expect(response?.body).toContain('assets/index-Ab12.js');
    expect(sw.fetchLog.length).toBe(installFetches);
  });

  it('offline navigation falls back to the pinned install-time shell', async () => {
    const sw = await installedWorker();
    sw.goOffline();
    const response = await sw.request({ url: SCOPE, mode: 'navigate' });
    expect(response?.body).toContain('index.html');
  });

  it('online navigation is network-first and never overwrites the pinned shell', async () => {
    const sw = await installedWorker();
    const pinned = await (await sw.caches.open(CACHE_A)).match(`${SCOPE}index.html`);
    sw.setNetwork(() => res('brand new html from a newer deploy'));
    const online = await sw.request({ url: SCOPE, mode: 'navigate' });
    expect(online?.body).toBe('brand new html from a newer deploy');
    expect(await (await sw.caches.open(CACHE_A)).match(`${SCOPE}index.html`)).toBe(pinned);
  });

  it('a missing asset never receives HTML as a fake fallback', async () => {
    const sw = await installedWorker();
    sw.goOffline();
    // Not precached and offline → a real network error, not index.html.
    await expect(sw.request({ url: `${SCOPE}assets/index-Gone.js` })).resolves.toBeUndefined();
    // Precached URL evicted from cache and offline → the fetch rejection
    // propagates; the worker must not substitute the cached shell.
    (await sw.caches.open(CACHE_A)).store.delete(`${SCOPE}assets/index-Ab12.js`);
    await expect(sw.request({ url: `${SCOPE}assets/index-Ab12.js` })).rejects.toThrow('offline');
  });
});
