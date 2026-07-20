import { describe, expect, it } from 'vitest';
import type { ExecutionRecord, ExecutionRecordStatus } from '../types';
import { CODING_COORDINATOR } from '../agents/executionAgentRegistry';
import { uid, nowIso } from '../types';
import {
  AUTHORITY_FIELDS,
  EXECUTION_RECORD_ID_PATTERN,
  EXECUTION_STATUSES,
  EXECUTION_TRANSITIONS,
  PACKET_HONESTY_NOTICE,
  isIsoTimestamp,
  addApprovalGate,
  addEvidence,
  applyTransition,
  canTransition,
  createExecutionRecord,
  decideApprovalGate,
  defaultAuthority,
  readinessErrors,
  renderExecutionPacket,
  sanitizeAuthority,
  transitionErrors,
  updateDraftFields,
  validateExecutionRecordUnknown,
  validateExecutionRecordsCollectionUnknown,
} from '../agents/executionRecords';

const T0 = '2026-07-19T10:00:00.000Z';
const T1 = '2026-07-19T10:01:00.000Z';
const T2 = '2026-07-19T10:02:00.000Z';
const T3 = '2026-07-19T10:03:00.000Z';

/** Synthetic privacy marker — must never appear in errors or audit output. */
const PRIV = 'ZZPRIV';

function fullDraft(id = 'rec00000001'): ExecutionRecord {
  return createExecutionRecord(
    {
      title: 'Fix widget parser',
      objective: 'Repair the tokenizer edge case.',
      scope: 'src/lib/parser only.',
      stopConditions: 'Stop on failed validation or scope expansion.',
      targetService: 'claude_code',
      model: 'model-label-x',
      sessionMode: 'supervised_implementation',
    },
    T0,
    id,
  );
}

/** Build a structurally valid record in the requested status. */
function recordIn(status: ExecutionRecordStatus): ExecutionRecord {
  const draft = fullDraft();
  if (status === 'draft') return draft;
  const ready = applyTransition(draft, 'ready', T1);
  if (status === 'ready') return ready;
  let inProgress = applyTransition(ready, 'in_progress', T1);
  inProgress = addEvidence(inProgress, 'test_run', 'unit suite green', T2, 'ev-1');
  if (status === 'in_progress') return inProgress;
  if (status === 'blocked') return applyTransition(inProgress, 'blocked', T2, { blockerSummary: 'blocked on env' });
  if (status === 'awaiting_approval') {
    return applyTransition(inProgress, 'awaiting_approval', T2, { decisionSummary: 'need a call' });
  }
  if (status === 'completed') return applyTransition(inProgress, 'completed', T3);
  return applyTransition(inProgress, 'cancelled', T3); // cancelled
}

describe('construction & authority', () => {
  it('every authority value defaults to not authorized', () => {
    const record = fullDraft();
    for (const field of AUTHORITY_FIELDS) {
      expect(record.authority[field.key]).toBe(false);
    }
    expect(Object.values(defaultAuthority()).every((v) => v === false)).toBe(true);
    expect(AUTHORITY_FIELDS.map((f) => f.key).sort()).toEqual(
      ['editCode', 'editDocs', 'merge', 'openPullRequests', 'push', 'runTests'],
    );
  });

  it('only actual booleans on recognized keys can modify authority defaults', () => {
    expect(sanitizeAuthority({ editCode: true, runTests: false }).editCode).toBe(true);
    const attacked = sanitizeAuthority({
      editCode: 'true',
      runTests: 1,
      editDocs: {},
      push: [],
      openPullRequests: 'yes',
      merge: null,
      all: true,
      fullAccess: true,
      standard: true,
      unknownKey: true,
    });
    expect(Object.values(attacked).every((v) => v === false)).toBe(true);
    expect(Object.keys(attacked).sort()).toEqual(
      ['editCode', 'editDocs', 'merge', 'openPullRequests', 'push', 'runTests'],
    );
    expect(sanitizeAuthority(null)).toEqual(defaultAuthority());
    expect(sanitizeAuthority(['editCode'])).toEqual(defaultAuthority());
    expect(sanitizeAuthority('all')).toEqual(defaultAuthority());
  });

  it('rejects invalid service, mode, id, and timestamp at runtime', () => {
    const base = {
      targetService: 'claude_code',
      sessionMode: 'plan_only',
    } as const;
    expect(() =>
      createExecutionRecord({ ...base, targetService: 'skynet' as never }, T0, 'testid0001'),
    ).toThrow(/targetService/);
    expect(() =>
      createExecutionRecord({ ...base, sessionMode: 'yolo' as never }, T0, 'testid0001'),
    ).toThrow(/sessionMode/);
    expect(() => createExecutionRecord(base, 'not-a-date', 'testid0001')).toThrow(/ISO/);
    expect(() => createExecutionRecord(base, T0, '  ')).toThrow(/grammar/);
    // Ids outside the conservative generated-id grammar are rejected at
    // construction too — paths, URLs, and hyphenated labels never become ids.
    expect(() => createExecutionRecord(base, T0, 'rec-0001')).toThrow(/grammar/);
    expect(() => createExecutionRecord(base, T0, 'C:\\repo\\secret')).toThrow(/grammar/);
    expect(() => createExecutionRecord(base, T0, 'short')).toThrow(/grammar/);
  });

  it('supports deterministic id/time injection and trims text fields', () => {
    const a = createExecutionRecord(
      { title: '  padded  ', objective: ' o ', scope: ' s ', stopConditions: ' sc ', targetService: 'manual', model: ' m ', sessionMode: 'plan_only' },
      T0,
      'fixedid001',
    );
    expect(a.id).toBe('fixedid001');
    expect(a.createdAt).toBe(T0);
    expect(a.updatedAt).toBe(T0);
    expect(a.title).toBe('padded');
    expect(a.objective).toBe('o');
    expect(a.scope).toBe('s');
    expect(a.stopConditions).toBe('sc');
    expect(a.model).toBe('m');
    expect(a.status).toBe('draft');
    expect(a.closedAt).toBeUndefined();
  });
});

describe('readiness', () => {
  it('objective, scope, and stopConditions each fail readiness independently', () => {
    const base = fullDraft();
    expect(readinessErrors(base)).toEqual([]);
    const noObjective = updateDraftFields(base, { objective: '  ' }, T1);
    expect(readinessErrors(noObjective)).toEqual(['Objective is required.']);
    const noScope = updateDraftFields(base, { scope: '' }, T1);
    expect(readinessErrors(noScope)).toEqual(['Bounded scope is required.']);
    const noStop = updateDraftFields(base, { stopConditions: '   ' }, T1);
    expect(readinessErrors(noStop)).toEqual(['Stop conditions are required.']);
    const noTitle = updateDraftFields(base, { title: '' }, T1);
    expect(readinessErrors(noTitle)).toEqual(['Title is required.']);
  });

  it('draft → ready is refused until readiness passes', () => {
    const incomplete = updateDraftFields(fullDraft(), { scope: '' }, T1);
    expect(transitionErrors(incomplete, 'ready')).toContain('Bounded scope is required.');
    expect(() => applyTransition(incomplete, 'ready', T1)).toThrow(/Bounded scope/);
    expect(canTransition(fullDraft(), 'ready')).toBe(true);
  });
});

describe('lifecycle transition matrix', () => {
  const EXTRAS = { blockerSummary: 'b', decisionSummary: 'd' };
  for (const from of EXECUTION_STATUSES) {
    for (const to of EXECUTION_STATUSES) {
      const allowed = from !== to && EXECUTION_TRANSITIONS[from].includes(to);
      it(`${from} → ${to} is ${allowed ? 'allowed' : 'forbidden'}`, () => {
        const record = recordIn(from);
        expect(canTransition(record, to, EXTRAS)).toBe(allowed);
        if (!allowed) {
          expect(() => applyTransition(record, to, T3, EXTRAS)).toThrow(/Illegal execution record transition/);
        } else {
          expect(applyTransition(record, to, T3, EXTRAS).status).toBe(to);
        }
      });
    }
  }

  it('terminal records report a terminal-specific reason', () => {
    expect(transitionErrors(recordIn('completed'), 'in_progress')[0]).toMatch(/terminal/);
    expect(transitionErrors(recordIn('cancelled'), 'in_progress')[0]).toMatch(/terminal/);
  });
});

describe('transition guards & normalization', () => {
  it('blocked requires a nonblank blocker summary supplied with the transition', () => {
    const record = recordIn('in_progress');
    expect(canTransition(record, 'blocked')).toBe(false);
    expect(canTransition(record, 'blocked', { blockerSummary: '   ' })).toBe(false);
    const blocked = applyTransition(record, 'blocked', T3, { blockerSummary: '  env broken  ' });
    expect(blocked.blockerSummary).toBe('env broken');
  });

  it('awaiting_approval requires a nonblank decision summary', () => {
    const record = recordIn('in_progress');
    expect(canTransition(record, 'awaiting_approval')).toBe(false);
    const awaiting = applyTransition(record, 'awaiting_approval', T3, { decisionSummary: ' pick option A ' });
    expect(awaiting.decisionSummary).toBe('pick option A');
  });

  it('resuming to in_progress clears stale summaries and closedAt, keeping evidence', () => {
    const blocked = recordIn('blocked');
    const resumed = applyTransition(blocked, 'in_progress', T3);
    expect(resumed.blockerSummary).toBeUndefined();
    expect(resumed.decisionSummary).toBeUndefined();
    expect(resumed.closedAt).toBeUndefined();
    expect(resumed.evidence).toHaveLength(1);
    const awaiting = recordIn('awaiting_approval');
    const resumed2 = applyTransition(awaiting, 'in_progress', T3);
    expect(resumed2.decisionSummary).toBeUndefined();
  });

  it('blocked ↔ awaiting_approval cross-transitions replace the prior summary', () => {
    const blocked = recordIn('blocked');
    const nowAwaiting = applyTransition(blocked, 'awaiting_approval', T3, { decisionSummary: 'call it' });
    expect(nowAwaiting.blockerSummary).toBeUndefined();
    expect(nowAwaiting.decisionSummary).toBe('call it');
    const backToBlocked = applyTransition(nowAwaiting, 'blocked', T3, { blockerSummary: 'still stuck' });
    expect(backToBlocked.decisionSummary).toBeUndefined();
    expect(backToBlocked.blockerSummary).toBe('still stuck');
  });

  it('terminal transitions stamp closedAt and clear obsolete summaries', () => {
    const completed = applyTransition(recordIn('in_progress'), 'completed', T3, { outcomeSummary: ' done ' });
    expect(completed.closedAt).toBe(T3);
    expect(completed.blockerSummary).toBeUndefined();
    expect(completed.decisionSummary).toBeUndefined();
    expect(completed.outcomeSummary).toBe('done');
    const cancelled = applyTransition(recordIn('blocked'), 'cancelled', T3);
    expect(cancelled.closedAt).toBe(T3);
    expect(cancelled.blockerSummary).toBeUndefined();
  });

  it('ready → draft reopens editing; edits outside draft are rejected', () => {
    const ready = recordIn('ready');
    expect(() => updateDraftFields(ready, { title: 'nope' }, T2)).toThrow(/only while the record is a draft/);
    const draftAgain = applyTransition(ready, 'draft', T2);
    const edited = updateDraftFields(draftAgain, { title: 'New title' }, T2);
    expect(edited.title).toBe('New title');
    expect(() => updateDraftFields(recordIn('completed'), { title: 'x' }, T3)).toThrow();
  });
});

describe('completion invariants', () => {
  it('requires at least one valid evidence item', () => {
    const ready = applyTransition(fullDraft(), 'ready', T1);
    const noEvidence = applyTransition(ready, 'in_progress', T1);
    expect(transitionErrors(noEvidence, 'completed')).toContain(
      'Completion requires at least one valid evidence item.',
    );
    expect(() => applyTransition(noEvidence, 'completed', T3)).toThrow();
  });

  it('structurally invalid evidence cannot satisfy completion', () => {
    const base = recordIn('in_progress');
    const corrupted: ExecutionRecord = {
      ...base,
      evidence: [{ id: 'ev-bad', kind: 'note', reference: '   ', addedAt: T2 }],
    };
    const errors = transitionErrors(corrupted, 'completed');
    expect(errors).toContain('Completion requires at least one valid evidence item.');
  });

  it('pending gates block completion; decided gates (approved AND denied) do not', () => {
    let record = recordIn('in_progress');
    record = addApprovalGate(record, 'Confirm approach', T2, 'g-1');
    expect(transitionErrors(record, 'completed')).toContain(
      'Completion requires every approval gate to be decided.',
    );
    const approved = decideApprovalGate(record, 'g-1', 'approved', T2);
    expect(canTransition(approved, 'completed')).toBe(true);
    // Denied-gate policy: a denied gate is a RESOLVED decision — it does not
    // block completion of the remaining in-scope work.
    const denied = decideApprovalGate(record, 'g-1', 'denied', T2);
    expect(canTransition(denied, 'completed')).toBe(true);
  });
});

describe('evidence & approval-gate integrity', () => {
  it('rejects whitespace-only references, invalid kinds, and duplicate ids', () => {
    const record = recordIn('in_progress');
    expect(() => addEvidence(record, 'note', '   ', T2, 'e2')).toThrow(/non-blank/);
    expect(() => addEvidence(record, 'selfie' as never, 'x', T2, 'e2')).toThrow(/kind/);
    expect(() => addEvidence(record, 'note', 'x', 'bad-date', 'e2')).toThrow(/ISO/);
    expect(() => addEvidence(record, 'note', 'x', T2, 'ev-1')).toThrow(/unique/);
    expect(() => addApprovalGate(record, '   ', T2, 'g1')).toThrow(/non-blank/);
    const withGate = addApprovalGate(record, 'Gate', T2, 'g1');
    expect(() => addApprovalGate(withGate, 'Gate 2', T2, 'g1')).toThrow(/unique/);
  });

  it('an unknown gate id is a true no-op — same object, updatedAt unchanged', () => {
    const record = addApprovalGate(recordIn('in_progress'), 'Gate', T2, 'g1');
    const result = decideApprovalGate(record, 'no-such-gate', 'approved', T3);
    expect(result).toBe(record);
    expect(result.updatedAt).toBe(record.updatedAt);
  });

  it('an already-decided gate cannot be re-decided (true no-op)', () => {
    const record = decideApprovalGate(
      addApprovalGate(recordIn('in_progress'), 'Gate', T2, 'g1'),
      'g1',
      'approved',
      T2,
    );
    const again = decideApprovalGate(record, 'g1', 'denied', T3);
    expect(again).toBe(record);
    expect(again.approvalGates[0].decision).toBe('approved');
  });

  it('terminal records reject every mutation helper', () => {
    for (const status of ['completed', 'cancelled'] as const) {
      const record = recordIn(status);
      expect(() => addEvidence(record, 'note', 'x', T3, 'e9')).toThrow(/terminal/);
      expect(() => addApprovalGate(record, 'Gate', T3, 'g9')).toThrow(/terminal/);
      expect(() => decideApprovalGate(record, 'any', 'approved', T3)).toThrow(/terminal/);
    }
  });
});

describe('unknown-safe validation', () => {
  it('never throws for null, primitives, arrays, or malformed nesting', () => {
    for (const junk of [null, undefined, 42, 'record', true, [], [{}], { nested: { deep: null } }]) {
      expect(() => validateExecutionRecordUnknown(junk)).not.toThrow();
      expect(validateExecutionRecordUnknown(junk).length).toBeGreaterThan(0);
    }
    expect(() => validateExecutionRecordsCollectionUnknown('not-an-array')).not.toThrow();
    expect(validateExecutionRecordsCollectionUnknown('not-an-array')).toEqual([
      'executionRecords must be an array.',
    ]);
  });

  it('accepts helper-built records in every status, including after JSON round-trip', () => {
    for (const status of EXECUTION_STATUSES) {
      const record = recordIn(status);
      expect(validateExecutionRecordUnknown(record)).toEqual([]);
      expect(validateExecutionRecordUnknown(JSON.parse(JSON.stringify(record)))).toEqual([]);
    }
  });

  it('rejects malformed authority, missing booleans, and unknown agent ids', () => {
    const good = JSON.parse(JSON.stringify(recordIn('ready')));
    expect(validateExecutionRecordUnknown({ ...good, authority: null })).toContain('"authority" must be an object.');
    expect(validateExecutionRecordUnknown({ ...good, authority: { editCode: 'true' } }))
      .toContain('"authority.editCode" must be a boolean.');
    expect(validateExecutionRecordUnknown({ ...good, executionAgentId: 'rogue-agent' }))
      .toContain('"executionAgentId" must be the known execution agent id.');
  });

  it('rejects contradictory lifecycle fields', () => {
    const ready = JSON.parse(JSON.stringify(recordIn('ready')));
    expect(validateExecutionRecordUnknown({ ...ready, closedAt: T3 }))
      .toContain('"closedAt" must be absent on a nonterminal record.');
    expect(validateExecutionRecordUnknown({ ...ready, blockerSummary: 'stale' }))
      .toContain('"blockerSummary" must be cleared outside blocked.');
    expect(validateExecutionRecordUnknown({ ...ready, decisionSummary: 'stale' }))
      .toContain('"decisionSummary" must be cleared outside awaiting approval.');
    const completed = JSON.parse(JSON.stringify(recordIn('completed')));
    const noClosed: Record<string, unknown> = { ...completed };
    delete noClosed.closedAt;
    expect(validateExecutionRecordUnknown(noClosed))
      .toContain('"closedAt" must be an ISO date string on a terminal record.');
    expect(validateExecutionRecordUnknown({ ...completed, evidence: [] }))
      .toContain('a completed record must carry at least one evidence item.');
    const blocked = JSON.parse(JSON.stringify(recordIn('blocked')));
    const blockedNoSummary: Record<string, unknown> = { ...blocked };
    delete blockedNoSummary.blockerSummary;
    expect(validateExecutionRecordUnknown(blockedNoSummary))
      .toContain('"blockerSummary" must be non-blank while blocked.');
    const readyBlankScope = { ...ready, scope: '   ' };
    expect(validateExecutionRecordUnknown(readyBlankScope))
      .toContain('"scope" must be non-blank once the record has left draft.');
  });

  it('rejects invalid evidence, gates, duplicate ids, and bad timestamps', () => {
    const good = JSON.parse(JSON.stringify(recordIn('in_progress')));
    expect(validateExecutionRecordUnknown({ ...good, evidence: {} })).toContain('"evidence" must be an array.');
    expect(validateExecutionRecordUnknown({
      ...good,
      evidence: [good.evidence[0], good.evidence[0]],
    })).toContain('evidence[1].id duplicates an earlier evidence id.');
    expect(validateExecutionRecordUnknown({
      ...good,
      evidence: [{ id: 'e', kind: 'bogus', reference: 'x', addedAt: T2 }],
    })).toContain('evidence[0].kind is not a recognized evidence kind.');
    expect(validateExecutionRecordUnknown({
      ...good,
      approvalGates: [{ id: 'g', label: 'L', decision: 'pending', decidedAt: T2 }],
    })).toContain('approvalGates[0].decidedAt must be absent while pending.');
    expect(validateExecutionRecordUnknown({
      ...good,
      approvalGates: [{ id: 'g', label: 'L', decision: 'approved' }],
    })).toContain('approvalGates[0].decidedAt must be an ISO date string once decided.');
    expect(validateExecutionRecordUnknown({ ...good, createdAt: 'yesterday' }))
      .toContain('"createdAt" must be an ISO date string.');
    const collection = validateExecutionRecordsCollectionUnknown([good, good]);
    expect(collection).toContain('executionRecords[1]: "id" duplicates the id of executionRecords[0].');
  });

  it('error messages never echo user-entered content', () => {
    const dirty = {
      id: '',
      executionAgentId: `${PRIV}-agent`,
      title: `${PRIV}-title`,
      objective: `${PRIV}-objective`,
      scope: 42,
      stopConditions: `${PRIV}-stop`,
      targetService: `${PRIV}-service`,
      model: `${PRIV}-model`,
      sessionMode: `${PRIV}-mode`,
      status: `${PRIV}-status`,
      authority: { editCode: `${PRIV}` },
      evidence: [{ id: '', kind: `${PRIV}-kind`, reference: '  ', addedAt: `${PRIV}-date` }],
      approvalGates: [{ id: '', label: ' ', decision: `${PRIV}-decision` }],
      blockerSummary: `${PRIV}-blocker`,
      decisionSummary: 7,
      createdAt: 'nope',
      updatedAt: 'nope',
      closedAt: `${PRIV}-closed`,
    };
    const errors = validateExecutionRecordUnknown(dirty);
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).not.toContain(PRIV);
    // Guard/transition errors are static strings too.
    const record = recordIn('in_progress');
    expect(JSON.stringify(transitionErrors({ ...record, title: `${PRIV}` }, 'blocked'))).not.toContain(PRIV);
  });
});

describe('packet rendering', () => {
  const golden: ExecutionRecord = {
    id: 'rec00000001',
    executionAgentId: 'coding-coordinator',
    title: 'Fix widget parser',
    objective: 'Repair the tokenizer edge case.',
    scope: 'src/lib/parser only.',
    stopConditions: 'Stop on failed validation or scope expansion.',
    targetService: 'claude_code',
    model: 'model-label-x',
    sessionMode: 'supervised_implementation',
    authority: { editCode: true, runTests: true, editDocs: false, push: false, openPullRequests: false, merge: false },
    status: 'completed',
    evidence: [{ id: 'ev-1', kind: 'test_run', reference: 'unit suite green', addedAt: T2 }],
    approvalGates: [{ id: 'g-1', label: 'Confirm parser approach', decision: 'approved', decidedAt: T1 }],
    outcomeSummary: 'Parser fixed with regression test.',
    createdAt: T0,
    updatedAt: T3,
    closedAt: T3,
  };

  it('renders the exact golden packet with stable sections and final newline', () => {
    const expected = [
      'DAVIDOS EXECUTION PACKET',
      '',
      'Record: rec00000001',
      'Coordinator: DavidOS Coding Coordinator (coding-coordinator)',
      'Status: Completed',
      `Created: ${T0}`,
      `Updated: ${T3}`,
      `Closed: ${T3}`,
      '',
      'NOTICE',
      PACKET_HONESTY_NOTICE,
      CODING_COORDINATOR.supervisionStatement,
      '',
      'TASK',
      'Title: Fix widget parser',
      'Target service: Claude Code',
      'Model (manually entered label): model-label-x',
      'Session mode: Supervised implementation',
      '',
      'OBJECTIVE',
      'Repair the tokenizer edge case.',
      '',
      'BOUNDED SCOPE',
      'src/lib/parser only.',
      '',
      'STOP CONDITIONS',
      'Stop on failed validation or scope expansion.',
      '',
      'AUTHORITY (recorded for the external session — DavidOS grants nothing)',
      '- Code edits: Authorized',
      '- Tests: Authorized',
      '- Documentation edits: NOT authorized',
      '- Push: NOT authorized',
      '- Pull-request creation: NOT authorized',
      '- Merge: NOT authorized (merging/deploying always requires David)',
      '',
      'APPROVAL GATES',
      `- [approved at ${T1}] Confirm parser approach`,
      '',
      'EVIDENCE',
      `- Test run (${T2}): unit suite green`,
      '',
      'STATUS DETAIL',
      'Outcome: Parser fixed with regression test.',
      '',
    ].join('\n');
    expect(renderExecutionPacket(golden)).toBe(expected);
  });

  it('repeated rendering is byte-identical and does not mutate the record', () => {
    const before = JSON.stringify(golden);
    const a = renderExecutionPacket(golden);
    const b = renderExecutionPacket(golden);
    expect(a).toBe(b);
    expect(JSON.stringify(golden)).toBe(before);
  });

  it('objective, bounded scope, and stop conditions are separate sections', () => {
    const packet = renderExecutionPacket(recordIn('ready'));
    const objectiveAt = packet.indexOf('OBJECTIVE');
    const scopeAt = packet.indexOf('BOUNDED SCOPE');
    const stopAt = packet.indexOf('STOP CONDITIONS');
    expect(objectiveAt).toBeGreaterThan(-1);
    expect(scopeAt).toBeGreaterThan(objectiveAt);
    expect(stopAt).toBeGreaterThan(scopeAt);
  });

  it('every authority dimension renders, all defaulting to NOT authorized', () => {
    const packet = renderExecutionPacket(recordIn('ready'));
    for (const field of AUTHORITY_FIELDS) {
      expect(packet).toContain(`- ${field.label}: NOT authorized`);
    }
  });

  it('a resumed record renders no stale blocker or decision text', () => {
    const resumed = applyTransition(recordIn('blocked'), 'in_progress', T3);
    const packet = renderExecutionPacket(resumed);
    expect(packet).not.toContain('Blocker:');
    expect(packet).not.toContain('Required decision:');
    expect(packet).not.toContain('blocked on env');
  });

  it('rejects a mismatched profile and structurally invalid records', () => {
    const record = recordIn('ready');
    const wrongProfile = { ...CODING_COORDINATOR, id: 'other-agent' as never };
    expect(() => renderExecutionPacket(record, wrongProfile)).toThrow(/does not match/);
    expect(() => renderExecutionPacket({ ...record, closedAt: T3 })).toThrow(/invalid record/);
    expect(() =>
      renderExecutionPacket({ ...record, executionAgentId: 'rogue' as never }),
    ).toThrow(/unknown execution agent/);
  });

  it('the honesty notice states nothing was executed, sent, or mutated', () => {
    expect(PACKET_HONESTY_NOTICE).toContain('did not execute commands');
    expect(PACKET_HONESTY_NOTICE).toContain('contact a provider');
    expect(PACKET_HONESTY_NOTICE).toContain('mutate GitHub');
    expect(renderExecutionPacket(recordIn('draft'))).toContain(PACKET_HONESTY_NOTICE);
  });
});

describe('strict canonical ISO timestamps (review correction 5)', () => {
  it('accepts exactly the canonical nowIso() format', () => {
    expect(isIsoTimestamp(T0)).toBe(true);
    expect(isIsoTimestamp(nowIso())).toBe(true);
    expect(isIsoTimestamp('1999-12-31T23:59:59.999Z')).toBe(true);
  });

  it('rejects impossible calendar dates even though Date.parse normalizes them', () => {
    expect(isIsoTimestamp('2026-02-30T10:00:00.000Z')).toBe(false);
    expect(isIsoTimestamp('2026-04-31T00:00:00.000Z')).toBe(false);
    expect(isIsoTimestamp('2026-13-01T00:00:00.000Z')).toBe(false);
    expect(isIsoTimestamp('2026-07-19T25:00:00.000Z')).toBe(false);
    expect(isIsoTimestamp('2026-07-19T10:61:00.000Z')).toBe(false);
  });

  it('rejects loose Date.parse-compatible strings that are not canonical', () => {
    expect(isIsoTimestamp('July 19, 2026')).toBe(false); // locale date
    expect(isIsoTimestamp('19/07/2026')).toBe(false); // locale date
    expect(isIsoTimestamp('2026-07-19')).toBe(false); // date only
    expect(isIsoTimestamp('2026-07-19T10:00:00Z')).toBe(false); // missing millis
    expect(isIsoTimestamp('2026-07-19T10:00:00.000')).toBe(false); // no timezone
    expect(isIsoTimestamp('2026-07-19T10:00:00.000+02:00')).toBe(false); // offset tz
    expect(isIsoTimestamp(' 2026-07-19T10:00:00.000Z')).toBe(false); // leading junk
    expect(isIsoTimestamp('2026-07-19T10:00:00.000Z extra')).toBe(false); // trailing junk
    expect(isIsoTimestamp('')).toBe(false);
    expect(isIsoTimestamp(1721400000000)).toBe(false);
  });

  it('deterministic injected timestamps in the canonical format keep working', () => {
    const record = createExecutionRecord(
      { targetService: 'manual', sessionMode: 'plan_only' }, T0, 'testid0001',
    );
    expect(record.createdAt).toBe(T0);
  });
});

describe('record id grammar (review correction 2, validation boundary)', () => {
  it('accepts ids the repository uid() helper actually produces', () => {
    for (let i = 0; i < 20; i++) {
      expect(EXECUTION_RECORD_ID_PATTERN.test(uid())).toBe(true);
    }
  });

  it('rejects imported ids carrying paths, URLs, branches, or token-like content', () => {
    const good = JSON.parse(JSON.stringify(recordIn('ready')));
    for (const hostile of [
      `C:\\repos\\${PRIV}\\secret.txt`,
      `https://example.com/${PRIV}`,
      `feature/${PRIV}-branch`,
      `ghp_${PRIV}SECRETTOKEN`,
      'UPPERCASE00',
      'rec-0001',
      'short',
      'x'.repeat(40),
      '',
    ]) {
      const errors = validateExecutionRecordUnknown({ ...good, id: hostile });
      expect(errors, hostile).toContain('"id" must match the generated-id grammar.');
      expect(JSON.stringify(errors)).not.toContain(PRIV);
    }
  });
});

describe('exact authority shape (review correction 4)', () => {
  const base = () => JSON.parse(JSON.stringify(recordIn('ready')));
  const AUTH_OK = { editCode: false, runTests: false, editDocs: false, push: false, openPullRequests: false, merge: false };

  it('accepts exactly the six approved keys', () => {
    expect(validateExecutionRecordUnknown({ ...base(), authority: { ...AUTH_OK } })).toEqual([]);
    expect(validateExecutionRecordUnknown({ ...base(), authority: { ...AUTH_OK, editCode: true } })).toEqual([]);
  });

  it('rejects wildcard-like and unknown properties without echoing their names', () => {
    for (const extra of [
      { all: true }, { full: true }, { admin: true }, { autonomous: true },
      { standardAccess: true }, { [`${PRIV}key`]: false }, { harmlessExtra: false },
    ]) {
      const errors = validateExecutionRecordUnknown({ ...base(), authority: { ...AUTH_OK, ...extra } });
      expect(errors).toContain('"authority" must contain only the six recognized keys.');
      expect(JSON.stringify(errors)).not.toContain(PRIV);
      expect(JSON.stringify(errors)).not.toContain('standardAccess');
    }
  });

  it('rejects missing keys, undefined values, and non-boolean values', () => {
    const missing: Record<string, unknown> = { ...AUTH_OK };
    delete missing.merge;
    expect(validateExecutionRecordUnknown({ ...base(), authority: missing }))
      .toContain('"authority.merge" must be a boolean.');
    expect(validateExecutionRecordUnknown({ ...base(), authority: { ...AUTH_OK, push: undefined } }))
      .toContain('"authority.push" must be a boolean.');
    expect(validateExecutionRecordUnknown({ ...base(), authority: { ...AUTH_OK, editCode: 'true' } }))
      .toContain('"authority.editCode" must be a boolean.');
    expect(validateExecutionRecordUnknown({ ...base(), authority: { ...AUTH_OK, runTests: 1 } }))
      .toContain('"authority.runTests" must be a boolean.');
  });

  it('inherited properties never grant: sanitizeAuthority reads own properties only', () => {
    const proto = { editCode: true, all: true };
    const inherited = Object.create(proto) as Record<string, unknown>;
    // Nothing own → everything stays safely false despite the prototype.
    expect(sanitizeAuthority(inherited)).toEqual(defaultAuthority());
  });
});

describe('outcomeSummary lifecycle invariants (review correction 3)', () => {
  it('the validator rejects outcomeSummary on every non-completed status', () => {
    for (const status of EXECUTION_STATUSES.filter((s) => s !== 'completed')) {
      const record = { ...JSON.parse(JSON.stringify(recordIn(status))), outcomeSummary: 'stale outcome' };
      expect(validateExecutionRecordUnknown(record), status)
        .toContain('"outcomeSummary" is allowed only on a completed record.');
    }
    const completed = { ...JSON.parse(JSON.stringify(recordIn('completed'))), outcomeSummary: 'fine here' };
    expect(validateExecutionRecordUnknown(completed)).toEqual([]);
  });

  // Final review correction 1: exercise EVERY (from, to) pair whose target
  // is non-completed, contaminating the source with stale values for ALL
  // four cleared fields at once (not just the ones `from` would naturally
  // carry) — this specifically tests normalization of data that should
  // never legitimately coexist, e.g. a nonterminal record with closedAt.
  const NON_COMPLETED_TRANSITIONS: Array<[ExecutionRecordStatus, ExecutionRecordStatus, Record<string, string>]> = [
    ['draft', 'ready', {}],
    ['draft', 'cancelled', {}],
    ['ready', 'draft', {}],
    ['ready', 'in_progress', {}],
    ['ready', 'cancelled', {}],
    ['in_progress', 'blocked', { blockerSummary: 'fresh blocker' }],
    ['in_progress', 'awaiting_approval', { decisionSummary: 'fresh decision' }],
    ['in_progress', 'cancelled', {}],
    ['blocked', 'in_progress', {}],
    ['blocked', 'awaiting_approval', { decisionSummary: 'fresh decision' }],
    ['blocked', 'cancelled', {}],
    ['awaiting_approval', 'in_progress', {}],
    ['awaiting_approval', 'blocked', { blockerSummary: 'fresh blocker' }],
    ['awaiting_approval', 'cancelled', {}],
  ];
  const CLEARED_FIELDS = ['blockerSummary', 'decisionSummary', 'outcomeSummary', 'closedAt'] as const;

  for (const [from, to, extras] of NON_COMPLETED_TRANSITIONS) {
    it(`${from} → ${to}: stale blocker/decision/outcome/closedAt are cleared as own properties`, () => {
      const contaminated = {
        ...recordIn(from),
        blockerSummary: 'stale blocker',
        decisionSummary: 'stale decision',
        outcomeSummary: 'stale outcome',
        closedAt: T2,
      };
      const result = applyTransition(contaminated, to, T3, extras);
      expect(result.status).toBe(to);
      for (const field of CLEARED_FIELDS) {
        // blockerSummary/decisionSummary are legitimately SET on the target
        // by extras for these two exact combinations; closedAt is
        // legitimately STAMPED (not cleared) on the one terminal target in
        // this non-completed set, `cancelled` — every other field, in
        // every other combination, must be fully absent.
        if (field === 'blockerSummary' && to === 'blocked') continue;
        if (field === 'decisionSummary' && to === 'awaiting_approval') continue;
        if (field === 'closedAt' && to === 'cancelled') {
          expect(result.closedAt, `${from}→${to} closedAt stamped`).toBe(T3);
          continue;
        }
        expect(result[field as keyof typeof result], `${from}→${to} ${field}`).toBeUndefined();
        expect(
          Object.prototype.hasOwnProperty.call(result, field),
          `${from}→${to} ${field} own-property`,
        ).toBe(false);
        expect(Object.keys(result), `${from}→${to} ${field} in Object.keys`).not.toContain(field);
      }
      expect(validateExecutionRecordUnknown(result), `${from}→${to}`).toEqual([]);
    });
  }

  it('draft → ready explicitly: a contaminated draft with a stale outcomeSummary transitions cleanly', () => {
    const contaminatedDraft = { ...fullDraft(), outcomeSummary: 'stale outcome from nowhere' };
    const result = applyTransition(contaminatedDraft, 'ready', T1);
    expect(result.status).toBe('ready');
    expect(result.outcomeSummary).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(result, 'outcomeSummary')).toBe(false);
    expect(Object.keys(result)).not.toContain('outcomeSummary');
    expect(validateExecutionRecordUnknown(result)).toEqual([]);
  });

  it('completing stores the supplied outcome; packets after resume render no stale outcome', () => {
    const completed = applyTransition(recordIn('in_progress'), 'completed', T3, { outcomeSummary: ' shipped ' });
    expect(completed.outcomeSummary).toBe('shipped');
    const resumed = applyTransition({ ...recordIn('blocked'), outcomeSummary: 'stale' }, 'in_progress', T3);
    const packet = renderExecutionPacket(resumed);
    expect(packet).not.toContain('Outcome:');
    expect(packet).not.toContain('stale');
  });

  it('outcome content survives persistence round-trip only on completed records', () => {
    const completed = applyTransition(recordIn('in_progress'), 'completed', T3, { outcomeSummary: 'done' });
    const roundTrip = JSON.parse(JSON.stringify(completed));
    expect(validateExecutionRecordUnknown(roundTrip)).toEqual([]);
    expect(roundTrip.outcomeSummary).toBe('done');
  });
});

describe('canonical cleared-field shape (review hardening 2)', () => {
  it('cleared lifecycle fields are omitted own properties, not undefined values', () => {
    const resumed = applyTransition(recordIn('blocked'), 'in_progress', T3);
    for (const key of ['blockerSummary', 'decisionSummary', 'outcomeSummary', 'closedAt']) {
      expect(Object.prototype.hasOwnProperty.call(resumed, key), key).toBe(false);
      expect(key in resumed, key).toBe(false);
    }
    // Live record and its JSON round-trip expose identical own keys.
    expect(Object.keys(resumed).sort()).toEqual(Object.keys(JSON.parse(JSON.stringify(resumed))).sort());
  });

  it('terminal records carry exactly the terminal extras they were given', () => {
    const cancelled = applyTransition(recordIn('awaiting_approval'), 'cancelled', T3);
    expect(Object.prototype.hasOwnProperty.call(cancelled, 'decisionSummary')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(cancelled, 'blockerSummary')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(cancelled, 'outcomeSummary')).toBe(false);
    expect(cancelled.closedAt).toBe(T3);
  });
});
