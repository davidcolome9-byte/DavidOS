/**
 * Prompt validity + staleness for the Workflow Runner (DOS-WF-001).
 *
 * A built prompt is only safe to Copy / Save when it is BOTH valid (honestly
 * constructed from real input) and fresh (built from the current input,
 * workflow, output configuration, and included Health Profile context). These
 * are pure helpers so the rules are unit-testable and deterministic.
 */

/** Tokens that should never survive a real build. */
const UNRESOLVED_TEMPLATE_TOKEN = /\{\{\s*(input|style|date)\s*\}\}/i;
/** Internal replacement sentinels of the form [[SOMETHING]]. */
const UNRESOLVED_BRACKET_PLACEHOLDER = /\[\[[^\]]+\]\]/;
/** The renderer's "nothing supplied" marker. */
const NO_INPUT_MARKER = /no input provided/i;

export interface PromptValidity {
  valid: boolean;
  reasons: string[];
}

/**
 * Evaluate whether a built prompt may be copied or saved.
 *
 * Intake mode (a Gravl prompt with no workout yet) is VALID as long as the
 * request is non-empty and the prompt honestly labels itself — such a prompt
 * contains the request and never the "no input provided" marker.
 */
export function evaluatePromptValidity(fullPrompt: string, request: string): PromptValidity {
  const reasons: string[] = [];

  if (!request.trim()) reasons.push('The request is empty.');
  if (!fullPrompt || !fullPrompt.trim()) reasons.push('Prompt construction produced no text.');
  if (NO_INPUT_MARKER.test(fullPrompt)) reasons.push('The prompt still says no input was provided.');
  if (UNRESOLVED_TEMPLATE_TOKEN.test(fullPrompt)) reasons.push('The prompt still contains an unresolved {{template}} token.');
  if (UNRESOLVED_BRACKET_PLACEHOLDER.test(fullPrompt)) reasons.push('The prompt still contains an unresolved [[placeholder]].');

  return { valid: reasons.length === 0, reasons };
}

export interface PromptConfigParts {
  input: string;
  workflowId: string;
  /** Output configuration (style / format selection). */
  style: string;
  /** Whether Health Profile context is included. */
  includeProfile: boolean;
  /**
   * Identity of the included Health Profile context (fingerprint/hash).
   * Changing profile content changes this, marking the prompt stale.
   */
  profileFingerprint?: string;
  /** Gravl-only: optional pasted workout text. */
  workoutText?: string;
  /** Gravl-only: whether screenshots were flagged. */
  hasScreenshots?: boolean;
}

/**
 * A stable identity for the values a prompt was built from. When the live
 * config key differs from the key captured at build time, the prompt is stale.
 */
export function buildPromptConfigKey(parts: PromptConfigParts): string {
  return JSON.stringify({
    input: parts.input,
    workflowId: parts.workflowId,
    style: parts.style,
    includeProfile: parts.includeProfile,
    profileFingerprint: parts.includeProfile ? parts.profileFingerprint ?? 'none' : 'excluded',
    workoutText: parts.workoutText ?? '',
    hasScreenshots: Boolean(parts.hasScreenshots),
  });
}
