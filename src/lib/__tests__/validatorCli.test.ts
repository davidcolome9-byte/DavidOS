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

let fixtureRoot: string | null = null;

afterAll(() => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
});

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

  it('validate-seed.mjs exits nonzero for a synthetic duplicate-id fixture', () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'davidos-seed-fixture-'));
    for (const dir of ['seed/agents', 'seed/workflows', 'seed/projects', 'seed/prompts', 'seed/context', 'src/lib/agents', 'src/lib/workflows']) {
      mkdirSync(join(fixtureRoot, dir), { recursive: true });
    }
    const agent = {
      id: 'daily_command', name: 'A', icon: 'a', purpose: 'p', handles: ['h'],
      inputs: ['i'], outputs: ['o'], approval: ['a'], exampleCommands: ['c'],
      defaultWorkflow: 'wf-x',
    };
    writeFileSync(join(fixtureRoot, 'seed/agents/a1.json'), JSON.stringify(agent));
    writeFileSync(join(fixtureRoot, 'seed/agents/a2.json'), JSON.stringify(agent)); // duplicate id
    writeFileSync(
      join(fixtureRoot, 'seed/workflows/wf.json'),
      JSON.stringify({
        id: 'wf-x', agentId: 'daily_command', name: 'W', description: 'd',
        inputHint: 'h', outputStyles: ['s'], risk: 'draft_only',
        assumptions: ['a'], nextAction: 'n', template: 'hello {{input}}',
      }),
    );
    writeFileSync(
      join(fixtureRoot, 'src/lib/agents/agentRegistry.ts'),
      `import a1 from '../../../seed/agents/a1.json';\nimport a2 from '../../../seed/agents/a2.json';\n`,
    );
    writeFileSync(
      join(fixtureRoot, 'src/lib/workflows/workflowRegistry.ts'),
      `import wf from '../../../seed/workflows/wf.json';\n`,
    );

    const r = runCli('validate-seed.mjs', { DAVIDOS_ROOT: fixtureRoot });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Seed validation FAILED');
    expect(r.stderr).toContain('duplicate id "daily_command"');
  });
});
