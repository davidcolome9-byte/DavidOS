import { AGENTS } from '../lib/agents/agentRegistry';
import AgentCard from './AgentCard';
import SupervisedExecutionSection from './SupervisedExecutionSection';

export default function AgentsPage() {
  return (
    <>
      <p className="muted small" style={{ padding: '0 4px' }}>
        Agent specs live in <code>/seed/agents</code> as JSON — the same definitions any AI tool can use.
      </p>
      {AGENTS.map((a) => <AgentCard key={a.id} agent={a} />)}
      <SupervisedExecutionSection />
    </>
  );
}
