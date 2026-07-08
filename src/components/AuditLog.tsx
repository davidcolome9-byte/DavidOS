import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../state/store';
import { getAgent } from '../lib/agents/agentRegistry';
import RiskBadge from './RiskBadge';

/** Logs page: audit trail + saved handoffs. */
export default function AuditLog() {
  const { state, update } = useStore();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'audit' | 'handoffs'>(params.get('tab') === 'handoffs' ? 'handoffs' : 'audit');
  const [flash, setFlash] = useState('');

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setFlash('Copied.');
    } catch {
      setFlash('Clipboard unavailable.');
    }
  }

  return (
    <>
      <div className="btn-row" style={{ padding: '0 4px' }}>
        <button className={`chip ${tab === 'audit' ? 'selected' : ''}`} onClick={() => setTab('audit')}>
          Audit log ({state.auditLog.length})
        </button>
        <button className={`chip ${tab === 'handoffs' ? 'selected' : ''}`} onClick={() => setTab('handoffs')}>
          Handoffs ({state.handoffs.length})
        </button>
      </div>

      {flash && <p className="notice flash">{flash}</p>}

      {tab === 'audit' && (
        <div className="card">
          <h2>
            Audit log
            {state.auditLog.length > 0 && (
              <button
                className="chip danger"
                onClick={() => window.confirm('Clear the audit log? Local only.') && update((s) => ({ ...s, auditLog: [] }))}
              >
                Clear
              </button>
            )}
          </h2>
          <p className="muted small">Every routed command, workflow run, and approval decision — stored locally.</p>
          {state.auditLog.map((e) => (
            <div key={e.id} className="audit-entry">
              <div className="row">
                <span className="when">{new Date(e.timestamp).toLocaleString()}</span>
                <RiskBadge risk={e.actionType} />
              </div>
              <div><strong>{e.command}</strong></div>
              <div className="muted">
                {e.agentId ? `${getAgent(e.agentId)?.name ?? e.agentId} · ` : ''}
                {e.workflowId ? `${e.workflowId} · ` : ''}
                approval: {e.approvalStatus}
              </div>
              <div className="muted">{e.resultSummary}</div>
            </div>
          ))}
          {state.auditLog.length === 0 && <p className="muted small">Nothing logged yet.</p>}
        </div>
      )}

      {tab === 'handoffs' && (
        <div className="card">
          <h2>Saved handoffs</h2>
          {state.handoffs.map((h) => (
            <details className="item" key={h.id}>
              <summary>
                <span className="small">
                  <strong>{h.workflowName}</strong>
                  <span className="muted"> · {new Date(h.createdAt).toLocaleDateString()}</span>
                </span>
                <RiskBadge risk={h.risk} />
              </summary>
              <p className="muted small">Input: {h.inputSummary} · Style: {h.outputStyle}</p>
              <pre className="output">{h.output}</pre>
              <div className="btn-row">
                <button className="primary" onClick={() => copy(h.output)}>Copy</button>
                <button
                  className="danger"
                  onClick={() =>
                    window.confirm('Delete this handoff?') &&
                    update((s) => ({ ...s, handoffs: s.handoffs.filter((x) => x.id !== h.id) }))
                  }
                >
                  Delete
                </button>
              </div>
            </details>
          ))}
          {state.handoffs.length === 0 && (
            <p className="muted small">No handoffs saved yet — run a workflow and hit “Save handoff”.</p>
          )}
        </div>
      )}
    </>
  );
}
