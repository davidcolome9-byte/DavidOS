import { describe, expect, it } from 'vitest';
import {
  executionCreatedAudit,
  executionPacketCopiedAudit,
  executionStatusChangedAudit,
  executionUpdatedAudit,
} from '../agents/executionAudit';

/** Synthetic privacy marker — must never appear in any audit output. */
const PRIV = 'ZZPRIV';

// Review correction 2: audit builders take NO user-controlled input at all —
// no record, no id, no text. A hostile imported record id (path, URL, branch,
// token) therefore cannot reach audit output by construction. These tests
// pin the exact allowlisted output shape.

describe('execution audit privacy (DOS-AGT-001A, review correction 2)', () => {
  const entries = [
    executionCreatedAudit(),
    executionUpdatedAudit('draft_fields'),
    executionUpdatedAudit('evidence_added', { evidenceCount: 3 }),
    executionUpdatedAudit('approval_gate_added'),
    executionUpdatedAudit('approval_gate_decided'),
    executionStatusChangedAudit('in_progress', 'blocked'),
    executionPacketCopiedAudit(),
  ];

  it('command fields are exactly the fixed closed event names — never a record id', () => {
    expect(executionCreatedAudit().command).toBe('execution_record_created');
    expect(executionUpdatedAudit('draft_fields').command).toBe('execution_record_updated');
    expect(executionStatusChangedAudit('in_progress', 'blocked').command).toBe('execution_status_changed');
    expect(executionPacketCopiedAudit().command).toBe('execution_packet_copied');
    for (const entry of entries) {
      expect(entry.command).not.toContain('record ');
      expect(entry.command).not.toContain('·');
    }
  });

  it('hostile content of any kind cannot reach serialized entries (no inputs exist to carry it)', () => {
    // The builders accept only closed enums and counts; serialize everything
    // they can ever produce and prove it is constant-only.
    const hostileMarkers = [
      PRIV,
      'C:\\\\repos\\\\secret',
      'https://example.com/private',
      'feature/secret-branch',
      'ghp_SECRETTOKEN',
    ];
    for (const entry of entries) {
      const serialized = JSON.stringify(entry);
      for (const marker of hostileMarkers) {
        expect(serialized).not.toContain(marker);
      }
    }
  });

  it('the domain agentId field is never set for execution events', () => {
    for (const entry of entries) {
      expect(entry.agentId).toBeUndefined();
      expect(entry.workflowId).toBeUndefined();
    }
  });

  it('status changes name only closed status labels', () => {
    const entry = executionStatusChangedAudit('in_progress', 'blocked');
    expect(entry.resultSummary).toBe('Status changed: In progress → Blocked. Nothing was sent or executed.');
  });

  it('evidence updates expose a count only', () => {
    const entry = executionUpdatedAudit('evidence_added', { evidenceCount: 3 });
    expect(entry.resultSummary).toBe(
      'Evidence item recorded locally. Nothing was sent or executed. Evidence count: 3.',
    );
  });

  it('creation names only the fixed execution-agent identifier', () => {
    expect(executionCreatedAudit().resultSummary).toBe(
      'Draft execution record created locally (coding-coordinator). Nothing was sent or executed.',
    );
  });

  it('packet copy is read-only and truthfully states nothing was sent or executed', () => {
    const entry = executionPacketCopiedAudit();
    expect(entry.actionType).toBe('read_only');
    expect(entry.resultSummary).toBe('Execution packet copied; nothing sent or executed.');
  });

  it('all local mutations audit as local_write with approval not required', () => {
    for (const entry of entries.slice(0, 6)) {
      expect(entry.actionType).toBe('local_write');
      expect(entry.approvalStatus).toBe('not_required');
    }
  });
});
