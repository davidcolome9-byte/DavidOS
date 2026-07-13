// Validates every seed data file so a broken spec fails fast and
// deterministically (also run by `npm run verify` and CI).
// Mirrors what the registries assume at build time.
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function readJsonDir(dir) {
  const abs = join(root, 'seed', dir);
  return readdirSync(abs)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const path = `seed/${dir}/${f}`;
      try {
        return { path, data: JSON.parse(readFileSync(join(abs, f), 'utf8')) };
      } catch (e) {
        errors.push(`${path}: invalid JSON — ${e.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

function requireFields(path, obj, fields) {
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null || obj[f] === '') {
      errors.push(`${path}: missing required field "${f}"`);
    }
  }
}

const AGENT_IDS = [
  'universal-operations', 'daily_command', 'fitness', 'work_project',
  'prompt_vault', 'calendar_planning', 'dogs_home_life_admin', 'content_asset',
];
const RISK_LEVELS = [
  'read_only', 'draft_only', 'local_write', 'external_write',
  'sensitive_external_write', 'high_risk',
];

const agents = readJsonDir('agents');
const workflows = readJsonDir('workflows');
const projects = readJsonDir('projects');

for (const { path, data } of agents) {
  requireFields(path, data, [
    'id', 'name', 'icon', 'purpose', 'handles', 'inputs', 'outputs',
    'approval', 'exampleCommands', 'defaultWorkflow',
  ]);
  if (data.id && !AGENT_IDS.includes(data.id)) {
    errors.push(`${path}: id "${data.id}" is not in the AgentId union (src/lib/types.ts)`);
  }
}

const workflowIds = new Set();
for (const { path, data } of workflows) {
  requireFields(path, data, [
    'id', 'agentId', 'name', 'description', 'inputHint', 'outputStyles',
    'risk', 'assumptions', 'nextAction', 'template',
  ]);
  workflowIds.add(data.id);
  if (data.agentId && !AGENT_IDS.includes(data.agentId)) {
    errors.push(`${path}: agentId "${data.agentId}" is not a known agent`);
  }
  if (data.risk && !RISK_LEVELS.includes(data.risk)) {
    errors.push(`${path}: risk "${data.risk}" is not a valid RiskLevel`);
  }
  const placeholders = String(data.template).match(/\{\{\s*([a-zA-Z]+)\s*\}\}/g) ?? [];
  for (const p of placeholders) {
    const name = p.replace(/[{} ]/g, '');
    if (!['input', 'style', 'date'].includes(name)) {
      errors.push(`${path}: template uses unknown placeholder {{${name}}}`);
    }
  }
}

for (const { path, data } of agents) {
  if (data.defaultWorkflow && !workflowIds.has(data.defaultWorkflow)) {
    errors.push(`${path}: defaultWorkflow "${data.defaultWorkflow}" does not exist in seed/workflows`);
  }
}

for (const { path, data } of projects) {
  requireFields(path, data, ['id', 'name', 'status', 'area', 'nextAction', 'notes']);
  if (data.status && !['active', 'paused', 'done'].includes(data.status)) {
    errors.push(`${path}: status "${data.status}" is not a valid ProjectStatus`);
  }
}

// Markdown seeds: prompts need frontmatter with a title; context files just
// need to be non-empty and personal-data-placeholder-disciplined (spot check
// for bracket placeholders is a human/agent job — here we check readability).
for (const dir of ['prompts', 'context']) {
  const abs = join(root, 'seed', dir);
  for (const f of readdirSync(abs).filter((f) => f.endsWith('.md'))) {
    const body = readFileSync(join(abs, f), 'utf8');
    if (!body.trim()) errors.push(`seed/${dir}/${f}: file is empty`);
    if (dir === 'prompts' && !/^---\n[\s\S]*?title:/m.test(body)) {
      errors.push(`seed/prompts/${f}: missing frontmatter title`);
    }
  }
}

const counts = `${agents.length} agents, ${workflows.length} workflows, ${projects.length} projects`;
if (errors.length) {
  console.error(`Seed validation FAILED (${counts}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Seed validation OK — ${counts}, prompts + context readable.`);
