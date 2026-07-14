import { describe, expect, it } from 'vitest';
import { join, resolve } from 'path';
// @ts-expect-error — plain .mjs module without type declarations
import { computeBuildIdentity, extractPrecacheAssets, resolvePrecacheAsset, stampServiceWorker } from '../../../scripts/stamp-sw-version.mjs';

// OL-001: the precache manifest is derived from the BUILT index.html, so
// hashed asset names are never guessed or hardcoded. These tests prove the
// extraction and stamping contract on synthetic fixtures; `npm run build`
// exercises the real CLI against dist/.

const BUILT_HTML = `<!doctype html>
<html lang="en">
  <head>
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="icon" type="image/png" href="./icons/icon-192.png" />
    <link rel="apple-touch-icon" href="./icons/icon-192.png" />
    <script type="module" crossorigin src="./assets/index-Ab12Cd34.js"></script>
    <link rel="stylesheet" crossorigin href="./assets/index-Ef56Gh78.css">
  </head>
  <body><div id="root"></div></body>
</html>`;

describe('extractPrecacheAssets', () => {
  it('collects every local script/link target from built HTML, deduplicated', () => {
    expect(extractPrecacheAssets(BUILT_HTML)).toEqual([
      './manifest.webmanifest',
      './icons/icon-192.png', // referenced twice, listed once
      './assets/index-Ab12Cd34.js',
      './assets/index-Ef56Gh78.css',
    ]);
  });

  it('excludes external and protocol-relative URLs', () => {
    const html = `
      <script src="https://cdn.example.com/x.js"></script>
      <link href="//cdn.example.com/y.css" rel="stylesheet">
      <script src="./assets/index-Local123.js"></script>`;
    expect(extractPrecacheAssets(html)).toEqual(['./assets/index-Local123.js']);
  });

  it('accepts single-quoted local attributes', () => {
    expect(extractPrecacheAssets("<script type='module' src='./assets/local.js'></script>")).toEqual([
      './assets/local.js',
    ]);
  });

  it('returns an empty list for HTML without asset references', () => {
    expect(extractPrecacheAssets('<html><body>hi</body></html>')).toEqual([]);
  });
});

describe('resolvePrecacheAsset', () => {
  const DIST = resolve('synthetic', 'dist');

  it('keeps a query in the request URL but excludes it from filesystem lookup', () => {
    expect(resolvePrecacheAsset(DIST, './assets/app.js?v=123')).toEqual({
      url: './assets/app.js?v=123',
      filePath: join(DIST, 'assets', 'app.js'),
    });
  });

  it('decodes percent-encoded path segments for filesystem validation', () => {
    expect(resolvePrecacheAsset(DIST, './assets/app%20shell.js')).toEqual({
      url: './assets/app%20shell.js',
      filePath: join(DIST, 'assets', 'app shell.js'),
    });
  });

  it('normalizes a bare relative path to the portable ./ form', () => {
    expect(resolvePrecacheAsset(DIST, 'assets/app.js').url).toBe('./assets/app.js');
  });

  it('rejects root-relative paths with a precise contract error', () => {
    expect(() => resolvePrecacheAsset(DIST, '/DavidOS/assets/app.js')).toThrow(/root-relative.*relative \.\//);
  });

  it('rejects absolute internal forms while extraction excludes external absolute URLs', () => {
    expect(() => resolvePrecacheAsset(DIST, 'https://valid.example/DavidOS/assets/app.js')).toThrow(
      /absolute.*relative \.\//,
    );
    expect(
      extractPrecacheAssets('<script src="https://cdn.example.test/external.js"></script>'),
    ).toEqual([]);
  });

  it('rejects traversal, encoded separators, malformed encoding, and fragments', () => {
    expect(() => resolvePrecacheAsset(DIST, '../outside.js')).toThrow(/unsafe path segment|escapes the application/);
    expect(() => resolvePrecacheAsset(DIST, './assets/%2e%2e/outside.js')).toThrow(
      /escapes the application directory|unsafe path segment/,
    );
    expect(() => resolvePrecacheAsset(DIST, './assets%2Foutside.js')).toThrow(/unsafe path segment/);
    expect(() => resolvePrecacheAsset(DIST, './assets/%ZZ.js')).toThrow(/invalid percent encoding/);
    expect(() => resolvePrecacheAsset(DIST, './assets/app.js#fragment')).toThrow(/fragments are unsupported/);
  });
});

describe('computeBuildIdentity', () => {
  const SHELL = [
    { url: './', content: '<html>shell</html>' },
    { url: './assets/app.js', content: 'console.log("one")' },
    { url: './assets/app.css', content: 'body{color:white}' },
  ];

  it('is deterministic for identical content regardless of entry order', () => {
    const first = computeBuildIdentity(SHELL);
    const second = computeBuildIdentity([...SHELL].reverse());
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('gives different same-second builds different identities when shell content differs', () => {
    const first = computeBuildIdentity(SHELL);
    const second = computeBuildIdentity(
      SHELL.map((entry) => (entry.url.endsWith('.js') ? { ...entry, content: 'console.log("two")' } : entry)),
    );
    expect(first).not.toBe(second);
  });

  it('includes the normalized URL list in the identity', () => {
    const first = computeBuildIdentity(SHELL);
    const second = computeBuildIdentity(
      SHELL.map((entry) => (entry.url.endsWith('.js') ? { ...entry, url: `${entry.url}?v=2` } : entry)),
    );
    expect(first).not.toBe(second);
  });

  it('changes when only the service-worker source changes', () => {
    const first = computeBuildIdentity(SHELL, "const POLICY = 'old';");
    const second = computeBuildIdentity(SHELL, "const POLICY = 'new';");
    expect(first).not.toBe(second);
  });
});

describe('stampServiceWorker', () => {
  const SW_SOURCE = [
    "const BUILD_ID = '__SW_VERSION__';",
    "const PRECACHE_MANIFEST = ['__SW_PRECACHE_MANIFEST__'];",
  ].join('\n');

  it('stamps the version and injects the manifest as a JSON string list', () => {
    const out = stampServiceWorker(SW_SOURCE, '20260713000000', ['./a.js', './b.css']);
    expect(out).toContain("const BUILD_ID = '20260713000000';");
    expect(out).toContain('const PRECACHE_MANIFEST = ["./a.js", "./b.css"];');
    expect(out).not.toContain('__SW_VERSION__');
    expect(out).not.toContain('__SW_PRECACHE_MANIFEST__');
  });

  it('stamped output is syntactically valid JavaScript', () => {
    const out = stampServiceWorker(SW_SOURCE, 'V1', ['./a.js']);
    expect(() => new Function(out)).not.toThrow();
  });

  it('throws when the version placeholder is missing', () => {
    expect(() =>
      stampServiceWorker("const PRECACHE_MANIFEST = ['__SW_PRECACHE_MANIFEST__'];", 'V1', ['./a.js']),
    ).toThrow(/__SW_VERSION__/);
  });

  it('throws when the manifest placeholder is missing', () => {
    expect(() => stampServiceWorker("const BUILD_ID = '__SW_VERSION__';", 'V1', ['./a.js'])).toThrow(
      /__SW_PRECACHE_MANIFEST__/,
    );
  });

  it('rejects duplicate runtime manifest placeholders', () => {
    expect(() =>
      stampServiceWorker(`${SW_SOURCE}\nconst OTHER = ['__SW_PRECACHE_MANIFEST__'];`, 'V1', ['./a.js']),
    ).toThrow(/exactly one/);
  });

  it('refuses to stamp an empty manifest', () => {
    expect(() => stampServiceWorker(SW_SOURCE, 'V1', [])).toThrow(/empty precache manifest/);
  });

  it('the real public/sw.js source carries both placeholders', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('public/sw.js', 'utf8'); // vitest runs from the repo root
    expect(source).toContain("const BUILD_ID = '__SW_VERSION__'");
    expect(source).toContain("['__SW_PRECACHE_MANIFEST__']");
  });
});
