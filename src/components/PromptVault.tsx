import { useMemo, useState } from 'react';
import { useStore, upsert, removeById } from '../state/store';
import type { Prompt } from '../lib/types';
import { uid, nowIso } from '../lib/types';
import { AGENTS } from '../lib/agents/agentRegistry';

const EMPTY: Omit<Prompt, 'id' | 'updatedAt'> = {
  title: '', body: '', category: 'General', tags: [], favorite: false, versions: [],
};

export default function PromptVault() {
  const { state, update, audit } = useStore();
  const [editing, setEditing] = useState<Prompt | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [flash, setFlash] = useState('');

  const categories = useMemo(
    () => Array.from(new Set(state.prompts.map((p) => p.category))).sort(),
    [state.prompts],
  );

  const visible = state.prompts
    .filter((p) => filter === 'all' || (filter === 'favorites' ? p.favorite : p.category === filter))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite));

  function save(prompt: Prompt) {
    const existing = state.prompts.find((p) => p.id === prompt.id);
    // Light versioning: keep the previous body when it changed.
    const versions =
      existing && existing.body !== prompt.body
        ? [{ body: existing.body, savedAt: existing.updatedAt }, ...existing.versions].slice(0, 10)
        : prompt.versions;
    update((s) => ({ ...s, prompts: upsert(s.prompts, { ...prompt, versions, updatedAt: nowIso() }) }));
    audit({
      command: `Save prompt: ${prompt.title}`,
      actionType: 'local_write',
      approvalStatus: 'not_required',
      resultSummary: existing ? 'Prompt updated (previous version kept).' : 'Prompt created.',
    });
    setEditing(null);
  }

  function remove(id: string) {
    const prompt = state.prompts.find((p) => p.id === id);
    if (!prompt || !window.confirm(`Delete prompt "${prompt.title}"?`)) return;
    update((s) => ({ ...s, prompts: removeById(s.prompts, id) }));
    setEditing(null);
  }

  function toggleFavorite(p: Prompt) {
    update((s) => ({ ...s, prompts: upsert(s.prompts, { ...p, favorite: !p.favorite }) }));
  }

  async function copy(p: Prompt) {
    try {
      await navigator.clipboard.writeText(p.body);
      setFlash(`Copied "${p.title}".`);
    } catch {
      setFlash('Clipboard unavailable — open the prompt and copy manually.');
    }
  }

  return (
    <>
      <div className="card">
        <h2>
          Prompt Vault
          <button className="primary" onClick={() => setEditing({ ...EMPTY, id: uid(), updatedAt: nowIso() })}>
            + New
          </button>
        </h2>
        <div className="btn-row">
          <button className={`chip ${filter === 'all' ? 'selected' : ''}`} onClick={() => setFilter('all')}>All</button>
          <button className={`chip ${filter === 'favorites' ? 'selected' : ''}`} onClick={() => setFilter('favorites')}>★ Favorites</button>
          {categories.map((c) => (
            <button key={c} className={`chip ${filter === c ? 'selected' : ''}`} onClick={() => setFilter(c)}>{c}</button>
          ))}
        </div>
        {flash && <p className="notice flash">{flash}</p>}
        {visible.map((p) => (
          <details className="item" key={p.id}>
            <summary>
              <span className="small">
                <strong>{p.favorite ? '★ ' : ''}{p.title}</strong>
                <span className="muted"> · {p.category}</span>
              </span>
              <span className="badge neutral">{p.tags[0] ?? 'untagged'}</span>
            </summary>
            <pre className="output">{p.body}</pre>
            {p.versions.length > 0 && (
              <p className="muted small">{p.versions.length} earlier version{p.versions.length > 1 ? 's' : ''} kept</p>
            )}
            <div className="btn-row">
              <button className="primary" onClick={() => copy(p)}>Copy</button>
              <button onClick={() => setEditing(p)}>Edit</button>
              <button onClick={() => toggleFavorite(p)}>{p.favorite ? 'Unfavorite' : '★ Favorite'}</button>
            </div>
          </details>
        ))}
        {visible.length === 0 && <p className="muted small">No prompts in this filter.</p>}
      </div>

      {editing && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <h2>{state.prompts.some((p) => p.id === editing.id) ? 'Edit prompt' : 'New prompt'}</h2>
          <label className="field" htmlFor="prompt-title">Title <span aria-hidden="true">*</span><span className="visually-hidden"> (required)</span></label>
          <input
            id="prompt-title"
            type="text"
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            aria-invalid={editing.title.trim() === ''}
            aria-describedby="prompt-title-hint"
          />
          {editing.title.trim() === '' && (
            <p id="prompt-title-hint" className="notice small" role="alert">A title is required to save this prompt.</p>
          )}
          <label className="field">Category</label>
          <input type="text" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
          <label className="field">Tags (comma-separated)</label>
          <input
            type="text"
            value={editing.tags.join(', ')}
            onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
          />
          <label className="field">Agent</label>
          <select
            value={editing.agentId ?? ''}
            onChange={(e) => setEditing({ ...editing, agentId: (e.target.value || undefined) as Prompt['agentId'] })}
          >
            <option value="">(none)</option>
            {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <label className="field">Prompt body</label>
          <textarea style={{ minHeight: 180 }} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
          <p className="muted small">
            ⚠️ Keep sensitive personal/work details as [PLACEHOLDERS] — prompts get pasted into external AI tools.
          </p>
          <div className="btn-row">
            <button className="primary" onClick={() => save(editing)} disabled={editing.title.trim() === ''}>Save (local)</button>
            <button onClick={() => setEditing(null)}>Cancel</button>
            {state.prompts.some((p) => p.id === editing.id) && (
              <button className="danger" onClick={() => remove(editing.id)}>Delete</button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
