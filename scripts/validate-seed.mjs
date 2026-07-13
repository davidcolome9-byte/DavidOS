// Validates every seed data file so a broken spec fails fast and
// deterministically (also run by `npm run verify` and CI).
// Covers: required fields, known ids, enum values, template placeholders,
// duplicate ids, and BOTH directions of seed-file <-> registry parity
// (an unregistered seed file, or a registry import whose backing file is
// gone, fails the build).
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// DAVIDOS_ROOT is a test-only override so CLI failure paths can be
// exercised against an isolated fixture tree without touching real seeds.
const root = process.env.DAVIDOS_ROOT
  ? resolve(process.env.DAVIDOS_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), '..');

export const AGENT_IDS = [
  'universal-operations', 'daily_command', 'fitness', 'work_project',
  'prompt_vault', 'calendar_planning', 'dogs_home_life_admin', 'content_asset',
];
export const RISK_LEVELS = [
  'read_only', 'draft_only', 'local_write', 'external_write',
  'sensitive_external_write', 'high_risk',
];

/** Duplicate-id detection over [{path, data}] entries. Returns error strings. */
export function findDuplicateIds(entries) {
  const seen = new Map();
  const errors = [];
  for (const { path, data } of entries) {
    if (!data?.id) continue;
    if (seen.has(data.id)) {
      errors.push(`${path}: duplicate id "${data.id}" (also in ${seen.get(data.id)})`);
    } else {
      seen.set(data.id, path);
    }
  }
  return errors;
}

/**
 * Seed-file <-> registry parity via registry source text.
 * - every discovered seed file must be imported by the registry;
 * - every seed path the registry imports must exist on disk.
 * Returns error strings.
 */
export function crossCheckRegistry(registrySource, registryName, dir, discoveredFiles, fileExists) {
  const errors = [];
  const imported = new Set();
  for (const m of registrySource.matchAll(new RegExp(`seed/${dir}/([A-Za-z0-9._-]+\\.json)`, 'g'))) {
    imported.add(m[1]);
  }
  for (const f of discoveredFiles) {
    if (!imported.has(f)) {
      errors.push(`seed/${dir}/${f} exists but is NOT imported by ${registryName} — it will silently not load`);
    }
  }
  for (const f of imported) {
    if (!fileExists(f)) {
      errors.push(`${registryName} imports seed/${dir}/${f}, which does not exist`);
    }
  }
  return errors;
}

function requireFields(errors, path, obj, fields) {
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null || obj[f] === '') {
      errors.push(`${path}: missing required field "${f}"`);
    }
  }
}

export function validateSeeds() {
  const errors = [];

  function readJsonDir(dir) {
    const abs = join(root, 'seed', dir);
    return readdirSync(abs)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const path = `seed/${dir}/${f}`;
        try {
          return { file: f, path, data: JSON.parse(readFileSync(join(abs, f), 'utf8')) };
        } catch (e) {
          errors.push(`${path}: invalid JSON — ${e.message}`);
          return null;
        }
      })
      .filter(Boolean);
  }

  const agents = readJsonDir('agents');
  const workflows = readJsonDir('workflows');
  const projects = readJsonDir('projects');

  for (const { path, data } of agents) {
    requireFields(errors, path, data, [
      'id', 'name', 'icon', 'purpose', 'handles', 'inputs', 'outputs',
      'approval', 'exampleCommands', 'defaultWorkflow',
    ]);
    if (data.id && !AGENT_IDS.includes(data.id)) {
      errors.push(`${path}: id "${data.id}" is not in the AgentId union (src/lib/types.ts)`);
    }
  }

  const workflowIds = new Set();
  for (const { path, data } of workflows) {
    requireFields(errors, path, data, [
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
    requireFields(errors, path, data, ['id', 'name', 'status', 'area', 'nextAction', 'notes']);
    if (data.status && !['active', 'paused', 'done'].includes(data.status)) {
      errors.push(`${path}: status "${data.status}" is not a valid ProjectStatus`);
    }
  }

  errors.push(...findDuplicateIds(agents), ...findDuplicateIds(workflows), ...findDuplicateIds(projects));

  // Seed <-> registry parity, both directions.
  for (const [dir, entries, registryPath] of [
    ['agents', agents, 'src/lib/agents/agentRegistry.ts'],
    ['workflows', workflows, 'src/lib/workflows/workflowRegistry.ts'],
  ]) {
    const registrySource = readFileSync(join(root, registryPath), 'utf8');
    errors.push(
      ...crossCheckRegistry(
        registrySource,
        registryPath,
        dir,
        entries.map((e) => e.file),
        (f) => existsSync(join(root, 'seed', dir, f)),
      ),
    );
  }

  // Markdown seeds: prompts need frontmatter with a title; context files
  // must be non-empty (placeholder discipline is enforced by
  // validate-privacy.mjs and human review).
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

  return { errors, counts: `${agents.length} agents, ${workflows.length} workflows, ${projects.length} projects` };
}

// Cross-platform direct-invocation check. The previous string-built
// file:/// comparison never matched on Linux (four leading slashes), so
// the CLI body silently no-oped in CI.
const invokedDirectly =
  !!process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  const { errors, counts } = validateSeeds();
  if (errors.length) {
    console.error(`Seed validation FAILED (${counts}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`Seed validation OK — ${counts}; ids unique, registry parity verified both directions, prompts + context readable.`);
}
