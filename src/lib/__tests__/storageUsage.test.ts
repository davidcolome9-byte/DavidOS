import { describe, expect, it } from 'vitest';
import type { AppState, WorkflowArtifact } from '../types';
import { STORAGE_KEY, RECOVERY_KEY_PREFIX } from '../storage/localStore';
import {
  JOURNAL_GENERATION_PREFIX,
  JOURNAL_HEAD_KEYS,
  LEGACY_STATE_KEY,
} from '../storage/stateJournal';
import { HEALTH_DRAFT_KEY } from '../health/profileDraft';
import {
  CRITICAL_THRESHOLD,
  QUOTA_UNITS_ESTIMATE,
  WARNING_THRESHOLD,
  formatUnits,
  measureStorageUsage,
  planArtifactPrune,
  usageLevel,
} from '../storage/storageUsage';
import type { StorageReader } from '../storage/storageUsage';

// OL-003: measurement and prune planning are pure and destructive-free —
// nothing in this module may delete anything. All fixture values synthetic.

function baseState(overrides: Partial<AppState> = {}): AppState {
  return {
    schemaVersion: 1,
    priorities: [],
    openLoops: [],
    reminders: [],
    projects: [],
    prompts: [],
    contextItems: [],
    handoffs: [],
    artifacts: [],
    executionRecords: [],
    healthProfile: null,
    auditLog: [],
    settings: { theme: 'dark' },
    ...overrides,
  };
}

function artifact(id: string, createdAt: string, content = 'SYN-CONTENT'): WorkflowArtifact {
  return { id, workflowId: 'syn-wf', artifactType: 'full_prompt', createdAt, content };
}

function fakeReader(entries: Record<string, string>): StorageReader {
  const keys = Object.keys(entries);
  return {
    length: keys.length,
    key: (i) => keys[i] ?? null,
    getItem: (k) => (k in entries ? entries[k] : null),
  };
}

const gen = (id: string) => `${JOURNAL_GENERATION_PREFIX}${id}`;
const rec = (suffix: string) => `${RECOVERY_KEY_PREFIX}${suffix}`;
const sumEntries = (entries: Record<string, string>) =>
  Object.entries(entries).reduce((sum, [k, v]) => sum + k.length + v.length, 0);

/** A reader whose enumerated total (keys + values) is EXACTLY `totalUnits`. */
function readerWithTotal(totalUnits: number): StorageReader {
  const key = gen('sized-generation-0001');
  return fakeReader({ [key]: 'X'.repeat(totalUnits - key.length) });
}

describe('measureStorageUsage — total same-origin accounting (DOS-STAB-002A P1)', () => {
  it('breaks the live state down per collection with counts, largest first (display only)', () => {
    const state = baseState({
      artifacts: [artifact('a1', '2026-01-01T00:00:00.000Z', 'X'.repeat(5000))],
      handoffs: [],
    });
    const usage = measureStorageUsage(state, null);
    const art = usage.collections.find((c) => c.key === 'artifacts')!;
    expect(art.count).toBe(1);
    expect(art.units).toBe(JSON.stringify(state.artifacts).length);
    expect(usage.collections[0].key).toBe('artifacts'); // largest first
    const sizes = usage.collections.map((c) => c.units);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
  });

  it('sums the estimated total across a representative journal layout, each key counted once', () => {
    // Retained generations, both journal heads, the legacy key, multiple
    // recovery blobs, the health draft, and unrelated same-origin keys — the
    // full set of things that consume this origin's quota. Values synthetic.
    const genCurrent = gen('generation-current-0001');
    const genPrevious = gen('generation-previous-0001');
    const recoveryA = rec('2026-01-01T00-00-00-000Z');
    const recoveryB = rec('2026-02-02T00-00-00-000Z');
    const entries: Record<string, string> = {
      [genCurrent]: 'G'.repeat(4000),
      [genPrevious]: 'g'.repeat(3200),
      [JOURNAL_HEAD_KEYS[0]]: 'H'.repeat(180),
      [JOURNAL_HEAD_KEYS[1]]: 'h'.repeat(175),
      [LEGACY_STATE_KEY]: 'L'.repeat(2500),
      [recoveryA]: 'R'.repeat(900),
      [recoveryB]: 'r'.repeat(150),
      [HEALTH_DRAFT_KEY]: 'D'.repeat(220),
      'davidos-unrelated-widget': 'U'.repeat(64),
      'third-party.analytics': 'T'.repeat(48),
    };
    const usage = measureStorageUsage(baseState(), fakeReader(entries));

    expect(usage.measured).toBe(true);
    expect(usage.generationCount).toBe(2);
    expect(usage.generationUnits).toBe((genCurrent.length + 4000) + (genPrevious.length + 3200));
    expect(usage.headCount).toBe(2);
    expect(usage.headUnits).toBe(
      (JOURNAL_HEAD_KEYS[0].length + 180) + (JOURNAL_HEAD_KEYS[1].length + 175),
    );
    expect(usage.legacyUnits).toBe(LEGACY_STATE_KEY.length + 2500);
    expect(usage.recoveryCount).toBe(2);
    expect(usage.recoveryUnits).toBe((recoveryA.length + 900) + (recoveryB.length + 150));
    expect(usage.draftUnits).toBe(HEALTH_DRAFT_KEY.length + 220);
    expect(usage.otherCount).toBe(2);
    expect(usage.otherUnits).toBe(
      ('davidos-unrelated-widget'.length + 64) + ('third-party.analytics'.length + 48),
    );
    // Total = every entry summed once (key + value units).
    expect(usage.totalUnits).toBe(sumEntries(entries));
  });

  it('does not double-count and uses consistent key+value units across all buckets', () => {
    const entries: Record<string, string> = {
      [gen('generation-current-0001')]: 'G'.repeat(1000),
      [gen('generation-previous-0001')]: 'g'.repeat(1000),
      [JOURNAL_HEAD_KEYS[0]]: 'H'.repeat(100),
      [LEGACY_STATE_KEY]: 'L'.repeat(500),
      // A recovery key STARTS WITH the legacy key string — it must classify as
      // recovery (its own prefix), never fall through to the legacy bucket.
      [rec('collision-check')]: 'R'.repeat(300),
      [HEALTH_DRAFT_KEY]: 'D'.repeat(40),
      'unrelated-key': 'U'.repeat(30),
    };
    const usage = measureStorageUsage(baseState(), fakeReader(entries));
    // Buckets exactly partition the measured total: no value counted twice.
    const bucketSum = usage.generationUnits + usage.headUnits + usage.legacyUnits +
      usage.recoveryUnits + usage.draftUnits + usage.otherUnits;
    expect(bucketSum).toBe(usage.totalUnits);
    expect(usage.totalUnits).toBe(sumEntries(entries));
    // The recovery-key-starting-with-legacy-key is counted as recovery only.
    expect(usage.recoveryCount).toBe(1);
    expect(usage.recoveryUnits).toBe(rec('collision-check').length + 300);
    expect(usage.legacyUnits).toBe(LEGACY_STATE_KEY.length + 500);
    // The measured total is the actual stored bytes, NOT the single logical
    // copy of state — proving classification is not driven by stateUnits.
    expect(usage.totalUnits).not.toBe(usage.stateUnits);
    expect(usage.measured).toBe(true);
  });

  it('classifies below / at / between / above the 35% and 45% thresholds on the measured total', () => {
    const at = (fraction: number) => Math.round(QUOTA_UNITS_ESTIMATE * fraction);
    // Below 35% → ok.
    expect(measureStorageUsage(baseState(), readerWithTotal(at(0.34))).level).toBe('ok');
    // Exactly 35% (an exact byte boundary: 0.35 × 5 MiB is an integer) → warning.
    expect(QUOTA_UNITS_ESTIMATE * 0.35).toBe(1835008);
    expect(measureStorageUsage(baseState(), readerWithTotal(1835008)).level).toBe('warning');
    // Between 35% and 45% → warning.
    expect(measureStorageUsage(baseState(), readerWithTotal(at(0.40))).level).toBe('warning');
    // Exactly 45% → critical.
    expect(QUOTA_UNITS_ESTIMATE * 0.45).toBe(2359296);
    expect(measureStorageUsage(baseState(), readerWithTotal(2359296)).level).toBe('critical');
    // Above 45% → critical.
    expect(measureStorageUsage(baseState(), readerWithTotal(at(0.50))).level).toBe('critical');
  });

  it('classifies on the raw unrounded measured fraction, not the rounded display percentage', () => {
    // A total whose fraction is 0.346 rounds to 35% for DISPLAY but is below the
    // 0.35 warning threshold — classification must stay ok.
    const total = Math.round(QUOTA_UNITS_ESTIMATE * 0.346);
    const usage = measureStorageUsage(baseState(), readerWithTotal(total));
    expect(Math.round(usage.usedFraction * 100)).toBe(35);
    expect(usage.usedFraction).toBeLessThan(WARNING_THRESHOLD);
    expect(usage.level).toBe('ok');
  });

  it('null storage falls back deterministically to the single serialized copy of state', () => {
    const state = baseState();
    const usage = measureStorageUsage(state, null);
    expect(usage.measured).toBe(false);
    expect(usage.stateUnits).toBe(STORAGE_KEY.length + JSON.stringify(state).length);
    expect(usage.totalUnits).toBe(usage.stateUnits);
    expect(usage.quotaUnits).toBe(QUOTA_UNITS_ESTIMATE);
    expect(usage.generationUnits).toBe(0);
    expect(usage.level).toBe('ok');
  });

  it('a throwing storage reader degrades safely: buckets zeroed, total = single-copy fallback, ok', () => {
    // DOS-STAB-002A: when the origin cannot be enumerated, classification must
    // degrade to the measurable state size — never over-report a partial tally.
    const reader: StorageReader = {
      get length(): number { throw new Error('unavailable'); },
      key: () => { throw new Error('unavailable'); },
      getItem: () => { throw new Error('unavailable'); },
    };
    const usage = measureStorageUsage(baseState(), reader);
    expect(usage.measured).toBe(false);
    expect(usage.generationUnits).toBe(0);
    expect(usage.recoveryUnits).toBe(0);
    expect(usage.draftUnits).toBe(0);
    expect(usage.otherUnits).toBe(0);
    expect(usage.totalUnits).toBe(usage.stateUnits);
    expect(usage.level).toBe('ok');
  });

  it('a mid-enumeration read failure discards the partial tally and falls back', () => {
    // key() enumerates fine but getItem throws — a partial sum must never leak
    // into totalUnits; the whole measurement falls back to the single copy.
    const reader: StorageReader = {
      length: 2,
      key: (i) => [gen('generation-current-0001'), HEALTH_DRAFT_KEY][i] ?? null,
      getItem: () => { throw new Error('read blocked'); },
    };
    const usage = measureStorageUsage(baseState(), reader);
    expect(usage.measured).toBe(false);
    expect(usage.generationUnits).toBe(0);
    expect(usage.draftUnits).toBe(0);
    expect(usage.totalUnits).toBe(usage.stateUnits);
  });

  it('key(index) returning null before length is reached discards the partial tally and falls back', () => {
    // The reader promises 4 entries but enumeration dries up at index 2 (the
    // origin changed under the read, or the reader is unreliable). The two
    // entries already tallied are a PARTIAL view of the origin — reporting them
    // as a measured total would under-report real usage, so they are discarded.
    const bigA = gen('generation-current-0001');
    const bigB = gen('generation-previous-0001');
    const entries: Record<string, string> = {
      [bigA]: 'G'.repeat(Math.ceil(QUOTA_UNITS_ESTIMATE * 0.20)),
      [bigB]: 'g'.repeat(Math.ceil(QUOTA_UNITS_ESTIMATE * 0.20)),
    };
    const enumerated: string[] = [];
    const truncating: StorageReader = {
      length: 4, // claims 4 keys…
      key: (i) => {
        const k = Object.keys(entries)[i] ?? null; // …but only yields 2
        if (k !== null) enumerated.push(k);
        return k;
      },
      getItem: (k) => (k in entries ? entries[k] : null),
    };
    const state = baseState();
    const usage = measureStorageUsage(state, truncating);

    // Enumeration really did start and really did stop short.
    expect(enumerated).toEqual([bigA, bigB]);
    // Reported as unavailable/incomplete through the existing contract.
    expect(usage.measured).toBe(false);
    // No partial measured total survives — every bucket is zeroed.
    expect(usage.generationUnits).toBe(0);
    expect(usage.generationCount).toBe(0);
    expect(usage.headUnits).toBe(0);
    expect(usage.headCount).toBe(0);
    expect(usage.legacyUnits).toBe(0);
    expect(usage.recoveryUnits).toBe(0);
    expect(usage.recoveryCount).toBe(0);
    expect(usage.draftUnits).toBe(0);
    expect(usage.otherUnits).toBe(0);
    expect(usage.otherCount).toBe(0);
    // The deterministic single-copy fallback is used instead.
    expect(usage.totalUnits).toBe(usage.stateUnits);
    expect(usage.stateUnits).toBe(STORAGE_KEY.length + JSON.stringify(state).length);
    // The partial tally (~40% of quota) never leaks into classification.
    expect(usage.totalUnits).toBeLessThan(sumEntries(entries));
    expect(usage.level).toBe('ok');
    // Measurement stayed read-only: the fixture is untouched.
    expect(Object.keys(entries)).toEqual([bigA, bigB]);
    expect(entries[bigA].length).toBe(Math.ceil(QUOTA_UNITS_ESTIMATE * 0.20));
  });

  it('getItem returning null for an enumerated key discards the partial tally and falls back', () => {
    // Every index yields a key, but one enumerated key has no readable value
    // (removed between key() and getItem(), or an unreliable reader). Counting
    // it as 0 units would silently under-report, so the whole measurement is
    // treated as unreliable.
    const first = gen('generation-current-0001');
    const vanished = gen('generation-previous-0001');
    const third = HEALTH_DRAFT_KEY;
    const values: Record<string, string> = {
      [first]: 'G'.repeat(Math.ceil(QUOTA_UNITS_ESTIMATE * 0.30)),
      [third]: 'D'.repeat(256),
    };
    const keys = [first, vanished, third];
    const read: string[] = [];
    const holed: StorageReader = {
      length: keys.length,
      key: (i) => keys[i] ?? null,
      getItem: (k) => {
        read.push(k);
        return k in values ? values[k] : null; // `vanished` reads back null
      },
    };
    const state = baseState();
    const usage = measureStorageUsage(state, holed);

    // It stopped at the unreadable key rather than skipping past it.
    expect(read).toEqual([first, vanished]);
    // Reported as unavailable/incomplete through the existing contract.
    expect(usage.measured).toBe(false);
    // No partial measured total survives — including the first key's real size.
    expect(usage.generationUnits).toBe(0);
    expect(usage.generationCount).toBe(0);
    expect(usage.headUnits).toBe(0);
    expect(usage.headCount).toBe(0);
    expect(usage.legacyUnits).toBe(0);
    expect(usage.recoveryUnits).toBe(0);
    expect(usage.recoveryCount).toBe(0);
    expect(usage.draftUnits).toBe(0);
    expect(usage.otherUnits).toBe(0);
    expect(usage.otherCount).toBe(0);
    // The deterministic single-copy fallback is used instead.
    expect(usage.totalUnits).toBe(usage.stateUnits);
    expect(usage.stateUnits).toBe(STORAGE_KEY.length + JSON.stringify(state).length);
    expect(usage.totalUnits).toBeLessThan(values[first].length);
    expect(usage.level).toBe('ok');
    // Measurement stayed read-only: the backing fixture is unmodified.
    expect(keys).toEqual([first, vanished, third]);
    expect(Object.keys(values)).toEqual([first, third]);
  });

  it('the deterministic fallback still classifies a genuinely huge single copy', () => {
    // With no reader, a single serialized copy that alone exceeds the bands is
    // still surfaced — the fallback is safe, not silently always-ok.
    const warnState = baseState({
      artifacts: [artifact('a1', '2026-01-01T00:00:00.000Z', 'X'.repeat(Math.ceil(QUOTA_UNITS_ESTIMATE * 0.40)))],
    });
    expect(measureStorageUsage(warnState, null).level).toBe('warning');
    const critState = baseState({
      artifacts: [artifact('a1', '2026-01-01T00:00:00.000Z', 'X'.repeat(Math.ceil(QUOTA_UNITS_ESTIMATE * 0.50)))],
    });
    expect(measureStorageUsage(critState, null).level).toBe('critical');
  });
});

describe('usageLevel (DOS-STAB-002A Stage 1 journal-adjusted thresholds)', () => {
  it('pins the approved journal-adjusted threshold constants', () => {
    // OL-032 Option 1: 70%/90% single-key levels halved for the second
    // redundant generation a durable commit needs.
    expect(WARNING_THRESHOLD).toBe(0.35);
    expect(CRITICAL_THRESHOLD).toBe(0.45);
  });

  it('below 35% is normal (ok)', () => {
    expect(usageLevel(0)).toBe('ok');
    expect(usageLevel(0.34)).toBe('ok');
    expect(usageLevel(0.3499)).toBe('ok');
  });

  it('exactly 35% is warning', () => {
    expect(usageLevel(0.35)).toBe('warning');
  });

  it('values between 35% and 45% are warning', () => {
    expect(usageLevel(0.3501)).toBe('warning');
    expect(usageLevel(0.40)).toBe('warning');
    expect(usageLevel(0.4499)).toBe('warning');
  });

  it('exactly 45% is critical', () => {
    expect(usageLevel(0.45)).toBe('critical');
  });

  it('above 45% is critical', () => {
    expect(usageLevel(0.4501)).toBe('critical');
    expect(usageLevel(0.9)).toBe('critical');
    expect(usageLevel(1.5)).toBe('critical');
  });

  it('classifies on the unrounded underlying value, not a rounded percentage', () => {
    // 0.346 rounds to 35% for DISPLAY but is below the 0.35 warning
    // threshold, so classification stays ok — proving the raw fraction,
    // not Math.round(fraction*100), drives the level.
    expect(Math.round(0.346 * 100)).toBe(35);
    expect(usageLevel(0.346)).toBe('ok');
    // Likewise just under critical: displays as 45% but stays warning.
    expect(Math.round(0.4467 * 100)).toBe(45);
    expect(usageLevel(0.4467)).toBe('warning');
  });

  it('keeps level and threshold constants mutually consistent', () => {
    expect(usageLevel(WARNING_THRESHOLD - 0.0001)).toBe('ok');
    expect(usageLevel(WARNING_THRESHOLD)).toBe('warning');
    expect(usageLevel(CRITICAL_THRESHOLD - 0.0001)).toBe('warning');
    expect(usageLevel(CRITICAL_THRESHOLD)).toBe('critical');
  });
});

describe('formatUnits', () => {
  it('formats B, KB and MB', () => {
    expect(formatUnits(0)).toBe('0 B');
    expect(formatUnits(512)).toBe('512 B');
    expect(formatUnits(2048)).toBe('2.0 KB');
    expect(formatUnits(3 * 1024 * 1024)).toBe('3.00 MB');
  });
});

describe('planArtifactPrune', () => {
  const newest = artifact('new', '2026-03-01T00:00:00.000Z');
  const middle = artifact('mid', '2026-02-01T00:00:00.000Z');
  const oldest = artifact('old', '2026-01-01T00:00:00.000Z');

  it('is a no-op plan when the list fits within keepCount', () => {
    const plan = planArtifactPrune([newest, oldest], 5);
    expect(plan.keep).toEqual([newest, oldest]);
    expect(plan.prune).toEqual([]);
    expect(plan.freedUnits).toBe(0);
  });

  it('keeps the newest N by createdAt and prunes the oldest', () => {
    // Stored newest-first, but plan must be order-independent.
    const plan = planArtifactPrune([middle, newest, oldest], 2);
    expect(plan.keep.map((a) => a.id)).toEqual(['mid', 'new']);
    expect(plan.prune.map((a) => a.id)).toEqual(['old']);
    expect(plan.freedUnits).toBe(JSON.stringify([oldest]).length);
  });

  it('preserves the original array order among kept artifacts', () => {
    const plan = planArtifactPrune([newest, middle, oldest], 2);
    expect(plan.keep.map((a) => a.id)).toEqual(['new', 'mid']);
  });

  it('keepCount 0 prunes everything; negative and fractional counts are clamped', () => {
    expect(planArtifactPrune([newest, oldest], 0).prune).toHaveLength(2);
    expect(planArtifactPrune([newest, oldest], -3).prune).toHaveLength(2);
    expect(planArtifactPrune([newest, middle, oldest], 1.9).keep.map((a) => a.id)).toEqual(['new']);
  });

  it('artifacts with missing/invalid createdAt are pruned before dated ones', () => {
    const undated = { ...artifact('undated', ''), createdAt: undefined } as unknown as WorkflowArtifact;
    const plan = planArtifactPrune([undated, newest, oldest], 2);
    expect(plan.keep.map((a) => a.id)).toEqual(['new', 'old']);
    expect(plan.prune.map((a) => a.id)).toEqual(['undated']);
  });

  it('breaks createdAt ties by array position (earlier = newer, matching prepend order)', () => {
    const twinA = artifact('twin-a', '2026-02-01T00:00:00.000Z');
    const twinB = artifact('twin-b', '2026-02-01T00:00:00.000Z');
    const plan = planArtifactPrune([twinA, twinB, oldest], 2);
    expect(plan.keep.map((a) => a.id)).toEqual(['twin-a', 'twin-b']);
  });

  it('never mutates its input', () => {
    const input = [newest, middle, oldest];
    const snapshot = [...input];
    planArtifactPrune(input, 1);
    expect(input).toEqual(snapshot);
  });
});
