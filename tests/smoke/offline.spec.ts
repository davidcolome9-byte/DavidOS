import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import http from 'http';
import type { AddressInfo } from 'net';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { extname, join } from 'path';

// OL-001 offline-launch coverage, end to end against the REAL production
// build in dist/ (npm run test:smoke builds first). Each test serves a copy
// of dist/ from its own throwaway HTTP server so that "offline" is real:
// the server drops every connection, which fails service-worker-initiated
// fetches too — context.setOffline(true) alone does not reliably reach
// requests made from inside a service worker. Every response is sent with
// Cache-Control: no-store, so an offline render can only come from the
// service worker's cache, never from the browser's HTTP cache.
//
// "Deployments" are simulated by re-serving a transformed copy of dist/
// (fresh cache version stamp + renamed hashed assets), mirroring exactly
// what a real GitHub Pages deploy changes. Test data is synthetic.

const distDir = join(process.cwd(), 'dist'); // playwright runs from the repo root

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

class StaticSite {
  private server: http.Server;
  private root: string;
  private offline = false;
  readonly requests: string[] = [];
  port = 0;

  constructor(root: string) {
    this.root = root;
    this.server = http.createServer((req, res) => {
      const urlPath = (req.url ?? '/').split('?')[0];
      this.requests.push(urlPath);
      if (this.offline) {
        req.socket.destroy();
        return;
      }
      const filePath = join(this.root, urlPath === '/' ? 'index.html' : urlPath.slice(1));
      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Cache-Control': 'no-store' });
        res.end('not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(readFileSync(filePath));
    });
  }

  start(): Promise<void> {
    return new Promise((resolve) =>
      this.server.listen(0, '127.0.0.1', () => {
        this.port = (this.server.address() as AddressInfo).port;
        resolve();
      }),
    );
  }

  url(path = '/'): string {
    return `http://127.0.0.1:${this.port}${path}`;
  }

  /** Swap the served directory — simulates pushing a new deployment. */
  deploy(root: string): void {
    this.root = root;
  }

  /** Refuse all traffic from now on — including service-worker fetches. */
  goOffline(): void {
    this.offline = true;
    this.server.closeAllConnections();
  }

  sawRequest(path: string): boolean {
    return this.requests.includes(path);
  }

  stop(): Promise<void> {
    this.offline = true;
    this.server.closeAllConnections();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }
}

let fixtureRoot: string;
let site: StaticSite | undefined;

test.beforeAll(() => {
  if (!existsSync(join(distDir, 'index.html')) || !existsSync(join(distDir, 'sw.js'))) {
    throw new Error('dist/ is missing — run `npm run build` first (test:smoke does this automatically).');
  }
  fixtureRoot = mkdtempSync(join(tmpdir(), 'davidos-offline-'));
});

test.afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

test.afterEach(async () => {
  await site?.stop();
  site = undefined;
});

/**
 * Copy dist/ into a fixture directory representing one deployment. The
 * stamped cache version is replaced with `tag` (so caches.keys() is
 * predictable), and optionally the hashed asset files are renamed — with
 * index.html and the sw precache manifest updated to match — exactly as a
 * rebuild would produce new hashed filenames.
 */
function makeDeployment(
  tag: string,
  options?: { renameAssets?: boolean; brokenPrecacheEntry?: string },
): string {
  const dir = join(fixtureRoot, tag);
  cpSync(distDir, dir, { recursive: true });

  const swPath = join(dir, 'sw.js');
  let sw = readFileSync(swPath, 'utf8');
  const restamped = sw.replace(/davidos-[0-9]{14}/g, `davidos-${tag}`);
  if (restamped === sw) throw new Error('stamped cache version not found in dist/sw.js');
  sw = restamped;

  if (options?.renameAssets) {
    const assetsDir = join(dir, 'assets');
    let html = readFileSync(join(dir, 'index.html'), 'utf8');
    readdirSync(assetsDir).forEach((file, i) => {
      const renamed = `index-${tag}${i}${extname(file)}`;
      renameSync(join(assetsDir, file), join(assetsDir, renamed));
      html = html.replaceAll(file, renamed);
      sw = sw.replaceAll(file, renamed);
    });
    writeFileSync(join(dir, 'index.html'), html);
  }

  if (options?.brokenPrecacheEntry) {
    // Target the array declaration, not just the first URL literal — the
    // sw.js header comment contains the same example URLs.
    const corrupted = sw.replace(
      'const PRECACHE_MANIFEST = [',
      `const PRECACHE_MANIFEST = [${JSON.stringify(options.brokenPrecacheEntry)}, `,
    );
    if (corrupted === sw) throw new Error('could not inject the broken precache entry');
    sw = corrupted;
  }

  writeFileSync(swPath, sw);
  return dir;
}

async function expectAppRenders(page: Page) {
  await expect(page.getByRole('heading', { name: /OS Status/ })).toBeVisible();
  await expect(page.locator('.bottom-nav')).toBeVisible();
}

/** Resolves once a service worker is active — install (precache) finished. */
async function waitForServiceWorkerReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

function cacheKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => caches.keys());
}

async function goOffline(page: Page) {
  site!.goOffline();
  await page.context().setOffline(true); // belt and braces; the server is the real cutoff
}

function shellScriptSrc(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector('script')?.getAttribute('src') ?? '');
}

test('first visit prepares the app for a later offline launch', async ({ page }) => {
  site = new StaticSite(makeDeployment('FIRSTA'));
  await site.start();

  await page.goto(site.url('/'));
  await expectAppRenders(page);
  await waitForServiceWorkerReady(page);

  await goOffline(page);
  await page.reload();
  await expectAppRenders(page); // meaningful UI, not a blank page
});

test('after a new deployment and one online load, the updated app launches offline', async ({ page }) => {
  const deployA = makeDeployment('UPDA');
  const deployB = makeDeployment('UPDB', { renameAssets: true });
  site = new StaticSite(deployA);
  await site.start();

  await page.goto(site.url('/'));
  await expectAppRenders(page);
  await waitForServiceWorkerReady(page);
  expect(await cacheKeys(page)).toEqual(['davidos-UPDA']);

  site.deploy(deployB);
  await page.reload(); // ONE online load of the new deployment

  // The new service worker precaches deployB into its own cache and only
  // then removes the superseded one.
  await expect.poll(() => cacheKeys(page), { timeout: 15_000 }).toEqual(['davidos-UPDB']);

  await goOffline(page);
  await page.reload();
  await expectAppRenders(page);
  // The offline shell is the NEW deployment (renamed hashed assets).
  expect(await shellScriptSrc(page)).toContain('index-UPDB');
});

test('a failed new-version install never destroys the last working offline version', async ({ page }) => {
  const missingAsset = './assets/missing-FAILB.js';
  const deployA = makeDeployment('FAILA');
  const deployB = makeDeployment('FAILB', { renameAssets: true, brokenPrecacheEntry: missingAsset });
  site = new StaticSite(deployA);
  await site.start();

  await page.goto(site.url('/'));
  await expectAppRenders(page);
  await waitForServiceWorkerReady(page);
  expect(await cacheKeys(page)).toEqual(['davidos-FAILA']);

  site.deploy(deployB);
  await page.reload(); // online load; the new SW's install 404s and must fail

  // Wait until the doomed install attempt actually ran (the missing asset
  // was requested) and settled.
  await expect.poll(() => site!.sawRequest(missingAsset.slice(1)), { timeout: 15_000 }).toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return !!registration && registration.installing === null;
        }),
      { timeout: 15_000 },
    )
    .toBe(true);

  // The previous working cache survived the failed install.
  expect(await cacheKeys(page)).toContain('davidos-FAILA');

  await goOffline(page);
  await page.reload();
  await expectAppRenders(page);
  // Offline serves the last WORKING version (deployA's original assets),
  // not the broken deployment's shell.
  const expectedSrc = readFileSync(join(deployA, 'index.html'), 'utf8').match(/src="([^"]+)"/)![1];
  expect(await shellScriptSrc(page)).toBe(expectedSrc);
});
