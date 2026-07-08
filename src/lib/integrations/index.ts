import type { IntegrationAdapter } from './integrationTypes';
import { googleDriveAdapter } from './googleDriveAdapter.stub';
import { gmailAdapter } from './gmailAdapter.stub';
import { googleCalendarAdapter } from './googleCalendarAdapter.stub';
import { githubAdapter } from './githubAdapter.stub';
import { aiProviderAdapter } from './aiProviderAdapter.stub';
import { localFilesAdapter } from './localFilesAdapter.stub';

export const INTEGRATIONS: IntegrationAdapter[] = [
  googleDriveAdapter,
  googleCalendarAdapter,
  gmailAdapter,
  githubAdapter,
  aiProviderAdapter,
  localFilesAdapter,
];
