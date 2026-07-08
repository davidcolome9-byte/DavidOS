import type { IntegrationAdapter } from './integrationTypes';
import { stubResult } from './integrationTypes';

export const googleDriveAdapter: IntegrationAdapter = {
  id: 'google_drive',
  name: 'Google Drive',
  capabilities: ['Vault sync (source of truth)', 'Backups', 'Read/write markdown + JSON'],
  requiredCredentials: ['Google OAuth (PKCE) with drive.file scope'],
  riskLevel: 'external_write',
  enabled: false,
  methods: [
    { name: 'listFiles', description: 'List files in the DavidOS Drive folder', risk: 'read_only', implemented: false },
    { name: 'readFile', description: 'Read a vault file from Drive', risk: 'read_only', implemented: false },
    { name: 'writeFile', description: 'Write a vault file to Drive', risk: 'external_write', implemented: false },
    { name: 'createFolder', description: 'Create the DavidOS folder structure', risk: 'external_write', implemented: false },
    { name: 'syncVault', description: 'Two-way sync of local vault with Drive', risk: 'external_write', implemented: false },
    { name: 'exportBackup', description: 'Push a JSON backup to Drive/06_Exports', risk: 'external_write', implemented: false },
  ],
  futureNotes:
    'Planned for v0.3. Uses drive.file scope so DavidOS can only touch files it created. ' +
    'Folder layout and conflict rules are specified in docs/google-drive-sync-plan.md. ' +
    'All write methods go through the ApprovalGate.',
};

export const listFiles = () => stubResult(googleDriveAdapter, 'listFiles');
export const readFile = () => stubResult(googleDriveAdapter, 'readFile');
export const writeFile = () => stubResult(googleDriveAdapter, 'writeFile');
export const createFolder = () => stubResult(googleDriveAdapter, 'createFolder');
export const syncVault = () => stubResult(googleDriveAdapter, 'syncVault');
export const exportBackup = () => stubResult(googleDriveAdapter, 'exportBackup');
