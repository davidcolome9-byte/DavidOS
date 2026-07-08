import type { IntegrationAdapter } from './integrationTypes';
import { stubResult } from './integrationTypes';

export const localFilesAdapter: IntegrationAdapter = {
  id: 'local_files',
  name: 'Local Files',
  capabilities: ['Read/write vault files via the File System Access API'],
  requiredCredentials: ['Browser folder permission grant (no credentials)'],
  riskLevel: 'local_write',
  enabled: false,
  methods: [
    { name: 'pickVaultFolder', description: 'Choose a local folder for the vault', risk: 'read_only', implemented: false },
    { name: 'readVaultFile', description: 'Read a markdown/JSON vault file', risk: 'read_only', implemented: false },
    { name: 'writeVaultFile', description: 'Write a vault file to disk', risk: 'local_write', implemented: false },
  ],
  futureNotes:
    'File System Access API works in Chrome on Android and desktop. Would let the vault ' +
    'live as real markdown files (editable by Claude Code / Codex) instead of localStorage.',
};

export const pickVaultFolder = () => stubResult(localFilesAdapter, 'pickVaultFolder');
export const readVaultFile = () => stubResult(localFilesAdapter, 'readVaultFile');
export const writeVaultFile = () => stubResult(localFilesAdapter, 'writeVaultFile');
