// Converts the app's real default state into an importable DavidOS backup JSON.
// Useful for seeding a new device: Settings → Import → pick the file.
//
// The state is built by the app's own buildDefaultState()/serializeState()
// (loaded through Vite's SSR module loader, so seed imports and `?raw` files
// resolve exactly as they do in the app) — there is no second copy of the seed
// lists or AppState shape to drift. Nothing is written except the output file.
//
// Usage: node scripts/seed-to-backup.mjs [output-path]
// Default output is personal/davidos-seed-backup.json (gitignored). Any
// existing output file is refused — the script never overwrites, and there is
// deliberately no force option, so it can never clobber the personal backup.
import { lstatSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = join(repoRoot, 'personal', 'davidos-seed-backup.json');

function exists(path) {
  try {
    lstatSync(path); // lstat: a dangling symlink still counts as existing
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
}

function refuse(outputPath) {
  return new Error(`Refusing to overwrite existing output: ${outputPath}. Choose a path that does not exist.`);
}

/**
 * Generate a seed backup at `outputPath` and return a small summary.
 * Rejects (leaving the existing path untouched) if anything already exists there.
 */
export async function generateSeedBackup(outputPath) {
  const out = resolve(outputPath);
  if (exists(out)) throw refuse(out);

  const server = await createServer({
    root: repoRoot,
    configFile: false,
    envFile: false,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true }, // SSR load only; no dependency scan or cache writes
  });
  try {
    const { buildDefaultState } = await server.ssrLoadModule('/src/data/defaultState.ts');
    const { serializeState } = await server.ssrLoadModule('/src/lib/storage/exportImport.ts');
    const state = buildDefaultState();
    const json = serializeState(state);

    await mkdir(dirname(out), { recursive: true });
    try {
      // 'wx' (O_EXCL) fails on ANY existing path, including one created after
      // the check above.
      await writeFile(out, json, { flag: 'wx' });
    } catch (err) {
      if (err && err.code === 'EEXIST') throw refuse(out);
      throw err;
    }
    return {
      outputPath: out,
      projects: state.projects.length,
      prompts: state.prompts.length,
      contextItems: state.contextItems.length,
    };
  } finally {
    await server.close();
  }
}

async function main() {
  const target = process.argv[2] ?? DEFAULT_OUTPUT;
  try {
    const summary = await generateSeedBackup(target);
    console.log(`Wrote ${summary.outputPath}`);
    console.log(`  ${summary.projects} projects, ${summary.prompts} prompts, ${summary.contextItems} context items`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
