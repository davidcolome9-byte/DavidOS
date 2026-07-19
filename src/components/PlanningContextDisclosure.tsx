import type { PlanningContextCounts, PlanningContextMode, RenderedPlanningStateBlock } from '../lib/planning/planningContext';

/**
 * Planning-state inclusion + disclosure control (DOS-WF-002A). Visible only
 * for planning-context workflows (Daily Brief / Weekly Review) in the
 * Workflow Runner. Reuses existing checkrow/details/chip/output patterns —
 * no new CSS.
 */
export interface PlanningContextDisclosureProps {
  mode: PlanningContextMode;
  included: boolean;
  onToggle: (next: boolean) => void;
  counts: PlanningContextCounts | null;
  block: RenderedPlanningStateBlock | null;
  revealed: boolean;
  onReveal: () => void;
}

export default function PlanningContextDisclosure({
  mode,
  included,
  onToggle,
  counts,
  block,
  revealed,
  onReveal,
}: PlanningContextDisclosureProps) {
  const hasContent = Boolean(block && !block.empty);

  return (
    <>
      <label className="checkrow">
        <input type="checkbox" checked={included} onChange={(e) => onToggle(e.target.checked)} />
        <span>
          Include planning state — priorities, open loops, reminders, and{' '}
          {mode === 'weekly' ? 'active/paused projects' : 'active projects'}
          {included && !hasContent && <> — <em>nothing saved yet</em></>}
          {!included && <> — <em>excluded for this run</em></>}
        </span>
      </label>

      {included && hasContent && block && (
        <details>
          <summary className="muted small">
            Current DavidOS state included
            {counts ? ` · ${counts.priorities} priorities, ${counts.openLoops} open loops, ${counts.reminders} reminders, ${counts.projects} projects` : ''}
            {' · '}
            {block.fingerprint}
          </summary>
          <ul className="plain small">
            <li>Fingerprint: <code>{block.fingerprint}</code></li>
            <li className="small muted">
              Never included: project notes, project area, Context Vault content, Health Profile,
              audit-record content, artifact content, handoff content and summaries.
            </li>
          </ul>
          {!revealed ? (
            <button className="chip" onClick={onReveal}>Show Inserted Planning State Text</button>
          ) : (
            <pre className="output">{block.text}</pre>
          )}
        </details>
      )}
    </>
  );
}
