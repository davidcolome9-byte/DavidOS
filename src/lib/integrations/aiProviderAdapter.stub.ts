import type { IntegrationAdapter } from './integrationTypes';
import { stubResult } from './integrationTypes';

/**
 * One adapter covering all AI providers (ChatGPT, Claude, Codex, Gemini).
 * The provider is a parameter, so the same workflow specs route to any model.
 */
export const aiProviderAdapter: IntegrationAdapter = {
  id: 'ai_provider',
  name: 'AI Providers (ChatGPT / Claude / Codex / Gemini)',
  capabilities: [
    'Send generated prompts to a chosen model',
    'Compare responses across models',
    'Generate handoffs',
    'Critique and improve prompts',
  ],
  requiredCredentials: ['Per-provider API key (never bundled — see .env.example)'],
  riskLevel: 'external_write',
  enabled: false,
  methods: [
    { name: 'sendPrompt', description: 'Send a prompt to a provider', risk: 'external_write', implemented: false },
    { name: 'compareResponses', description: 'Same prompt to multiple providers', risk: 'external_write', implemented: false },
    { name: 'generateHandoff', description: 'AI-assisted handoff generation', risk: 'external_write', implemented: false },
    { name: 'critiquePrompt', description: 'AI critique of a vault prompt', risk: 'external_write', implemented: false },
  ],
  futureNotes:
    'Planned for v0.6. Sending a prompt is an external write (data leaves the device), ' +
    'so it always gates — with an extra warning if the prompt contains sensitive-context markers. ' +
    'Until then, workflows generate prompts to copy/paste into each tool manually.',
};

export const sendPrompt = () => stubResult(aiProviderAdapter, 'sendPrompt');
export const compareResponses = () => stubResult(aiProviderAdapter, 'compareResponses');
export const generateHandoff = () => stubResult(aiProviderAdapter, 'generateHandoff');
export const critiquePrompt = () => stubResult(aiProviderAdapter, 'critiquePrompt');
