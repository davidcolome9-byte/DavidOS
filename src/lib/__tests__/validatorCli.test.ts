import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// DAV-004-A: the validators' CLI bodies must actually EXECUTE when invoked
// as `node scripts/<validator>.mjs` — on Windows AND Linux. These tests run
// the real CLIs as child processes (CI runs them on Linux, which is the
// platform where the old entrypoint check silently no-oped). Importing the
// same modules elsewhere in the suite proves imports do NOT trigger the CLI.

const repoRoot = process.cwd(); // vitest runs from the repo root

function runCli(script: string, env: Record<string, string> = {}) {
  try {
    const stdout = execFileSync(process.execPath, [join(repoRoot, 'scripts', script)], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

const fixtureRoots: string[] = [];

afterAll(() => {
  for (const r of fixtureRoots) rmSync(r, { recursive: true, force: true });
});

interface SeedFixture {
  agents?: Array<Record<string, unknown>>;
  workflows?: Array<Record<string, unknown>>;
  /** Filenames the registries import; defaults to every fixture file. */
  agentRegistryImports?: string[];
  workflowRegistryImports?: string[];
}

function makeAgent(over: Record<string, unknown> = {}) {
  return {
    id: 'daily_command', name: 'A', icon: 'a', purpose: 'p', handles: ['h'],
    inputs: ['i'], outputs: ['o'], approval: ['a'], exampleCommands: ['c'],
    defaultWorkflow: 'wf-x', ...over,
  };
}

function makeWorkflow(over: Record<string, unknown> = {}) {
  return {
    id: 'wf-x', agentId: 'daily_command', name: 'W', description: 'd',
    inputHint: 'h', outputStyles: ['s'], risk: 'draft_only',
    assumptions: ['a'], nextAction: 'n', template: 'hello {{input}}', ...over,
  };
}

/** Build an isolated seed+registry tree in tmpdir (production seeds untouched). */
function buildFixture(fx: SeedFixture): string {
  const root = mkdtempSync(join(tmpdir(), 'davidos-seed-fixture-'));
  fixtureRoots.push(root);
  for (const dir of ['seed/agents', 'seed/workflows', 'seed/projects', 'seed/prompts', 'seed/context', 'src/lib/agents', 'src/lib/workflows']) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  const agents = fx.agents ?? [makeAgent()];
  const workflows = fx.workflows ?? [makeWorkflow()];
  const agentFiles: string[] = [];
  const workflowFiles: string[] = [];
  agents.forEach((a, i) => {
    const f = `a${i + 1}.json`;
    agentFiles.push(f);
    writeFileSync(join(root, 'seed/agents', f), JSON.stringify(a));
  });
  workflows.forEach((w, i) => {
    const f = `w${i + 1}.json`;
    workflowFiles.push(f);
    writeFileSync(join(root, 'seed/workflows', f), JSON.stringify(w));
  });
  const agentImports = fx.agentRegistryImports ?? agentFiles;
  const workflowImports = fx.workflowRegistryImports ?? workflowFiles;
  writeFileSync(
    join(root, 'src/lib/agents/agentRegistry.ts'),
    agentImports.map((f, i) => `import a${i} from '../../../seed/agents/${f}';`).join('\n') + '\n',
  );
  writeFileSync(
    join(root, 'src/lib/workflows/workflowRegistry.ts'),
    workflowImports.map((f, i) => `import w${i} from '../../../seed/workflows/${f}';`).join('\n') + '\n',
  );
  return root;
}

describe('validator CLI execution (cross-platform)', () => {
  it('validate-seed.mjs executes and prints its success summary', () => {
    const r = runCli('validate-seed.mjs');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Seed validation OK');
    expect(r.stdout).toContain('registry parity verified both directions');
  });

  it('validate-privacy.mjs executes and prints its success summary', () => {
    const r = runCli('validate-privacy.mjs');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Privacy validation OK');
    expect(r.stdout).toMatch(/\d+ tracked files considered, \d+ scanned as text/);
  });

  it('validate-privacy.mjs exits nonzero when the optional private denylist matches', () => {
    // "DavidOS" appears throughout the repo — a denylist entry for it must
    // make the gate fail, proving the CLI body and denylist both execute.
    const r = runCli('validate-privacy.mjs', { DAVIDOS_PRIVATE_DENYLIST: 'DavidOS' });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Privacy validation FAILED');
    expect(r.stderr).toContain('private denylist literal');
  });

  it('a minimal VALID fixture passes (fixture harness itself is sound)', () => {
    const r = runCli('validate-seed.mjs', { DAVIDOS_ROOT: buildFixture({}) });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Seed validation OK');
  });

  it('exits nonzero for a duplicate agent id, naming both files', () => {
    const r = runCli('validate-seed.mjs', {
      DAVIDOS_ROOT: buildFixture({ agents: [makeAgent(), makeAgent()] }),
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Seed validation FAILED');
    expect(r.stderr).toContain('duplicate id "daily_command"');
    expect(r.stderr).toContain('a2.json');
  });

  it('exits nonzero when a discovered seed file is missing from its registry', () => {
    const r = runCli('validate-seed.mjs', {
      DAVIDOS_ROOT: buildFixture({ agentRegistryImports: [] }), // a1.json exists, never imported
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('a1.json exists but is NOT imported');
  });

  it('exits nonzero when a registry imports a seed file that does not exist', () => {
    const r = runCli('validate-seed.mjs', {
      DAVIDOS_ROOT: buildFixture({ workflowRegistryImports: ['w1.json', 'ghost.json'] }),
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('ghost.json, which does not exist');
  });

  // DAV-007-R1: the id stays in the TypeScript union, but no agent seed
  // exists for it — the workflow reference must fail anyway.
  it('exits nonzero when a workflow references a union AgentId with NO discovered agent seed', () => {
    const r = runCli('validate-seed.mjs', {
      DAVIDOS_ROOT: buildFixture({
        agents: [makeAgent({ id: 'daily_command' })],
        workflows: [makeWorkflow(), makeWorkflow({ id: 'wf-orphan', agentId: 'fitness' })],
      }),
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('agentId "fitness" has no discovered agent seed');
    expect(r.stderr).toContain('w2.json');
  });

  it('exits nonzero when a workflow references an entirely unknown agent id', () => {
    const r = runCli('validate-seed.mjs', {
      DAVIDOS_ROOT: buildFixture({
        workflows: [makeWorkflow(), makeWorkflow({ id: 'wf-bad', agentId: 'nonexistent_agent' })],
      }),
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('not in the AgentId union');
    expect(r.stderr).toContain('no discovered agent seed');
  });

  it('exits nonzero when an agent defaultWorkflow references an absent workflow', () => {
    const r = runCli('validate-seed.mjs', {
      DAVIDOS_ROOT: buildFixture({ agents: [makeAgent({ defaultWorkflow: 'wf-missing' })] }),
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('defaultWorkflow "wf-missing" does not exist');
  });
});
