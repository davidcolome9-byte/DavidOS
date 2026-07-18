import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
// @ts-expect-error — plain .mjs module without type declarations
import { collectShellAssets, computeBuildId, stampServiceWorker, stampDist } from '../../../scripts/stamp-sw-version.mjs';

// OL-001: the precache manifest is derived from the ACTUAL dist/ output,
// so hashed asset names are never guessed or hardcoded, nothing the shell
// needs is missing, and nothing nonexistent is listed. These tests prove
// the derivation and stamping contract on synthetic dist fixtures;
// `npm run build` exercises the real CLI against dist/.

const SW_SOURCE = readFileSync(fileURLToPath(new URL('../../../public/sw.js', import.meta.url)), 'utf8');

let dist: string;

function makeDistFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'davidos-dist-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><script src="./assets/index-Ab12Cd34.js"></script>');
  writeFileSync(join(dir, 'manifest.webmanifest'), '{"name":"DavidOS"}');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'index-Ab12Cd34.js'), 'console.log("app")');
  writeFileSync(join(dir, 'assets', 'index-Ef56Gh78.css'), 'body{}');
  mkdirSync(join(dir, 'icons'));
  writeFileSync(join(dir, 'icons', 'icon-192.png'), 'png-bytes');
  writeFileSync(join(dir, 'sw.js'), SW_SOURCE);
  return dir;
}

beforeEach(() => {
  dist = makeDistFixture();
});
afterEach(() => {
  rmSync(dist, { recursive: true, force: true });
});

describe('collectShellAssets', () => {
  it('lists every real dist file except sw.js, sorted, with URL separators', () => {
    expect(collectShellAssets(dist)).toEqual([
      'assets/index-Ab12Cd34.js',
      'assets/index-Ef56Gh78.css',
      'icons/icon-192.png',
      'index.html',
      'manifest.webmanifest',
    ]);
  });

  it('never lists nonexistent files — every entry exists on disk', () => {
    for (const file of collectShellAssets(dist)) {
      expect(existsSync(join(dist, file))).toBe(true);
    }
  });

  it('includes the required shell asset kinds: HTML, JS, CSS, manifest, icons', () => {
    const files = collectShellAssets(dist) as string[];
    expect(files).toContain('index.html');
    expect(files).toContain('manifest.webmanifest');
    expect(files.some((f) => /^assets\/.*\.js$/.test(f))).toBe(true);
    expect(files.some((f) => /^assets\/.*\.css$/.test(f))).toBe(true);
    expect(files.some((f) => /^icons\//.test(f))).toBe(true);
  });
});

describe('computeBuildId', () => {
  it('is deterministic for identical shell content', () => {
    const files = collectShellAssets(dist);
    const a = computeBuildId(dist, files, SW_SOURCE);
    const b = computeBuildId(dist, files, SW_SOURCE);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{20}$/);
  });

  it('changes when any shell file content changes', () => {
    const files = collectShellAssets(dist);
    const before = computeBuildId(dist, files, SW_SOURCE);
    writeFileSync(join(dist, 'assets', 'index-Ab12Cd34.js'), 'console.log("app v2")');
    expect(computeBuildId(dist, files, SW_SOURCE)).not.toBe(before);
  });

  it('changes when a shell file is added', () => {
    const before = computeBuildId(dist, collectShellAssets(dist), SW_SOURCE);
    writeFileSync(join(dist, 'assets', 'chunk-Zz99.js'), 'lazy');
    expect(computeBuildId(dist, collectShellAssets(dist), SW_SOURCE)).not.toBe(before);
  });

  it('changes when only the service-worker source changes', () => {
    const files = collectShellAssets(dist);
    const before = computeBuildId(dist, files, SW_SOURCE);
    expect(computeBuildId(dist, files, `${SW_SOURCE}\n// v2`)).not.toBe(before);
  });
});

describe('stampServiceWorker', () => {
  it('stamps the build id and a relative ./ manifest, leaving no placeholders', () => {
    const files = collectShellAssets(dist);
    const stamped = stampServiceWorker(SW_SOURCE, 'abc123', files);
    expect(stamped).not.toContain('__SW_VERSION__');
    expect(stamped).not.toContain('__SW_PRECACHE__');
    expect(stamped).toContain('abc123');
    // Relative ./ URLs are what keeps the worker correct under the GitHub
    // Pages /DavidOS/ base — the worker resolves them against its scope.
    for (const file of files as string[]) {
      expect(stamped).toContain(`"./${file}"`);
    }
  });

  it('throws when a placeholder is missing (double-stamp protection)', () => {
    const stamped = stampServiceWorker(SW_SOURCE, 'abc123', collectShellAssets(dist));
    expect(() => stampServiceWorker(stamped, 'def456', [])).toThrow(/placeholder/);
  });
});

describe('stampDist (CLI contract)', () => {
  it('stamps dist/sw.js in place with a deterministic identity', () => {
    const { buildId, files } = stampDist(dist);
    const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
    expect(sw).toContain(buildId);
    expect(sw).not.toContain('__SW_VERSION__');
    expect(files).toEqual(collectShellAssets(dist));
    // Rebuilding the identical fixture yields the identical release id.
    const twin = makeDistFixture();
    try {
      expect(stampDist(twin).buildId).toBe(buildId);
    } finally {
      rmSync(twin, { recursive: true, force: true });
    }
  });

  it('a changed shell produces a changed service-worker release id', () => {
    const { buildId } = stampDist(dist);
    const twin = makeDistFixture();
    try {
      writeFileSync(join(twin, 'assets', 'index-Ab12Cd34.js'), 'console.log("app v2")');
      expect(stampDist(twin).buildId).not.toBe(buildId);
    } finally {
      rmSync(twin, { recursive: true, force: true });
    }
  });
});
