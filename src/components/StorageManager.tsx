import { useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { downloadBackup } from '../lib/storage/exportImport';
import { appendAudit, makeAuditEntry } from '../lib/audit/auditLog';
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
  const {
    state,
    update,
    audit,
    recovery,
    externalChange,
    persistFailed,
    commitUncertain,
    committedGeneration,
    committedSequence,
    getAuthority,
    commitDestructiveState,
  } = useStore();
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

  // The meter enumerates localStorage, so it must recompute AFTER a commit's
  // bytes land — not on the memory-only state change that only enqueues the
  // write. `committedGeneration`/`committedSequence` advance only on a verified
  // journal commit (or initial migration), so a durable prune/import/reset here
  // refreshes the displayed total without any timeout, poll, reload, or extra
  // state mutation. `state` stays a dependency for the live-state breakdown.
  const usage = useMemo(
    () => measureStorageUsage(state, safeLocalStorage()),
    // committedGeneration/committedSequence are intentional cache-busters: the
    // meter reads localStorage (not these values directly), so it must recompute
    // when the committed generation advances, not only when `state` changes.
    // They are deliberately retained, not "unnecessary".
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, committedGeneration, committedSequence],
  );
  const badge = LEVEL_BADGE[usage.level];

  // Destructive pruning requires HEALTHY persistence. While it is suppressed
  // (unpreserved recovery boot, stale tab, unconfirmed earlier commit) or
  // already failing (quota / unavailable), a prune could not commit durably —
  // so it is disabled.
  const liveAuthority = getAuthority();
  const canPrune = recovery.canPersist && !externalChange && !persistFailed && !commitUncertain &&
    liveAuthority.persistenceAvailable && !liveAuthority.reconciliationRequired &&
    !liveAuthority.outcomeUncertain && !liveAuthority.preservationFailed &&
    !liveAuthority.writeQueued && !liveAuthority.writeRunning;

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
    setFlash(
      'Backup downloaded — it contains every saved prompt, including the ones a prune would delete. ' +
      'A backup is a copy and does not free local storage; pruning below is what frees space.',
    );
  }

  async function confirmPrune() {
    if (confirmText !== 'PRUNE' || !canPrune) return;
    // Authority is re-checked at EXECUTION time from the store's synchronous
    // snapshot, and the plan is drawn from that same authoritative state.
    const authority = getAuthority();
    if (
      !authority.canPersist ||
      authority.externalChange ||
      authority.persistFailed ||
      authority.commitUncertain ||
      !authority.persistenceAvailable ||
      authority.reconciliationRequired ||
      authority.outcomeUncertain ||
      authority.preservationFailed ||
      authority.writeQueued ||
      authority.writeRunning
    ) {
      return;
    }
    const current = planArtifactPrune(authority.state.artifacts, keepCount);
    if (current.prune.length === 0) return;
    // ONE durable state per prune transaction: the FIRST durable candidate
    // already contains the intended deletions AND the completed success
    // audit — no second audit-triggered persistence write is ever needed.
    const candidate: AppState = appendAudit(
      { ...authority.state, artifacts: current.keep },
      makeAuditEntry({
        command: 'Prune saved prompts — completed',
        actionType: 'local_write',
        approvalStatus: 'approved',
        actionTaken: true,
        resultSummary:
          `Deleted the ${current.prune.length} oldest saved prompt artifact(s), keeping the newest ` +
          `${current.keep.length} (~${formatUnits(current.freedUnits)} freed). Handoff history untouched.`,
      }),
    );
    // Transactional delete through the shared persist-first boundary
    // (DOS-STAB-001A): the complete pruned state must be durably written AND
    // read back confirmed BEFORE the active state is replaced or success is
    // reported. A failed commit leaves the stored original exactly as it was.
    const commit = await commitDestructiveState(candidate, authority.committedGeneration);
    if (!commit.ok) {
      setPruneOpen(false);
      // A failed prune leaves active AppState deeply unchanged: NO audit
      // append (that would itself change state and trigger another
      // StoreProvider persistence attempt). Persistence health/uncertainty
      // is reported to the store, which keeps it OUTSIDE AppState.
      setFlash(
        commit.outcome === 'uncertain'
          ? 'Prune failed: the pruned state could not be confirmed as saved. Nothing was reported as ' +
            'deleted, and saving is paused to protect your data. Reload before trying again.'
          : commit.reason === 'external_change' || commit.reason === 'stale_authority'
            ? 'Prune failed: DavidOS was changed in another tab, so nothing was deleted. ' +
              'Reload to continue with the latest saved data.'
            : 'Prune failed: the pruned state could not be saved on this device, so nothing was deleted. ' +
              'Your last saved data is unchanged. Pruning stays unavailable while saving is failing — ' +
              'exporting a backup keeps a precautionary copy of your data, but it does not free storage ' +
              'or make a prune succeed.',
      );
      return;
    }
    // One React state update: the already-committed candidate becomes active.
    update(() => candidate);
    setPruneOpen(false);
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
        {formatUnits(usage.quotaUnits)} this browser typically allows ({pct}%). Sizes are estimates.{' '}
        {usage.measured ? (
          <span data-testid="storage-usage-total-measured">
            This is everything stored for this DavidOS site (browser origin) — including the
            redundant crash-safe copies it keeps of your saved data and any other items saved under
            this origin — not just one copy, and not only what DavidOS itself created. Saving a
            change writes another full copy before the old one is removed, so warnings begin before
            the browser’s quota looks full. This does not change the browser’s actual limit.
          </span>
        ) : (
          <span data-testid="storage-usage-total-estimated">
            Everything stored for this DavidOS site (browser origin) could not be read here, so this
            is a deterministic estimate of a single copy of your current data. The actual total
            stored under this origin could not be determined — it may be higher or lower than the
            figure shown. This does not change the browser’s actual limit.
          </span>
        )}
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
        {usage.generationCount > 0 && (
          <li className="row">
            <span className="muted">Redundant crash-safe copies ({usage.generationCount})</span>
            <span>{formatUnits(usage.generationUnits)}</span>
          </li>
        )}
        {usage.legacyUnits > 0 && (
          <li className="row">
            <span className="muted">Earlier saved copy</span>
            <span>{formatUnits(usage.legacyUnits)}</span>
          </li>
        )}
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
        {usage.otherCount > 0 && (
          <li className="row">
            <span className="muted">Other items in this browser ({usage.otherCount})</span>
            <span>{formatUnits(usage.otherUnits)}</span>
          </li>
        )}
      </ul>
      {usage.level !== 'ok' && (
        <p className="notice risk-block small" data-testid="storage-warning">
          <strong>Storage is {usage.level === 'critical' ? 'nearly full' : 'filling up'}.</strong>{' '}
          {usage.level === 'critical'
            ? 'DavidOS keeps redundant crash-safe copies of your data, and saving a change must write ' +
              'another full copy before the old one is removed — on this device that may soon fail. '
            : 'DavidOS keeps redundant crash-safe copies of your data, so the practical safe capacity ' +
              'is reached well before the browser’s quota looks full. '}
          Your last successfully saved data stays protected; new or unsaved changes may fail to save
          if capacity runs out. Exporting a backup saves a copy of your data but does not free local
          storage or raise the browser’s limit. If pruning is available, pruning old saved prompts
          can reduce storage usage; reducing saved history also reduces what is stored. Export and
          recovery downloads stay available even if saving pauses. Nothing is deleted automatically.
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
        never pruned; export a backup to archive it — a backup is a copy of your data and does not
        free local storage. Pruning saved prompts or reducing saved history is what frees capacity.
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
            <p className="muted small" data-testid="storage-prune-export-note">
              A backup is a copy of your data — it does not free local storage or raise the browser’s
              limit. Confirming the prune below is what frees space.
            </p>
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
