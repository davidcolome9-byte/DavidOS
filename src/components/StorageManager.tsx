import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { downloadBackup } from '../lib/storage/exportImport';
import {
  formatUnits,
  measureStorageUsage,
  planArtifactPrune,
} from '../lib/storage/storageUsage';
import type { StorageReader } from '../lib/storage/storageUsage';

/**
 * Settings → Data → Storage: usage meter + explicit, guarded artifact
 * retention (OL-003). Pruning is never automatic: it deletes only the
 * oldest saved prompts beyond a user-chosen keep-count, only after the
 * exact effect is shown and the user types PRUNE. Handoffs are append-only
 * canonical history and are never touched here.
 */

const DEFAULT_KEEP = 50;

function safeLocalStorage(): StorageReader | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const LEVEL_BADGE = {
  ok: { className: 'ok', label: 'ok' },
  warning: { className: 'warn', label: 'getting full' },
  critical: { className: 'danger', label: 'nearly full' },
} as const;

export default function StorageManager() {
  const { state, update, audit, recovery, externalChange } = useStore();
  const [pruneOpen, setPruneOpen] = useState(false);
  const [keepText, setKeepText] = useState(String(DEFAULT_KEEP));
  const [confirmText, setConfirmText] = useState('');
  const [flash, setFlash] = useState('');

  const usage = useMemo(() => measureStorageUsage(state, safeLocalStorage()), [state]);
  const badge = LEVEL_BADGE[usage.level];

  // While persistence is suppressed (unpreserved recovery boot, stale tab),
  // a prune would change memory but not the stored copy — confusing at best,
  // an inconsistent delete at worst. Disable it for the session instead.
  const canPrune = recovery.canPersist && !externalChange;

  const keepCount = Math.max(0, Math.floor(Number(keepText) || 0));
  const plan = useMemo(
    () => planArtifactPrune(state.artifacts, keepCount),
    [state.artifacts, keepCount],
  );

  function openPrune() {
    setKeepText(String(DEFAULT_KEEP));
    setConfirmText('');
    setPruneOpen(true);
    audit({
      command: 'Prune saved prompts — dialog opened',
      actionType: 'local_write',
      approvalStatus: 'not_required',
      actionTaken: false,
      resultSummary: 'Prune confirmation dialog opened. Nothing changed yet.',
    });
  }

  function cancelPrune() {
    setPruneOpen(false);
    audit({
      command: 'Prune saved prompts — cancelled',
      actionType: 'local_write',
      approvalStatus: 'denied',
      actionTaken: false,
      resultSummary: 'Prune cancelled by user. Nothing was deleted.',
    });
    setFlash('Prune cancelled — nothing was deleted.');
  }

  function exportBeforePrune() {
    downloadBackup(state);
    audit({
      command: 'Export backup (before prune)',
      actionType: 'local_write',
      approvalStatus: 'not_required',
      actionTaken: true,
      resultSummary: 'JSON backup downloaded before pruning (includes all saved prompts).',
    });
    setFlash('Backup downloaded — it contains every saved prompt, including the ones a prune would delete.');
  }

  function confirmPrune() {
    if (confirmText !== 'PRUNE' || plan.prune.length === 0 || !canPrune) return;
    const removed = plan.prune.length;
    const freed = formatUnits(plan.freedUnits);
    const kept = plan.keep;
    update((s) => ({ ...s, artifacts: planArtifactPrune(s.artifacts, keepCount).keep }));
    setPruneOpen(false);
    audit({
      command: 'Prune saved prompts — completed',
      actionType: 'local_write',
      approvalStatus: 'approved',
      actionTaken: true,
      resultSummary:
        `Deleted the ${removed} oldest saved prompt artifact(s), keeping the newest ${kept.length} ` +
        `(~${freed} freed). Handoff history untouched.`,
    });
    setFlash(`Deleted ${removed} saved prompt(s); kept the newest ${kept.length}. Handoff history was not touched.`);
  }

  const pct = Math.min(100, Math.round(usage.usedFraction * 100));
  const barColor =
    usage.level === 'critical' ? 'var(--danger)' : usage.level === 'warning' ? 'var(--warn)' : 'var(--ok)';

  return (
    <>
      <h3>
        Storage{' '}
        <span className={`badge ${badge.className}`} data-testid="storage-level-badge">{badge.label}</span>
      </h3>
      <p className="muted small" data-testid="storage-usage-total">
        Using about <strong>{formatUnits(usage.totalUnits)}</strong> of the ~
        {formatUnits(usage.quotaUnits)} this browser typically allows ({pct}%). Sizes are estimates.
      </p>
      <div
        data-testid="storage-meter"
        role="img"
        aria-label={`Storage used: about ${pct}% of the estimated quota`}
        style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: barColor }} />
      </div>
      <ul className="plain small" data-testid="storage-breakdown">
        {usage.collections.filter((c) => c.count > 0).map((c) => (
          <li key={c.key} className="row">
            <span className="muted">{c.label} ({c.count})</span>
            <span>{formatUnits(c.units)}</span>
          </li>
        ))}
        {usage.recoveryCount > 0 && (
          <li className="row">
            <span className="muted">Preserved recovery copies ({usage.recoveryCount})</span>
            <span>{formatUnits(usage.recoveryUnits)}</span>
          </li>
        )}
        {usage.draftUnits > 0 && (
          <li className="row">
            <span className="muted">Unsaved Health Profile draft</span>
            <span>{formatUnits(usage.draftUnits)}</span>
          </li>
        )}
      </ul>
      {usage.level !== 'ok' && (
        <p className="notice risk-block small" data-testid="storage-warning">
          <strong>Storage is {usage.level === 'critical' ? 'nearly full' : 'filling up'}.</strong>{' '}
          When it runs out, new changes stop saving on this device. Export a backup, then prune old
          saved prompts below. Nothing is ever deleted automatically.
        </p>
      )}
      <div className="btn-row">
        <button data-testid="storage-prune-open" onClick={openPrune} disabled={state.artifacts.length === 0 || !canPrune}>
          Prune saved prompts…
        </button>
      </div>
      {!canPrune && (
        <p className="muted small">
          Pruning is disabled while saving to this device is paused (see the warning above).
        </p>
      )}
      <p className="muted small">
        Retention applies to saved prompts (artifacts) only. Handoff history is append-only and is
        never pruned; use Export backup to archive it.
      </p>
      {flash && <p className="notice flash">{flash}</p>}

      {/* Prune modal — type-to-confirm, exact effect shown, export offered first. */}
      {pruneOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal" data-testid="storage-prune-dialog">
            <h2>⚠️ Prune saved prompts</h2>
            <p className="muted">
              You have <strong>{state.artifacts.length}</strong> saved prompt artifact(s) using{' '}
              {formatUnits(usage.collections.find((c) => c.key === 'artifacts')?.units ?? 0)}.
              Pruning permanently deletes the oldest ones from this device. Handoff history and all
              other data are not touched.
            </p>
            <label className="field" htmlFor="prune-keep">Keep the newest</label>
            <input
              id="prune-keep"
              data-testid="storage-prune-keep"
              type="number"
              min={0}
              value={keepText}
              onChange={(e) => setKeepText(e.target.value)}
            />
            <p className="muted small" data-testid="storage-prune-effect">
              {plan.prune.length === 0
                ? `Nothing to delete — you have ${state.artifacts.length} saved prompt(s), which is not more than ${keepCount}.`
                : `This deletes the ${plan.prune.length} oldest saved prompt(s) and keeps the newest ` +
                  `${plan.keep.length}, freeing about ${formatUnits(plan.freedUnits)}.`}
            </p>
            <div className="btn-row">
              <button onClick={exportBeforePrune}>Export backup first (JSON)</button>
            </div>
            <label className="field" htmlFor="prune-confirm">Type <code>PRUNE</code> to confirm</label>
            <input
              id="prune-confirm"
              data-testid="storage-prune-confirm-text"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="PRUNE"
              autoComplete="off"
            />
            <div className="btn-row">
              <button
                className="danger"
                data-testid="storage-prune-confirm"
                disabled={confirmText !== 'PRUNE' || plan.prune.length === 0 || !canPrune}
                onClick={confirmPrune}
              >
                Delete {plan.prune.length} oldest saved prompt(s)
              </button>
              <button data-testid="storage-prune-cancel" onClick={cancelPrune}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
