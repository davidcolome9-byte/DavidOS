import { describe, expect, it } from 'vitest';
import type { AppState, WorkflowArtifact } from '../types';
import { STORAGE_KEY, RECOVERY_KEY_PREFIX } from '../storage/localStore';
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

describe('measureStorageUsage', () => {
  it('measures the serialized state including the storage key itself', () => {
    const state = baseState();
    const usage = measureStorageUsage(state, null);
    expect(usage.stateUnits).toBe(STORAGE_KEY.length + JSON.stringify(state).length);
    expect(usage.totalUnits).toBe(usage.stateUnits);
    expect(usage.quotaUnits).toBe(QUOTA_UNITS_ESTIMATE);
    expect(usage.level).toBe('ok');
  });

  it('breaks usage down per collection with counts, largest first', () => {
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

  it('counts recovery blobs and the health draft from storage', () => {
    const recoveryKey = `${RECOVERY_KEY_PREFIX}2026-01-01`;
    const reader = fakeReader({
      [recoveryKey]: 'R'.repeat(100),
      [HEALTH_DRAFT_KEY]: 'D'.repeat(40),
      'unrelated-key': 'ignored',
    });
    const usage = measureStorageUsage(baseState(), reader);
    expect(usage.recoveryCount).toBe(1);
    expect(usage.recoveryUnits).toBe(recoveryKey.length + 100);
    expect(usage.draftUnits).toBe(HEALTH_DRAFT_KEY.length + 40);
    expect(usage.totalUnits).toBe(usage.stateUnits + usage.recoveryUnits + usage.draftUnits);
  });

  it('a huge state crosses warning then critical levels', () => {
    const warnState = baseState({
      artifacts: [artifact('a1', '2026-01-01T00:00:00.000Z', 'X'.repeat(Math.ceil(QUOTA_UNITS_ESTIMATE * 0.75)))],
    });
    expect(measureStorageUsage(warnState, null).level).toBe('warning');
    const critState = baseState({
      artifacts: [artifact('a1', '2026-01-01T00:00:00.000Z', 'X'.repeat(Math.ceil(QUOTA_UNITS_ESTIMATE * 0.95)))],
    });
    expect(measureStorageUsage(critState, null).level).toBe('critical');
  });

  it('survives a throwing storage reader (reports state size only)', () => {
    const reader: StorageReader = {
      get length(): number { throw new Error('unavailable'); },
      key: () => { throw new Error('unavailable'); },
      getItem: () => { throw new Error('unavailable'); },
    };
    const usage = measureStorageUsage(baseState(), reader);
    expect(usage.recoveryUnits).toBe(0);
    expect(usage.draftUnits).toBe(0);
    expect(usage.totalUnits).toBe(usage.stateUnits);
  });
});

describe('usageLevel', () => {
  it('maps fractions to levels at the documented thresholds', () => {
    expect(usageLevel(0)).toBe('ok');
    expect(usageLevel(WARNING_THRESHOLD - 0.001)).toBe('ok');
    expect(usageLevel(WARNING_THRESHOLD)).toBe('warning');
    expect(usageLevel(CRITICAL_THRESHOLD - 0.001)).toBe('warning');
    expect(usageLevel(CRITICAL_THRESHOLD)).toBe('critical');
    expect(usageLevel(1.5)).toBe('critical');
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
