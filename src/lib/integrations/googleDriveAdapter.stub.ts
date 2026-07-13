import type { IntegrationAdapter } from './integrationTypes';
import { stubResult } from './integrationTypes';

export const googleDriveAdapter: IntegrationAdapter = {
  id: 'google_drive',
  name: 'Google Drive',
  capabilities: ['Backup export', 'Vault sync (source of truth)', 'Read/write markdown + JSON'],
  requiredCredentials: ['Google OAuth web client ID with drive.file scope'],
  riskLevel: 'external_write',
  enabled: true,
  methods: [
    { name: 'listFiles', description: 'List files in the DavidOS Drive folder', risk: 'read_only', implemented: false },
    { name: 'readFile', description: 'Read a vault file from Drive', risk: 'read_only', implemented: false },
    { name: 'writeFile', description: 'Write a vault file to Drive', risk: 'external_write', implemented: false },
    { name: 'createFolder', description: 'Create the DavidOS backup folder structure', risk: 'external_write', implemented: true },
    { name: 'syncVault', description: 'Two-way sync of local vault with Drive', risk: 'external_write', implemented: false },
    { name: 'exportBackup', description: 'Push a JSON backup to Drive/06_Exports', risk: 'external_write', implemented: true },
  ],
  futureNotes:
    'v0.3 foundation: manual JSON backup export is live using drive.file scope and short-lived browser tokens. ' +
    'Two-way vault sync and conflict review remain pending per docs/google-drive-sync-plan.md. ' +
    'Drive writes go through the ApprovalGate.',
};

export const listFiles = () => stubResult(googleDriveAdapter, 'listFiles');
export const readFile = () => stubResult(googleDriveAdapter, 'readFile');
export const writeFile = () => stubResult(googleDriveAdapter, 'writeFile');
export const syncVault = () => stubResult(googleDriveAdapter, 'syncVault');
// createFolder / exportBackup are NOT stubbed: they are live (marked
// implemented above) via googleDriveClient.ts (ensureDriveFolderPath /
// exportBackupToDrive), always behind ApprovalGate. Stub functions for them
// were removed so nothing can honestly-but-wrongly report "no call was made".
