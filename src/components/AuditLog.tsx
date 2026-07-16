import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../state/store';
import { getAgent } from '../lib/agents/agentRegistry';
import { resolveLogsTab, type LogsTab } from '../lib/workflows/logsTabs';
import { uid, nowIso } from '../lib/types';
import type { Handoff } from '../lib/types';
import RiskBadge from './RiskBadge';

/** Logs page: audit trail + saved handoffs. */
export default function AuditLog() {
  const { state, update, audit } = useStore();
  const [params, setParams] = useSearchParams();
  // The active tab is a pure function of the URL `tab` param, so browser Back
  // and Forward move between tabs, and an invalid/missing value falls back
  // honestly to the audit log. Switching tabs pushes a history entry.
  const tab: LogsTab = resolveLogsTab(params.get('tab'));
  const setTab = (next: LogsTab) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', next);
      return p;
    });
  };
  const [flash, setFlash] = useState('');
  const [correcting, setCorrecting] = useState<Handoff | null>(null);
  const [correctionText, setCorrectionText] = useState('');

  // Append a correction (never mutate the original's content). The original is
  // marked superseded and the new entry points back at it via correctsHandoffId,
  // so continuity retrieval prefers the correction automatically.
  function saveCorrection() {
    if (!correcting) return;
    const original = correcting;
    const correction: Handoff = {
      id: uid(),
      agentId: original.agentId,
      workflowId: original.workflowId,
      workflowName: original.workflowName,
      inputSummary: original.inputSummary,
      outputStyle: original.outputStyle,
      content: correctionText,
      risk: original.risk,
      createdAt: nowIso(),
      entryDate: original.entryDate,
      dateConfidence: original.dateConfidence,
      status: 'correction',
      correctsHandoffId: original.id,
    };
    update((s) => ({
      ...s,
      handoffs: [correction, ...s.handoffs.map((h) => (h.id === original.id ? { ...h, status: 'superseded' as const } : h))],
    }));
    audit({
      command: 'handoff_corrected',
      workflowId: original.workflowId,
      actionType: 'local_write',
      approvalStatus: 'not_required',
      actionTaken: true,
      resultSummary: `Correction saved for handoff ${original.id.slice(0, 8)} (${original.workflowName}); original marked superseded.`,
    });
    setCorrecting(null);
    setCorrectionText('');
    setFlash('Correction saved. The original entry is now superseded.');
  }

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
        <button className={`chip ${tab === 'artifacts' ? 'selected' : ''}`} onClick={() => setTab('artifacts')}>
          Artifacts ({state.artifacts.length})
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
          {state.handoffs.map((h) => {
            const supersededBy = h.status === 'superseded'
              ? state.handoffs.find((x) => x.correctsHandoffId === h.id)
              : undefined;
            const correctsName = h.status === 'correction' && h.correctsHandoffId
              ? state.handoffs.find((x) => x.id === h.correctsHandoffId)
              : undefined;
            return (
            <details className="item" key={h.id} data-testid="handoff-item">
              <summary>
                <span className="small">
                  <strong>{h.workflowName}</strong>
                  <span className="muted"> · {new Date(h.createdAt).toLocaleDateString()}</span>
                  {h.status === 'superseded' && <span className="badge neutral" style={{ marginLeft: 6 }}>Superseded</span>}
                  {h.status === 'correction' && <span className="badge info" style={{ marginLeft: 6 }}>Correction</span>}
                </span>
                <RiskBadge risk={h.risk} />
              </summary>
              <p className="muted small">Input: {h.inputSummary} · Style: {h.outputStyle}</p>
              {supersededBy && (
                <p className="muted small" data-testid="superseded-note">↳ Superseded by a correction on {new Date(supersededBy.createdAt).toLocaleDateString()}.</p>
              )}
              {correctsName && (
                <p className="muted small" data-testid="corrects-note">↳ Corrects an earlier “{correctsName.workflowName}” entry (now superseded).</p>
              )}
              <pre className="output">{h.content ?? h.output}</pre>
              <div className="btn-row">
                <button className="primary" onClick={() => copy(h.content ?? h.output ?? '')}>Copy</button>
                {h.status !== 'superseded' && (
                  <button onClick={() => { setCorrecting(h); setCorrectionText(h.content ?? h.output ?? ''); }}>Correct this entry</button>
                )}
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
            );
          })}

          {correcting && (
            <div className="card" style={{ borderColor: 'var(--accent)' }} data-testid="correction-editor">
              <h3>Correct: {correcting.workflowName}</h3>
              <p className="muted small">
                This saves a NEW correction entry and marks the original as superseded — the original
                text is preserved, not overwritten. Future workflow runs use the correction.
              </p>
              <label className="field" htmlFor="correction-body">Corrected content</label>
              <textarea id="correction-body" rows={8} value={correctionText} onChange={(e) => setCorrectionText(e.target.value)} />
              <div className="btn-row">
                <button className="primary" onClick={saveCorrection} disabled={correctionText.trim() === ''}>Save correction</button>
                <button onClick={() => { setCorrecting(null); setCorrectionText(''); }}>Cancel</button>
              </div>
            </div>
          )}
          {state.handoffs.length === 0 && (
            <p className="muted small">No handoffs saved yet — build a prompt and hit “Save to Workflow History”.</p>
          )}
        </div>
      )}

      {tab === 'artifacts' && (
        <div className="card">
          <h2>Generated artifacts</h2>
          <p className="muted small">
            Full generated prompts you explicitly saved. Separate from handoff history — artifacts are
            never pulled into future continuity.
          </p>
          {state.artifacts.map((a) => (
            <details className="item" key={a.id}>
              <summary>
                <span className="small">
                  <strong>{a.artifactType.replace(/_/g, ' ')}</strong>
                  <span className="muted"> · {a.workflowId} · {new Date(a.createdAt).toLocaleDateString()}</span>
                </span>
                <span className="badge neutral">{a.shortFingerprint ?? ''}</span>
              </summary>
              <p className="muted small">
                {a.priorHandoffCount ?? 0} prior handoffs · {a.historyStrategy ?? 'default'} history
                {a.rawFallbackUsed ? ' · raw fallback used' : ''}
                {a.healthProfilePromptMetadata?.healthProfileIncluded
                  ? ` · Health Profile included (${a.healthProfilePromptMetadata.promptContextFingerprint ?? ''})`
                  : ''}
              </p>
              <pre className="output">{a.content}</pre>
              <div className="btn-row">
                <button className="primary" onClick={() => copy(a.content)}>Copy</button>
                <button
                  className="danger"
                  onClick={() =>
                    window.confirm('Delete this artifact?') &&
                    update((s) => ({ ...s, artifacts: s.artifacts.filter((x) => x.id !== a.id) }))
                  }
                >
                  Delete
                </button>
              </div>
            </details>
          ))}
          {state.artifacts.length === 0 && (
            <p className="muted small">No saved prompts yet — build a prompt and hit “Save Prompt”.</p>
          )}
        </div>
      )}
    </>
  );
}
