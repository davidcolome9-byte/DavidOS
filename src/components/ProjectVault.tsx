import { useState } from 'react';
import { useStore, upsert, removeById } from '../state/store';
import type { Project, ProjectStatus } from '../lib/types';
import { uid, nowIso } from '../lib/types';
import { redactedCommandLabel } from '../lib/audit/redaction';

const STATUS_TONE: Record<ProjectStatus, string> = { active: 'ok', paused: 'warn', done: 'neutral' };

const EMPTY: Omit<Project, 'id' | 'updatedAt'> = {
  name: '', status: 'active', area: '', nextAction: '', notes: '',
  relatedPrompts: [], relatedWorkflows: [],
};

export default function ProjectVault() {
  const { state, update, audit } = useStore();
  const [editing, setEditing] = useState<Project | null>(null);

  function save(project: Project) {
    const existing = state.projects.some((p) => p.id === project.id);
    update((s) => ({ ...s, projects: upsert(s.projects, { ...project, updatedAt: nowIso() }) }));
    // The project name is personal free text — the audit record stores only the
    // event type, a non-reversible fingerprint, and a length (POST-H-PRIV-01).
    audit({
      command: redactedCommandLabel(existing ? 'project_updated' : 'project_created', project.name),
      actionType: 'local_write',
      approvalStatus: 'not_required',
      actionTaken: true,
      resultSummary: 'Project saved locally.',
    });
    setEditing(null);
  }

  function remove(id: string) {
    const project = state.projects.find((p) => p.id === id);
    if (!project) return;
    if (!window.confirm(`Delete project "${project.name}"? This only affects local data.`)) return;
    update((s) => ({ ...s, projects: removeById(s.projects, id) }));
    // Same privacy rule as save: never store the project name verbatim.
    audit({
      command: redactedCommandLabel('project_deleted', project.name),
      actionType: 'local_write',
      approvalStatus: 'approved',
      actionTaken: true,
      resultSummary: 'Project deleted from local vault.',
    });
    setEditing(null);
  }

  return (
    <>
      <div className="card">
        <h2>
          Project Vault
          <button className="primary" onClick={() => setEditing({ ...EMPTY, id: uid(), updatedAt: nowIso() })}>
            + New
          </button>
        </h2>
        {state.projects.map((p) => (
          <details className="item" key={p.id}>
            <summary>
              <span className="small"><strong>{p.name}</strong> <span className="muted">· {p.area}</span></span>
              <span className={`badge ${STATUS_TONE[p.status]}`}>{p.status}</span>
            </summary>
            <p className="small"><strong>Next:</strong> {p.nextAction || '—'}</p>
            <p className="muted small">{p.notes}</p>
            {p.relatedWorkflows.length > 0 && (
              <p className="muted small">Workflows: {p.relatedWorkflows.join(', ')}</p>
            )}
            {p.relatedPrompts.length > 0 && (
              <p className="muted small">Prompts: {p.relatedPrompts.join(', ')}</p>
            )}
            <p className="muted small">Updated {new Date(p.updatedAt).toLocaleDateString()}</p>
            <div className="btn-row">
              <button onClick={() => setEditing(p)}>Edit</button>
            </div>
          </details>
        ))}
      </div>

      {editing && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <h2>{state.projects.some((p) => p.id === editing.id) ? 'Edit project' : 'New project'}</h2>
          <label className="field" htmlFor="project-name">Name <span aria-hidden="true">*</span><span className="visually-hidden"> (required)</span></label>
          <input
            id="project-name"
            type="text"
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            aria-invalid={editing.name.trim() === ''}
            aria-describedby="project-name-hint"
          />
          {editing.name.trim() === '' && (
            <p id="project-name-hint" className="notice small" role="alert">A name is required to save this project.</p>
          )}
          <label className="field">Status</label>
          <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as ProjectStatus })}>
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="done">done</option>
          </select>
          <label className="field">Area</label>
          <input type="text" value={editing.area} onChange={(e) => setEditing({ ...editing, area: e.target.value })} />
          <label className="field">Next action</label>
          <input type="text" value={editing.nextAction} onChange={(e) => setEditing({ ...editing, nextAction: e.target.value })} />
          <label className="field">Notes</label>
          <textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
          <div className="btn-row">
            <button className="primary" onClick={() => save(editing)} disabled={editing.name.trim() === ''}>Save (local)</button>
            <button onClick={() => setEditing(null)}>Cancel</button>
            {state.projects.some((p) => p.id === editing.id) && (
              <button className="danger" onClick={() => remove(editing.id)}>Delete</button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
