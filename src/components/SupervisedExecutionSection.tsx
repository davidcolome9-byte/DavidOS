import { useEffect, useRef, useState } from 'react';
import { useStore, upsert } from '../state/store';
import type {
  ExecutionEvidenceKind,
  ExecutionRecord,
  ExecutionRecordStatus,
  ExecutionService,
  ExecutionSessionMode,
} from '../lib/types';
import { CODING_COORDINATOR } from '../lib/agents/executionAgentRegistry';
import {
  AUTHORITY_FIELDS,
  EVIDENCE_KIND_LABELS,
  EXECUTION_EVIDENCE_KINDS,
  EXECUTION_SERVICES,
  EXECUTION_SESSION_MODES,
  LOCKED_CAPABILITIES,
  SERVICE_LABELS,
  SESSION_MODE_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  applyTransition,
  addApprovalGate,
  addEvidence,
  canTransition,
  createExecutionRecord,
  decideApprovalGate,
  readinessErrors,
  renderExecutionPacket,
  transitionErrors,
  updateDraftFields,
  validateExecutionRecordUnknown,
} from '../lib/agents/executionRecords';
import {
  executionCreatedAudit,
  executionPacketCopiedAudit,
  executionStatusChangedAudit,
  executionUpdatedAudit,
} from '../lib/agents/executionAudit';

/**
 * Supervised execution (DOS-AGT-001A) — a thin, mobile-first section on the
 * Agents page. All lifecycle/validation rules come from
 * lib/agents/executionRecords.ts; this component only renders state and calls
 * the pure helpers. DavidOS never sends or executes anything here: records
 * describe work David performs himself in an external coding service.
 */

interface DraftForm {
  title: string;
  objective: string;
  scope: string;
  stopConditions: string;
  targetService: ExecutionService;
  model: string;
  sessionMode: ExecutionSessionMode;
  authority: Record<string, boolean>;
}

const EMPTY_FORM: DraftForm = {
  title: '',
  objective: '',
  scope: '',
  stopConditions: '',
  targetService: 'claude_code',
  model: '',
  sessionMode: 'plan_only',
  authority: {},
};

function formFromRecord(record: ExecutionRecord): DraftForm {
  return {
    title: record.title,
    objective: record.objective,
    scope: record.scope,
    stopConditions: record.stopConditions,
    targetService: record.targetService,
    model: record.model,
    sessionMode: record.sessionMode,
    authority: { ...record.authority },
  };
}

export default function SupervisedExecutionSection() {
  const { state, update, audit, persistFailed, recovery, externalChange } = useStore();
  const [editing, setEditing] = useState<{ id: string | null; form: DraftForm } | null>(null);
  const [flash, setFlash] = useState('');

  // Honest persistence posture: while boot recovery or a stale tab suppresses
  // persistence, record mutations are disabled rather than pretending to save.
  const mutationsDisabled = !recovery.canPersist || externalChange;

  const records = state.executionRecords;

  function saveRecord(next: ExecutionRecord, auditEntry: Parameters<typeof audit>[0], message: string) {
    update((s) => ({ ...s, executionRecords: upsert(s.executionRecords, next) }));
    audit(auditEntry);
    setFlash(persistFailed ? `${message} Warning: saving to this device is currently failing — this change is memory-only until storage recovers.` : message);
  }

  function submitDraft(form: DraftForm, existingId: string | null) {
    try {
      if (existingId === null) {
        const record = createExecutionRecord(form);
        saveRecord(record, executionCreatedAudit(), 'Draft execution record created locally. Nothing was sent or executed.');
      } else {
        const current = records.find((r) => r.id === existingId);
        if (!current) return;
        const record = updateDraftFields(current, form);
        saveRecord(record, executionUpdatedAudit('draft_fields'), 'Draft updated locally. Nothing was sent or executed.');
      }
      setEditing(null);
    } catch (err) {
      setFlash((err as Error).message);
    }
  }

  function transition(record: ExecutionRecord, to: ExecutionRecordStatus, extras?: { blockerSummary?: string; decisionSummary?: string; outcomeSummary?: string }) {
    try {
      const from = record.status;
      const next = applyTransition(record, to, undefined, extras);
      saveRecord(
        next,
        executionStatusChangedAudit(from, to),
        `Status changed to ${STATUS_LABELS[to]}. Nothing was sent or executed.`,
      );
    } catch (err) {
      setFlash((err as Error).message);
    }
  }

  async function copyPacket(record: ExecutionRecord) {
    let packet: string;
    try {
      packet = renderExecutionPacket(record, CODING_COORDINATOR);
    } catch (err) {
      setFlash((err as Error).message);
      return;
    }
    try {
      await navigator.clipboard.writeText(packet);
      audit(executionPacketCopiedAudit());
      setFlash('Packet copied. Nothing was sent and nothing was executed by DavidOS.');
    } catch {
      // Honest failure: no status change, no evidence, no audit success.
      setFlash('Clipboard unavailable — the packet was NOT copied. Nothing was sent or executed.');
    }
  }

  return (
    <section aria-labelledby="supervised-execution-heading">
      <div className="card">
        <h2 id="supervised-execution-heading">
          <span>{CODING_COORDINATOR.icon} Supervised execution</span>
          <button
            className="primary"
            onClick={() => setEditing({ id: null, form: EMPTY_FORM })}
            disabled={mutationsDisabled || editing !== null}
          >
            + New record
          </button>
        </h2>
        <p className="muted small">{CODING_COORDINATOR.name} — {CODING_COORDINATOR.purpose}</p>
        <p className="notice">{CODING_COORDINATOR.supervisionStatement}</p>
        {mutationsDisabled && (
          <p className="notice" role="alert">
            Execution records are read-only right now: saving to this device is paused
            {externalChange ? ' because another tab has newer data (reload to continue)' : ' by boot-time recovery'}.
            Nothing shown here has been sent or executed.
          </p>
        )}
        <details>
          <summary className="muted small">What this coordinator never does</summary>
          <ul className="plain small">
            {CODING_COORDINATOR.neverDoes.map((line) => <li key={line}>🚫 {line}</li>)}
          </ul>
        </details>
        <details>
          <summary className="muted small">Locked capabilities (cannot be enabled in DOS-AGT-001A)</summary>
          <ul className="plain small">
            {LOCKED_CAPABILITIES.map((line) => <li key={line}>🔒 {line} — unavailable</li>)}
          </ul>
        </details>
      </div>

      <p role="status" aria-live="polite" className={flash ? 'notice flash' : 'visually-hidden'}>
        {flash}
      </p>

      {editing && (
        <DraftEditor
          form={editing.form}
          isNew={editing.id === null}
          disabled={mutationsDisabled}
          onChange={(form) => setEditing({ ...editing, form })}
          onSave={() => submitDraft(editing.form, editing.id)}
          onCancel={() => setEditing(null)}
        />
      )}

      {records.length === 0 && !editing && (
        <div className="card">
          <p className="muted small">
            No execution records yet. Create a local draft to plan a supervised coding
            session — DavidOS will only record it and let you copy the packet.
          </p>
        </div>
      )}

      {records.map((record) => (
        <RecordCard
          key={record.id}
          record={record}
          disabled={mutationsDisabled}
          onEditDraft={() => setEditing({ id: record.id, form: formFromRecord(record) })}
          onTransition={(to, extras) => transition(record, to, extras)}
          onAddEvidence={(kind, reference) => {
            try {
              const next = addEvidence(record, kind, reference);
              saveRecord(
                next,
                executionUpdatedAudit('evidence_added', { evidenceCount: next.evidence.length }),
                'Evidence recorded locally. Nothing was sent or executed.',
              );
            } catch (err) {
              setFlash((err as Error).message);
            }
          }}
          onAddGate={(label) => {
            try {
              const next = addApprovalGate(record, label);
              saveRecord(next, executionUpdatedAudit('approval_gate_added'), 'Approval gate recorded locally.');
            } catch (err) {
              setFlash((err as Error).message);
            }
          }}
          onDecideGate={(gateId, decision) => {
            try {
              const next = decideApprovalGate(record, gateId, decision);
              if (next === record) return; // true no-op: unknown or already-decided gate
              saveRecord(next, executionUpdatedAudit('approval_gate_decided'), 'Approval gate decision recorded locally.');
            } catch (err) {
              setFlash((err as Error).message);
            }
          }}
          onCopyPacket={() => copyPacket(record)}
        />
      ))}
    </section>
  );
}

// ---- draft editor ---------------------------------------------------------------

function DraftEditor({
  form,
  isNew,
  disabled,
  onChange,
  onSave,
  onCancel,
}: {
  form: DraftForm;
  isNew: boolean;
  disabled: boolean;
  onChange: (form: DraftForm) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="card" style={{ borderColor: 'var(--accent)' }}>
      <h3>{isNew ? 'New execution record (local draft)' : 'Edit draft'}</h3>
      <p className="muted small">
        Drafts are local records only. Marking a record ready requires a title,
        an objective, a bounded scope, and stop conditions — each on its own.
      </p>

      <label className="field" htmlFor="exec-title">Task / package title</label>
      <input
        id="exec-title"
        type="text"
        value={form.title}
        onChange={(e) => onChange({ ...form, title: e.target.value })}
      />

      <label className="field" htmlFor="exec-service">Target service</label>
      <select
        id="exec-service"
        value={form.targetService}
        onChange={(e) => onChange({ ...form, targetService: e.target.value as ExecutionService })}
      >
        {EXECUTION_SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABELS[s]}</option>)}
      </select>

      <label className="field" htmlFor="exec-model">Model (manual label)</label>
      <input
        id="exec-model"
        type="text"
        value={form.model}
        onChange={(e) => onChange({ ...form, model: e.target.value })}
        aria-describedby="exec-model-hint"
      />
      <p id="exec-model-hint" className="muted small">Optional. A label you type — DavidOS never contacts any model.</p>

      <label className="field" htmlFor="exec-mode">Session mode</label>
      <select
        id="exec-mode"
        value={form.sessionMode}
        onChange={(e) => onChange({ ...form, sessionMode: e.target.value as ExecutionSessionMode })}
      >
        {EXECUTION_SESSION_MODES.map((m) => <option key={m} value={m}>{SESSION_MODE_LABELS[m]}</option>)}
      </select>

      <label className="field" htmlFor="exec-objective">Objective</label>
      <textarea
        id="exec-objective"
        value={form.objective}
        onChange={(e) => onChange({ ...form, objective: e.target.value })}
        aria-describedby="exec-objective-hint"
      />
      <p id="exec-objective-hint" className="muted small">What this supervised session should accomplish.</p>

      <label className="field" htmlFor="exec-scope">Bounded scope</label>
      <textarea
        id="exec-scope"
        value={form.scope}
        onChange={(e) => onChange({ ...form, scope: e.target.value })}
        aria-describedby="exec-scope-hint"
      />
      <p id="exec-scope-hint" className="muted small">
        The exact repository area, files, or package the external service may work in.
      </p>

      <label className="field" htmlFor="exec-stop">Stop conditions</label>
      <textarea
        id="exec-stop"
        value={form.stopConditions}
        onChange={(e) => onChange({ ...form, stopConditions: e.target.value })}
        aria-describedby="exec-stop-hint"
      />
      <p id="exec-stop-hint" className="muted small">
        When the external service must stop and return control to David — e.g. unexpected
        repository state, failed validation, scope expansion, dependency requests,
        destructive Git operations, or any push/PR/merge/deploy beyond recorded authority.
      </p>

      <fieldset className="exec-authority">
        <legend className="field">Authority recorded for the external session</legend>
        <p className="muted small">
          All default to not authorized. This records your decision for the external
          service — DavidOS itself gains no capability either way.
        </p>
        {AUTHORITY_FIELDS.map((field) => (
          <label className="checkrow" key={field.key} htmlFor={`exec-auth-${field.key}`}>
            <input
              id={`exec-auth-${field.key}`}
              type="checkbox"
              checked={form.authority[field.key] === true}
              onChange={(e) => onChange({ ...form, authority: { ...form.authority, [field.key]: e.target.checked } })}
            />
            <span>
              {field.label}
              {field.key === 'merge' && <> — <em>merging/deploying always requires David</em></>}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="btn-row">
        <button className="primary" onClick={onSave} disabled={disabled}>
          {isNew ? 'Create draft (local)' : 'Save draft (local)'}
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---- record card ----------------------------------------------------------------

function RecordCard({
  record,
  disabled,
  onEditDraft,
  onTransition,
  onAddEvidence,
  onAddGate,
  onDecideGate,
  onCopyPacket,
}: {
  record: ExecutionRecord;
  disabled: boolean;
  onEditDraft: () => void;
  onTransition: (to: ExecutionRecordStatus, extras?: { blockerSummary?: string; decisionSummary?: string; outcomeSummary?: string }) => void;
  onAddEvidence: (kind: ExecutionEvidenceKind, reference: string) => void;
  onAddGate: (label: string) => void;
  onDecideGate: (gateId: string, decision: 'approved' | 'denied') => void;
  onCopyPacket: () => void;
}) {
  const [blockerText, setBlockerText] = useState('');
  const [decisionText, setDecisionText] = useState('');
  const [evidenceKind, setEvidenceKind] = useState<ExecutionEvidenceKind>('note');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [gateLabel, setGateLabel] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showPacket, setShowPacket] = useState(false);

  // Inline cancel-confirmation focus contract (review correction 6):
  // opening moves focus to the destructive confirm button; "Keep record"
  // restores it to the opener; a confirmed cancel lands on the record
  // heading. Focus never falls silently to <body>. No modal is involved.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cancelOpenerRef = useRef<HTMLButtonElement>(null);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
  const [pendingFocus, setPendingFocus] = useState<'confirm' | 'opener' | 'heading' | null>(null);
  useEffect(() => {
    if (pendingFocus === null) return;
    if (pendingFocus === 'confirm') confirmCancelRef.current?.focus();
    else if (pendingFocus === 'opener') cancelOpenerRef.current?.focus();
    else headingRef.current?.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  const status = record.status;
  const terminal = status === 'completed' || status === 'cancelled';
  const readiness = status === 'draft' ? readinessErrors(record) : [];
  const completionProblems = status === 'in_progress' ? transitionErrors(record, 'completed') : [];
  const recordValid = validateExecutionRecordUnknown(record).length === 0;
  const idp = `exec-${record.id}`;

  return (
    <div className="card exec-record">
      <h3 ref={headingRef} tabIndex={-1}>
        <span>{record.title.trim() === '' ? '(untitled draft)' : record.title}</span>
        <span className={`badge ${STATUS_TONE[status]}`}>{STATUS_LABELS[status]}</span>
      </h3>
      <p className="muted small">
        {SERVICE_LABELS[record.targetService]} · {SESSION_MODE_LABELS[record.sessionMode]}
        {record.model.trim() !== '' && <> · model label: {record.model}</>}
      </p>
      <p className="muted small">
        Status: {STATUS_LABELS[status]}{terminal && ' (terminal — read-only)'} ·
        created {record.createdAt.slice(0, 10)}
        {record.closedAt && <> · closed {record.closedAt.slice(0, 10)}</>}
      </p>

      {status === 'blocked' && (
        <p className="notice" role="alert">Blocked: {record.blockerSummary}</p>
      )}
      {status === 'awaiting_approval' && (
        <p className="notice" role="alert">Required decision: {record.decisionSummary}</p>
      )}
      {status === 'completed' && record.outcomeSummary && (
        <p className="notice">Outcome: {record.outcomeSummary}</p>
      )}

      <details>
        <summary className="muted small">Objective, bounded scope, stop conditions & authority</summary>
        <h4>Objective</h4>
        <p className="small">{record.objective.trim() === '' ? '—' : record.objective}</p>
        <h4>Bounded scope</h4>
        <p className="small">{record.scope.trim() === '' ? '—' : record.scope}</p>
        <h4>Stop conditions</h4>
        <p className="small">{record.stopConditions.trim() === '' ? '—' : record.stopConditions}</p>
        <h4>Authority (recorded for the external session)</h4>
        <ul className="plain small">
          {AUTHORITY_FIELDS.map((field) => (
            <li key={field.key}>
              {field.label}: <strong>{record.authority[field.key] ? 'Authorized' : 'NOT authorized'}</strong>
              {field.key === 'merge' && ' (always requires David)'}
            </li>
          ))}
        </ul>
      </details>

      {/* Approval gates */}
      <details>
        <summary className="muted small">Approval gates ({record.approvalGates.length})</summary>
        {record.approvalGates.length === 0 && <p className="muted small">No approval gates recorded.</p>}
        <ul className="plain small">
          {record.approvalGates.map((gate) => (
            <li key={gate.id}>
              [{gate.decision}] {gate.label}
              {gate.decision === 'pending' && !terminal && (
                <span className="btn-row">
                  <button onClick={() => onDecideGate(gate.id, 'approved')} disabled={disabled}>Approve</button>
                  <button onClick={() => onDecideGate(gate.id, 'denied')} disabled={disabled}>Deny</button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {!terminal && (
          <>
            <label className="field" htmlFor={`${idp}-gate`}>New approval gate</label>
            <input
              id={`${idp}-gate`}
              type="text"
              value={gateLabel}
              onChange={(e) => setGateLabel(e.target.value)}
            />
            <div className="btn-row">
              <button
                onClick={() => { onAddGate(gateLabel); setGateLabel(''); }}
                disabled={disabled || gateLabel.trim() === ''}
              >
                Add gate (local)
              </button>
            </div>
          </>
        )}
      </details>

      {/* Evidence */}
      <details>
        <summary className="muted small">Evidence ({record.evidence.length})</summary>
        {record.evidence.length === 0 && (
          <p className="muted small">No evidence yet. Completion requires at least one evidence item.</p>
        )}
        <ul className="plain small">
          {record.evidence.map((item) => (
            <li key={item.id}>{EVIDENCE_KIND_LABELS[item.kind]}: {item.reference}</li>
          ))}
        </ul>
        {!terminal && (
          <>
            <label className="field" htmlFor={`${idp}-evidence-kind`}>Evidence kind</label>
            <select
              id={`${idp}-evidence-kind`}
              value={evidenceKind}
              onChange={(e) => setEvidenceKind(e.target.value as ExecutionEvidenceKind)}
            >
              {EXECUTION_EVIDENCE_KINDS.map((k) => <option key={k} value={k}>{EVIDENCE_KIND_LABELS[k]}</option>)}
            </select>
            <label className="field" htmlFor={`${idp}-evidence-ref`}>Evidence reference</label>
            <input
              id={`${idp}-evidence-ref`}
              type="text"
              value={evidenceRef}
              onChange={(e) => setEvidenceRef(e.target.value)}
              aria-describedby={`${idp}-evidence-hint`}
            />
            <p id={`${idp}-evidence-hint`} className="muted small">
              E.g. a commit SHA, PR number, or test summary from the external service. Local record only.
            </p>
            <div className="btn-row">
              <button
                onClick={() => { onAddEvidence(evidenceKind, evidenceRef); setEvidenceRef(''); }}
                disabled={disabled || evidenceRef.trim() === ''}
              >
                Add evidence (local)
              </button>
            </div>
          </>
        )}
      </details>

      {/* Packet preview & copy */}
      {recordValid && (
        <details open={showPacket} onToggle={(e) => setShowPacket((e.target as HTMLDetailsElement).open)}>
          <summary className="muted small">Execution packet (deterministic preview)</summary>
          <p className="muted small">
            Copy this into {SERVICE_LABELS[record.targetService]} yourself. DavidOS does not send it.
          </p>
          <pre className="output">{renderExecutionPacket(record, CODING_COORDINATOR)}</pre>
          <div className="btn-row">
            <button className="primary" onClick={onCopyPacket}>Copy packet (nothing is sent)</button>
          </div>
        </details>
      )}

      {/* Readiness feedback (draft only) */}
      {status === 'draft' && readiness.length > 0 && (
        <div className="notice" role="alert" id={`${idp}-readiness`}>
          <strong>Not ready yet:</strong>
          <ul className="plain small">
            {readiness.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Blocker / decision inputs for the transitions that need them */}
      {!terminal && (status === 'in_progress' || status === 'awaiting_approval') && (
        <>
          <label className="field" htmlFor={`${idp}-blocker`}>Blocker summary (required to mark blocked)</label>
          <textarea
            id={`${idp}-blocker`}
            value={blockerText}
            onChange={(e) => setBlockerText(e.target.value)}
          />
        </>
      )}
      {!terminal && (status === 'in_progress' || status === 'blocked') && (
        <>
          <label className="field" htmlFor={`${idp}-decision`}>Decision needed (required to request approval)</label>
          <textarea
            id={`${idp}-decision`}
            value={decisionText}
            onChange={(e) => setDecisionText(e.target.value)}
          />
        </>
      )}

      {/* Lifecycle actions — only valid transitions are offered. */}
      {!terminal && (
        <div className="btn-row">
          {status === 'draft' && (
            <>
              <button onClick={onEditDraft} disabled={disabled}>Edit draft</button>
              <button
                className="primary"
                onClick={() => onTransition('ready')}
                disabled={disabled || !canTransition(record, 'ready')}
                aria-describedby={readiness.length > 0 ? `${idp}-readiness` : undefined}
              >
                Mark ready
              </button>
            </>
          )}
          {status === 'ready' && (
            <>
              <button onClick={() => onTransition('draft')} disabled={disabled}>Return to draft</button>
              <button className="primary" onClick={() => onTransition('in_progress')} disabled={disabled}>
                Begin work (external)
              </button>
            </>
          )}
          {(status === 'blocked' || status === 'awaiting_approval') && (
            <button className="primary" onClick={() => onTransition('in_progress')} disabled={disabled}>
              Resume work
            </button>
          )}
          {(status === 'in_progress' || status === 'awaiting_approval') && (
            <button
              onClick={() => { onTransition('blocked', { blockerSummary: blockerText }); setBlockerText(''); }}
              disabled={disabled || blockerText.trim() === ''}
            >
              Mark blocked
            </button>
          )}
          {(status === 'in_progress' || status === 'blocked') && (
            <button
              onClick={() => { onTransition('awaiting_approval', { decisionSummary: decisionText }); setDecisionText(''); }}
              disabled={disabled || decisionText.trim() === ''}
            >
              Request approval
            </button>
          )}
          {status === 'in_progress' && (
            <button
              className="primary"
              onClick={() => onTransition('completed')}
              disabled={disabled || completionProblems.length > 0}
              title={completionProblems.join(' ')}
            >
              Complete
            </button>
          )}
          {!confirmCancel && (
            <button
              ref={cancelOpenerRef}
              onClick={() => { setConfirmCancel(true); setPendingFocus('confirm'); }}
              disabled={disabled}
            >
              Cancel record…
            </button>
          )}
        </div>
      )}
      {!terminal && confirmCancel && (
        <div role="group" aria-labelledby={`${idp}-cancel-desc`}>
          <p id={`${idp}-cancel-desc`} className="notice">
            Cancel this execution record? Cancelling is terminal: the record becomes
            permanently read-only. Nothing external is affected — DavidOS sent and
            executed nothing.
          </p>
          <div className="btn-row">
            <button
              ref={confirmCancelRef}
              className="danger"
              aria-describedby={`${idp}-cancel-desc`}
              onClick={() => { onTransition('cancelled'); setConfirmCancel(false); setPendingFocus('heading'); }}
              disabled={disabled}
            >
              Confirm cancel (terminal)
            </button>
            <button onClick={() => { setConfirmCancel(false); setPendingFocus('opener'); }}>
              Keep record
            </button>
          </div>
        </div>
      )}
      {status === 'in_progress' && completionProblems.length > 0 && (
        <p className="muted small">
          Complete is unavailable: {completionProblems.join(' ')}
        </p>
      )}
    </div>
  );
}
