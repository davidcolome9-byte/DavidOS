import type { AuditLogEntry, ExecutionRecordStatus } from '../types';
import { STATUS_LABELS } from './executionRecords';

/**
 * Privacy-safe audit entries for supervised execution records (DOS-AGT-001A).
 *
 * ALLOWLIST ONLY: fixed closed event names, closed status labels, counts,
 * the fixed execution-agent identifier, and constant truthful summaries.
 * NEVER include — in any field, hash, fingerprint, excerpt, or transform —
 * titles, objectives, scope, stop conditions, model labels, evidence text,
 * gate labels, blocker/decision/outcome text, packet text, clipboard
 * content, paths, branches, URLs, or credentials.
 *
 * Record ids are ALSO excluded: an IMPORTED record id is user-controlled
 * content (it could carry a path, URL, or token), so no raw, hashed, or
 * partial record id ever reaches audit output. The import boundary
 * additionally constrains ids to the generated-id grammar, but audit
 * privacy does not rely on that.
 *
 * AuditLogEntry.agentId is deliberately NOT set: it is typed as the domain
 * AgentId union and the execution agent must not be forced into it. The
 * execution context is carried by the event name plus the fixed
 * coding-coordinator identifier in the summary where useful.
 */

export type ExecutionAuditEvent =
  | 'execution_record_created'
  | 'execution_record_updated'
  | 'execution_status_changed'
  | 'execution_packet_copied';

/** Closed set of update descriptions — fixed labels, never user text. */
export type ExecutionUpdateKind =
  | 'draft_fields'
  | 'evidence_added'
  | 'approval_gate_added'
  | 'approval_gate_decided';

const UPDATE_SUMMARIES: Record<ExecutionUpdateKind, string> = {
  draft_fields: 'Draft fields updated locally. Nothing was sent or executed.',
  evidence_added: 'Evidence item recorded locally. Nothing was sent or executed.',
  approval_gate_added: 'Approval gate recorded locally. Nothing was sent or executed.',
  approval_gate_decided: 'Approval gate decision recorded locally. Nothing was sent or executed.',
};

type NewAuditEntry = Omit<AuditLogEntry, 'id' | 'timestamp'>;

export function executionCreatedAudit(): NewAuditEntry {
  return {
    command: 'execution_record_created',
    actionType: 'local_write',
    approvalStatus: 'not_required',
    resultSummary:
      'Draft execution record created locally (coding-coordinator). Nothing was sent or executed.',
    actionTaken: true,
  };
}

export function executionUpdatedAudit(
  kind: ExecutionUpdateKind,
  counts?: { evidenceCount?: number },
): NewAuditEntry {
  const countSuffix =
    kind === 'evidence_added' && counts?.evidenceCount !== undefined
      ? ` Evidence count: ${counts.evidenceCount}.`
      : '';
  return {
    command: 'execution_record_updated',
    actionType: 'local_write',
    approvalStatus: 'not_required',
    resultSummary: `${UPDATE_SUMMARIES[kind]}${countSuffix}`,
    actionTaken: true,
  };
}

export function executionStatusChangedAudit(
  from: ExecutionRecordStatus,
  to: ExecutionRecordStatus,
): NewAuditEntry {
  return {
    command: 'execution_status_changed',
    actionType: 'local_write',
    approvalStatus: 'not_required',
    resultSummary: `Status changed: ${STATUS_LABELS[from]} → ${STATUS_LABELS[to]}. Nothing was sent or executed.`,
    actionTaken: true,
  };
}

export function executionPacketCopiedAudit(): NewAuditEntry {
  return {
    command: 'execution_packet_copied',
    actionType: 'read_only',
    approvalStatus: 'not_required',
    resultSummary: 'Execution packet copied; nothing sent or executed.',
    actionTaken: true,
  };
}
