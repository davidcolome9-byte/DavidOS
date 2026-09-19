import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildDefaultState } from '../../data/defaultState';
import { parseImport } from '../storage/exportImport';

// scripts/seed-to-backup.mjs is plain Node ESM with no type declarations, so it
// is loaded dynamically through a narrow local signature.
const SCRIPT = resolve(process.cwd(), 'scripts', 'seed-to-backup.mjs'); // vitest runs from the repo root
interface SeedBackupSummary { outputPath: string; projects: number; prompts: number; contextItems: number }
type GenerateSeedBackup = (outputPath: string) => Promise<SeedBackupSummary>;
async function loadGenerate(): Promise<GenerateSeedBackup> {
  const mod = (await import(/* @vite-ignore */ pathToFileURL(SCRIPT).href)) as { generateSeedBackup: GenerateSeedBackup };
  return mod.generateSeedBackup;
}

// ids/timestamps are minted per call (uid()/nowIso()), so two builds never match on them.
const VOLATILE_KEYS = new Set(['id', 'createdAt', 'updatedAt', 'seededAt', 'exportedAt']);
function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !VOLATILE_KEYS.has(k))
        .map(([k, v]) => [k, stripVolatile(v)]),
    );
  }
  return value;
}

// Generous: each run boots a Vite SSR server and loads the app's seed modules.
const SLOW = 60_000;

let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'davidos-seed-backup-test-')); });
afterAll(() => {
  const target = resolve(dir);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('davidos-seed-backup-test-')) {
    throw new Error('Refusing cleanup outside the synthetic temporary directory.');
  }
  rmSync(target, { recursive: true, force: true });
});

describe('scripts/seed-to-backup.mjs (OL-014)', () => {
  it('writes the app\'s real default state, matching buildDefaultState() apart from ids/timestamps', async () => {
    const generate = await loadGenerate();
    const out = join(dir, 'parity', 'seed.json');
    const summary = await generate(out); // also proves missing parent directories are created
    expect(summary.outputPath).toBe(out);

    const envelope = JSON.parse(readFileSync(out, 'utf8')) as { app: string; schemaVersion: number; state: Record<string, unknown> };
    expect(envelope.app).toBe('davidos');

    const expected = buildDefaultState();
    expect(envelope.schemaVersion).toBe(expected.schemaVersion);
    // JSON round-trip drops undefined values exactly as serialization does.
    const expectedSemantic = stripVolatile(JSON.parse(JSON.stringify(expected)));
    expect(stripVolatile(envelope.state)).toEqual(expectedSemantic);

    // Seed-backed entities carry stable ids from the seed files, so drift there is caught too.
    const state = envelope.state as { projects: { id: string }[]; prompts: { id: string }[] };
    expect(state.projects.map((p) => p.id)).toEqual(expected.projects.map((p) => p.id));
    expect(state.prompts.map((p) => p.id)).toEqual(expected.prompts.map((p) => p.id));
    expect(summary).toMatchObject({
      projects: expected.projects.length,
      prompts: expected.prompts.length,
      contextItems: expected.contextItems.length,
    });
  }, SLOW);

  it('produces a file the real importer accepts, including keys the old script omitted', async () => {
    const generate = await loadGenerate();
    const out = join(dir, 'roundtrip.json');
    await generate(out);

    const imported = parseImport(readFileSync(out, 'utf8'));
    const expected = buildDefaultState();
    expect(imported.projects).toHaveLength(expected.projects.length);
    expect(imported.prompts).toHaveLength(expected.prompts.length);
    expect(imported.contextItems).toHaveLength(expected.contextItems.length);
    // Newer AppState keys the duplicated script never wrote:
    expect(imported.artifacts).toEqual([]);
    expect(imported.executionRecords).toEqual([]);
    expect(imported.healthProfile).not.toBeNull();
    expect(imported.healthProfile?.seedMetadata?.isSeededProfile).toBe(true);
  }, SLOW);

  it('refuses to overwrite any existing output and leaves it byte-identical', async () => {
    const generate = await loadGenerate();
    const out = join(dir, 'sentinel.json');
    const sentinel = 'SENTINEL — must survive unchanged\n';
    writeFileSync(out, sentinel);

    await expect(generate(out)).rejects.toThrow(/Refusing to overwrite/);
    expect(readFileSync(out, 'utf8')).toBe(sentinel);

    // A directory at the target is also "existing" and is refused.
    const asDir = join(dir, 'a-directory');
    mkdirSync(asDir);
    await expect(generate(asDir)).rejects.toThrow(/Refusing to overwrite/);
  }, SLOW);

  it('CLI takes an explicit output path, exits non-zero on an existing file, and never overwrites', () => {
    const out = join(dir, 'cli.json');
    execFileSync(process.execPath, [SCRIPT, out], { stdio: 'pipe' });
    const first = readFileSync(out, 'utf8');
    expect(() => parseImport(first)).not.toThrow();

    let status: number | null = null;
    let stderr = '';
    try {
      execFileSync(process.execPath, [SCRIPT, out], { stdio: 'pipe' });
    } catch (err) {
      const e = err as { status: number | null; stderr: Buffer };
      status = e.status;
      stderr = e.stderr.toString();
    }
    expect(status).toBe(1);
    expect(stderr).toMatch(/Refusing to overwrite/);
    expect(readFileSync(out, 'utf8')).toBe(first);
  }, SLOW);
});
