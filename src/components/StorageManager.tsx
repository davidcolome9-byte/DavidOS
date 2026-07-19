import { useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { downloadBackup } from '../lib/storage/exportImport';
import { persistState } from '../lib/storage/localStore';
import {
  formatUnits,
  measureStorageUsage,
  planArtifactPrune,
} from '../lib/storage/storageUsage';
import type { StorageReader } from '../lib/storage/storageUsage';
import type { AppState } from '../lib/types';
import { useModalFocus } from './useModalFocus';

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
  const { state, update, audit, recovery, externalChange, persistFailed } = useStore();
  const [pruneOpen, setPruneOpen] = useState(false);
  const [keepText, setKeepText] = useState(String(DEFAULT_KEEP));
  const [confirmText, setConfirmText] = useState('');
  const [flash, setFlash] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  // OL-015 shared focus management. The safe choice (Cancel) receives focus
  // when the dialog opens, so Enter can never confirm a delete by accident;
  // Escape is always Cancel.
  const pruneDialogRef = useModalFocus<HTMLDivElement>({
    open: pruneOpen,
    onEscape: cancelPrune,
    initialFocusRef: cancelRef,
  });

  const usage = useMemo(() => measureStorageUsage(state, safeLocalStorage()), [state]);
  const badge = LEVEL_BADGE[usage.level];

  // Destructive pruning requires HEALTHY persistence. While it is suppressed
  // (unpreserved recovery boot, stale tab) or already failing (quota /
  // unavailable), a prune could not commit durably — so it is disabled.
  const canPrune = recovery.canPersist && !externalChange && !persistFailed;

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
    if (confirmText !== 'PRUNE' || !canPrune) return;
    // Plan from the live state WITHOUT mutating anything yet.
    const current = planArtifactPrune(state.artifacts, keepCount);
    if (current.prune.length === 0) return;
    const next: AppState = { ...state, artifacts: current.keep };
    // Transactional delete: the complete pruned state must be durably written
    // through the canonical persistence boundary BEFORE the active state is
    // replaced or success is reported. localStorage writes are atomic per key,
    // so a failed write leaves the stored original exactly as it was.
    let committed: boolean;
    try {
      committed = persistState(next);
    } catch {
      committed = false;
    }
    if (!committed) {
      setPruneOpen(false);
      // This audit append changes state, so the store's normal persistence
      // effect re-probes the device: persistFailed then reflects real health
      // (keeping pruning disabled and raising the app-wide warning) or clears
      // if the failure was transient.
      audit({
        command: 'Prune saved prompts — failed',
        actionType: 'local_write',
        approvalStatus: 'approved',
        actionTaken: false,
        resultSummary:
          'Durable write of the pruned state failed. Nothing was deleted; stored and in-memory data are unchanged.',
      });
      setFlash(
        'Prune failed: the pruned state could not be saved on this device, so nothing was deleted. ' +
        'Free up storage or export a backup, then try again.',
      );
      return;
    }
    update(() => next);
    setPruneOpen(false);
    audit({
      command: 'Prune saved prompts — completed',
      actionType: 'local_write',
      approvalStatus: 'approved',
      actionTaken: true,
      resultSummary:
        `Deleted the ${current.prune.length} oldest saved prompt artifact(s), keeping the newest ` +
        `${current.keep.length} (~${formatUnits(current.freedUnits)} freed). Handoff history untouched.`,
    });
    setFlash(
      `Deleted ${current.prune.length} saved prompt(s); kept the newest ${current.keep.length}. ` +
      'Handoff history was not touched.',
    );
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
        <p className="muted small" data-testid="storage-prune-disabled-note">
          Pruning is disabled while saving to this device is paused or failing (see the warning
          above) — a delete that cannot be durably saved is never performed.
        </p>
      )}
      <p className="muted small">
        Retention applies to saved prompts (artifacts) only. Handoff history is append-only and is
        never pruned; use Export backup to archive it.
      </p>
      {flash && <p className="notice flash">{flash}</p>}

      {/* Prune modal — type-to-confirm, exact effect shown, export offered
          first. Escape is Cancel (the safe choice); focus is trapped inside. */}
      {pruneOpen && (
        <div className="modal-overlay">
          <div
            className="modal"
            ref={pruneDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="storage-prune-title"
            aria-describedby="storage-prune-desc"
            tabIndex={-1}
            data-testid="storage-prune-dialog"
          >
            <h2 id="storage-prune-title">⚠️ Prune saved prompts</h2>
            <p className="muted" id="storage-prune-desc">
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
              <button data-testid="storage-prune-cancel" ref={cancelRef} onClick={cancelPrune}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
