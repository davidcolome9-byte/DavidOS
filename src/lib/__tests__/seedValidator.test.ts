import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs module without type declarations
import { findDuplicateIds, crossCheckRegistry, validateSeeds } from '../../../scripts/validate-seed.mjs';

// Synthetic fixtures only — production seeds are validated by the CLI run
// in `npm run verify`; here we prove the checks themselves work.

describe('findDuplicateIds', () => {
  it('flags a duplicated id across files', () => {
    const errors = findDuplicateIds([
      { path: 'seed/x/a.json', data: { id: 'same' } },
      { path: 'seed/x/b.json', data: { id: 'same' } },
      { path: 'seed/x/c.json', data: { id: 'unique' } },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('duplicate id "same"');
  });

  it('passes distinct ids', () => {
    expect(
      findDuplicateIds([
        { path: 'a', data: { id: 'one' } },
        { path: 'b', data: { id: 'two' } },
      ]),
    ).toEqual([]);
  });
});

describe('crossCheckRegistry', () => {
  const registry = `
    import a from '../../../seed/agents/alpha.json';
    import b from '../../../seed/agents/beta.json';
  `;

  it('flags a discovered seed file the registry never imports', () => {
    const errors = crossCheckRegistry(registry, 'registry.ts', 'agents', ['alpha.json', 'beta.json', 'orphan.json'], () => true);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('orphan.json');
    expect(errors[0]).toContain('NOT imported');
  });

  it('flags a registry import whose backing file is gone', () => {
    const errors = crossCheckRegistry(registry, 'registry.ts', 'agents', ['alpha.json'], (f: string) => f === 'alpha.json');
    expect(errors.some((e: string) => e.includes('beta.json') && e.includes('does not exist'))).toBe(true);
  });

  it('passes when both directions match', () => {
    expect(crossCheckRegistry(registry, 'registry.ts', 'agents', ['alpha.json', 'beta.json'], () => true)).toEqual([]);
  });
});

describe('production seeds', () => {
  it('validate cleanly (same check npm run verify performs)', () => {
    const { errors } = validateSeeds();
    expect(errors).toEqual([]);
  });
});
