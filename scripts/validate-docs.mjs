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

// 5. Recovery behavior is documented where the code contract points
//    (localStore.ts references this exact section).
const dataModel = readFileSync(join(root, 'docs/DATA_MODEL.md'), 'utf8');
if (!dataModel.includes('## Load & recovery states')) {
  errors.push('docs/DATA_MODEL.md is missing the "## Load & recovery states" section that localStore.ts references');
}

// 6. Known-obsolete phrases must not reappear in the operating docs.
const OBSOLETE_PHRASES = [
  ['davidos-state-v1-corrupt', 'the single fixed corrupt-backup key was replaced by unique -recovery-* keys'],
  ['strict validation on import', 'import validation is envelope + partial structural, not "strict"'],
  ['silent data loss', 'lossy paths now quarantine + warn; docs must not describe silent loss as expected behavior'],
];
for (const doc of ls('*.md').filter((f) => f === 'AGENTS.md' || f === 'README.md' || f.startsWith('docs/'))) {
  const text = readFileSync(join(root, doc), 'utf8');
  for (const [phrase, why] of OBSOLETE_PHRASES) {
    if (text.includes(phrase)) errors.push(`${doc} contains obsolete phrase "${phrase}" (${why})`);
  }
}

// 7. Workflow triggers/gating stay consistent with what the docs promise
//    (structured string checks on the YAML, not prose parsing).
const ciYml = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
if (!/^\s*pull_request:/m.test(ciYml)) errors.push('.github/workflows/ci.yml no longer triggers on pull_request');
const deployYml = readFileSync(join(root, '.github/workflows/deploy.yml'), 'utf8');
const verifyAt = deployYml.indexOf('npm run verify');
const uploadAt = deployYml.indexOf('upload-pages-artifact');
if (verifyAt === -1 || uploadAt === -1 || verifyAt > uploadAt) {
  errors.push('.github/workflows/deploy.yml must run "npm run verify" BEFORE upload-pages-artifact (full gate before deploy)');
}

// 8. AI Tool Routing doctrine must exist, be referenced from AGENTS.md
//    (near the top AND in the docs index), and still contain the core
//    authorization/independent-review/gate concepts that make it a real
//    governance doctrine rather than an empty or gutted placeholder.
//    Narrow semantic markers, not a full-document snapshot, so ordinary
//    prose edits and rewording do not trip this check.
const ROUTING_DOC = 'docs/AI_TOOL_ROUTING.md';
const routingDocPath = join(root, ROUTING_DOC);
if (!existsSync(routingDocPath)) {
  errors.push(`${ROUTING_DOC} is missing — it is the authoritative AI model/tool routing policy (see AGENTS.md)`);
} else {
  const agentsText = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  if (!agentsText.includes('docs/AI_TOOL_ROUTING.md')) {
    errors.push('AGENTS.md no longer references docs/AI_TOOL_ROUTING.md — the mandatory-reading pointer is missing');
  }
  if (!/^- \[docs\/AI_TOOL_ROUTING\.md\]/m.test(agentsText)) {
    errors.push('AGENTS.md docs index no longer lists docs/AI_TOOL_ROUTING.md');
  }

  const routingText = readFileSync(routingDocPath, 'utf8');
  const ROUTING_DOCTRINE_MARKERS = [
    ['Only David may authorize', 'authorization-boundaries section (§9)'],
    ['Independence rules', 'model-family independence section (§6)'],
    ['Gate 1', 'two-gate execution model (§8)'],
    ['Gate 2', 'two-gate execution model (§8)'],
    ['Mandatory stop conditions', 'mandatory stop-condition list (§8)'],
    ['Package assignment record template', 'package-assignment template (§16)'],
  ];
  for (const [marker, why] of ROUTING_DOCTRINE_MARKERS) {
    if (!routingText.includes(marker)) {
      errors.push(`${ROUTING_DOC} is missing "${marker}" (${why}) — looks gutted or replaced with a placeholder`);
    }
  }
}

if (errors.length) {
  console.error('Docs/metadata consistency FAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `Docs/metadata consistency OK — ${jsonCount} JSON files, ${linkCount} relative links, version ${pkg.version} in sync, ` +
    `${cmdCount} documented npm commands exist, recovery section present, no obsolete phrases, workflow gates intact, ` +
    `AI Tool Routing doctrine present and referenced.`,
);
