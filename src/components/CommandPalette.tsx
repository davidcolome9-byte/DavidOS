import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { COMMANDS, matchCommand, resolveDomainRouteCommand, workflowTargetToParams } from '../lib/commands';
import { redactedCommandLabel } from '../lib/audit/redaction';
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
 *   no connected executable route, so nothing is sent - and we say so plainly.
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
      const params = workflowTargetToParams(target, args);
      if (params) navigate(`/workflows?${params}`);
    } else if (target === 'route') {
      routeFreeText(args);
    } else if (target === 'domain-route') {
      const resolution = resolveDomainRouteCommand(args);
      if (!resolution.route) {
        routeFreeText(resolution.routeInput ?? args, {
          command: resolution.auditCommand,
          resultSummary: resolution.resultSummary,
        });
        return;
      }
      audit({
        command: resolution.auditCommand,
        workflowId: resolution.route.workflowId,
        actionType: 'read_only',
        approvalStatus: 'not_required',
        actionTaken: resolution.actionTaken,
        resultSummary: resolution.resultSummary,
      });
      navigate(resolution.navigationPath ?? `/workflows?wf=${resolution.route.workflowId}`);
    }
  }

  function routeFreeText(text: string, auditOptions?: { command?: string; resultSummary?: string }) {
    const r = routeIntent(text);
    const commandRisk = classifyCommand(text);
    const blocked = requiresApproval(commandRisk); // external_write and above
    const classSummary: Record<string, string> = {
      supported: `Routed -> ${r.target} (confidence ${r.confidence}). Draft-only, nothing sent.`,
      unsupported: `Recognized ${r.intentLabel ?? 'an unsupported intent'} — no workflow exists yet. Nothing routed.`,
      ambiguous: `Ambiguous request — asked for clarification. Nothing routed.`,
      multi_domain: `Multiple independent goals detected — asked which to handle first. Nothing routed.`,
      unknown: `No confident match. Nothing routed.`,
    };
    const defaultSummary = blocked
      ? `Risky command detected (${RISK_LABELS[commandRisk]}), but no executable route is connected. Nothing was sent or changed.`
      : classSummary[r.classification];
    setResult(r);
    setRisk(commandRisk);
    setRoutedInput(text);
    // Never persist the raw command. Store a safe event label with the route
    // classification and a non-reversible fingerprint (F-05). The routed text
    // stays in component state (routedInput) for the live UI only.
    audit({
      command: auditOptions?.command ?? redactedCommandLabel(`Routed command (${r.classification})`, text),
      agentId: r.target === 'unknown' ? undefined : r.target,
      workflowId: r.suggestedWorkflowId,
      actionType: commandRisk,
      approvalStatus: blocked ? 'blocked' : 'not_required',
      actionTaken: false,
      resultSummary: auditOptions?.resultSummary ?? defaultSummary,
    });
  }

  function submit() {
    const text = input.trim();
    if (!text) return;
    const cmd = matchCommand(text);
    if (cmd) {
      if (cmd.command.target !== 'domain-route') {
        // Log the slash keyword only — the full typed line may carry free text.
        audit({
          command: `Slash command ${cmd.command.slash}`,
          actionType: 'read_only',
          approvalStatus: 'not_required',
          actionTaken: true,
          resultSummary: `Slash command ${cmd.command.slash}`,
        });
      }
      runCommandTarget(cmd.command.target, cmd.args);
      if (cmd.command.target !== 'route' && cmd.command.target !== 'domain-route') setInput('');
      return;
    }
    routeFreeText(text);
  }

  const agent = result && result.target !== 'unknown' ? getAgent(result.target) : undefined;
  const recognizedAgent = result?.recognizedDomain ? getAgent(result.recognizedDomain) : undefined;
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
        placeholder='Type a request, or "/" for commands...'
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

      {/* Honest safety banner for risky commands - shown whether or not an agent matched. */}
      {isExternalRisk && (
        <div className="notice risk-block" style={{ borderStyle: 'solid' }}>
          <p className="row">
            <strong>This looks like an external action.</strong>
            {risk && <RiskBadge risk={risk} />}
          </p>
          <p className="muted small">No matching executable route is connected in this version.</p>
          <p className="muted small"><strong>Nothing was sent or changed.</strong> {agent && 'You can still draft it below - drafting never leaves this device.'}</p>
        </div>
      )}
      {isLocalRisk && (
        <div className="notice" style={{ borderStyle: 'solid' }}>
          <p className="row"><strong>Heads up - local change</strong>{risk && <RiskBadge risk={risk} />}</p>
          <p className="muted small">This would write to your local DavidOS data on this device only.</p>
        </div>
      )}

      {result && (
        <div className="notice" style={{ borderStyle: 'solid' }}>
          {result.classification === 'unknown' ? (
            <>
              <p><strong>No confident match.</strong> {result.reasoning}</p>
              <p className="muted">{result.nextAction}</p>
            </>
          ) : result.classification === 'unsupported' ? (
            <>
              <p className="row">
                <strong>{recognizedAgent?.icon} Recognized: {recognizedAgent?.name ?? result.intentLabel}</strong>
                <span className="badge neutral">no workflow yet</span>
              </p>
              <p className="muted small">This looks like <strong>{result.intentLabel}</strong>. There's no workflow for it in this version.</p>
              <p className="muted small"><strong>Nothing was routed.</strong> {result.nextAction}</p>
            </>
          ) : result.classification === 'multi_domain' ? (
            <>
              <p><strong>This request has more than one goal.</strong></p>
              <ul className="plain small">
                {result.domains?.map((d, i) => (
                  <li key={i} className="muted">• {d.label}</li>
                ))}
              </ul>
              <p className="muted small">{result.nextAction}</p>
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
              {result.alternatives && result.alternatives.length > 0 ? (
                <div className="btn-row">
                  {result.alternatives.map((alt) => (
                    <Link
                      key={alt.workflowId}
                      className="btn"
                      to={`/workflows?wf=${alt.workflowId}&input=${encodeURIComponent(routedInput)}`}
                    >
                      {alt.label}
                    </Link>
                  ))}
                </div>
              ) : (
                workflow && (
                  <Link
                    className="btn primary"
                    to={`/workflows?wf=${workflow.id}&input=${encodeURIComponent(routedInput)}`}
                  >
                    {isExternalRisk ? `Draft with ${workflow.name}` : `Run ${workflow.name}`}
                  </Link>
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
