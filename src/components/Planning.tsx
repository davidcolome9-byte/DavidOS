import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, upsert, removeById } from '../state/store';
import { composeDailyBrief, composeWeeklyReview } from '../lib/planning';
import { uid, nowIso } from '../lib/types';

export default function Planning() {
  const { state, update, audit } = useStore();
  const [brief, setBrief] = useState('');
  const [review, setReview] = useState('');
  const [newReminder, setNewReminder] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newLoop, setNewLoop] = useState('');
  const [flash, setFlash] = useState('');

  function generateBrief() {
    const text = composeDailyBrief(state);
    setBrief(text);
    audit({
      command: 'Generate daily brief',
      agentId: 'daily_command',
      workflowId: 'daily-brief',
      actionType: 'draft_only',
      approvalStatus: 'not_required',
      resultSummary: 'Daily brief composed from local state.',
    });
  }

  function generateReview() {
    const text = composeWeeklyReview(state);
    setReview(text);
    audit({
      command: 'Generate weekly review scaffold',
      agentId: 'calendar_planning',
      workflowId: 'weekly-review',
      actionType: 'draft_only',
      approvalStatus: 'not_required',
      resultSummary: 'Weekly review scaffold composed from local state.',
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setFlash('Copied.');
    } catch {
      setFlash('Clipboard unavailable.');
    }
  }

  function addReminder() {
    if (!newReminder.trim()) return;
    update((s) => ({
      ...s,
      reminders: [{ id: uid(), label: newReminder.trim(), due: newDue.trim(), done: false }, ...s.reminders],
    }));
    setNewReminder('');
    setNewDue('');
  }

  function addLoop() {
    if (!newLoop.trim()) return;
    update((s) => ({
      ...s,
      openLoops: [{ id: uid(), label: newLoop.trim(), status: 'open', createdAt: nowIso() }, ...s.openLoops],
    }));
    setNewLoop('');
  }

  const openLoops = state.openLoops.filter((l) => l.status === 'open');
  const doneLoops = state.openLoops.filter((l) => l.status === 'done');

  return (
    <>
      <div className="card">
        <h2>Daily brief <span className="badge ok">Draft only</span></h2>
        <div className="btn-row">
          <button className="primary" onClick={generateBrief}>Generate locally (no AI)</button>
          <Link className="btn" to="/workflows?wf=daily-brief">Build AI prompt (Workflow Runner)</Link>
        </div>
        {brief && (
          <>
            <pre className="output">{brief}</pre>
            <div className="btn-row"><button onClick={() => copy(brief)}>Copy</button></div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Weekly review <span className="badge ok">Draft only</span></h2>
        <div className="btn-row">
          <button className="primary" onClick={generateReview}>Generate locally (no AI)</button>
          <Link className="btn" to="/workflows?wf=weekly-review">Build AI prompt (Workflow Runner)</Link>
        </div>
        {review && (
          <>
            <pre className="output">{review}</pre>
            <div className="btn-row"><button onClick={() => copy(review)}>Copy</button></div>
          </>
        )}
      </div>

      {flash && <p className="notice flash">{flash}</p>}

      <div className="card">
        <h2>Reminders <span className="badge info">Local only</span></h2>
        <p className="muted small">
          v1 reminders live on this device. Google Calendar integration (v0.4) will require
          approval per event — see Settings → Integrations.
        </p>
        <div className="row">
          <input type="text" placeholder="New reminder…" value={newReminder} onChange={(e) => setNewReminder(e.target.value)} />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input type="text" placeholder="Due (free text, e.g. Fri)" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
          <button className="primary" onClick={addReminder}>Add</button>
        </div>
        <ul className="plain">
          {state.reminders.map((r) => (
            <li key={r.id} className="row">
              <span className={`small ${r.done ? 'muted' : ''}`} style={r.done ? { textDecoration: 'line-through' } : undefined}>
                {r.label}{r.due ? ` — ${r.due}` : ''}
              </span>
              <span className="btn-row" style={{ margin: 0 }}>
                <button className="chip" onClick={() => update((s) => ({ ...s, reminders: upsert(s.reminders, { ...r, done: !r.done }) }))}>
                  {r.done ? 'Undo' : 'Done'}
                </button>
                <button className="chip danger" aria-label={`Delete reminder: ${r.label}`} onClick={() => update((s) => ({ ...s, reminders: removeById(s.reminders, r.id) }))}>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Open loops <span className="badge neutral">{openLoops.length} open</span></h2>
        <div className="row">
          <input type="text" placeholder="New open loop…" value={newLoop} onChange={(e) => setNewLoop(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLoop()} />
          <button className="primary" onClick={addLoop}>Add</button>
        </div>
        <ul className="plain">
          {openLoops.map((l) => (
            <li key={l.id} className="row">
              <span className="small">{l.label}</span>
              <button className="chip" onClick={() => update((s) => ({ ...s, openLoops: upsert(s.openLoops, { ...l, status: 'done', closedAt: nowIso() }) }))}>
                Close
              </button>
            </li>
          ))}
        </ul>
        {doneLoops.length > 0 && (
          <details>
            <summary className="muted small">Closed ({doneLoops.length})</summary>
            <ul className="plain">
              {doneLoops.map((l) => (
                <li key={l.id} className="row">
                  <span className="small muted" style={{ textDecoration: 'line-through' }}>{l.label}</span>
                  <span className="btn-row" style={{ margin: 0 }}>
                    <button className="chip" onClick={() => update((s) => ({ ...s, openLoops: upsert(s.openLoops, { ...l, status: 'open', closedAt: undefined }) }))}>
                      Reopen
                    </button>
                    <button className="chip danger" aria-label={`Delete closed loop: ${l.label}`} onClick={() => update((s) => ({ ...s, openLoops: removeById(s.openLoops, l.id) }))}>
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="card">
        <h2>Calendar prep <span className="badge warn">Approval required later</span></h2>
        <p className="muted small">
          v1 has no calendar access. When Google Calendar lands (v0.4), DavidOS will read events
          and draft changes, but every create/edit/delete goes through the approval gate.
        </p>
      </div>
    </>
  );
}
