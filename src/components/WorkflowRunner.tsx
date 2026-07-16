import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AGENTS, getAgent } from '../lib/agents/agentRegistry';
import { WORKFLOWS, getWorkflow, resolveWorkflowOutputStyle } from '../lib/workflows/workflowRegistry';
import { summarizeInput } from '../lib/workflows/templateRenderer';
import { buildPrompt } from '../lib/workflows/continuity';
import type { BuiltPrompt } from '../lib/workflows/continuity';
import { buildGravlPrompt } from '../lib/workflows/gravlPrompt';
import { evaluatePromptValidity, buildPromptConfigKey, evaluateActability } from '../lib/workflows/promptValidity';
import { GRAVL_WORKFLOW_ID } from '../lib/router/fitnessRouting';
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
 * to copy into your AI assistant. No AI call happens here.
 */
export default function WorkflowRunner() {
  const [params, setParams] = useSearchParams();
  const { state, update, audit } = useStore();

  const preselected = getWorkflow(params.get('wf') ?? '');
  const [agentFilter, setAgentFilter] = useState<AgentId | 'all'>(preselected?.agentId ?? 'all');
  const [workflow, setWorkflow] = useState<Workflow | null>(preselected ?? null);
  const [input, setInput] = useState(params.get('input') ?? '');
  const [workoutText, setWorkoutText] = useState('');
  const [hasScreenshots, setHasScreenshots] = useState(false);
  const [style, setStyle] = useState(preselected ? resolveWorkflowOutputStyle(preselected, params.get('style')) : '');
  const [built, setBuilt] = useState<BuiltPrompt | null>(null);
  const [builtConfigKey, setBuiltConfigKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [includeProfile, setIncludeProfile] = useState(true);
  const [profileRevealLevel, setProfileRevealLevel] = useState(0); // 0=summary 1=metadata 2=text
  const [flash, setFlash] = useState('');

  // Effect 1 — WORKFLOW / STYLE sync only. Arriving via a link like
  // /workflows?wf=fitness-handoff (or a style change) selects the workflow and
  // resets workout inputs; it deliberately does NOT touch the request input,
  // which Effect 2 owns.
  useEffect(() => {
    const wf = getWorkflow(params.get('wf') ?? '');
    const requestedStyle = params.get('style');
    const nextStyle = wf ? resolveWorkflowOutputStyle(wf, requestedStyle) : '';
    if (wf && (wf.id !== workflow?.id || (requestedStyle !== null && nextStyle !== style))) {
      const workflowChanged = wf.id !== workflow?.id;
      setWorkflow(wf);
      setAgentFilter(wf.agentId);
      setStyle(nextStyle);
      // Switching workflows must invalidate any old built result immediately.
      setBuilt(null);
      setBuiltConfigKey(null);
      if (workflowChanged) {
        setWorkoutText('');
        setHasScreenshots(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Effect 2 — URL INPUT sync only, keyed on the exact `input` search param so
  // it fires on every navigation that changes routed input (including
  // same-workflow A→B and browser back/forward) but NEVER on ordinary typing
  // (typing changes local state, not the URL, so `urlInput` is unchanged).
  // Absent or empty input clears the prior routed input; any URL-provided
  // change also invalidates a stale built result.
  const urlInput = params.get('input');
  useEffect(() => {
    setInput(urlInput ?? '');
    setBuilt(null);
    setBuiltConfigKey(null);
  }, [urlInput]);

  const visibleWorkflows = useMemo(
    () => (agentFilter === 'all' ? WORKFLOWS : WORKFLOWS.filter((w) => w.agentId === agentFilter)),
    [agentFilter],
  );

  const isGravl = workflow?.id === GRAVL_WORKFLOW_ID;
  const isFitness = workflow ? resolveCategory(workflow) === 'fitness_health' : false;
  const historyProfile = workflow ? resolveHistoryProfile(workflow) : 'default';
  const hasProfileData = Boolean(state.healthProfile);
  const deepAnalysis = workflow?.outputMode === 'dashboard_full_analysis' || isFitness;

  const profileBlock = useMemo(() => {
    if (!isFitness || !includeProfile || !state.healthProfile) return null;
    // The Gravl review uses a strict training-relevant field whitelist and
    // drops medications/supplements plus the free-text summary; non-Gravl
    // fitness workflows keep the full existing behavior.
    return buildProfilePromptBlock(state.healthProfile, { deepAnalysis, gravlSafe: isGravl });
  }, [isFitness, includeProfile, state.healthProfile, deepAnalysis, isGravl]);

  function pick(wf: Workflow) {
    setWorkflow(wf);
    setStyle(wf.outputStyles[0]);
    setBuilt(null);
    setBuiltConfigKey(null);
    setWorkoutText('');
    setHasScreenshots(false);
    setFlash('');
    // Carry the current request into the URL so Effect 2 (keyed on the input
    // param) does not clear a typed request when switching workflows.
    const trimmed = input.trim();
    setParams(trimmed ? { wf: wf.id, input } : { wf: wf.id }, { replace: true });
  }

  // Staleness keys on the FULL context hash, not the shortened display
  // fingerprint — a truncated fingerprint could collide and miss a real
  // change to the included Health Profile context.
  const profileContextHash = profileBlock && !profileBlock.empty
    ? profileBlock.metadata.promptContextHash
    : undefined;

  /** Identity of the values a prompt would be built from right now. */
  function currentConfigKey(wf: Workflow): string {
    return buildPromptConfigKey({
      input,
      workflowId: wf.id,
      style,
      includeProfile,
      profileFingerprint: profileContextHash,
      workoutText: isGravl ? workoutText : undefined,
      hasScreenshots: isGravl ? hasScreenshots : undefined,
    });
  }

  /** Build Prompt: assemble the current prompt from the CURRENT input. */
  function build() {
    if (!workflow || !input.trim()) return;
    const profileText = profileBlock && !profileBlock.empty ? profileBlock.text : undefined;
    const result: BuiltPrompt = isGravl
      ? buildGravlPrompt({
          request: input,
          workoutText,
          hasScreenshots,
          profileBlock: profileText,
          healthProfile: includeProfile ? state.healthProfile : null,
        })
      : buildPrompt({
          workflow,
          input,
          style,
          allHandoffs: state.handoffs,
          profileBlock: profileText,
          healthProfile: includeProfile ? state.healthProfile : null,
        });
    setBuilt(result);
    setBuiltConfigKey(currentConfigKey(workflow));
    setProfileRevealLevel(0);
    audit({
      command: `Build prompt: ${workflow.name}`,
      agentId: workflow.agentId,
      workflowId: workflow.id,
      actionType: workflow.risk,
      approvalStatus: 'not_required',
      actionTaken: true,
      resultSummary:
        `Built prompt ${result.fingerprint} · ${result.priorCount} prior handoffs · ` +
        `profile ${profileText ? 'included' : 'excluded'} — draft only, nothing sent.`,
    });
    setFlash('');
  }

  /**
   * Defense-in-depth guard shared by every action handler. Disabled buttons
   * are the first line; this re-verifies (built exists, valid, fresh, belongs
   * to the current workflow+config) before ANY clipboard or local write, and
   * shows an explanatory message on failure. Uses the pure evaluateActability
   * helper so the rule is unit-tested and identical to the button-enable rule.
   */
  function guardAction(): boolean {
    const v = built ? evaluatePromptValidity(built.fullPrompt, input) : null;
    const res = evaluateActability({
      hasBuilt: Boolean(built),
      validity: v,
      builtConfigKey,
      currentConfigKey: workflow ? currentConfigKey(workflow) : '',
    });
    if (!res.ok) {
      setFlash(res.message ?? 'This action is unavailable right now.');
      return false;
    }
    return true;
  }

  async function copyText(text: string, label: string) {
    if (!guardAction()) return;
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
    if (!guardAction() || !workflow || !input.trim()) return;
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

  /** Save Prompt: the built prompt saved locally, on this device only. */
  function saveArtifact() {
    if (!guardAction() || !workflow || !built) return;
    const artifact: WorkflowArtifact = {
      id: uid(),
      workflowId: workflow.id,
      artifactType: 'full_prompt',
      createdAt: nowIso(),
      title: `${workflow.name} — ${summarizeInput(input)}`,
      sourceInput: input.trim(),
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
      resultSummary: `Prompt saved locally · ${built.fingerprint}. Saved on this device only.`,
    });
    setFlash('Prompt saved on this device only — view under Logs → Artifacts.');
  }

  function addOpenLoop() {
    if (!guardAction() || !workflow) return;
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

  // Gravl intake vs review is knowable from the live inputs (before build too).
  const gravlIntake = isGravl && !(workoutText.trim() || hasScreenshots);

  // A built prompt is safe to copy/save only when it is valid AND fresh.
  const validity = built ? evaluatePromptValidity(built.fullPrompt, input) : null;
  const stale = Boolean(built && workflow && builtConfigKey !== null && builtConfigKey !== currentConfigKey(workflow));
  const canAct = evaluateActability({
    hasBuilt: Boolean(built),
    validity,
    builtConfigKey,
    currentConfigKey: workflow ? currentConfigKey(workflow) : '',
  }).ok;

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
          {isGravl ? (
            <p className="muted small">
              Builds from your request and the Gravl workout you provide. Prior saved handoffs are
              not pulled into this prompt yet — Gravl history integration is deferred.
            </p>
          ) : (
            <p className="muted small">
              {historyProfile === 'fitness_health'
                ? `Uses expanded history context — pulls up to ${historyTargetCount(historyProfile)} prior saved handoffs.`
                : `Pulls up to ${historyTargetCount(historyProfile)} prior saved handoffs.`}
              {' '}({priorAvailable} saved so far)
            </p>
          )}

          <label className="field" htmlFor="wf-input">
            {isGravl ? 'Your request — what do you want from this workout? (required)' : 'Input — messy notes are fine'}
          </label>
          <textarea
            id="wf-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={workflow.inputHint}
          />

          {isGravl && (
            <>
              <label className="field" htmlFor="wf-workout">Gravl workout (optional — paste what Gravl gave you)</label>
              <textarea
                id="wf-workout"
                value={workoutText}
                onChange={(e) => setWorkoutText(e.target.value)}
                placeholder="Paste the workout text here, or leave blank and use the screenshots option below."
              />
              <label className="checkrow">
                <input
                  type="checkbox"
                  checked={hasScreenshots}
                  onChange={(e) => setHasScreenshots(e.target.checked)}
                />
                <span>I have Gravl screenshots</span>
              </label>
              {hasScreenshots && (
                <p className="notice small">
                  DavidOS can’t read screenshots. After you Copy Prompt, paste it into ChatGPT or
                  Claude and attach your screenshots there.
                </p>
              )}
              {gravlIntake && (
                <p className="notice small">No Gravl workout added. This prompt will ask for it.</p>
              )}
            </>
          )}

          {!isGravl && (
            <>
              <label className="field" htmlFor="wf-style">Output style</label>
              <select id="wf-style" value={style} onChange={(e) => setStyle(e.target.value)}>
                {workflow.outputStyles.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </>
          )}

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
            <button className="primary" onClick={build} disabled={!input.trim()}>Build Prompt</button>
          </div>
          {!input.trim() && (
            <p className="muted small">Enter a request above to build the prompt.</p>
          )}

          {built && (
            <>
              <h3 className="row">
                Output
                <span className="badge ok">Draft only — nothing left this device</span>
              </h3>
              <p className="muted small">{built.helperText}</p>
              <p className="muted small">Prompt fingerprint: <code>{built.fingerprint}</code></p>

              {stale && (
                <p className="notice risk-block" data-testid="stale-notice">Prompt out of date. Rebuild to update.</p>
              )}
              {!stale && validity && !validity.valid && (
                <p className="notice risk-block" data-testid="invalid-notice">
                  This prompt can’t be copied or saved: {validity.reasons.join(' ')}
                </p>
              )}

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
                <button className="primary" onClick={() => copyText(built.fullPrompt, 'Prompt')} disabled={!canAct}>Copy Prompt</button>
                <button onClick={() => copyText(built.currentOnly, 'Request only')} disabled={!canAct}>Copy Request Only</button>
              </div>
              <p className="muted small">
                <strong>Copy Request Only</strong> copies just your current request — without prior
                workflow context, Health Profile context, or workout details.
              </p>
              <div className="btn-row">
                <button onClick={saveArtifact} disabled={!canAct}>Save Prompt</button>
                <button onClick={saveHandoff} disabled={!canAct}>Save to Workflow History</button>
                <button onClick={addOpenLoop} disabled={!canAct}>Create Follow-Up Task</button>
              </div>
              <p className="muted small">Saved prompts stay on this device only.</p>
              {flash && <p className="notice flash">{flash}</p>}
            </>
          )}
        </div>
      )}
    </>
  );
}
