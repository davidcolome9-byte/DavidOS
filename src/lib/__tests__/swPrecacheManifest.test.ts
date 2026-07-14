import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs module without type declarations
import { extractPrecacheAssets, stampServiceWorker } from '../../../scripts/stamp-sw-version.mjs';

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

  it('returns an empty list for HTML without asset references', () => {
    expect(extractPrecacheAssets('<html><body>hi</body></html>')).toEqual([]);
  });
});

describe('stampServiceWorker', () => {
  const SW_SOURCE = [
    "const CACHE = 'davidos-__SW_VERSION__';",
    "const PRECACHE_MANIFEST = ['__SW_PRECACHE_MANIFEST__'];",
  ].join('\n');

  it('stamps the version and injects the manifest as a JSON string list', () => {
    const out = stampServiceWorker(SW_SOURCE, '20260713000000', ['./a.js', './b.css']);
    expect(out).toContain("const CACHE = 'davidos-20260713000000';");
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
    expect(() => stampServiceWorker("const CACHE = 'davidos-__SW_VERSION__';", 'V1', ['./a.js'])).toThrow(
      /__SW_PRECACHE_MANIFEST__/,
    );
  });

  it('refuses to stamp an empty manifest', () => {
    expect(() => stampServiceWorker(SW_SOURCE, 'V1', [])).toThrow(/empty precache manifest/);
  });

  it('the real public/sw.js source carries both placeholders', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('public/sw.js', 'utf8'); // vitest runs from the repo root
    expect(source).toContain('davidos-__SW_VERSION__');
    expect(source).toContain("['__SW_PRECACHE_MANIFEST__']");
  });
});
