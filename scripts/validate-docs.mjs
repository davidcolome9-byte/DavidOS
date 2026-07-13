// Lightweight documentation/metadata consistency checks (structured facts
// only — no fragile prose parsing):
//   1. Every tracked JSON file parses.
//   2. Every relative markdown link target exists.
//   3. package.json version === package-lock.json version (root AND packages[""]).
//   4. Every `npm run <script>` mentioned in AGENTS.md / README.md /
//      docs/DEVELOPMENT.md exists in package.json scripts.
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const ls = (pattern) =>
  execSync(`git ls-files "${pattern}"`, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);

// 1. JSON validity
let jsonCount = 0;
for (const f of ls('*.json')) {
  jsonCount++;
  try {
    JSON.parse(readFileSync(join(root, f), 'utf8'));
  } catch (e) {
    errors.push(`invalid JSON: ${f} — ${e.message}`);
  }
}

// 2. Markdown relative links
let linkCount = 0;
for (const f of ls('*.md')) {
  const text = readFileSync(join(root, f), 'utf8');
  for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
    let target = m[1].trim();
    if (/^(https?:|mailto:)/.test(target)) continue;
    target = target.split('#')[0];
    if (!target) continue;
    linkCount++;
    const resolved = target.startsWith('/') ? join(root, target) : join(root, dirname(f), target);
    if (!existsSync(resolved)) errors.push(`broken link: ${f} -> ${m[1]}`);
  }
}

// 3. Version consistency
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
if (lock.version !== pkg.version) {
  errors.push(`package-lock.json version "${lock.version}" != package.json version "${pkg.version}" — run \`npm install --package-lock-only\``);
}
const lockRootPkg = lock.packages?.[''];
if (lockRootPkg && lockRootPkg.version !== pkg.version) {
  errors.push(`package-lock.json packages[""].version "${lockRootPkg.version}" != package.json version "${pkg.version}"`);
}

// 4. Documented commands exist
let cmdCount = 0;
for (const doc of ['AGENTS.md', 'README.md', 'docs/DEVELOPMENT.md']) {
  const text = readFileSync(join(root, doc), 'utf8');
  for (const m of text.matchAll(/npm run ([a-z0-9:_-]+)/g)) {
    cmdCount++;
    if (!pkg.scripts?.[m[1]]) errors.push(`${doc} references "npm run ${m[1]}" but package.json has no such script`);
  }
}

if (errors.length) {
  console.error('Docs/metadata consistency FAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `Docs/metadata consistency OK — ${jsonCount} JSON files, ${linkCount} relative links, version ${pkg.version} in sync, ${cmdCount} documented npm commands exist.`,
);
