import { describe, expect, it } from 'vitest';
import type { AppState, ExecutionRecord } from '../types';
import { inspectStructure, normalizeState } from '../storage/localStore';
import { parseImport, serializeState } from '../storage/exportImport';
import { buildDefaultState } from '../../data/defaultState';
import { addApprovalGate, addEvidence, applyTransition, createExecutionRecord, decideApprovalGate } from '../agents/executionRecords';

/** Synthetic privacy marker — must never appear in import diagnostics. */
const PRIV = 'ZZPRIV';

const T0 = '2026-07-19T10:00:00.000Z';
const T1 = '2026-07-19T10:01:00.000Z';

function sampleRecord(): ExecutionRecord {
  let record = createExecutionRecord(
    {
      title: 'Synthetic task',
      objective: 'Synthetic objective.',
      scope: 'Synthetic scope.',
      stopConditions: 'Synthetic stop conditions.',
      targetService: 'codex',
      model: 'syn-model',
      sessionMode: 'plan_only',
      authority: { editCode: true },
    },
    T0,
    'exec0000001',
  );
  record = applyTransition(record, 'ready', T0);
  record = applyTransition(record, 'in_progress', T0);
  record = addEvidence(record, 'commit', 'syn-sha-1234', T1, 'ev-1');
  record = addApprovalGate(record, 'Synthetic gate', T1, 'g-1');
  record = decideApprovalGate(record, 'g-1', 'approved', T1);
  return record;
}

/** A minimal legacy-shaped state (predates artifacts/executionRecords/healthProfile). */
function legacyState(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    priorities: [{ id: 'p1', label: 'SENTINEL-PRIORITY', rank: 1 }],
    openLoops: [],
    reminders: [],
    projects: [],
    prompts: [],
    contextItems: [],
    handoffs: [],
    auditLog: [],
    settings: { theme: 'dark' },
  };
}

function envelope(state: unknown): string {
  return JSON.stringify({ app: 'davidos', exportedAt: T0, schemaVersion: 1, state });
}

describe('executionRecords persistence & normalization (DOS-AGT-001A)', () => {
  it('buildDefaultState initializes executionRecords to [] (reset semantics)', () => {
    expect(buildDefaultState().executionRecords).toEqual([]);
  });

  it('normalizeState backfills a missing legacy field to [] and preserves unrelated data', () => {
    const legacy = legacyState() as unknown as AppState;
    const normalized = normalizeState(legacy);
    expect(normalized.executionRecords).toEqual([]);
    expect(normalized.priorities).toEqual([{ id: 'p1', label: 'SENTINEL-PRIORITY', rank: 1 }]);
  });

  it('normalizeState preserves valid execution records exactly', () => {
    const record = sampleRecord();
    const state = { ...buildDefaultState(), executionRecords: [record] };
    const normalized = normalizeState(JSON.parse(JSON.stringify(state)) as AppState);
    expect(normalized.executionRecords).toEqual(JSON.parse(JSON.stringify([record])));
  });

  it('inspectStructure classifies missing vs invalid executionRecords', () => {
    const missing = inspectStructure(legacyState() as unknown as AppState);
    expect(missing.missing).toContain('executionRecords');
    expect(missing.invalid).not.toContain('executionRecords');

    const wrongType = inspectStructure({ ...legacyState(), executionRecords: 'oops' } as unknown as AppState);
    expect(wrongType.invalid).toContain('executionRecords');

    const badItems = inspectStructure({ ...legacyState(), executionRecords: [null, 42] } as unknown as AppState);
    expect(badItems.invalid).toContain('executionRecords');
  });
});

describe('executionRecords import/export (DOS-AGT-001A)', () => {
  it('a legacy backup without executionRecords imports successfully as []', () => {
    const imported = parseImport(envelope(legacyState()));
    expect(imported.executionRecords).toEqual([]);
    expect(imported.priorities[0].label).toBe('SENTINEL-PRIORITY');
  });

  it('export → import round-trips records with nested evidence and gates exactly', () => {
    const record = sampleRecord();
    const state: AppState = { ...buildDefaultState(), executionRecords: [record] };
    const imported = parseImport(serializeState(state));
    expect(imported.executionRecords).toEqual(JSON.parse(JSON.stringify([record])));
    expect(imported.executionRecords[0].evidence).toHaveLength(1);
    expect(imported.executionRecords[0].approvalGates[0].decision).toBe('approved');
    expect(imported.executionRecords[0].authority.editCode).toBe(true);
    expect(imported.executionRecords[0].authority.merge).toBe(false);
  });

  it('rejects a backup whose executionRecords collection is not an array', () => {
    expect(() => parseImport(envelope({ ...legacyState(), executionRecords: {} })))
      .toThrow(/executionRecords must be an array/);
  });

  it('rejects malformed records with value-free diagnostics and applies nothing', () => {
    const malformed = {
      ...legacyState(),
      executionRecords: [
        {
          id: 'exec-bad',
          executionAgentId: 'coding-coordinator',
          title: `${PRIV}-title`,
          objective: `${PRIV}-objective`,
          scope: `${PRIV}-scope`,
          stopConditions: `${PRIV}-stop`,
          targetService: `${PRIV}-service`,
          model: `${PRIV}-model`,
          sessionMode: 'plan_only',
          authority: { editCode: 'yes' },
          status: 'completed', // terminal, but no evidence and no closedAt
          evidence: [],
          approvalGates: [],
          createdAt: T0,
          updatedAt: T0,
        },
      ],
    };
    let message = '';
    try {
      parseImport(envelope(malformed));
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('invalid data and was not imported');
    expect(message).toContain('executionRecords[0]');
    expect(message).not.toContain(PRIV);
  });

  it('rejects imported ids outside the generated-id grammar without echoing them', () => {
    for (const hostile of [
      `C:\\repos\\${PRIV}\\file.ts`,
      `https://example.com/${PRIV}`,
      `feature/${PRIV}-branch`,
      `ghp_${PRIV}TOKEN`,
    ]) {
      const record = { ...JSON.parse(JSON.stringify(sampleRecord())), id: hostile };
      let message = '';
      try {
        parseImport(envelope({ ...legacyState(), executionRecords: [record] }));
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toContain('generated-id grammar');
      expect(message).not.toContain(PRIV);
    }
  });

  it('rejects duplicate record ids at import', () => {
    const record = JSON.parse(JSON.stringify(sampleRecord()));
    expect(() =>
      parseImport(envelope({ ...legacyState(), executionRecords: [record, record] })),
    ).toThrow(/duplicates the id/);
  });

  it('rejects a record whose summaries contradict its status', () => {
    const record = { ...JSON.parse(JSON.stringify(sampleRecord())), blockerSummary: 'stale text' };
    expect(() =>
      parseImport(envelope({ ...legacyState(), executionRecords: [record] })),
    ).toThrow(/"blockerSummary" must be cleared outside blocked/);
  });

  it('serializeState includes executionRecords with the full state', () => {
    const state: AppState = { ...buildDefaultState(), executionRecords: [sampleRecord()] };
    const parsed = JSON.parse(serializeState(state));
    expect(parsed.state.executionRecords).toHaveLength(1);
    expect(parsed.state.executionRecords[0].id).toBe('exec0000001');
  });
});
