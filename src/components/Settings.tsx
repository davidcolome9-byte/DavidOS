import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { downloadBackup, parseImport } from '../lib/storage/exportImport';
import { clearPersistedState } from '../lib/storage/localStore';
import { buildResetState } from '../lib/storage/resetState';
import { hasHealthDraft, clearHealthDraft } from '../lib/health/profileDraft';
import { fingerprintInput } from '../lib/audit/redaction';
import { INTEGRATIONS } from '../lib/integrations';
import { requiresApproval } from '../lib/safety/approvalRules';
import { stubResult } from '../lib/integrations/integrationTypes';
import {
  exportBackupToDrive,
  isDriveSessionFresh,
  isGoogleDriveConfigured,
  loadGoogleIdentityServices,
  requestDriveAccessToken,
} from '../lib/integrations/googleDriveClient';
import type { DriveSession } from '../lib/integrations/googleDriveClient';
import { DRIVE_BACKUP_FOLDER_PATH, formatDrivePath } from '../lib/integrations/googleDrivePaths';
import type { AppState, IntegrationAdapter, IntegrationMethod } from '../lib/types';
import ApprovalGate from './ApprovalGate';
import type { ApprovalRequest } from './ApprovalGate';
import RiskBadge from './RiskBadge';

interface PendingCall {
  adapter: IntegrationAdapter;
  method: IntegrationMethod;
  request: ApprovalRequest;
}

const EXPORT_WARNING =
  'This backup includes your workflows, saved handoffs, generated artifacts, logs, ' +
  'settings, and Health Profile data. Treat the file itself as sensitive.';

const DRIVE_BACKUP_PATH = formatDrivePath(DRIVE_BACKUP_FOLDER_PATH);

export default function Settings() {
  const { state, update, audit } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useState('');
  const [pending, setPending] = useState<PendingCall | null>(null);
  const [pendingDriveExport, setPendingDriveExport] = useState<ApprovalRequest | null>(null);
  const [driveSession, setDriveSession] = useState<DriveSession | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveAuthReady, setDriveAuthReady] = useState(false);
  const [driveFlash, setDriveFlash] = useState('');

  // Reset modal
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');
  const [alsoDeleteHealth, setAlsoDeleteHealth] = useState(false);

  // Import health-profile conflict modal
  const [importConflict, setImportConflict] = useState<{ state: AppState; fileName: string } | null>(null);
  // Unsaved Health Profile draft vs import: a valid import must never silently
  // wipe an in-progress draft, so we interrupt and make the user choose.
  const [draftConflict, setDraftConflict] = useState<{ state: AppState; fileName: string } | null>(null);
  const driveConfigured = isGoogleDriveConfigured();
  const driveConnected = isDriveSessionFresh(driveSession);

  useEffect(() => {
    let cancelled = false;
    if (!driveConfigured) {
      setDriveAuthReady(false);
      return () => {
        cancelled = true;
      };
    }
    setDriveAuthReady(false);
    void loadGoogleIdentityServices()
      .then(() => {
        if (!cancelled) setDriveAuthReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'unknown error';
          setDriveFlash(`Google authorization failed to load: ${message}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [driveConfigured]);

  function exportData() {
    downloadBackup(state);
    audit({
      command: 'Export backup',
      actionType: 'local_write',
      approvalStatus: 'not_required',
      actionTaken: true,
      resultSummary: 'JSON backup downloaded (includes Health Profile data).',
    });
    setFlash('Backup downloaded. ' + EXPORT_WARNING);
  }

  /** Apply an imported backup. healthChoice decides the profile when it matters. */
  function applyImport(imported: AppState, healthChoice: 'imported' | 'keep-current', fileName: string) {
    const next: AppState =
      healthChoice === 'keep-current'
        ? { ...imported, healthProfile: state.healthProfile }
        : imported;
    // Reaching applyImport means the user passed the draft-conflict gate by
    // explicitly choosing to discard (a kept draft aborts the import earlier).
    // Clearing HERE — at the actual apply — means a later cancel (e.g. the
    // replace-data confirm) leaves the draft intact, so no path discards it
    // without importing. A no-op when there was no draft. Never logged.
    clearHealthDraft();
    update(() => next);
    // The filename can carry personal text — record only a fingerprint (F-05).
    audit({
      command: 'Import backup',
      actionType: 'local_write',
      approvalStatus: 'approved',
      actionTaken: true,
      resultSummary:
        `Backup imported — local state replaced (source fp ${fingerprintInput(fileName)}). Health Profile: ` +
        (healthChoice === 'keep-current' ? 'kept current.' : 'used imported.'),
    });
    setImportConflict(null);
    setFlash('Import complete.');
  }

  /** The rest of the import flow once any unsaved-draft conflict is resolved. */
  function continueImport(imported: AppState, fileName: string) {
    setDraftConflict(null);
    // Health Profile is never silently overwritten. (Backups that predate
    // profiles arrive with healthProfile === null — no false conflict.)
    if (imported.healthProfile && state.healthProfile) {
      setImportConflict({ state: imported, fileName });
      return;
    }
    if (!window.confirm('Importing replaces your current DavidOS data on this device. Continue?')) return;
    // If the imported backup has no profile but you have one, keep yours (don't wipe it).
    const choice = imported.healthProfile ? 'imported' : 'keep-current';
    applyImport(imported, choice, fileName);
  }

  async function importData(file: File) {
    let imported: AppState;
    try {
      // A malformed or future-schema backup throws HERE — before any draft or
      // state is touched — so an invalid import can never disturb the draft.
      imported = parseImport(await file.text());
    } catch (err) {
      setFlash(`Import failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      return;
    }
    // Selecting a file must NOT discard unsaved Health Profile edits. If a draft
    // exists, interrupt and let the user keep it (cancel) or discard it.
    if (hasHealthDraft()) {
      setDraftConflict({ state: imported, fileName: file.name });
      return;
    }
    continueImport(imported, file.name);
  }

  async function connectDrive() {
    if (!driveConfigured) {
      setDriveFlash('Add VITE_GOOGLE_CLIENT_ID before using Google Drive sync.');
      return;
    }
    if (!driveAuthReady) {
      setDriveFlash('Google authorization is still loading.');
      return;
    }
    setDriveBusy(true);
    setDriveFlash('');
    try {
      const session = await requestDriveAccessToken();
      setDriveSession(session);
      audit({
        command: 'Connect Google Drive',
        actionType: 'read_only',
        approvalStatus: 'not_required',
        actionTaken: true,
        resultSummary: 'Google Drive access granted for drive.file scope. Token kept in memory only.',
      });
      setDriveFlash('Google Drive connected for this session.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      audit({
        command: 'Connect Google Drive',
        actionType: 'read_only',
        approvalStatus: 'not_required',
        actionTaken: false,
        resultSummary: `Google Drive connection failed: ${message}`,
      });
      setDriveFlash(`Google Drive connection failed: ${message}`);
    } finally {
      setDriveBusy(false);
    }
  }

  function forgetDriveSession() {
    setDriveSession(null);
    audit({
      command: 'Forget Google Drive session',
      actionType: 'read_only',
      approvalStatus: 'not_required',
      actionTaken: true,
      resultSummary: 'Short-lived Google Drive access token removed from memory.',
    });
    setDriveFlash('Google Drive session forgotten on this device.');
  }

  function requestDriveBackupExport() {
    if (!driveConfigured) {
      setDriveFlash('Add VITE_GOOGLE_CLIENT_ID before using Google Drive sync.');
      return;
    }
    if (!driveAuthReady) {
      setDriveFlash('Google authorization is still loading.');
      return;
    }
    setPendingDriveExport({
      title: 'Export backup to Google Drive',
      description:
        `Writes a JSON backup to ${DRIVE_BACKUP_PATH}, creating missing folders if needed. ` +
        EXPORT_WARNING,
      risk: 'external_write',
    });
  }

  async function getFreshDriveSession(): Promise<DriveSession> {
    if (isDriveSessionFresh(driveSession)) return driveSession;
    const session = await requestDriveAccessToken();
    setDriveSession(session);
    return session;
  }

  async function runDriveBackupExport(approved: boolean) {
    setPendingDriveExport(null);
    if (!approved) {
      audit({
        command: 'Export backup to Google Drive',
        actionType: 'external_write',
        approvalStatus: 'denied',
        actionTaken: false,
        resultSummary: 'Denied by user - nothing was written to Google Drive.',
      });
      setDriveFlash('Denied - nothing was written to Google Drive.');
      return;
    }

    setDriveBusy(true);
    setDriveFlash('');
    try {
      const session = await getFreshDriveSession();
      const result = await exportBackupToDrive(state, session);
      audit({
        command: 'Export backup to Google Drive',
        actionType: 'external_write',
        approvalStatus: 'approved',
        actionTaken: true,
        resultSummary: `Backup exported to Google Drive: ${result.path}/${result.file.name}`,
      });
      setDriveFlash(`Backup exported to Google Drive: ${result.file.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      audit({
        command: 'Export backup to Google Drive',
        actionType: 'external_write',
        approvalStatus: 'approved',
        actionTaken: false,
        resultSummary: `Google Drive export failed: ${message}`,
      });
      setDriveFlash(`Google Drive export failed: ${message}`);
    } finally {
      setDriveBusy(false);
    }
  }

  function openReset() {
    setResetText('');
    setAlsoDeleteHealth(false);
    setResetOpen(true);
    audit({
      command: 'Reset to seed — dialog opened',
      actionType: 'local_write',
      approvalStatus: 'not_required',
      actionTaken: false,
      resultSummary: 'Reset confirmation dialog opened. Nothing changed yet.',
    });
  }

  function cancelReset() {
    setResetOpen(false);
    audit({
      command: 'Reset to seed — cancelled',
      actionType: 'local_write',
      approvalStatus: 'denied',
      actionTaken: false,
      resultSummary: 'Reset cancelled by user. Nothing changed.',
    });
  }

  function confirmReset() {
    if (resetText !== 'RESET') return;
    clearPersistedState();
    // An unsaved Health Profile draft would be stale against the reset state —
    // discard it explicitly (the modal warned about it) rather than leaving it
    // to silently reappear.
    clearHealthDraft();
    // Health Profile preserved EXACTLY by default (null stays null);
    // only the explicit checkbox deletes it.
    const preserved = !alsoDeleteHealth;
    const next = buildResetState(state, alsoDeleteHealth);
    update(() => next);
    setResetOpen(false);
    audit({
      command: 'Reset to seed — completed',
      actionType: 'local_write',
      approvalStatus: 'approved',
      actionTaken: true,
      resultSummary: `Reset to seed data. Health Profile ${preserved ? 'preserved' : 'deleted'}.`,
    });
    setFlash(`Reset to seed data. Health Profile ${preserved ? 'preserved' : 'deleted'}.`);
  }

  /** Demonstrates the full approval loop against a stub — honestly. */
  function callIntegrationMethod(adapter: IntegrationAdapter, method: IntegrationMethod) {
    if (adapter.id === 'google_drive' && method.implemented) {
      const message = 'Use Google Drive sync above for the live Drive methods.';
      audit({
        command: `${adapter.name}.${method.name}()`,
        actionType: method.risk,
        approvalStatus: 'not_required',
        actionTaken: false,
        resultSummary: message,
      });
      setFlash(message);
      return;
    }
    if (requiresApproval(method.risk)) {
      setPending({
        adapter,
        method,
        request: {
          title: `${adapter.name} → ${method.name}()`,
          description: `${method.description}. This integration is a v1 stub: even if approved, no external call will be made.`,
          risk: method.risk,
        },
      });
    } else {
      const result = stubResult(adapter, method.name);
      audit({
        command: `${adapter.name}.${method.name}()`,
        actionType: method.risk,
        approvalStatus: 'not_required',
        actionTaken: false,
        resultSummary: result.message,
      });
      setFlash(result.message);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Appearance</h2>
        <div className="btn-row">
          <button
            onClick={() =>
              update((s) => ({ ...s, settings: { ...s.settings, theme: s.settings.theme === 'dark' ? 'light' : 'dark' } }))
            }
          >
            Switch to {state.settings.theme === 'dark' ? 'light' : 'dark'} mode
          </button>
        </div>
      </div>

      <div className="card" id="data">
        <h2>Data <span className="badge info">Local only</span></h2>
        <p className="muted small">{EXPORT_WARNING}</p>
        <div className="btn-row">
          <button className="primary" onClick={exportData}>Export backup (JSON)</button>
          <button onClick={() => fileInput.current?.click()}>Import backup</button>
          <button className="danger" onClick={openReset}>Reset to seed</button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importData(f);
            e.target.value = '';
          }}
        />
        {flash && <p className="notice flash">{flash}</p>}
      </div>

      <div className="card" id="drive-sync">
        <h2>
          Google Drive sync
          <span className={`badge ${driveConfigured ? (driveConnected ? 'ok' : (driveAuthReady ? 'info' : 'warn')) : 'warn'}`}>
            {driveConfigured ? (driveConnected ? 'connected' : (driveAuthReady ? 'ready' : 'loading')) : 'client ID needed'}
          </span>
        </h2>
        <p className="muted small">
          Manual backup export is live. Two-way vault sync and conflict review are still pending.
        </p>
        <p className="muted small">Target: <code>{DRIVE_BACKUP_PATH}</code></p>
        <div className="btn-row">
          <button onClick={() => { void connectDrive(); }} disabled={!driveConfigured || !driveAuthReady || driveBusy}>
            {driveConnected ? 'Reconnect Google Drive' : 'Connect Google Drive'}
          </button>
          <button className="primary" onClick={requestDriveBackupExport} disabled={!driveConfigured || !driveAuthReady || driveBusy}>
            Export backup to Drive
          </button>
          {driveSession && <button className="ghost" onClick={forgetDriveSession} disabled={driveBusy}>Forget session</button>}
          <a className="btn ghost" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            Google permissions
          </a>
        </div>
        {!driveConfigured && (
          <p className="notice">
            Set <code>VITE_GOOGLE_CLIENT_ID</code> in your local environment to enable Drive sync.
          </p>
        )}
        {driveFlash && <p className="notice">{driveFlash}</p>}
      </div>

      <div className="card">
        <h2>Integrations <span className="badge info">Drive backup live</span></h2>
        <p className="muted small">
          Google Drive backup export is available above. Other integration methods remain honest stubs.
        </p>
        {INTEGRATIONS.map((adapter) => (
          <details className="item" key={adapter.id}>
            <summary>
              <span className="small"><strong>{adapter.name}</strong></span>
              <span className={`badge ${adapter.enabled ? 'ok' : 'neutral'}`}>
                {adapter.enabled ? 'enabled' : 'disabled'}
              </span>
            </summary>
            <h3>Capabilities</h3>
            <ul className="plain small">{adapter.capabilities.map((c) => <li key={c}>{c}</li>)}</ul>
            <h3>Required credentials</h3>
            <ul className="plain small">{adapter.requiredCredentials.map((c) => <li key={c}>{c}</li>)}</ul>
            <h3>Methods</h3>
            <ul className="plain small">
              {adapter.methods.map((m) => (
                <li key={m.name} className="row">
                  <span><code>{m.name}</code> — {m.description}</span>
                  <span className="btn-row" style={{ margin: 0 }}>
                    <RiskBadge risk={m.risk} />
                    <button className="chip" onClick={() => callIntegrationMethod(adapter, m)}>Try</button>
                  </span>
                </li>
              ))}
            </ul>
            <p className="muted small">{adapter.futureNotes}</p>
          </details>
        ))}
      </div>

      <div className="card">
        <h2>Personal</h2>
        <p className="muted small">
          <a href="#/health">Health &amp; Fitness Profile</a> — targets, regimen, and restrictions used
          by Health &amp; Fitness workflows. Preserved during reset by default.
        </p>
      </div>

      <div className="card">
        <h2>About</h2>
        <p className="muted small">
          DavidOS v0.3 foundation - personal agentic command center. Local-first PWA.
          Google Drive backup export is live; full vault sync remains on the roadmap.
        </p>
      </div>

      {/* Reset modal — type-to-confirm, Health-Profile-aware. */}
      {resetOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>⚠️ Reset to seed</h2>
            <p className="muted">
              This wipes your local DavidOS data (priorities, projects, prompts, handoffs, logs)
              and restores the starter seed. Export a backup first if unsure.
            </p>
            {hasHealthDraft() && (
              <p className="notice risk-block small">
                You have an <strong>unsaved Health Profile draft</strong>. Resetting will discard it.
                Cancel and save your draft first if you want to keep it.
              </p>
            )}
            <label className="field" htmlFor="reset-confirm">Type <code>RESET</code> to confirm</label>
            <input
              id="reset-confirm"
              type="text"
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              placeholder="RESET"
              autoComplete="off"
            />
            <label className="checkrow">
              <input
                type="checkbox"
                checked={alsoDeleteHealth}
                onChange={(e) => setAlsoDeleteHealth(e.target.checked)}
              />
              <span>Also delete my Health &amp; Fitness Profile (otherwise it’s preserved)</span>
            </label>
            <div className="btn-row">
              <button className="danger" disabled={resetText !== 'RESET'} onClick={confirmReset}>
                {alsoDeleteHealth ? 'Reset + delete Health Profile' : 'Reset (keep Health Profile)'}
              </button>
              <button onClick={cancelReset}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Health Profile draft vs import — never silently discard it. */}
      {draftConflict && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="draft-conflict-title">
          <div className="modal">
            <h2 id="draft-conflict-title">Unsaved Health Profile edits</h2>
            <p className="muted">
              You have <strong>unsaved Health Profile edits</strong> in progress. Importing this backup
              replaces your local data — if you continue without keeping them, those unsaved edits are gone.
            </p>
            <div className="btn-row">
              <button
                className="primary"
                onClick={() => { setDraftConflict(null); setFlash('Import cancelled — your unsaved Health Profile edits were kept.'); }}
              >
                Cancel &amp; keep my edits
              </button>
              <button
                className="danger"
                onClick={() => continueImport(draftConflict.state, draftConflict.fileName)}
              >
                Discard edits &amp; import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import health-profile conflict — never silently overwrite. */}
      {importConflict && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Health Profile conflict</h2>
            <p className="muted">
              The backup contains a Health Profile and you already have one. The rest of the backup
              will be imported either way — choose what happens to your Health Profile.
            </p>
            <div className="btn-row">
              <button className="primary" onClick={() => applyImport(importConflict.state, 'keep-current', importConflict.fileName)}>
                Keep current
              </button>
              <button onClick={() => applyImport(importConflict.state, 'imported', importConflict.fileName)}>
                Replace with imported
              </button>
              <button className="ghost" onClick={() => { setImportConflict(null); setFlash('Import cancelled.'); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ApprovalGate
        request={pendingDriveExport ?? pending?.request ?? null}
        onDecision={(approved) => {
          if (pendingDriveExport) {
            void runDriveBackupExport(approved);
            return;
          }
          if (pending) {
            const { adapter, method } = pending;
            const result = approved ? stubResult(adapter, method.name) : null;
            audit({
              command: `${adapter.name}.${method.name}()`,
              actionType: method.risk,
              approvalStatus: approved ? 'approved' : 'denied',
              actionTaken: false,
              resultSummary: approved ? result!.message : 'Denied by user — nothing executed.',
            });
            setFlash(approved ? result!.message : 'Denied — nothing executed.');
          }
          setPending(null);
        }}
      />
    </>
  );
}
