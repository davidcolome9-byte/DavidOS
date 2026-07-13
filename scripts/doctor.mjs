// Environment doctor: diagnoses the common ways a dev environment for
// DavidOS goes wrong. Read docs/TROUBLESHOOTING.md for fixes.
// Exit code 0 = healthy (warnings allowed), 1 = a blocking problem.
import { existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
let failures = 0;
let warnings = 0;

function ok(msg) { console.log(`  OK    ${msg}`); }
function warn(msg) { warnings++; console.log(`  WARN  ${msg}`); }
function fail(msg) { failures++; console.log(`  FAIL  ${msg}`); }

console.log(`DavidOS doctor — ${root}\n`);

// 1. Node version (must match engines; CI uses Node 20)
const major = Number(process.versions.node.split('.')[0]);
if (major >= 20) ok(`Node ${process.versions.node} (>= 20 required; CI uses 20)`);
else fail(`Node ${process.versions.node} is too old — need >= 20 (winget install OpenJS.NodeJS.LTS)`);

// 2. Repo location — Google Drive's virtual FS breaks node_modules
if (/\\(my drive|google drive)\\/i.test(root + '\\') || /^g:\\/i.test(root)) {
  fail(`Repo is inside a Google Drive-synced path (${root}). Move it to a real disk, e.g. C:\\dev\\davidos.`);
} else {
  ok('Repo is on a real disk (not Google Drive)');
}

// 3. Dependencies installed and in sync with the lockfile
if (!existsSync(join(root, 'node_modules'))) {
  fail('node_modules missing — run `npm run setup`');
} else if (!existsSync(join(root, 'node_modules', 'vite'))) {
  fail('node_modules incomplete (vite missing) — run `npm run setup`');
} else {
  ok('Dependencies installed');
}

// 4. Seed data validity
const seed = spawnSync(process.execPath, [join(root, 'scripts', 'validate-seed.mjs')], { encoding: 'utf8' });
if (seed.status === 0) ok(seed.stdout.trim());
else fail(`Seed validation failed:\n${seed.stderr || seed.stdout}`);

// 5. Service worker placeholder contract (build stamps this)
try {
  const sw = execSync('git show HEAD:public/sw.js', { cwd: root, encoding: 'utf8' });
  if (sw.includes('__SW_VERSION__')) ok('public/sw.js has the __SW_VERSION__ placeholder');
  else fail('public/sw.js lost the __SW_VERSION__ placeholder — installed PWAs will never update');
} catch {
  warn('Could not check public/sw.js via git (not a git checkout?)');
}

// 6. Playwright browsers (optional — only needed for smoke tests)
const pwCache = join(
  process.env.LOCALAPPDATA || join(process.env.HOME || '', '.cache'),
  'ms-playwright',
);
if (existsSync(pwCache)) ok('Playwright browser cache present (smoke tests runnable)');
else warn('Playwright browsers not installed — `npx playwright install chromium` before `npm run test:smoke`');

// 7. Ports (informational)
for (const port of [5173, 4173]) {
  const res = spawnSync(
    process.platform === 'win32' ? 'cmd' : 'sh',
    process.platform === 'win32'
      ? ['/c', `netstat -ano | findstr :${port} | findstr LISTENING`]
      : ['-c', `lsof -i :${port} -sTCP:LISTEN`],
    { encoding: 'utf8' },
  );
  if (res.stdout && res.stdout.trim()) warn(`Port ${port} is in use — dev/preview may need --port`);
  else ok(`Port ${port} free`);
}

// 8. No .env needed — but warn if one exists with content (v1 uses no secrets)
if (existsSync(join(root, '.env'))) warn('.env exists — v1 needs no env vars; make sure it is not committed (it is gitignored)');
else ok('No .env (none needed in v1)');

console.log(`\n${failures} failure(s), ${warnings} warning(s).`);
if (failures > 0) {
  console.log('See docs/TROUBLESHOOTING.md for fixes.');
  process.exit(1);
}
