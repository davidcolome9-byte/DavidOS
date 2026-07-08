import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import { downloadBackup, parseImport } from '../lib/storage/exportImport';
import { clearPersistedState } from '../lib/storage/localStore';
import { buildDefaultState } from '../data/defaultState';
import { INTEGRATIONS } from '../lib/integrations';
import { requiresApproval } from '../lib/safety/approvalRules';
import { stubResult } from '../lib/integrations/integrationTypes';
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

export default function Settings() {
  const { state, update, audit } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useState('');
  const [pending, setPending] = useState<PendingCall | null>(null);

  // Reset modal
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');
  const [alsoDeleteHealth, setAlsoDeleteHealth] = useState(false);

  // Import health-profile conflict modal
  const [importConflict, setImportConflict] = useState<AppState | null>(null);

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
    update(() => next);
    audit({
      command: `Import backup: ${fileName}`,
      actionType: 'local_write',
      approvalStatus: 'approved',
      actionTaken: true,
      resultSummary:
        `Backup imported — local state replaced. Health Profile: ` +
        (healthChoice === 'keep-current' ? 'kept current.' : 'used imported.'),
    });
    setImportConflict(null);
    setFlash('Import complete.');
  }

  async function importData(file: File) {
    try {
      const imported = parseImport(await file.text());
      // Health Profile is never silently overwritten.
      if (imported.healthProfile && state.healthProfile) {
        setImportConflict(imported);
        return;
      }
      if (!window.confirm('Importing replaces your current DavidOS data on this device. Continue?')) return;
      // If the imported backup has no profile but you have one, keep yours (don't wipe it).
      const choice = imported.healthProfile ? 'imported' : 'keep-current';
      applyImport(imported, choice, file.name);
    } catch (err) {
      setFlash(`Import failed: ${err instanceof Error ? err.message : 'unknown error'}`);
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
    const fresh = buildDefaultState();
    // Health Profile preserved by default; only wiped if explicitly chosen.
    const preserved = !alsoDeleteHealth;
    const next: AppState = preserved
      ? { ...fresh, healthProfile: state.healthProfile ?? fresh.healthProfile }
      : { ...fresh, healthProfile: null };
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

      <div className="card">
        <h2>Integrations <span className="badge warn">All stubbed in v1</span></h2>
        <p className="muted small">
          Nothing here talks to the outside world yet. Methods marked with an approval badge
          demonstrate the real gate flow — approving a stub still performs no external action.
        </p>
        {INTEGRATIONS.map((adapter) => (
          <details className="item" key={adapter.id}>
            <summary>
              <span className="small"><strong>{adapter.name}</strong></span>
              <span className="badge neutral">disabled</span>
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
          DavidOS v0.1 — personal agentic command center. Local-first PWA. Google Drive sync
          planned for v0.3 (see docs/google-drive-sync-plan.md).
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
              <button className="primary" onClick={() => applyImport(importConflict, 'keep-current', 'backup')}>
                Keep current
              </button>
              <button onClick={() => applyImport(importConflict, 'imported', 'backup')}>
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
        request={pending?.request ?? null}
        onDecision={(approved) => {
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
