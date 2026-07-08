import { Link } from 'react-router-dom';
import type { Agent } from '../lib/types';
import { workflowsForAgent } from '../lib/workflows/workflowRegistry';

export default function AgentCard({ agent }: { agent: Agent }) {
  const workflows = workflowsForAgent(agent.id);
  return (
    <div className="card">
      <h2>
        <span>{agent.icon} {agent.name}</span>
        <Link className="btn primary" to={`/workflows?wf=${agent.defaultWorkflow}`}>Launch</Link>
      </h2>
      <p className="muted">{agent.purpose}</p>
      <details>
        <summary className="muted small">Details: handles, inputs, outputs, approval</summary>
        <h3>Handles</h3>
        <ul className="plain small">{agent.handles.map((h) => <li key={h}>{h}</li>)}</ul>
        <h3>Inputs it needs</h3>
        <ul className="plain small">{agent.inputs.map((i) => <li key={i}>{i}</li>)}</ul>
        <h3>Output formats</h3>
        <ul className="plain small">{agent.outputs.map((o) => <li key={o}>{o}</li>)}</ul>
        <h3>Approval requirements</h3>
        <ul className="plain small">{agent.approval.map((a) => <li key={a}>⚠️ {a}</li>)}</ul>
        <h3>Example commands</h3>
        <ul className="plain small">{agent.exampleCommands.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
        <h3>Workflows</h3>
        <div className="btn-row">
          {workflows.map((w) => (
            <Link key={w.id} className="btn chip" to={`/workflows?wf=${w.id}`}>{w.name}</Link>
          ))}
        </div>
      </details>
    </div>
  );
}
