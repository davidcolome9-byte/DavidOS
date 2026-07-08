import { Link } from 'react-router-dom';
import { useStore, upsert } from '../state/store';
import { AGENTS } from '../lib/agents/agentRegistry';
import CommandPalette from './CommandPalette';

const QUICK_ACTIONS = [
  { label: '☀️ Daily Brief', to: '/workflows?wf=daily-brief' },
  { label: '💪 Fitness Handoff', to: '/workflows?wf=fitness-handoff' },
  { label: '🛡️ Teachback', to: '/workflows?wf=work-teachback' },
  { label: '🗓️ Weekly Review', to: '/workflows?wf=weekly-review' },
];

export default function StatusDashboard() {
  const { state, update } = useStore();
  const openLoops = state.openLoops.filter((l) => l.status === 'open');
  const reminders = state.reminders.filter((r) => !r.done);
  const priorities = [...state.priorities].sort((a, b) => a.rank - b.rank);
  const suggested =
    state.projects.find((p) => p.status === 'active' && p.nextAction)?.nextAction ??
    'Review today’s plan and choose one highest-leverage action.';

  function toggleLoop(id: string) {
    update((s) => {
      const loop = s.openLoops.find((l) => l.id === id);
      if (!loop) return s;
      return {
        ...s,
        openLoops: upsert(s.openLoops, { ...loop, status: loop.status === 'open' ? 'done' : 'open' }),
      };
    });
  }

  return (
    <>
      <div className="card">
        <h2>
          OS Status
          <span className="badge ok">Local-first · v0.1</span>
        </h2>
        <h3>Top priorities</h3>
        <ul className="plain small">
          {priorities.slice(0, 5).map((p) => <li key={p.id}>{p.rank}. {p.label}</li>)}
        </ul>
        <h3>Suggested next move</h3>
        <p className="small">→ {suggested}</p>
        {reminders.length > 0 && (
          <>
            <h3>Upcoming reminders</h3>
            <ul className="plain small">
              {reminders.slice(0, 3).map((r) => (
                <li key={r.id}>{r.label}{r.due ? ` — ${r.due}` : ''}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <CommandPalette />

      <div className="card">
        <h2>Quick actions</h2>
        <div className="grid-2">
          {QUICK_ACTIONS.map((a) => (
            <Link key={a.to} className="btn" to={a.to}>{a.label}</Link>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Agents <Link className="muted small" to="/agents">all →</Link></h2>
        <div className="btn-row">
          {AGENTS.map((a) => (
            <Link key={a.id} className="btn chip" to={`/workflows?wf=${a.defaultWorkflow}`}>
              {a.icon} {a.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Open loops <span className="badge neutral">{openLoops.length}</span></h2>
        <ul className="plain">
          {openLoops.slice(0, 6).map((l) => (
            <li key={l.id} className="row">
              <span className="small">{l.label}</span>
              <button className="chip" onClick={() => toggleLoop(l.id)}>Done</button>
            </li>
          ))}
          {openLoops.length === 0 && <li className="muted small">No open loops. Clear board.</li>}
        </ul>
      </div>

      <div className="card">
        <h2>Recent activity <Link className="muted small" to="/logs">log →</Link></h2>
        {state.auditLog.slice(0, 5).map((e) => (
          <div key={e.id} className="audit-entry">
            <span className="when">{new Date(e.timestamp).toLocaleTimeString()}</span>{' '}
            {e.command} <span className="muted">— {e.resultSummary}</span>
          </div>
        ))}
        {state.auditLog.length === 0 && <p className="muted small">No activity yet. Route a command above.</p>}
      </div>
    </>
  );
}
