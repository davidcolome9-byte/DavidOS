import type { IntegrationAdapter } from './integrationTypes';
import { stubResult } from './integrationTypes';

export const githubAdapter: IntegrationAdapter = {
  id: 'github',
  name: 'GitHub',
  capabilities: ['Read repos', 'Create issues', 'Commits and PRs (with approval)'],
  requiredCredentials: ['GitHub fine-grained personal access token or GitHub App'],
  riskLevel: 'external_write',
  enabled: false,
  methods: [
    { name: 'readRepo', description: 'Read repository contents', risk: 'read_only', implemented: false },
    { name: 'createIssue', description: 'Open an issue', risk: 'external_write', implemented: false },
    { name: 'createCommit', description: 'Commit changes', risk: 'external_write', implemented: false },
    { name: 'openPullRequest', description: 'Open a pull request', risk: 'external_write', implemented: false },
  ],
  futureNotes:
    'Useful for pushing DavidOS vault exports or project notes to a private repo. ' +
    'Fine-grained token scoped to specific repos only.',
};

export const readRepo = () => stubResult(githubAdapter, 'readRepo');
export const createIssue = () => stubResult(githubAdapter, 'createIssue');
export const createCommit = () => stubResult(githubAdapter, 'createCommit');
export const openPullRequest = () => stubResult(githubAdapter, 'openPullRequest');
