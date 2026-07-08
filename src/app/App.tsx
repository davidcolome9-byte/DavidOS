import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from '../components/Layout';
import StatusDashboard from '../components/StatusDashboard';
import AgentsPage from '../components/AgentsPage';
import WorkflowRunner from '../components/WorkflowRunner';
import ProjectVault from '../components/ProjectVault';
import PromptVault from '../components/PromptVault';
import ContextVault from '../components/ContextVault';
import Planning from '../components/Planning';
import AuditLog from '../components/AuditLog';
import Settings from '../components/Settings';
import { StoreProvider } from '../state/store';

// HashRouter so the PWA works on any static host (and file://) with zero
// server config — no rewrite rules needed.
export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<StatusDashboard />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/workflows" element={<WorkflowRunner />} />
            <Route path="/projects" element={<ProjectVault />} />
            <Route path="/prompts" element={<PromptVault />} />
            <Route path="/context" element={<ContextVault />} />
            <Route path="/planning" element={<Planning />} />
            <Route path="/logs" element={<AuditLog />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </HashRouter>
    </StoreProvider>
  );
}
