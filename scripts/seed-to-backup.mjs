// Converts the seed files into an importable DavidOS backup JSON.
// Useful for seeding a new device: Settings → Import → pick the file.
// Output goes to personal/ which is gitignored — safe for personal seed content.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const now = new Date().toISOString();
let n = 0;
const uid = () => `seed-${Date.now().toString(36)}-${(n++).toString(36)}`;

function parseFrontmatter(raw) {
  const s = raw.replace(/\r\n/g, '\n');
  if (!s.startsWith('---\n')) return { meta: {}, body: s.trim() };
  const end = s.indexOf('\n---', 4);
  if (end === -1) return { meta: {}, body: s.trim() };
  const meta = {};
  for (const line of s.slice(4, end).split('\n')) {
    const c = line.indexOf(':');
    if (c > 0) meta[line.slice(0, c).trim()] = line.slice(c + 1).trim();
  }
  return { meta, body: s.slice(end + 4).trim() };
}

const readDir = (dir) => readdirSync(join(root, dir)).sort();

const projects = readDir('seed/projects').map((f) => ({
  ...JSON.parse(readFileSync(join(root, 'seed/projects', f), 'utf8')),
  updatedAt: now,
}));

const contextItems = readDir('seed/context').map((f) => {
  const { meta, body } = parseFrontmatter(readFileSync(join(root, 'seed/context', f), 'utf8'));
  return { id: uid(), title: meta.title ?? f, kind: meta.kind ?? 'stable', body, updatedAt: now };
});
contextItems.push(
  {
    id: uid(), title: 'AI Output Rules', kind: 'stable', updatedAt: now,
    body: '- Lead with the answer; no filler or motivational padding\n- Mark assumptions explicitly as [ASSUMPTION]\n- Mark unverified claims as [VERIFY]\n- Fitness: current facts only, grams/mL, no goals/left/remaining unless asked\n- Work: placeholders instead of any member/customer data',
  },
  {
    id: uid(), title: 'Current Priorities', kind: 'priorities', updatedAt: now,
    body: '1. Body recomposition (Operation David)\n2. Work projects\n3. AI / tool building (DavidOS)\n4. Dogs / home\n5. Calendar / planning',
  },
  {
    id: uid(), title: 'Recurring Workflows', kind: 'workflow', updatedAt: now,
    body: '- Morning: Daily Brief\n- After meals/training: Fitness Handoff\n- Sunday: Weekly Review\n- As needed: Work Teachback, Prompt Improvement, Life Admin Checklist',
  },
  {
    id: uid(), title: 'Session Notes (temporary)', kind: 'session', updatedAt: now,
    body: 'Scratch space for today only — cleared whenever you like.',
  },
);

const prompts = readDir('seed/prompts').map((f) => {
  const { meta, body } = parseFrontmatter(readFileSync(join(root, 'seed/prompts', f), 'utf8'));
  return {
    id: f.replace(/\.md$/, ''),
    title: meta.title ?? f,
    body,
    category: meta.category ?? 'General',
    tags: (meta.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    agentId: meta.agent,
    favorite: false,
    versions: [],
    updatedAt: now,
  };
});

const state = {
  schemaVersion: 1,
  priorities: [
    { id: uid(), label: 'Body recomposition (Operation David)', rank: 1 },
    { id: uid(), label: 'Work projects', rank: 2 },
    { id: uid(), label: 'AI / tool building', rank: 3 },
    { id: uid(), label: 'Dogs / home', rank: 4 },
    { id: uid(), label: 'Calendar / planning', rank: 5 },
  ],
  openLoops: [
    { id: uid(), label: 'Build DavidOS', status: 'open', createdAt: now },
    { id: uid(), label: 'Maintain fitness diary', status: 'open', createdAt: now },
    { id: uid(), label: 'Weekly planning', status: 'open', createdAt: now },
    { id: uid(), label: 'Work training / project assets', status: 'open', createdAt: now },
  ],
  reminders: [
    { id: uid(), label: 'Run weekly review', due: 'Sunday', done: false },
    { id: uid(), label: 'Dog food check', due: '', done: false },
  ],
  projects,
  prompts,
  contextItems,
  handoffs: [],
  auditLog: [],
  settings: { theme: 'dark' },
};

const envelope = { app: 'davidos', exportedAt: now, schemaVersion: 1, state };
mkdirSync(join(root, 'personal'), { recursive: true });
const out = join(root, 'personal', 'davidos-personal-backup.json');
writeFileSync(out, JSON.stringify(envelope, null, 2));
console.log(`Wrote ${out}`);
console.log(`  ${projects.length} projects, ${prompts.length} prompts, ${contextItems.length} context items`);
