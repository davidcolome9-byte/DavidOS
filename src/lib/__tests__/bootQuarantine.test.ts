import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECOVERY_KEY_PREFIX, STORAGE_KEY, loadPersistedState } from '../storage/localStore';
import { summarizeStructuralDamage } from '../storage/bootValidation';
import { validateImportedState } from '../storage/importValidation';
import { handoffContent } from '../workflows/continuity';
import { buildDefaultState } from '../../data/defaultState';
import type { AppState, Handoff, OpenLoop, Priority, Reminder } from '../types';

// DOS-STAB-001A — legacy-aware DEEP boot validation. Malformed individual
// records must be quarantined (preserve the byte-exact original blob FIRST,
// then exclude only the invalid records and keep loading valid neighbors).
// Valid legacy states with missing OPTIONAL fields must keep loading without
// any recovery. Nothing here may echo record contents. All values synthetic.

function fakeLocalStorage() {
  const store = new Map<string, string>();
  let failRecoveryWrites = false;
  return {
    store,
    setFailRecoveryWrites(v: boolean) {
      failRecoveryWrites = v;
    },
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (failRecoveryWrites && k.startsWith(RECOVERY_KEY_PREFIX)) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      store.set(k, String(v));
    },
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  };
}

let storage: ReturnType<typeof fakeLocalStorage>;
let consoleLines: string[];

beforeEach(() => {
  storage = fakeLocalStorage();
  (globalThis as { localStorage?: unknown }).localStorage = storage;
  consoleLines = [];
  for (const m of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      consoleLines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a) ?? String(a))).join(' '));
    });
  }
});

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
  vi.restoreAllMocks();
});

function recoveryKeys() {
  return [...storage.store.keys()].filter((k) => k.startsWith(RECOVERY_KEY_PREFIX));
}

const validPriority = (id: string, rank: number): Priority => ({ id, label: `syn-priority-${id}`, rank });
const validLoop = (id: string): OpenLoop => ({ id, label: `syn-loop-${id}`, status: 'open', createdAt: '2026-01-05T00:00:00.000Z' });
const validReminder = (id: string): Reminder => ({ id, label: `syn-reminder-${id}`, due: 'Friday', done: false });
const validHandoff = (id: string): Handoff => ({
  id,
  agentId: 'fitness',
  workflowId: 'syn-workflow',
  workflowName: 'Syn Workflow',
  inputSummary: `syn-input-${id}`,
  outputStyle: 'standard',
  content: `syn-content-${id}`,
  risk: 'read_only',
  createdAt: '2026-01-05T00:00:00.000Z',
});

/** Store a state blob and boot from it. */
function boot(mutate: (s: AppState) => void): { raw: string; result: ReturnType<typeof loadPersistedState> } {
  const s = JSON.parse(JSON.stringify(buildDefaultState())) as AppState;
  mutate(s);
  const raw = JSON.stringify(s);
  storage.store.set(STORAGE_KEY, raw);
  return { raw, result: loadPersistedState() };
}

describe('boot quarantine of malformed records (preserve first, then exclude)', () => {
  it('a malformed required string field is quarantined; valid neighbors keep loading', () => {
    const { raw, result } = boot((s) => {
      s.priorities = [
        validPriority('syn-p1', 1),
        { ...validPriority('syn-p2', 2), label: 424242 } as unknown as Priority,
        validPriority('syn-p3', 3),
      ];
    });
    expect(result.state!.priorities.map((p) => p.id)).toEqual(['syn-p1', 'syn-p3']);
    expect(result.recovery.kind).toBe('repaired');
    expect(result.recovery.rawPreserved).toBe(true);
    expect(result.recovery.canPersist).toBe(true);
    // Byte-exact preservation BEFORE the lossy exclusion.
    expect(storage.getItem(result.recovery.recoveryKey!)).toBe(raw);
  });

  it('a malformed numeric field is quarantined', () => {
    const { result } = boot((s) => {
      s.priorities = [
        validPriority('syn-p1', 1),
        { ...validPriority('syn-p2', 2), rank: 'SYN-BAD-RANK' } as unknown as Priority,
      ];
    });
    expect(result.state!.priorities.map((p) => p.id)).toEqual(['syn-p1']);
    expect(result.recovery.kind).toBe('repaired');
  });

  it('an invalid enum field is quarantined', () => {
    const { result } = boot((s) => {
      s.openLoops = [
        validLoop('syn-l1'),
        { ...validLoop('syn-l2'), status: 'SYN-PAUSED' } as unknown as OpenLoop,
      ];
    });
    expect(result.state!.openLoops.map((l) => l.id)).toEqual(['syn-l1']);
  });

  it('an invalid date field is quarantined', () => {
    const { result } = boot((s) => {
      s.openLoops = [
        { ...validLoop('syn-l1'), createdAt: 'SYN-NOT-A-DATE' } as unknown as OpenLoop,
        validLoop('syn-l2'),
      ];
    });
    expect(result.state!.openLoops.map((l) => l.id)).toEqual(['syn-l2']);
  });

  it('a malformed nested item (prompt version entry) quarantines that record only', () => {
    const { result } = boot((s) => {
      s.prompts = s.prompts.map((p, i) =>
        i === 0 ? { ...p, versions: [{ body: 999, savedAt: 'SYN-NOT-A-DATE' }] } as unknown as typeof p : p,
      );
    });
    const originalCount = buildDefaultState().prompts.length;
    expect(result.state!.prompts).toHaveLength(originalCount - 1);
    expect(result.recovery.kind).toBe('repaired');
  });

  it('duplicate IDs within an ID-keyed collection keep only the first record', () => {
    const { result } = boot((s) => {
      s.reminders = [
        { ...validReminder('syn-dup'), label: 'syn-first' },
        { ...validReminder('syn-dup'), label: 'syn-second' },
        validReminder('syn-r3'),
      ];
    });
    expect(result.state!.reminders.map((r) => r.label)).toEqual(['syn-first', `syn-reminder-syn-r3`]);
    expect(result.recovery.kind).toBe('repaired');
  });

  it('a malformed handoff value is quarantined; valid handoffs keep loading', () => {
    const { result } = boot((s) => {
      s.handoffs = [
        validHandoff('syn-h1'),
        { ...validHandoff('syn-h2'), risk: 'SYN-YOLO' } as unknown as Handoff,
      ];
    });
    expect(result.state!.handoffs.map((h) => h.id)).toEqual(['syn-h1']);
  });

  it('malformed Health Profile values quarantine the profile (no invented replacement)', () => {
    const { result } = boot((s) => {
      s.healthProfile = {
        ...s.healthProfile!,
        nutritionTargets: { calories: 'SYN-ABC' },
      } as unknown as AppState['healthProfile'];
    });
    // The profile is excluded from active state — never silently rebuilt with
    // guessed values. The full original remains in the preserved blob.
    expect(result.state!.healthProfile).toBeNull();
    expect(result.recovery.kind).toBe('repaired');
    expect(result.recovery.rawPreserved).toBe(true);
  });

  it('unrelated collections are untouched by a quarantine elsewhere', () => {
    const { result } = boot((s) => {
      s.openLoops = [{ ...validLoop('syn-l1'), status: 'SYN-BROKEN' } as unknown as OpenLoop];
    });
    const seedState = buildDefaultState();
    expect(result.state!.prompts).toHaveLength(seedState.prompts.length);
    expect(result.state!.projects).toHaveLength(seedState.projects.length);
  });
});

describe('legacy compatibility — missing optional fields are NOT corruption', () => {
  it('a legacy state missing optional collections/fields loads fully with no quarantine', () => {
    const { result } = boot((s) => {
      const legacy = s as Partial<AppState>;
      delete legacy.artifacts;
      delete legacy.executionRecords;
      delete legacy.healthProfile;
      // Optional per-record fields absent.
      legacy.openLoops = legacy.openLoops!.map((l) => {
        const { closedAt: _omit, ...rest } = l;
        return rest as OpenLoop;
      });
      legacy.prompts = legacy.prompts!.map((p) => {
        const rest = { ...p } as Partial<typeof p>;
        delete rest.versions;
        delete rest.agentId;
        // tags is REQUIRED today but is additively backfilled from older
        // states — its absence must never be treated as corruption at boot.
        delete rest.tags;
        return rest as typeof p;
      });
      legacy.projects = legacy.projects!.map((pr) => {
        const rest = { ...pr } as Partial<typeof pr>;
        delete rest.relatedPrompts;
        delete rest.relatedWorkflows;
        return rest as typeof pr;
      });
    });
    expect(result.recovery.kind).toBe('migrated'); // additive backfill only
    expect(result.recovery.canPersist).toBe(true);
    expect(recoveryKeys()).toEqual([]);
    expect(result.state!.openLoops).toHaveLength(buildDefaultState().openLoops.length);
    expect(result.state!.prompts).toHaveLength(buildDefaultState().prompts.length);
    expect(result.state!.projects).toHaveLength(buildDefaultState().projects.length);
    // The absent arrays were backfilled, not quarantined.
    expect(result.state!.prompts.every((p) => Array.isArray(p.tags))).toBe(true);
    expect(result.state!.projects.every((p) => Array.isArray(p.relatedPrompts))).toBe(true);
  });

  it('a PRESENT but wrong-typed backfillable field is still corruption', () => {
    const { result } = boot((s) => {
      s.prompts = s.prompts.map((p, i) =>
        i === 0 ? ({ ...p, tags: 'SYN-NOT-AN-ARRAY' } as unknown as typeof p) : p,
      );
    });
    expect(result.state!.prompts).toHaveLength(buildDefaultState().prompts.length - 1);
    expect(result.recovery.kind).toBe('repaired');
  });

  it('a fully valid current state boots clean — no recovery, no quarantine', () => {
    const { result } = boot(() => {});
    expect(result.recovery.kind).toBe('none');
    expect(recoveryKeys()).toEqual([]);
  });
});

/**
 * Historical v1 Handoff shape, reproduced from the ORIGINAL committed release
 * (git cb30ead, src/lib/types.ts): a required `output` field holding the
 * entry text, NO `content`, and none of the later continuity fields
 * (contentHash/entryDate/dateConfidence/status/correctsHandoffId). All
 * values here are synthetic; only the field set matches history.
 */
const legacyV1Handoff = (id: string) => ({
  id,
  agentId: 'fitness',
  workflowId: 'syn-workflow',
  workflowName: 'Syn Workflow',
  inputSummary: `syn-input-${id}`,
  outputStyle: 'standard',
  output: `syn-legacy-output-${id}`,
  risk: 'read_only',
  createdAt: '2025-01-05T00:00:00.000Z',
});

describe('historical v1 output-only Handoffs stay compatible', () => {
  it('boot accepts an output-only v1 handoff — no quarantine, no recovery, data preserved as-is', () => {
    const { result } = boot((s) => {
      s.handoffs = [legacyV1Handoff('syn-h1') as unknown as Handoff, validHandoff('syn-h2')];
    });
    expect(result.recovery.kind).toBe('none');
    expect(recoveryKeys()).toEqual([]);
    expect(result.state!.handoffs.map((h) => h.id)).toEqual(['syn-h1', 'syn-h2']);
    const legacy = result.state!.handoffs[0];
    // The historical shape is preserved: `content` is NOT fabricated to
    // satisfy validation, and the legacy `output` value survives untouched.
    expect(legacy.content).toBeUndefined();
    expect(legacy.output).toBe('syn-legacy-output-syn-h1');
    // Normal runtime access still works through content ?? output.
    expect(handoffContent(legacy)).toBe('syn-legacy-output-syn-h1');
  });

  it('import validation accepts an output-only v1 handoff', () => {
    const s = JSON.parse(JSON.stringify(buildDefaultState())) as AppState;
    s.handoffs = [legacyV1Handoff('syn-h1') as unknown as Handoff];
    expect(validateImportedState(s)).toEqual([]);
  });

  it('a handoff missing BOTH content and a string output is still corruption', () => {
    const { result } = boot((s) => {
      const broken = legacyV1Handoff('syn-h1') as unknown as Record<string, unknown>;
      broken.output = 12345; // non-string output cannot satisfy content
      s.handoffs = [broken as unknown as Handoff, validHandoff('syn-h2')];
    });
    expect(result.state!.handoffs.map((h) => h.id)).toEqual(['syn-h2']);
    expect(result.recovery.kind).toBe('repaired');
  });

  it('a present but non-string content is still corruption even with a valid output', () => {
    const { result } = boot((s) => {
      const broken = { ...legacyV1Handoff('syn-h1'), content: 42 } as unknown as Handoff;
      s.handoffs = [broken, validHandoff('syn-h2')];
    });
    expect(result.state!.handoffs.map((h) => h.id)).toEqual(['syn-h2']);
    expect(result.recovery.kind).toBe('repaired');
  });
});

describe('lossy handoff relationship repairs preserve the raw original first', () => {
  it('an orphaned correction pointer: preserve byte-exact, then repair, neighbors keep loading', () => {
    const { raw, result } = boot((s) => {
      s.handoffs = [
        { ...validHandoff('syn-h1'), status: 'correction', correctsHandoffId: 'syn-missing' },
        validHandoff('syn-h2'),
      ];
    });
    expect(result.recovery.kind).toBe('repaired');
    expect(result.recovery.rawPreserved).toBe(true);
    expect(result.recovery.canPersist).toBe(true);
    // Byte-exact preservation of the COMPLETE original blob.
    expect(storage.getItem(result.recovery.recoveryKey!)).toBe(raw);
    // The intended repair still applies: demoted to a standalone entry.
    const h1 = result.state!.handoffs.find((h) => h.id === 'syn-h1')!;
    expect(h1.status).toBe('active');
    expect(h1.correctsHandoffId).toBeUndefined();
    // Valid neighboring handoffs remain available (not quarantined).
    expect(result.state!.handoffs.map((h) => h.id)).toEqual(['syn-h1', 'syn-h2']);
  });

  it('contradictory statuses (corrected original still active): preserve, then normalize', () => {
    const { raw, result } = boot((s) => {
      s.handoffs = [
        validHandoff('syn-h1'), // corrected below but not marked superseded
        { ...validHandoff('syn-h2'), status: 'correction', correctsHandoffId: 'syn-h1' },
      ];
    });
    expect(result.recovery.kind).toBe('repaired');
    expect(result.recovery.rawPreserved).toBe(true);
    expect(storage.getItem(result.recovery.recoveryKey!)).toBe(raw);
    const h1 = result.state!.handoffs.find((h) => h.id === 'syn-h1')!;
    expect(h1.status).toBe('superseded'); // the intended normalization
    expect(result.state!.handoffs).toHaveLength(2);
  });

  it('a stuck-superseded handoff with no surviving corrector: preserve, then restore', () => {
    const { raw, result } = boot((s) => {
      s.handoffs = [{ ...validHandoff('syn-h1'), status: 'superseded' }, validHandoff('syn-h2')];
    });
    expect(result.recovery.kind).toBe('repaired');
    expect(storage.getItem(result.recovery.recoveryKey!)).toBe(raw);
    const h1 = result.state!.handoffs.find((h) => h.id === 'syn-h1')!;
    expect(h1.status).toBe('active');
  });

  it('a CONSISTENT correction chain boots clean — no preservation, no repair', () => {
    const { result } = boot((s) => {
      s.handoffs = [
        { ...validHandoff('syn-h1'), status: 'superseded' },
        { ...validHandoff('syn-h2'), status: 'correction', correctsHandoffId: 'syn-h1' },
      ];
    });
    expect(result.recovery.kind).toBe('none');
    expect(recoveryKeys()).toEqual([]);
    expect(result.state!.handoffs.map((h) => h.status)).toEqual(['superseded', 'correction']);
  });

  it('preservation failure blocks persistence; the repaired view stays in memory only', () => {
    storage.setFailRecoveryWrites(true);
    const { raw, result } = boot((s) => {
      s.handoffs = [
        { ...validHandoff('syn-h1'), status: 'correction', correctsHandoffId: 'syn-missing' },
        validHandoff('syn-h2'),
      ];
    });
    expect(result.recovery.rawPreserved).toBe(false);
    expect(result.recovery.canPersist).toBe(false);
    // The stored original is byte-identical — never overwritten.
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
    // The repaired view still loads in memory, neighbors intact.
    expect(result.state!.handoffs.map((h) => h.id)).toEqual(['syn-h1', 'syn-h2']);
  });
});

describe('Health Profile: malformed-present quarantines to null; only genuine absence seeds', () => {
  const malformedShapes: Array<[string, unknown]> = [
    ['array', ['syn-not-a-profile']],
    ['string', 'syn-not-a-profile'],
    ['number', 4242],
    ['boolean', true],
  ];
  for (const [label, value] of malformedShapes) {
    it(`a ${label} Health Profile quarantines to null (never a seeded replacement)`, () => {
      const { raw, result } = boot((s) => {
        (s as unknown as Record<string, unknown>).healthProfile = value;
      });
      expect(result.state!.healthProfile).toBeNull();
      expect(result.recovery.kind).toBe('repaired');
      expect(result.recovery.rawPreserved).toBe(true);
      expect(storage.getItem(result.recovery.recoveryKey!)).toBe(raw);
    });
  }

  it('a malformed OBJECT profile (deep-invalid) quarantines to null, not a seed', () => {
    const { result } = boot((s) => {
      s.healthProfile = {
        ...s.healthProfile!,
        nutritionTargets: { calories: 'SYN-NOT-A-NUMBER' },
      } as unknown as AppState['healthProfile'];
    });
    expect(result.state!.healthProfile).toBeNull();
    expect(result.recovery.kind).toBe('repaired');
  });

  it('a genuinely ABSENT profile receives the intended compatible seed (no recovery)', () => {
    const { result } = boot((s) => {
      delete (s as Partial<AppState>).healthProfile;
    });
    expect(result.state!.healthProfile).not.toBeNull();
    expect(result.state!.healthProfile!.seedMetadata?.isSeededProfile).toBe(true);
    expect(result.recovery.kind).toBe('migrated'); // additive backfill only
    expect(recoveryKeys()).toEqual([]);
  });

  it('an explicitly deleted (null) profile stays null with no recovery', () => {
    const { result } = boot((s) => {
      s.healthProfile = null;
    });
    expect(result.state!.healthProfile).toBeNull();
    expect(result.recovery.kind).toBe('none');
  });

  it('a malformed present profile NEVER takes the absent-data seed path', () => {
    const { result } = boot((s) => {
      (s as unknown as Record<string, unknown>).healthProfile = 'syn-not-a-profile';
    });
    // Not an object at all — proves no seed was fabricated.
    expect(result.state!.healthProfile).toBeNull();
  });
});

describe('quarantine warnings say quarantined/excluded — value-free, key-free', () => {
  it('the repaired-boot warning names the exclusion explicitly and stays privacy-safe', () => {
    const { result } = boot((s) => {
      s.priorities = [
        validPriority('syn-p1', 1),
        { ...validPriority('syn-p2', 2), rank: 'SYN-BAD-RANK' } as unknown as Priority,
      ];
    });
    // Explicit quarantine/exclusion wording — "repaired" alone is not enough
    // when records were removed from active state.
    expect(result.recovery.message).toMatch(/quarantined|excluded/i);
    // Allowed content: collection name, count, preserved-original availability.
    expect(result.recovery.message).toContain('priorities');
    expect(result.recovery.message).toMatch(/1 of 2/);
    expect(result.recovery.message).toMatch(/preserved/i);
    // Forbidden content: ids, values, user text, raw blobs, storage keys.
    const everything = result.recovery.message + '\n' + consoleLines.join('\n');
    expect(everything).not.toContain('syn-p1');
    expect(everything).not.toContain('syn-p2');
    expect(everything).not.toContain('SYN-BAD-RANK');
    expect(everything).not.toContain(STORAGE_KEY);
    expect(everything).not.toContain(RECOVERY_KEY_PREFIX);
    for (const key of recoveryKeys()) expect(everything).not.toContain(key);
  });

  it('the preservation-failed warning is equally explicit and key-free', () => {
    storage.setFailRecoveryWrites(true);
    const { result } = boot((s) => {
      s.openLoops = [{ ...validLoop('syn-l1'), status: 'SYN-BROKEN' } as unknown as OpenLoop];
    });
    expect(result.recovery.message).toMatch(/quarantined|excluded/i);
    expect(result.recovery.message).toMatch(/paused/i);
    expect(result.recovery.message).not.toContain(STORAGE_KEY);
    expect(result.recovery.message).not.toContain('syn-l1');
  });
});

describe('quarantine-warning allowlist — approved categories and counts only', () => {
  // Every emitted token must be an approved fixed category name, optionally
  // with a count. Nothing else — no paths, indices, ids, keys, or values.
  const ALLOWLIST_FORMAT = /^[A-Za-z ]+(: \d+)?(, [A-Za-z ]+(: \d+)?)*$/;

  it('collapses dotted field paths to their collection-level category', () => {
    expect(summarizeStructuralDamage(['settings.theme'])).toBe('settings');
  });

  it('collapses bracket-indexed item paths and aggregates counts per collection', () => {
    const out = summarizeStructuralDamage(['prompts[0].tags', 'prompts[3].versions', 'projects[1].relatedPrompts']);
    expect(out).toBe('prompts: 2, projects');
    expect(out).toMatch(ALLOWLIST_FORMAT);
  });

  it('rejects synthetic ids, private-looking values, storage keys, and raw JSON fragments', () => {
    const hostile = [
      'syn-record-id-42',
      'SYN-PRIVATE-VALUE-XYZ',
      STORAGE_KEY,
      `${RECOVERY_KEY_PREFIX}2026-01-01`,
      '{"healthProfile":{"notes":"SYN"}}',
      'davidos-state-generation-v1-abcdef',
    ];
    const out = summarizeStructuralDamage(hostile);
    expect(out).toBe('AppState records: 6');
    expect(out).toMatch(ALLOWLIST_FORMAT);
    for (const forbidden of hostile) expect(out).not.toContain(forbidden);
  });

  it('the boot warning aggregates structural damage into categories — never paths or indices', () => {
    const { result } = boot((s) => {
      (s.settings as { theme: unknown }).theme = 'SYN-NEON';
      s.prompts = [{
        id: 'syn-prompt-1',
        title: 'Syn Prompt',
        body: 'syn-body',
        tags: 'SYN-NOT-ARRAY' as unknown as string[],
        versions: [],
      } as never];
    });
    const message = result.recovery.message;
    expect(message).toContain('prompts');
    expect(message).toContain('settings');
    expect(message).not.toContain('settings.theme');
    expect(message).not.toMatch(/\[\d+\]/);
    expect(message).not.toMatch(/\w+\.\w+\b.*\)/); // no dotted property paths in the damage list
    expect(message).not.toContain('SYN-NEON');
    expect(message).not.toContain('SYN-NOT-ARRAY');
    expect(message).not.toContain(STORAGE_KEY);
  });
});

describe('preservation failure suppresses persistence', () => {
  it('when the raw original cannot be preserved, nothing is overwritten and saving is paused', () => {
    storage.setFailRecoveryWrites(true);
    const { raw, result } = boot((s) => {
      s.priorities = [
        validPriority('syn-p1', 1),
        { ...validPriority('syn-p2', 2), rank: 'SYN-BAD-RANK' } as unknown as Priority,
      ];
    });
    expect(result.recovery.rawPreserved).toBe(false);
    expect(result.recovery.canPersist).toBe(false);
    // The stored original is byte-identical — never overwritten.
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
    // In-memory state is still safely representable (quarantined view).
    expect(result.state!.priorities.map((p) => p.id)).toEqual(['syn-p1']);
  });
});

describe('privacy — recovery reporting is counts/categories only', () => {
  it('messages and console output name collections and counts, never record contents', () => {
    const { result } = boot((s) => {
      s.priorities = [
        validPriority('syn-p1', 1),
        { ...validPriority('syn-p2', 2), label: 'SYN-PRIVATE-LABEL-XYZ' as unknown as string, rank: 'SYN-BAD-RANK' as unknown as number },
      ];
      s.openLoops = [{ ...validLoop('syn-l1'), status: 'SYN-SECRET-STATUS' } as unknown as OpenLoop];
    });
    // The collection names and quarantine counts are reported…
    expect(result.recovery.message).toMatch(/priorities/);
    expect(result.recovery.message).toMatch(/openLoops/);
    expect(result.recovery.message).toMatch(/\b1\b/);
    // …but no record contents, field values, or ids ever appear.
    const everything = result.recovery.message + '\n' + consoleLines.join('\n');
    for (const secret of ['SYN-PRIVATE-LABEL-XYZ', 'SYN-BAD-RANK', 'SYN-SECRET-STATUS', 'syn-p2', 'syn-l1']) {
      expect(everything).not.toContain(secret);
    }
  });
});
