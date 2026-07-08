import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import { downloadBackup, parseImport } from '../lib/storage/exportImport';
import { clearPersistedState } from '../lib/storage/localStore';
import { buildDefaultState } from '../data/defaultState';
import { INTEGRATIONS } from '../lib/integrations';
import { requiresApproval } from '../lib/safety/approvalRules';
import { stubResult } from '../lib/integrations/integrationTypes';
import type { IntegrationAdapter, IntegrationMethod } from '../lib/types';
import ApprovalGate from './ApprovalGate';
import type { ApprovalRequest } from './ApprovalGate';
import RiskBadge from './RiskBadge';

interface PendingCall {
  adapter: IntegrationAdapter;
  method: IntegrationMethod;
  request: ApprovalRequest;
}

export default function Settings() {
  const { state, update, audit } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useState('');
  const [pending, setPending] = useState<PendingCall | null>(null);

  function exportData() {
    downloadBackup(state);
    audit({
      command: 'Export backup',
      actionType: 'local_write',
      approvalStatus: 'not_required',
      resultSummary: 'JSON backup downloaded. Treat the file as sensitive — it contains your vaults.',
    });
    setFlash('Backup downloaded. The file contains everything — store it somewhere safe.');
  }

  async function importData(file: File) {
    try {
      const text = await file.text();
      const imported = parseImport(text);
      if (!window.confirm('Importing replaces ALL current DavidOS data on this device. Continue?')) return;
      update(() => imported);
      audit({
        command: `Import backup: ${file.name}`,
        actionType: 'local_write',
        approvalStatus: 'approved',
        resultSummary: 'Backup imported — previous local state replaced.',
      });
      setFlash('Import complete.');
    } catch (err) {
      setFlash(`Import failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  function resetToSeed() {
    if (!window.confirm('Reset DavidOS to seed data? All local changes will be lost. Export a backup first if unsure.')) return;
    clearPersistedState();
    update(() => buildDefaultState());
    setFlash('Reset to seed data.');
  }

  /** Demonstrates the full approval loop against a stub — honestly. */
  function callIntegrationMethod(adapter: IntegrationAdapter, method: IntegrationMethod) {
    const finish = (approved: boolean) => {
      const result = approved ? stubResult(adapter, method.name) : null;
      audit({
        command: `${adapter.name}.${method.name}()`,
        actionType: method.risk,
        approvalStatus: requiresApproval(method.risk) ? (approved ? 'approved' : 'denied') : 'not_required',
        resultSummary: approved
          ? result!.message
          : 'Denied by user — nothing executed.',
      });
      setFlash(approved ? result!.message : 'Denied — nothing executed.');
    };

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
      finish(true);
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

      <div className="card">
        <h2>Data <span className="badge info">Local only</span></h2>
        <p className="muted small">
          Everything lives in this browser's localStorage. Export regularly — the backup JSON
          contains all vaults, so treat the file itself as sensitive.
        </p>
        <div className="btn-row">
          <button className="primary" onClick={exportData}>Export backup (JSON)</button>
          <button onClick={() => fileInput.current?.click()}>Import backup</button>
          <button className="danger" onClick={resetToSeed}>Reset to seed</button>
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
        <h2>About</h2>
        <p className="muted small">
          DavidOS v0.1 — personal agentic command center. Local-first PWA. Repo:{' '}
          <code>C:\dev\davidos</code>. Google Drive sync planned for v0.3
          (see docs/google-drive-sync-plan.md).
        </p>
      </div>

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
