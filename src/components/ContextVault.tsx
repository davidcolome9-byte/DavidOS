import { useState } from 'react';
import { useStore, upsert } from '../state/store';
import type { ContextItem, ContextKind } from '../lib/types';
import { nowIso } from '../lib/types';

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

export default function ContextVault() {
  const { state, update, audit } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  function startEdit(item: ContextItem) {
    setEditingId(item.id);
    setDraft(item.body);
  }

  function save(item: ContextItem) {
    update((s) => ({
      ...s,
      contextItems: upsert(s.contextItems, { ...item, body: draft, updatedAt: nowIso() }),
    }));
    audit({
      command: `Edit context: ${item.title}`,
      actionType: 'local_write',
      approvalStatus: 'not_required',
      resultSummary: 'Context item saved locally.',
    });
    setEditingId(null);
  }

  const sorted = [...state.contextItems].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  );

  return (
    <div className="card">
      <h2>Context Vault</h2>
      <p className="muted small">
        AI-ready context, layered by stability. Private items stay on-device —
        never paste them into external tools without deliberately deciding to.
      </p>
      {sorted.map((item) => (
        <details className="item" key={item.id}>
          <summary>
            <span className="small"><strong>{item.title}</strong></span>
            <span className={`badge ${KIND_TONE[item.kind]}`}>{KIND_LABEL[item.kind]}</span>
          </summary>
          {editingId === item.id ? (
            <>
              <textarea style={{ minHeight: 160 }} value={draft} onChange={(e) => setDraft(e.target.value)} />
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
  );
}
