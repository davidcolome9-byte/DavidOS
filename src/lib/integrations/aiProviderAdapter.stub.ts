import type { IntegrationAdapter } from './integrationTypes';
import { stubResult } from './integrationTypes';

// ---------- Provider contract (Phase 13 — architecture only, no live calls) ----------

export type AiProviderId = 'claude' | 'openai' | 'gemini' | 'local';

export interface ProviderRequest {
  provider: AiProviderId;
  model?: string;
  prompt: string;
  promptHash?: string;
  workflowId?: string;
  maxOutputTokens?: number;
}

export interface ProviderResponse {
  provider: AiProviderId;
  model?: string;
  status: 'success' | 'error' | 'cancelled';
  content?: string;
  errorMessage?: string;
  tokenCount?: number;
  estimatedCost?: number;
  latencyMs?: number;
}

/** Future settings shape — no key storage is implemented in this pass. */
export interface ProviderSettings {
  defaultProvider: AiProviderId;
  /** Keys are entered at runtime, never bundled. Storage strategy TBD (v0.6). */
  keyStorage: 'session_only' | 'local_encrypted' | 'proxy';
}

/**
 * The single integration point WorkflowRunner will use when live calls land
 * (Claude first). Always throws in v1 so nothing can pretend to succeed.
 */
export async function sendProviderRequest(_req: ProviderRequest): Promise<ProviderResponse> {
  throw new Error(
    'AI providers are not wired in this version. Copy the generated prompt into your AI tool instead.',
  );
}

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
