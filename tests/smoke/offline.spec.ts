import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// OL-001 offline-launch suite. Runs against REAL production builds served
// under the GitHub Pages base path /DavidOS/ by a throwaway static server
// whose document root can be swapped mid-test to simulate deployments:
//   build A       — the actual dist/ output, re-stamped from public/sw.js
//   build B       — A with renamed hashed assets (a routine redeploy)
//   build B broken— B minus one precache-required file (a bad deploy)
// All fixtures live in an isolated temp directory; tracked files are never
// modified. Test data is synthetic; never use personal values.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIST = join(ROOT, 'dist');
const BASE_PATH = '/DavidOS/';

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

function copyDir(src: string, dst: string) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}

/** Copy dist/ into a fixture dir, optionally rename hashed assets (build
 * B), restore the unstamped worker source, and stamp via the real CLI. */
function makeBuild(fixturesDir: string, name: string, { renameAssets = false } = {}) {
  const dir = join(fixturesDir, name);
  copyDir(DIST, dir);
  if (renameAssets) {
    let html = readFileSync(join(dir, 'index.html'), 'utf8');
    for (const asset of readdirSync(join(dir, 'assets'))) {
      const renamed = asset.replace('index-', 'indexB-');
      copyFileSync(join(dir, 'assets', asset), join(dir, 'assets', renamed));
      rmSync(join(dir, 'assets', asset));
      html = html.replaceAll(asset, renamed);
    }
    writeFileSync(join(dir, 'index.html'), html);
  }
  copyFileSync(join(ROOT, 'public', 'sw.js'), join(dir, 'sw.js'));
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'stamp-sw-version.mjs'), dir]);
  const buildId = /const BUILD_ID = '([0-9a-f]{20})'/.exec(readFileSync(join(dir, 'sw.js'), 'utf8'))?.[1];
  if (!buildId) throw new Error(`fixture ${name}: stamped sw.js has no build id`);
  return { dir, buildId };
}

let fixturesDir: string;
let buildA: { dir: string; buildId: string };
let buildB: { dir: string; buildId: string };
let buildBBroken: { dir: string; buildId: string };
let server: http.Server;
let baseUrl: string;
let serverRoot: string;

test.beforeAll(async () => {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('dist/ missing — run npm run build first');
  fixturesDir = mkdtempSync(join(tmpdir(), 'davidos-offline-'));
  buildA = makeBuild(fixturesDir, 'build-a');
  buildB = makeBuild(fixturesDir, 'build-b', { renameAssets: true });
  // Broken deploy: a precache-required file (an icon the initial HTML does
  // not load) disappears AFTER stamping, so the online page still renders
  // while the candidate worker's precache must fail.
  buildBBroken = makeBuild(fixturesDir, 'build-b-broken', { renameAssets: true });
  rmSync(join(buildBBroken.dir, 'icons', 'icon-192.png'));

  serverRoot = buildA.dir;
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith(BASE_PATH)) {
      res.writeHead(404);
      res.end('outside app base path');
      return;
    }
    const rel = decodeURIComponent(url.pathname.slice(BASE_PATH.length)) || 'index.html';
    const file = join(serverRoot, rel);
    if (!existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind a port');
  baseUrl = `http://127.0.0.1:${address.port}${BASE_PATH}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  rmSync(fixturesDir, { recursive: true, force: true });
});

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function expectAppRendered(page: Page) {
  await expect(page.locator('.app-header h1')).toHaveText('DavidOS');
  await expect(page.getByRole('heading', { name: /OS Status/ })).toBeVisible();
}

/** Wait until this page is controlled by an active service worker. */
async function waitForControl(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    }
  });
}

const cacheKeys = (page: Page) => page.evaluate(() => caches.keys());

/** Poll until the DavidOS cache set for this origin matches a predicate —
 * used to observe a deployment update settling (or being rejected). */
async function waitForCaches(page: Page, predicate: (keys: string[]) => boolean) {
  await expect
    .poll(async () => {
      const keys = await cacheKeys(page);
      return predicate(keys);
    }, { timeout: 15_000 })
    .toBe(true);
}

async function firstVisit(page: Page) {
  await page.goto(baseUrl);
  await expectAppRendered(page);
  await waitForControl(page);
  await waitForCaches(page, (keys) => keys.some((k) => k.endsWith(buildA.buildId)));
}

async function deployAndReload(page: Page, context: BrowserContext, dir: string) {
  serverRoot = dir;
  await context.setOffline(false);
  await page.reload();
  await expectAppRendered(page);
}

test.afterEach(() => {
  serverRoot = buildA.dir; // next test starts from build A again
});

test('first online visit installs the worker and precaches the complete shell at /DavidOS/', async ({ page }) => {
  await firstVisit(page);
  const contents = await page.evaluate(async () => {
    const [name] = await caches.keys();
    return { name, urls: (await (await caches.open(name)).keys()).map((r) => r.url) };
  });
  expect(contents.name).toContain('davidos-shell::');
  expect(contents.name).toContain(buildA.buildId);
  const paths = contents.urls.map((u) => new URL(u).pathname);
  expect(paths).toContain('/DavidOS/index.html');
  expect(paths).toContain('/DavidOS/manifest.webmanifest');
  expect(paths.some((p) => /^\/DavidOS\/assets\/index-.*\.js$/.test(p))).toBe(true);
  expect(paths.some((p) => /^\/DavidOS\/assets\/index-.*\.css$/.test(p))).toBe(true);
  expect(paths.some((p) => p.startsWith('/DavidOS/icons/'))).toBe(true);
});

test('offline reload after the first visit launches the app (OL-001 first-install)', async ({ page, context }) => {
  const errors = collectPageErrors(page);
  await firstVisit(page);
  await context.setOffline(true);
  await page.reload();
  await expectAppRendered(page);
  expect(errors).toEqual([]);
});

test('offline reload preserves the supported hash-route state', async ({ page, context }) => {
  await firstVisit(page);
  await page.goto(`${baseUrl}#/workflows`);
  await expect(page.getByRole('heading', { name: 'Workflow Runner' })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Workflow Runner' })).toBeVisible();
});

test('deployment update A→B is atomic: offline launch of B, old cache gone, user data intact', async ({ page, context }) => {
  const errors = collectPageErrors(page);
  await firstVisit(page);
  await page.evaluate(() => localStorage.setItem('davidos-offline-spec-marker', 'synthetic-user-data'));
  const stateBefore = await page.evaluate(() => localStorage.getItem('davidos-state-v1'));
  expect(stateBefore).toBeTruthy();

  await deployAndReload(page, context, buildB.dir);
  // B replaces A only after B's shell is fully cached; then A is removed.
  await waitForCaches(
    page,
    (keys) => keys.some((k) => k.endsWith(buildB.buildId)) && !keys.some((k) => k.endsWith(buildA.buildId)),
  );

  await context.setOffline(true);
  await page.reload();
  await expectAppRendered(page);
  // The offline page is a consistent B shell — B HTML loading B assets.
  const scriptSrc = await page.evaluate(() => document.querySelector('script')?.getAttribute('src'));
  expect(scriptSrc).toContain('indexB-');
  expect(errors).toEqual([]);
  // No user-data cleanup happened anywhere in the update.
  expect(await page.evaluate(() => localStorage.getItem('davidos-offline-spec-marker'))).toBe('synthetic-user-data');
  expect(await page.evaluate(() => localStorage.getItem('davidos-state-v1'))).toBeTruthy();
});

test('failed B deployment: candidate is rejected and build A still launches offline', async ({ page, context }) => {
  await firstVisit(page);
  await page.evaluate(() => localStorage.setItem('davidos-offline-spec-marker', 'synthetic-user-data'));

  await deployAndReload(page, context, buildBBroken.dir);
  // The candidate's precache 404s on the missing icon → install must fail,
  // A's cache must survive, and no broken-B cache may take over. Give the
  // rejected install time to (incorrectly) do damage before asserting.
  await page.waitForTimeout(2_000);
  const keys = await cacheKeys(page);
  expect(keys.some((k) => k.endsWith(buildA.buildId))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expectAppRendered(page);
  // Offline serves build A's pinned shell — not broken-B HTML.
  const scriptSrc = await page.evaluate(() => document.querySelector('script')?.getAttribute('src'));
  expect(scriptSrc).toContain('index-');
  expect(scriptSrc).not.toContain('indexB-');
  expect(await page.evaluate(() => localStorage.getItem('davidos-offline-spec-marker'))).toBe('synthetic-user-data');
});

test('refresh, back, and forward keep working under service-worker control', async ({ page }) => {
  await firstVisit(page);
  await page.locator('.bottom-nav').getByText('Workflows').click();
  await expect(page.getByRole('heading', { name: 'Workflow Runner' })).toBeVisible();
  await page.locator('.bottom-nav').getByText('Projects').click();
  await expect(page.getByRole('heading', { name: /Project Vault/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Workflow Runner' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: /Project Vault/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Project Vault/ })).toBeVisible();
});

test('private and cross-origin responses never enter the DavidOS caches', async ({ page }) => {
  await firstVisit(page);
  // Same-origin, in-scope, but not a shell asset → must not be cached.
  await page.evaluate((base) => fetch(`${base}api/synthetic-user-audit.json`).catch(() => undefined), baseUrl);
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
    }
    return urls;
  });
  expect(cached.filter((u) => u.includes('api/'))).toEqual([]);
  expect(cached.filter((u) => !u.includes('/DavidOS/'))).toEqual([]);
});

test('production preview (vite preview at /) also survives an offline reload', async ({ page, context, baseURL }) => {
  // The deployed base is /DavidOS/, but the local production preview serves
  // the same dist/ at / — the relative-URL contract must hold there too.
  await page.goto(baseURL!);
  await expectAppRendered(page);
  await waitForControl(page);
  await expect
    .poll(async () => {
      const keys = await cacheKeys(page);
      return keys.some((k) => k.startsWith('davidos-shell::'));
    }, { timeout: 15_000 })
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expectAppRendered(page);
  await context.setOffline(false);
});
