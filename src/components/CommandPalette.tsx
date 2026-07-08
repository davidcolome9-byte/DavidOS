import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { COMMANDS, matchCommand } from '../lib/commands';
import { routeIntent } from '../lib/router/intentRouter';
import { classifyCommand } from '../lib/safety/riskClassifier';
import { getAgent } from '../lib/agents/agentRegistry';
import { getWorkflow } from '../lib/workflows/workflowRegistry';
import { useStore } from '../state/store';
import type { RouteResult } from '../lib/types';
import RiskBadge from './RiskBadge';

/**
 * Command input + "Route This" classifier. Free text is routed to an
 * agent; text starting with "/" is treated as a slash command.
 */
export default function CommandPalette() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<RouteResult | null>(null);
  const [routedInput, setRoutedInput] = useState('');
  const navigate = useNavigate();
  const { audit } = useStore();

  const showSuggestions = input.trim().startsWith('/');
  const suggestions = showSuggestions
    ? COMMANDS.filter((c) => c.slash.startsWith(input.trim().toLowerCase())).slice(0, 6)
    : [];

  function runCommandTarget(target: string, args: string) {
    if (target.startsWith('nav:')) {
      navigate(target.slice(4));
    } else if (target.startsWith('wf:')) {
      const params = new URLSearchParams({ wf: target.slice(3) });
      if (args) params.set('input', args);
      navigate(`/workflows?${params}`);
    } else if (target === 'route') {
      routeFreeText(args);
      return;
    }
  }

  function routeFreeText(text: string) {
    const r = routeIntent(text);
    setResult(r);
    setRoutedInput(text);
    audit({
      command: text || '(empty)',
      agentId: r.target === 'unknown' ? undefined : r.target,
      workflowId: r.suggestedWorkflowId,
      actionType: classifyCommand(text),
      approvalStatus: 'not_required',
      resultSummary: `Routed → ${r.target} (confidence ${r.confidence})`,
    });
  }

  function submit() {
    const text = input.trim();
    if (!text) return;
    const cmd = matchCommand(text);
    if (cmd) {
      audit({
        command: text,
        actionType: 'read_only',
        approvalStatus: 'not_required',
        resultSummary: `Slash command ${cmd.command.slash}`,
      });
      runCommandTarget(cmd.command.target, cmd.args);
      setInput('');
      return;
    }
    routeFreeText(text);
  }

  const agent = result && result.target !== 'unknown' ? getAgent(result.target) : undefined;
  const workflow = result?.suggestedWorkflowId ? getWorkflow(result.suggestedWorkflowId) : undefined;

  return (
    <div className="card">
      <h2>Command</h2>
      <input
        type="text"
        value={input}
        onChange={(e) => { setInput(e.target.value); setResult(null); }}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder='Type a request, or "/" for commands…'
        aria-label="Command input"
      />
      {suggestions.length > 0 && (
        <ul className="plain small">
          {suggestions.map((c) => (
            <li key={c.slash} className="row">
              <button className="ghost chip" onClick={() => { setInput(c.slash + ' '); }}>
                <code>{c.slash}</code>
              </button>
              <span className="muted">{c.description}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="btn-row">
        <button className="primary" onClick={submit}>Route This</button>
        <button className="ghost" onClick={() => { setInput(''); setResult(null); }}>Clear</button>
      </div>

      {result && (
        <div className="notice" style={{ borderStyle: 'solid' }}>
          {result.target === 'unknown' ? (
            <>
              <p><strong>No confident match.</strong> {result.reasoning}</p>
              <p className="muted">{result.nextAction}</p>
            </>
          ) : (
            <>
              <p className="row">
                <strong>{agent?.icon} {agent?.name}</strong>
                <span className="badge neutral">confidence {result.confidence}</span>
              </p>
              <p className="muted small">{result.reasoning}</p>
              {workflow && (
                <p className="row small">
                  <span>Suggested: {workflow.name}</span>
                  <RiskBadge risk={workflow.risk} />
                </p>
              )}
              <p className="muted small">{result.nextAction}</p>
              {workflow && (
                <Link
                  className="btn primary"
                  to={`/workflows?wf=${workflow.id}&input=${encodeURIComponent(routedInput)}`}
                >
                  Run {workflow.name}
                </Link>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
