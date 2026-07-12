import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AGENTS, getAgent } from '../lib/agents/agentRegistry';
import { WORKFLOWS, getWorkflow } from '../lib/workflows/workflowRegistry';
import { summarizeInput } from '../lib/workflows/templateRenderer';
import { buildPrompt } from '../lib/workflows/continuity';
import type { BuiltPrompt } from '../lib/workflows/continuity';
import { resolveCategory, resolveHistoryProfile, historyTargetCount } from '../lib/workflows/workflowMeta';
import { buildProfilePromptBlock } from '../lib/health/profilePrompt';
import { parseEntryDate } from '../lib/workflows/dateParsing';
import { sha256Hex } from '../lib/utils/hash';
import { useStore, upsert } from '../state/store';
import { uid, nowIso } from '../lib/types';
import type { AgentId, Handoff, Workflow, WorkflowArtifact } from '../lib/types';
import RiskBadge from './RiskBadge';

type ViewMode = 'preview' | 'full_prompt';

/**
 * Workflow Runner (Phase 4+): continuity-aware prompt builder.
 * Pulls prior saved handoffs for the same workflow, extracts structured
 * context, optionally adds the Health Profile block, and generates a prompt
 * to copy into Claude/ChatGPT. No AI call happens here.
 */
export default function WorkflowRunner() {
  const [params, setParams] = useSearchParams();
  const { state, update, audit } = useStore();

  const preselected = getWorkflow(params.get('wf') ?? '');
  const [agentFilter, setAgentFilter] = useState<AgentId | 'all'>(preselected?.agentId ?? 'all');
  const [workflow, setWorkflow] = useState<Workflow | null>(preselected ?? null);
  const [input, setInput] = useState(params.get('input') ?? '');
  const [style, setStyle] = useState(preselected?.outputStyles[0] ?? '');
  const [built, setBuilt] = useState<BuiltPrompt | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [includeProfile, setIncludeProfile] = useState(true);
  const [profileRevealLevel, setProfileRevealLevel] = useState(0); // 0=summary 1=metadata 2=text
  const [flash, setFlash] = useState('');

  // Sync when arriving via a link like /workflows?wf=fitness-handoff
  useEffect(() => {
    const wf = getWorkflow(params.get('wf') ?? '');
    if (wf && wf.id !== workflow?.id) {
      setWorkflow(wf);
      setAgentFilter(wf.agentId);
      setStyle(wf.outputStyles[0]);
      setBuilt(null);
      const linkedInput = params.get('input');
      if (linkedInput) setInput(linkedInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const visibleWorkflows = useMemo(
    () => (agentFilter === 'all' ? WORKFLOWS : WORKFLOWS.filter((w) => w.agentId === agentFilter)),
    [agentFilter],
  );

  const isFitness = workflow ? resolveCategory(workflow) === 'fitness_health' : false;
  const historyProfile = workflow ? resolveHistoryProfile(workflow) : 'default';
  const hasProfileData = Boolean(state.healthProfile);
  const deepAnalysis = workflow?.outputMode === 'dashboard_full_analysis' || isFitness;

  const profileBlock = useMemo(() => {
    if (!isFitness || !includeProfile || !state.healthProfile) return null;
    return buildProfilePromptBlock(state.healthProfile, { deepAnalysis });
  }, [isFitness, includeProfile, state.healthProfile, deepAnalysis]);

  function pick(wf: Workflow) {
    setWorkflow(wf);
    setStyle(wf.outputStyles[0]);
    setBuilt(null);
    setFlash('');
    setParams({ wf: wf.id }, { replace: true });
  }

  function generate() {
    if (!workflow) return;
    const result = buildPrompt({
      workflow,
      input,
      style,
      allHandoffs: state.handoffs,
      profileBlock: profileBlock && !profileBlock.empty ? profileBlock.text : undefined,
      healthProfile: includeProfile ? state.healthProfile : null,
    });
    setBuilt(result);
    setProfileRevealLevel(0);
    audit({
      command: `Run workflow: ${workflow.name}`,
      agentId: workflow.agentId,
      workflowId: workflow.id,
      actionType: workflow.risk,
      approvalStatus: 'not_required',
      actionTaken: true,
      resultSummary:
        `Generated prompt ${result.fingerprint} · ${result.priorCount} prior handoffs · ` +
        `profile ${profileBlock && !profileBlock.empty ? 'included' : 'excluded'} — draft only, nothing sent.`,
    });
    setFlash('');
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setFlash(`${label} copied to clipboard.`);
    } catch {
      setFlash('Clipboard unavailable — switch to Full Prompt view and select manually.');
    }
    if (built && workflow) {
      audit({
        command: `Copy: ${label} (${workflow.name})`,
        agentId: workflow.agentId,
        workflowId: workflow.id,
        actionType: 'read_only',
        approvalStatus: 'not_required',
        actionTaken: true,
        resultSummary: `${label} copied · ${built.fingerprint}.`,
      });
    }
  }

  /** Canonical save: cleaned current entry ONLY — never the generated prompt. */
  function saveHandoff() {
    if (!workflow || !input.trim()) return;
    const content = input.trim();
    const { entryDate, dateConfidence } = parseEntryDate(content);
    const handoff: Handoff = {
      id: uid(),
      agentId: workflow.agentId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      inputSummary: summarizeInput(content),
      outputStyle: style,
      content,
      risk: workflow.risk,
      createdAt: nowIso(),
      contentHash: sha256Hex(content),
      entryDate,
      dateConfidence,
      status: 'active',
    };
    update((s) => ({ ...s, handoffs: [handoff, ...s.handoffs] }));
    audit({
      command: `Save handoff: ${workflow.name}`,
      agentId: workflow.agentId,
      workflowId: workflow.id,
      actionType: 'local_write',
      approvalStatus: 'not_required',
      actionTaken: true,
      resultSummary: `Current entry saved to history (${content.length} chars, entry date ${entryDate ?? 'unknown'}). Future runs will use it as prior context.`,
    });
    setFlash('Current entry saved to this workflow’s history — local only.');
  }

  /** Explicit artifact save: full generated prompt with traceability metadata. */
  function saveArtifact() {
    if (!workflow || !built) return;
    const artifact: WorkflowArtifact = {
      id: uid(),
      workflowId: workflow.id,
      artifactType: 'full_prompt',
      createdAt: nowIso(),
      content: built.fullPrompt,
      promptHash: built.promptHash,
      shortFingerprint: built.fingerprint,
      characterCount: built.fullPrompt.length,
      priorHandoffCount: built.priorCount,
      historyStrategy: built.historyProfile,
      includedHandoffIds: built.includedHandoffIds,
      rawFallbackUsed: built.rawFallbackCount > 0,
      sourceMode: viewMode,
      includedHandoffSnapshots: built.snapshots,
      healthProfilePromptMetadata: profileBlock?.metadata ?? { healthProfileIncluded: false },
    };
    update((s) => ({ ...s, artifacts: [artifact, ...s.artifacts] }));
    audit({
      command: `Save artifact: full prompt (${workflow.name})`,
      agentId: workflow.agentId,
      workflowId: workflow.id,
      actionType: 'local_write',
      approvalStatus: 'not_required',
      actionTaken: true,
      resultSummary: `Full prompt artifact saved · ${built.fingerprint}. Artifacts are separate from handoff history.`,
    });
    setFlash('Generated artifact saved — view under Logs → Artifacts.');
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
  const priorAvailable = workflow
    ? state.handoffs.filter((h) => h.workflowId === workflow.id).length
    : 0;

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
                {resolveCategory(w) === 'fitness_health' && (
                  <span className="badge info" style={{ marginLeft: 6 }}>Health &amp; Fitness</span>
                )}
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
          <p className="muted small">
            {historyProfile === 'fitness_health'
              ? `Uses expanded history context — pulls up to ${historyTargetCount(historyProfile)} prior saved handoffs.`
              : `Pulls up to ${historyTargetCount(historyProfile)} prior saved handoffs.`}
            {' '}({priorAvailable} saved so far)
          </p>

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

          {isFitness && (
            <label className="checkrow">
              <input
                type="checkbox"
                checked={includeProfile && hasProfileData}
                disabled={!hasProfileData}
                onChange={(e) => setIncludeProfile(e.target.checked)}
              />
              <span>
                Include Health Profile
                {!hasProfileData && <> — <em>no Health Profile saved yet.</em> <Link to="/health">Set one up</Link></>}
                {hasProfileData && !includeProfile && <> — <em>excluded for this run</em></>}
              </span>
            </label>
          )}
          {isFitness && includeProfile && hasProfileData && profileBlock?.empty && (
            <p className="notice">No usable Health Profile data saved yet — the prompt will say so.</p>
          )}

          <div className="btn-row">
            <button className="primary" onClick={generate}>Generate</button>
          </div>

          {built && (
            <>
              <h3 className="row">
                Output
                <span className="badge ok">Draft only — nothing left this device</span>
              </h3>
              <p className="muted small">{built.helperText}</p>
              <p className="muted small">Prompt fingerprint: <code>{built.fingerprint}</code></p>

              <div className="btn-row">
                <button className={`chip ${viewMode === 'preview' ? 'selected' : ''}`} onClick={() => setViewMode('preview')}>Preview</button>
                <button className={`chip ${viewMode === 'full_prompt' ? 'selected' : ''}`} onClick={() => setViewMode('full_prompt')}>Full Prompt</button>
              </div>

              {profileBlock && !profileBlock.empty && (
                <p className="notice risk-block small">
                  This prompt includes Health Profile data. Review before copying or sharing.
                </p>
              )}

              {viewMode === 'preview' ? (
                <>
                  <h3>New entry</h3>
                  <pre className="output">{built.currentOnly}</pre>
                  {profileBlock && !profileBlock.empty && (
                    <details>
                      <summary className="muted small">
                        Health Profile included · {profileBlock.metadata.includedFieldPaths?.length ?? 0} fields · {profileBlock.metadata.promptContextFingerprint}
                      </summary>
                      <ul className="plain small">
                        <li>Last updated: {profileBlock.metadata.profileLastUpdatedAt?.slice(0, 10)}</li>
                        <li>Prompt-context fingerprint: <code>{profileBlock.metadata.promptContextFingerprint}</code></li>
                        <li>
                          {profileBlock.metadata.promptSummaryCharCount
                            ? `Prompt Summary used (${profileBlock.metadata.promptSummaryCharCount} chars)`
                            : profileBlock.metadata.freeformContextExcerptCharCount
                              ? `Freeform excerpt used (${profileBlock.metadata.freeformContextExcerptCharCount} chars)`
                              : 'Structured fields only'}
                        </li>
                        <li className="small muted">Fields: {profileBlock.metadata.includedFieldPaths?.join(', ')}</li>
                      </ul>
                      {profileRevealLevel < 2 ? (
                        <button className="chip" onClick={() => setProfileRevealLevel(2)}>Show Inserted Health Profile Text</button>
                      ) : (
                        <pre className="output">{profileBlock.text}</pre>
                      )}
                    </details>
                  )}
                  <details>
                    <summary className="muted small">
                      Prior context ({built.priorCount} entr{built.priorCount === 1 ? 'y' : 'ies'} included)
                    </summary>
                    <p className="muted small">
                      Summarized/extracted history is embedded in the full prompt. Switch to Full Prompt
                      to see exactly what gets copied.
                    </p>
                  </details>
                </>
              ) : (
                <pre className="output">{built.fullPrompt}</pre>
              )}

              <p className="muted small">Next action: {workflow.nextAction}</p>
              <div className="btn-row">
                <button className="primary" onClick={() => copyText(built.fullPrompt, 'Full prompt')}>Copy Full Prompt</button>
                <button onClick={() => copyText(built.currentOnly, 'Current entry only')}>Copy Current Only</button>
              </div>
              <div className="btn-row">
                <button onClick={saveHandoff}>Save handoff (history)</button>
                <button onClick={saveArtifact}>Save Generated Artifact</button>
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
