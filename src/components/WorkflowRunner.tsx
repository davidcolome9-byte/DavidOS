import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AGENTS, getAgent } from '../lib/agents/agentRegistry';
import { WORKFLOWS, getWorkflow } from '../lib/workflows/workflowRegistry';
import { renderTemplate, summarizeInput } from '../lib/workflows/templateRenderer';
import { useStore, upsert } from '../state/store';
import { uid, nowIso } from '../lib/types';
import type { AgentId, Handoff, Workflow } from '../lib/types';
import RiskBadge from './RiskBadge';

/**
 * Workflow Runner: pick a workflow, paste messy input, choose an output
 * style, and generate an AI-ready prompt/handoff — locally, no API calls.
 */
export default function WorkflowRunner() {
  const [params, setParams] = useSearchParams();
  const { update, audit } = useStore();

  const preselected = getWorkflow(params.get('wf') ?? '');
  const [agentFilter, setAgentFilter] = useState<AgentId | 'all'>(preselected?.agentId ?? 'all');
  const [workflow, setWorkflow] = useState<Workflow | null>(preselected ?? null);
  const [input, setInput] = useState(params.get('input') ?? '');
  const [style, setStyle] = useState(preselected?.outputStyles[0] ?? '');
  const [output, setOutput] = useState('');
  const [flash, setFlash] = useState('');

  // Sync when arriving via a link like /workflows?wf=fitness-handoff
  useEffect(() => {
    const wf = getWorkflow(params.get('wf') ?? '');
    if (wf && wf.id !== workflow?.id) {
      setWorkflow(wf);
      setAgentFilter(wf.agentId);
      setStyle(wf.outputStyles[0]);
      setOutput('');
      const linkedInput = params.get('input');
      if (linkedInput) setInput(linkedInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const visibleWorkflows = useMemo(
    () => (agentFilter === 'all' ? WORKFLOWS : WORKFLOWS.filter((w) => w.agentId === agentFilter)),
    [agentFilter],
  );

  function pick(wf: Workflow) {
    setWorkflow(wf);
    setStyle(wf.outputStyles[0]);
    setOutput('');
    setParams({ wf: wf.id }, { replace: true });
  }

  function generate() {
    if (!workflow) return;
    const rendered = renderTemplate(workflow, input, style);
    setOutput(rendered);
    audit({
      command: `Run workflow: ${workflow.name}`,
      agentId: workflow.agentId,
      workflowId: workflow.id,
      actionType: workflow.risk,
      approvalStatus: 'not_required',
      resultSummary: `Generated ${style} (${rendered.length} chars) — draft only, nothing sent anywhere.`,
    });
    setFlash('');
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(output);
      setFlash('Copied to clipboard.');
    } catch {
      setFlash('Clipboard unavailable — select the text manually.');
    }
  }

  function saveHandoff() {
    if (!workflow || !output) return;
    const handoff: Handoff = {
      id: uid(),
      agentId: workflow.agentId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      inputSummary: summarizeInput(input),
      outputStyle: style,
      output,
      risk: workflow.risk,
      createdAt: nowIso(),
    };
    update((s) => ({ ...s, handoffs: [handoff, ...s.handoffs] }));
    audit({
      command: `Save handoff: ${workflow.name}`,
      agentId: workflow.agentId,
      workflowId: workflow.id,
      actionType: 'local_write',
      approvalStatus: 'not_required',
      resultSummary: 'Handoff saved to local vault (Logs → Handoffs).',
    });
    setFlash('Saved locally — this device only. View under Logs → Handoffs.');
  }

  function addOpenLoop() {
    if (!workflow) return;
    const label = `Follow up: ${workflow.name} — ${summarizeInput(input)}`;
    update((s) => ({
      ...s,
      openLoops: upsert(s.openLoops, { id: uid(), label, status: 'open', createdAt: nowIso() }),
    }));
    setFlash('Open loop added — local only.');
  }

  const agent = workflow ? getAgent(workflow.agentId) : undefined;

  return (
    <>
      <div className="card">
        <h2>Workflow Runner</h2>
        <div className="btn-row">
          <button className={`chip ${agentFilter === 'all' ? 'selected' : ''}`} onClick={() => setAgentFilter('all')}>All</button>
          {AGENTS.map((a) => (
            <button
              key={a.id}
              className={`chip ${agentFilter === a.id ? 'selected' : ''}`}
              onClick={() => setAgentFilter(a.id)}
            >
              {a.icon}
            </button>
          ))}
        </div>
        <ul className="plain">
          {visibleWorkflows.map((w) => (
            <li key={w.id} className="row">
              <div>
                <strong className="small">{w.name}</strong>
                <div className="muted small">{w.description}</div>
              </div>
              <button className={`chip ${workflow?.id === w.id ? 'selected' : ''}`} onClick={() => pick(w)}>
                {workflow?.id === w.id ? 'Selected' : 'Select'}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {workflow && (
        <div className="card">
          <h2>
            <span>{agent?.icon} {workflow.name}</span>
            <RiskBadge risk={workflow.risk} />
          </h2>
          <p className="muted small">{workflow.description}</p>

          <label className="field" htmlFor="wf-input">Input — messy notes are fine</label>
          <textarea
            id="wf-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={workflow.inputHint}
          />

          <label className="field" htmlFor="wf-style">Output style</label>
          <select id="wf-style" value={style} onChange={(e) => setStyle(e.target.value)}>
            {workflow.outputStyles.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <div className="btn-row">
            <button className="primary" onClick={generate}>Generate</button>
          </div>

          {output && (
            <>
              <h3 className="row">
                Output
                <span className="badge ok">Draft only — nothing left this device</span>
              </h3>
              <p className="muted small">
                Agent: {agent?.name} · Workflow: {workflow.name} · Style: {style}
              </p>
              {workflow.assumptions.length > 0 && (
                <details>
                  <summary className="muted small">Assumptions ({workflow.assumptions.length})</summary>
                  <ul className="plain small">
                    {workflow.assumptions.map((a) => <li key={a}>• {a}</li>)}
                  </ul>
                </details>
              )}
              <pre className="output">{output}</pre>
              <p className="muted small">Next action: {workflow.nextAction}</p>
              <div className="btn-row">
                <button className="primary" onClick={copyOutput}>Copy</button>
                <button onClick={saveHandoff}>Save handoff</button>
                <button onClick={addOpenLoop}>Add open loop</button>
              </div>
              {flash && <p className="notice flash">{flash}</p>}
            </>
          )}
        </div>
      )}
    </>
  );
}
