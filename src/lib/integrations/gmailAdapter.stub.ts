import type { IntegrationAdapter } from './integrationTypes';
import { stubResult } from './integrationTypes';

export const gmailAdapter: IntegrationAdapter = {
  id: 'gmail',
  name: 'Gmail',
  capabilities: ['Search mail', 'Read threads', 'Draft replies (never auto-send)'],
  requiredCredentials: ['Google OAuth (PKCE) with gmail.readonly + gmail.compose scopes'],
  riskLevel: 'sensitive_external_write',
  enabled: false,
  methods: [
    { name: 'searchMessages', description: 'Search messages by query', risk: 'read_only', implemented: false },
    { name: 'readThread', description: 'Read a full thread', risk: 'read_only', implemented: false },
    { name: 'draftReply', description: 'Create a draft reply (not sent)', risk: 'external_write', implemented: false },
    { name: 'sendReply', description: 'Send a reply', risk: 'sensitive_external_write', implemented: false },
  ],
  futureNotes:
    'Planned for v0.5, read + draft first. sendReply stays behind approval + review ' +
    'forever — DavidOS never auto-sends email.',
};

export const searchMessages = () => stubResult(gmailAdapter, 'searchMessages');
export const readThread = () => stubResult(gmailAdapter, 'readThread');
export const draftReply = () => stubResult(gmailAdapter, 'draftReply');
export const sendReply = () => stubResult(gmailAdapter, 'sendReply');
