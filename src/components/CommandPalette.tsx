import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { COMMANDS, matchCommand } from '../lib/commands';
import { routeIntent } from '../lib/router/intentRouter';
import { classifyCommand } from '../lib/safety/riskClassifier';
import { requiresApproval, requiresLocalNotice, RISK_LABELS } from '../lib/safety/approvalRules';
import { getAgent } from '../lib/agents/agentRegistry';
import { getWorkflow } from '../lib/workflows/workflowRegistry';
import { useStore } from '../state/store';
import type { RouteResult, RiskLevel } from '../lib/types';
import RiskBadge from './RiskBadge';

/**
 * Command input + "Route This" classifier.
 * - Text starting with "/" runs a slash command.
 * - Free text is routed to an agent AND risk-classified.
 * - Risky commands (external write and above) surface an honest no-op: v1 has
 *   no connected executable route, so nothing is sent — and we say so plainly.
 */
export default function CommandPalette() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<RouteResult | null>(null);
  const [risk, setRisk] = useState<RiskLevel | null>(null);
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
    }
  }

  function routeFreeText(text: string) {
    const r = routeIntent(text);
    const commandRisk = classifyCommand(text);
    const blocked = requiresApproval(commandRisk); // external_write and above
    setResult(r);
    setRisk(commandRisk);
    setRoutedInput(text);
    audit({
      command: text || '(empty)',
      agentId: r.target === 'unknown' ? undefined : r.target,
      workflowId: r.suggestedWorkflowId,
      actionType: commandRisk,
      approvalStatus: blocked ? 'blocked' : 'not_required',
      actionTaken: false,
      resultSummary: blocked
        ? `Risky command detected (${RISK_LABELS[commandRisk]}), but no executable route is connected. Nothing was sent or changed.`
        : `Routed → ${r.target} (confidence ${r.confidence}). Draft-only, nothing sent.`,
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
        actionTaken: true,
        resultSummary: `Slash command ${cmd.command.slash}`,
      });
      runCommandTarget(cmd.command.target, cmd.args);
      if (cmd.command.target !== 'route') setInput('');
      return;
    }
    routeFreeText(text);
  }

  const agent = result && result.target !== 'unknown' ? getAgent(result.target) : undefined;
  const workflow = result?.suggestedWorkflowId ? getWorkflow(result.suggestedWorkflowId) : undefined;
  const isExternalRisk = risk ? requiresApproval(risk) : false;
  const isLocalRisk = risk ? requiresLocalNotice(risk) : false;

  return (
    <div className="card">
      <h2>Command</h2>
      <input
        type="text"
        value={input}
        onChange={(e) => { setInput(e.target.value); setResult(null); setRisk(null); }}
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
        <button className="ghost" onClick={() => { setInput(''); setResult(null); setRisk(null); }}>Clear</button>
      </div>

      {/* Honest safety banner for risky commands — shown whether or not an agent matched. */}
      {isExternalRisk && (
        <div className="notice risk-block" style={{ borderStyle: 'solid' }}>
          <p className="row">
            <strong>⛔ This looks like an external action.</strong>
            {risk && <RiskBadge risk={risk} />}
          </p>
          <p className="muted small">No matching executable route is connected in this version.</p>
          <p className="muted small"><strong>Nothing was sent or changed.</strong> {agent && 'You can still draft it below — drafting never leaves this device.'}</p>
        </div>
      )}
      {isLocalRisk && (
        <div className="notice" style={{ borderStyle: 'solid' }}>
          <p className="row"><strong>Heads up — local change</strong>{risk && <RiskBadge risk={risk} />}</p>
          <p className="muted small">This would write to your local DavidOS data on this device only.</p>
        </div>
      )}

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
                  {isExternalRisk ? `Draft with ${workflow.name}` : `Run ${workflow.name}`}
                </Link>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
