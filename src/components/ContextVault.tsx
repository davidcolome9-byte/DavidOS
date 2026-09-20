import { useEffect, useRef, useState } from 'react';
import { useStore, upsert } from '../state/store';
import type { ContextItem, ContextKind } from '../lib/types';
import { uid, nowIso } from '../lib/types';
import { redactedCommandLabel } from '../lib/audit/redaction';

const KIND_LABEL: Record<ContextKind, string> = {
  stable: 'Stable context',
  priorities: 'Current priorities',
  private: 'Private / sensitive',
  workflow: 'Workflow-specific',
  session: 'Temporary session',
};

const KIND_TONE: Record<ContextKind, string> = {
  stable: 'info',
  priorities: 'ok',
  private: 'danger',
  workflow: 'neutral',
  session: 'warn',
};

const KIND_ORDER: ContextKind[] = ['stable', 'priorities', 'workflow', 'session', 'private'];

// The kind starts unset so choosing one (especially "Private / sensitive") is
// a deliberate act rather than a silently accepted default.
interface NewContextDraft {
  title: string;
  kind: ContextKind | '';
  body: string;
}

const EMPTY_DRAFT: NewContextDraft = { title: '', kind: '', body: '' };

export default function ContextVault() {
  const { state, update, audit } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState<NewContextDraft | null>(null);
  const [flash, setFlash] = useState('');
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const isCreating = creating !== null;

  // Land on the first field when the create form opens.
  useEffect(() => {
    if (isCreating) titleRef.current?.focus();
  }, [isCreating]);

  function startEdit(item: ContextItem) {
    setEditingId(item.id);
    setDraft(item.body);
  }

  function save(item: ContextItem) {
    update((s) => ({
      ...s,
      contextItems: upsert(s.contextItems, { ...item, body: draft, updatedAt: nowIso() }),
    }));
    // Context titles and bodies are personal free text — the audit record
    // stores only the event type, a non-reversible fingerprint of the title,
    // and lengths (POST-H-PRIV-01, same rule as Project/Prompt audits).
    audit({
      command: redactedCommandLabel('context_updated', item.title),
      actionType: 'local_write',
      approvalStatus: 'not_required',
      actionTaken: true,
      resultSummary: `Context item updated · body ${draft.length} chars.`,
    });
    setEditingId(null);
  }

  function openNew() {
    setFlash('');
    if (creating) titleRef.current?.focus();
    else setCreating({ ...EMPTY_DRAFT });
  }

  function cancelNew() {
    setCreating(null);
    newButtonRef.current?.focus();
  }

  const titleMissing = creating !== null && creating.title.trim() === '';
  const kindMissing = creating !== null && creating.kind === '';
  const bodyMissing = creating !== null && creating.body.trim() === '';
  const newInvalid = titleMissing || kindMissing || bodyMissing;

  function saveNew() {
    if (!creating || creating.kind === '' || newInvalid) return;
    const { title, kind, body } = creating;
    const item: ContextItem = { id: uid(), title: title.trim(), kind, body, updatedAt: nowIso() };
    update((s) => ({ ...s, contextItems: upsert(s.contextItems, item) }));
    // Same privacy rule as edits: the title fingerprint and lengths only. The
    // kind is a fixed enum, so it is safe to record.
    audit({
      command: redactedCommandLabel('context_created', item.title),
      actionType: 'local_write',
      approvalStatus: 'not_required',
      actionTaken: true,
      resultSummary: `Context item created · kind ${kind} · body ${body.length} chars.`,
    });
    setCreating(null);
    // Persistence is asynchronous and can fail or pause; the app-wide storage
    // status is the source of truth for durability, so don't claim it here.
    setFlash('Context item added. Device saving follows the app storage status.');
    newButtonRef.current?.focus();
  }

  const sorted = [...state.contextItems].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  );

  return (
    <>
      <div className="card">
        <h2 className="wrap">
          Context Vault
          <button ref={newButtonRef} className="primary" onClick={openNew}>
            + New context item
          </button>
        </h2>
        <p className="muted small">
          AI-ready context, layered by stability. Private items stay on-device —
          never paste them into external tools without deliberately deciding to.
        </p>
        {flash && <p className="notice flash" role="status">{flash}</p>}
        {sorted.length === 0 && (
          <p className="muted small" data-testid="context-empty">
            No context items yet. Use <strong>+ New context item</strong> to add stable facts,
            current priorities, or constraints your AI prompts can reuse. Items stay on this device.
          </p>
        )}
        {sorted.map((item) => (
          <details className="item" key={item.id}>
            <summary>
              <span className="small"><strong>{item.title}</strong></span>
              <span className={`badge ${KIND_TONE[item.kind]}`}>{KIND_LABEL[item.kind]}</span>
            </summary>
            {editingId === item.id ? (
              <>
                <label className="field" htmlFor={`context-body-${item.id}`}>Context body</label>
                <textarea
                  id={`context-body-${item.id}`}
                  style={{ minHeight: 160 }}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="btn-row">
                  <button className="primary" onClick={() => save(item)}>Save (local)</button>
                  <button onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <pre className="output">{item.body}</pre>
                <div className="btn-row">
                  <button onClick={() => startEdit(item)}>Edit</button>
                </div>
              </>
            )}
          </details>
        ))}
      </div>

      {creating && (
        <div className="card" style={{ borderColor: 'var(--accent)' }} data-testid="context-new-form">
          <h2>New context item</h2>
          <p className="notice small" data-testid="context-local-write-notice">
            Saving is a local write: this item is stored on this device only. Nothing is sent anywhere.
          </p>
          <label className="field" htmlFor="context-title">Title <span aria-hidden="true">*</span><span className="visually-hidden"> (required)</span></label>
          <input
            id="context-title"
            ref={titleRef}
            type="text"
            value={creating.title}
            onChange={(e) => setCreating({ ...creating, title: e.target.value })}
            aria-invalid={titleMissing}
            aria-describedby={newInvalid ? 'context-new-hint' : undefined}
          />
          <label className="field" htmlFor="context-kind">Kind <span aria-hidden="true">*</span><span className="visually-hidden"> (required)</span></label>
          <select
            id="context-kind"
            value={creating.kind}
            onChange={(e) => setCreating({ ...creating, kind: e.target.value as ContextKind | '' })}
            aria-invalid={kindMissing}
            aria-describedby={newInvalid ? 'context-new-hint' : undefined}
          >
            <option value="">Choose a kind…</option>
            {KIND_ORDER.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <label className="field" htmlFor="context-new-body">Body <span aria-hidden="true">*</span><span className="visually-hidden"> (required)</span></label>
          <textarea
            id="context-new-body"
            style={{ minHeight: 160 }}
            value={creating.body}
            onChange={(e) => setCreating({ ...creating, body: e.target.value })}
            aria-invalid={bodyMissing}
            aria-describedby={newInvalid ? 'context-new-hint' : undefined}
          />
          {newInvalid && (
            <p id="context-new-hint" className="notice small" role="alert">
              A title, a kind, and a body are all required to save this item.
            </p>
          )}
          <div className="btn-row">
            <button className="primary" onClick={saveNew} disabled={newInvalid}>Save (local)</button>
            <button onClick={cancelNew}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
