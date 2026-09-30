import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
// @ts-expect-error — plain .mjs module without type declarations
import { AUTHORITY_MARKER, MAX_SKILL_BYTES, MAX_SKILL_LINES, OPTIONAL_SECTIONS, REQUIRED_SECTIONS, SKILL_RISKS, SKILL_STATUSES, SKILL_TIERS, SKILL_TOOLS, findDuplicateSkillIds, validateSkillText, validateSkills } from '../../../scripts/validate-skills.mjs';
// @ts-expect-error — plain .mjs module without type declarations
import { findPrivacyViolations } from '../../../scripts/validate-privacy.mjs';

// DOS-AI-001B: proves the Skill contract checks themselves work. Fixtures are
// synthetic; the production Skills are validated by `npm run validate:skills`
// (and once more here). Skills are procedure files only, so nothing here loads
// them into the app.

const repoRoot = process.cwd(); // vitest runs from the repo root

type Section = [title: string, body: string];

const GOOD_SECTIONS: Section[] = [
  ['Purpose', 'One responsibility.'],
  ['When to use', '- A trigger.'],
  ['Inputs', '- An input.'],
  ['Procedure', '1. First step.\n2. Second step.'],
  ['Constraints', '- A boundary.'],
  ['Tool requirements', '- none — no tools needed'],
  ['Output', 'A result.'],
  ['Verification', '- [ ] Evidence exists.'],
  ['Stop conditions', '- Halt when unsafe.'],
  ['Authority', `${AUTHORITY_MARKER} Governing docs prevail.`],
];

const GOOD_METADATA: Record<string, string> = {
  'davidos-contract': '1',
  'davidos-version': '1.0.0',
  'davidos-status': 'active',
  'davidos-tiers': 'tier_2_assistant',
  'davidos-risk': 'draft_only',
};

interface Parts {
  name?: string;
  /** Rendered verbatim after "description: " so quoting can be broken on purpose. */
  description?: string;
  omit?: Array<'name' | 'description' | 'metadata'>;
  metadata?: Record<string, string>;
  omitMetadata?: string[];
  /** Replaces the rendered metadata block lines entirely. */
  metadataLines?: string[];
  extraFrontmatter?: string[];
  sections?: Section[];
  tail?: string;
}

const metadataBlock = (over: Record<string, string> = {}, omit: string[] = []): string[] => {
  const merged: Record<string, string> = { ...GOOD_METADATA, ...over };
  for (const key of omit) delete merged[key];
  return Object.entries(merged).map(([k, v]) => `  ${k}: "${v}"`);
};

const withSection = (title: string, body: string): Section[] =>
  GOOD_SECTIONS.map(([t, b]): Section => (t === title ? [t, body] : [t, b]));
const without = (title: string): Section[] => GOOD_SECTIONS.filter(([t]) => t !== title);

function makeSkill(p: Parts = {}): string {
  const fm: string[] = [];
  if (!p.omit?.includes('name')) fm.push(`name: ${p.name ?? 'good-skill'}`);
  if (!p.omit?.includes('description')) fm.push(`description: ${p.description ?? '"Does one thing. Use when that thing is needed."'}`);
  if (!p.omit?.includes('metadata')) {
    fm.push('metadata:', ...(p.metadataLines ?? metadataBlock(p.metadata, p.omitMetadata)));
  }
  fm.push(...(p.extraFrontmatter ?? []));
  const sections = (p.sections ?? GOOD_SECTIONS).map(([t, b]) => `## ${t}\n\n${b}\n`).join('\n');
  return ['---', ...fm, '---', '', '# Title', '', sections, p.tail ?? ''].join('\n');
}

const ctx = {
  agentIds: new Set(['daily_command', 'universal-operations']),
  workflowIds: new Set(['prompt-improvement']),
  docExists: (p: string) => p === 'docs/EXISTS.md',
};

function check(text: string, dirName = 'good-skill'): string[] {
  return validateSkillText({ text, dirName, relPath: `skills/${dirName}/SKILL.md`, ctx }).errors as string[];
}
const joined = (errors: string[]) => errors.join('\n');

describe('skill contract: valid skills', () => {
  it('accepts a minimal valid skill, with LF or CRLF line endings', () => {
    expect(check(makeSkill())).toEqual([]);
    expect(check(makeSkill().replace(/\n/g, '\r\n'))).toEqual([]);
  });

  it('accepts the optional Examples section as the final section, and all permitted values', () => {
    const withExamples = makeSkill({ sections: [...GOOD_SECTIONS, ['Examples', 'An example.']] });
    expect(check(withExamples)).toEqual([]);
    expect(OPTIONAL_SECTIONS).toEqual(['Examples']);
    expect(SKILL_TIERS).toEqual(['tier_2_assistant', 'tier_3_executor']);
    expect(SKILL_RISKS).toEqual(['read_only', 'draft_only', 'local_write']);
  });
});

describe('skill contract: frontmatter', () => {
  it('rejects a missing or unterminated frontmatter block', () => {
    expect(joined(check('## Purpose\n\nNo frontmatter.\n'))).toContain('missing frontmatter');
    expect(joined(check('---\nname: good-skill\n\n## Purpose\n'))).toContain('unterminated frontmatter');
  });

  it('rejects malformed or unsupported frontmatter constructs instead of guessing', () => {
    const cases: Array<[string, Parts, string]> = [
      ['duplicate key', { extraFrontmatter: ['name: other'] }, 'duplicate key "name"'],
      ['comment', { extraFrontmatter: ['# note'] }, 'comments are not supported'],
      ['tab', { extraFrontmatter: ['\tstray: x'] }, 'tabs are not allowed'],
      ['blank line', { extraFrontmatter: [''] }, 'blank lines are not allowed'],
      ['no colon', { extraFrontmatter: ['not a pair'] }, 'unsupported syntax'],
      ['unterminated quote', { description: '"never closed' }, 'unterminated double-quoted'],
      ['bad escape', { description: '"a\\nb"' }, 'unsupported escape'],
      ['flow map', { description: '{a: b}' }, 'unsupported YAML syntax'],
      ['unquoted colon', { description: 'Use when: needed' }, 'must be double-quoted'],
      ['inline metadata', { omit: ['metadata'], extraFrontmatter: ['metadata: {a: b}'] }, 'must be a block map'],
      ['nested metadata', { metadataLines: [...metadataBlock(), '    nested: "x"'] }, 'nested structure under metadata'],
    ];
    for (const [label, parts, expected] of cases) {
      expect(joined(check(makeSkill(parts))), label).toContain(expected);
    }
  });

  it('rejects required top-level fields when absent', () => {
    for (const field of ['name', 'description', 'metadata'] as const) {
      expect(joined(check(makeSkill({ omit: [field] }))), field).toContain(`missing required field "${field}"`);
    }
  });

  it('rejects required DavidOS metadata when absent', () => {
    for (const key of Object.keys(GOOD_METADATA)) {
      expect(joined(check(makeSkill({ omitMetadata: [key] }))), key).toContain(`missing required metadata "${key}"`);
    }
  });

  it('rejects unexpected frontmatter keys, including tool pre-approval', () => {
    for (const line of ['allowed-tools: Bash', 'license: MIT', 'compatibility: "anything"']) {
      expect(joined(check(makeSkill({ extraFrontmatter: [line] }))), line).toContain('unexpected frontmatter key');
    }
    expect(joined(check(makeSkill({ metadata: { 'davidos-extra': 'x' } })))).toContain('unknown metadata key "davidos-extra"');
  });

  it('rejects an over-long description', () => {
    const errors = check(makeSkill({ description: `"${'d'.repeat(1025)}"` }));
    expect(joined(errors)).toContain('description is 1025 characters');
  });
});

describe('skill contract: identity', () => {
  it('rejects malformed names', () => {
    for (const name of ['Bad-Name', '-lead', 'trail-', 'double--hyphen', 'under_score', 'a'.repeat(65)]) {
      expect(joined(check(makeSkill({ name }), name)), name).toContain('must be 1-64 lowercase');
    }
  });

  it('rejects a name that differs from its directory', () => {
    expect(joined(check(makeSkill({ name: 'good-skill' }), 'other-dir'))).toContain('must equal its directory name "other-dir"');
  });

  it('rejects ids that collide with an agent or workflow id (underscores normalized)', () => {
    for (const name of ['prompt-improvement', 'universal-operations', 'daily-command']) {
      expect(joined(check(makeSkill({ name }), name)), name).toContain('collides with an existing agent or workflow id');
    }
  });

  it('detects case-insensitive duplicate skill ids', () => {
    const errors = findDuplicateSkillIds([
      { path: 'skills/Foo/SKILL.md', name: 'Foo' },
      { path: 'skills/foo/SKILL.md', name: 'foo' },
      { path: 'skills/bar/SKILL.md', name: 'bar' },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('duplicate skill id "foo"');
  });
});

describe('skill contract: DavidOS metadata', () => {
  it('rejects an unknown contract version, bad semver, and bad status', () => {
    expect(joined(check(makeSkill({ metadata: { 'davidos-contract': '2' } })))).toContain('davidos-contract "2" is not supported');
    expect(joined(check(makeSkill({ metadata: { 'davidos-version': '1.0' } })))).toContain('not a semantic version');
    expect(joined(check(makeSkill({ metadata: { 'davidos-status': 'live' } })))).toContain(`not one of ${SKILL_STATUSES.join(', ')}`);
  });

  it('rejects tier_1_local for skills', () => {
    const errors = check(makeSkill({ metadata: { 'davidos-tiers': 'tier_1_local' } }));
    expect(joined(errors)).toContain('"tier_1_local" is not permitted');
  });

  it('rejects unknown, duplicate, and empty tier lists', () => {
    expect(joined(check(makeSkill({ metadata: { 'davidos-tiers': 'tier_9' } })))).toContain('"tier_9" is not one of');
    expect(joined(check(makeSkill({ metadata: { 'davidos-tiers': 'tier_2_assistant tier_2_assistant' } })))).toContain('lists "tier_2_assistant" twice');
    expect(joined(check(makeSkill({ metadata: { 'davidos-tiers': '' } })))).toContain('must list at least one tier');
  });

  it('rejects external-write and high-risk values, and unknown risks', () => {
    for (const risk of ['external_write', 'sensitive_external_write', 'high_risk']) {
      expect(joined(check(makeSkill({ metadata: { 'davidos-risk': risk } }))), risk).toContain('is not permitted');
    }
    expect(joined(check(makeSkill({ metadata: { 'davidos-risk': 'banana' } })))).toContain('is not one of');
  });

  it('requires metadata values that YAML would type as non-strings to be quoted', () => {
    const lines = metadataBlock();
    lines[0] = '  davidos-contract: 1';
    expect(joined(check(makeSkill({ metadataLines: lines })))).toContain('ambiguous as a YAML type');
  });
});

describe('skill contract: davidos-related references', () => {
  it('rejects malformed references and empty values', () => {
    expect(joined(check(makeSkill({ metadata: { 'davidos-related': 'banana' } })))).toContain('is malformed');
    expect(joined(check(makeSkill({ metadata: { 'davidos-related': '' } })))).toContain('present but empty');
  });

  it('rejects references that do not resolve or that escape the repository', () => {
    for (const ref of ['workflow:nope', 'agent:nope', 'doc:docs/MISSING.md']) {
      expect(joined(check(makeSkill({ metadata: { 'davidos-related': ref } }))), ref).toContain('does not resolve');
    }
    // The last value is written to the file as an escaped backslash (\\), which
    // the parser accepts, so the path rule itself is what rejects it.
    for (const ref of ['doc:../x.md', 'doc:/abs.md', 'doc:docs\\\\x.md']) {
      expect(joined(check(makeSkill({ metadata: { 'davidos-related': ref } }))), ref).toContain('repository-relative path');
    }
  });

  it('accepts references that resolve', () => {
    const related = 'workflow:prompt-improvement agent:daily_command doc:docs/EXISTS.md';
    expect(check(makeSkill({ metadata: { 'davidos-related': related } }))).toEqual([]);
  });
});

describe('skill contract: body sections', () => {
  it('requires every section, reporting each missing one', () => {
    for (const title of REQUIRED_SECTIONS as string[]) {
      expect(joined(check(makeSkill({ sections: without(title) }))), title).toContain(`missing required section "## ${title}"`);
    }
  });

  it('enforces section order', () => {
    const swapped = [...GOOD_SECTIONS];
    [swapped[3], swapped[4]] = [swapped[4] as Section, swapped[3] as Section];
    expect(joined(check(makeSkill({ sections: swapped })))).toContain('sections are out of order');
    expect(joined(check(makeSkill({ sections: [['Examples', 'x'], ...GOOD_SECTIONS] })))).toContain('sections are out of order');
  });

  it('rejects duplicate, unknown, and empty sections', () => {
    expect(joined(check(makeSkill({ sections: [...GOOD_SECTIONS, ['Purpose', 'Again.']] })))).toContain('appears 2 times');
    expect(joined(check(makeSkill({ sections: [...GOOD_SECTIONS, ['Notes', 'Extra.']] })))).toContain('unknown section "## Notes"');
    expect(joined(check(makeSkill({ sections: withSection('Purpose', '') })))).toContain('section "## Purpose" is empty');
  });

  it('ignores headings and list markers inside fenced code blocks', () => {
    const fenced = ['A result.', '', '```text', '## Fake heading', '1. fake step', '```'].join('\n');
    expect(check(makeSkill({ sections: withSection('Output', fenced) }))).toEqual([]);

    const hidden = ['A result.', '', '```text', '## Verification', '- [ ] not real', '```'].join('\n');
    const errors = check(makeSkill({ sections: [...without('Verification').map(([t, b]): Section => (t === 'Output' ? [t, hidden] : [t, b]))] }));
    expect(joined(errors)).toContain('missing required section "## Verification"');

    const stepsInFence = ['```text', '1. a', '2. b', '```'].join('\n');
    expect(joined(check(makeSkill({ sections: withSection('Procedure', stepsInFence) })))).toContain('at least two numbered steps');
  });

  it('requires two numbered Procedure steps', () => {
    expect(joined(check(makeSkill({ sections: withSection('Procedure', '1. Only one.') })))).toContain('at least two numbered steps');
  });

  it('requires bullets in Constraints, Verification, and Stop conditions', () => {
    for (const title of ['Constraints', 'Verification', 'Stop conditions']) {
      expect(joined(check(makeSkill({ sections: withSection(title, 'Prose only.') }))), title).toContain(`"## ${title}" needs at least one bullet`);
    }
  });

  it('requires the exact Authority sentence as prose', () => {
    expect(joined(check(makeSkill({ sections: withSection('Authority', 'Some authority text.') })))).toContain('exact sentence');
    const fencedOnly = ['```text', AUTHORITY_MARKER, '```'].join('\n');
    expect(joined(check(makeSkill({ sections: withSection('Authority', fencedOnly) })))).toContain('exact sentence');
  });
});

describe('skill contract: tool, tier, and risk consistency', () => {
  const tools = (...labels: string[]) => withSection('Tool requirements', labels.map((l) => `- ${l} — reason`).join('\n'));

  it('requires tool bullets to use only known capability labels', () => {
    expect(joined(check(makeSkill({ sections: withSection('Tool requirements', '- banana — nope') })))).toContain('must start with a capability label');
    expect(joined(check(makeSkill({ sections: withSection('Tool requirements', 'Some prose instead.') })))).toContain('may contain only capability bullets');
    expect(SKILL_TOOLS).toEqual(['none', 'web_search', 'repo_read', 'repo_write', 'shell_run']);
  });

  it('does not allow "none" to be combined with another capability', () => {
    expect(joined(check(makeSkill({ sections: tools('none', 'web_search') })))).toContain('"none" cannot be combined');
  });

  it('ties repo_write to tier_3_executor and local_write', () => {
    const tier2 = check(makeSkill({ sections: tools('repo_write') }));
    expect(joined(tier2)).toContain('repo_write requires tier_3_executor');
    expect(joined(tier2)).toContain('repo_write requires davidos-risk "local_write"');

    const tier3WrongRisk = check(makeSkill({ sections: tools('repo_write'), metadata: { 'davidos-tiers': 'tier_3_executor' } }));
    expect(joined(tier3WrongRisk)).toContain('repo_write requires davidos-risk "local_write"');
    expect(joined(tier3WrongRisk)).not.toContain('repo_write requires tier_3_executor');

    const ok = check(makeSkill({ sections: tools('repo_read', 'repo_write', 'shell_run'), metadata: { 'davidos-tiers': 'tier_2_assistant tier_3_executor', 'davidos-risk': 'local_write' } }));
    expect(ok).toEqual([]);
  });

  it('ties shell_run and local_write to tier_3_executor', () => {
    expect(joined(check(makeSkill({ sections: tools('shell_run') })))).toContain('shell_run requires tier_3_executor');
    expect(joined(check(makeSkill({ metadata: { 'davidos-risk': 'local_write' } })))).toContain('"local_write" requires tier_3_executor');
  });
});

describe('skill contract: content safety and size', () => {
  it('rejects zero-width, bidi, and control characters', () => {
    for (const ch of ['​', '‮', '⁦', '﻿', '\u0000']) {
      const text = makeSkill({ sections: withSection('Output', `A result.${ch}`) });
      expect(joined(check(text)), `U+${ch.charCodeAt(0).toString(16)}`).toContain('hidden or control character');
    }
  });

  it('rejects credential- and token-shaped values (built from fragments in this file)', () => {
    const shapes: Array<[string, string]> = [
      ['api key', 'sk-' + 'a1'.repeat(12)],
      ['github token', 'ghp_' + 'Ab'.repeat(18)],
      ['aws key id', 'AKIA' + 'ABCDEFGH12345678'],
      ['private key', '-----BEGIN ' + 'PRIVATE KEY-----'],
      ['bearer token', 'Bearer ' + 'abcd1234'.repeat(3)],
      ['assignment', 'api_key = ' + 'A1b2C3d4'.repeat(3)],
    ];
    for (const [label, value] of shapes) {
      const text = makeSkill({ sections: withSection('Output', `Example value ${value} here.`) });
      expect(joined(check(text)), label).toContain('shape detected');
    }
  });

  it('enforces the line and byte caps', () => {
    expect(joined(check(makeSkill({ tail: 'filler\n'.repeat(MAX_SKILL_LINES) })))).toContain(`lines (limit ${MAX_SKILL_LINES})`);
    expect(joined(check(makeSkill({ tail: 'y'.repeat(MAX_SKILL_BYTES) })))).toContain(`bytes (limit ${MAX_SKILL_BYTES})`);
  });
});

// CLI behavior against isolated fixture trees via the DAVIDOS_ROOT override
// (same contract as validate-seed.mjs). Production files are never touched.
const fixtureRoots: string[] = [];
afterAll(() => {
  for (const r of fixtureRoots) rmSync(r, { recursive: true, force: true });
});

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'davidos-skill-fixture-'));
  fixtureRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, ...rel.split('/'));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

function runCli(root: string) {
  try {
    const stdout = execFileSync(process.execPath, [join(repoRoot, 'scripts', 'validate-skills.mjs')], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DAVIDOS_ROOT: root },
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('validate-skills CLI', () => {
  it('succeeds when the skills directory is absent', () => {
    const r = runCli(fixture({ 'README.md': 'x' }));
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('no skills/ directory');
  });

  it('succeeds for a valid fixture', () => {
    const r = runCli(fixture({ 'skills/good-skill/SKILL.md': makeSkill() }));
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Skills validation OK — 1 skills (good-skill)');
  });

  it('exits nonzero for an invalid fixture, naming the file and the reason', () => {
    const r = runCli(fixture({ 'skills/bad-skill/SKILL.md': makeSkill({ name: 'bad-skill', metadata: { 'davidos-risk': 'high_risk' } }) }));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Skills validation FAILED');
    expect(r.stderr).toContain('skills/bad-skill/SKILL.md');
    expect(r.stderr).toContain('"high_risk" is not permitted');
  });

  it('rejects extra entries, stray root files, and a missing SKILL.md', () => {
    const extra = runCli(fixture({
      'skills/good-skill/SKILL.md': makeSkill(),
      'skills/good-skill/scripts/run.sh': 'echo x',
    }));
    expect(extra.code).toBe(1);
    expect(extra.stderr).toContain('skills/good-skill/scripts: unexpected entry');

    const stray = runCli(fixture({ 'skills/good-skill/SKILL.md': makeSkill(), 'skills/README.md': 'x' }));
    expect(stray.code).toBe(1);
    expect(stray.stderr).toContain('unexpected file at the skills/ root');

    const missing = runCli(fixture({ 'skills/empty-skill/notes.txt': 'x' }));
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('skills/empty-skill/SKILL.md: missing');
  });

  it('resolves agent, workflow, and doc references and rejects id collisions against real seed files', () => {
    const seed = {
      'seed/workflows/wf.json': JSON.stringify({ id: 'alpha-flow' }),
      'seed/agents/ag.json': JSON.stringify({ id: 'beta_agent' }),
      'docs/NOTE.md': '# note\n',
    };
    const ok = runCli(fixture({
      ...seed,
      'skills/gamma-skill/SKILL.md': makeSkill({
        name: 'gamma-skill',
        metadata: { 'davidos-related': 'workflow:alpha-flow agent:beta_agent doc:docs/NOTE.md' },
      }),
    }));
    expect(ok.code).toBe(0);

    const collision = runCli(fixture({ ...seed, 'skills/alpha-flow/SKILL.md': makeSkill({ name: 'alpha-flow' }) }));
    expect(collision.code).toBe(1);
    expect(collision.stderr).toContain('collides with an existing agent or workflow id');
  });
});

describe('production skills', () => {
  const productionIds = ['deep-research', 'independent-code-review', 'skill-authoring'];
  const read = (id: string) => readFileSync(join(repoRoot, 'skills', id, 'SKILL.md'), 'utf8');

  it('validate cleanly (same check npm run verify performs)', () => {
    const { errors, skills } = validateSkills();
    expect(errors).toEqual([]);
    expect(skills).toEqual(expect.arrayContaining(productionIds));
  });

  it('pass the repository privacy rules', () => {
    for (const id of productionIds) {
      expect(findPrivacyViolations(read(id), `skills/${id}/SKILL.md`), id).toEqual([]);
    }
  });

  it('keep the Meta-Skill in step with the validator vocabulary', () => {
    const meta = read('skill-authoring');
    const tokens: string[] = [
      ...(REQUIRED_SECTIONS as string[]).map((t) => `## ${t}`),
      ...(OPTIONAL_SECTIONS as string[]).map((t) => `## ${t}`),
      ...(SKILL_STATUSES as string[]),
      ...(SKILL_TIERS as string[]),
      ...(SKILL_RISKS as string[]),
      ...(SKILL_TOOLS as string[]),
      AUTHORITY_MARKER,
      'davidos-contract: "1"',
    ];
    for (const token of tokens) expect(meta, `skill-authoring mentions ${token}`).toContain(token);
  });

  it('are wired into the verification gate by a dedicated command', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['validate:skills']).toBe('node scripts/validate-skills.mjs');
    const verify = pkg.scripts.verify ?? '';
    expect(verify.indexOf('npm run validate:seed')).toBeGreaterThan(-1);
    expect(verify.indexOf('npm run validate:skills')).toBeGreaterThan(verify.indexOf('npm run validate:seed'));
    expect(verify.indexOf('npm run validate:privacy')).toBeGreaterThan(verify.indexOf('npm run validate:skills'));
  });
});
