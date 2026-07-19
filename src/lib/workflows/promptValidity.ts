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

export interface PromptValidityOptions {
  /**
   * Planning-context workflows (Daily Brief / Weekly Review, DOS-WF-002A) may
   * honestly build a prompt from zero notes — the canonical planning state
   * substitutes for a typed request, and the New Entry section renders a
   * locked placeholder instead of the generic "no input provided" marker.
   */
  allowEmptyRequest?: boolean;
}

/**
 * Evaluate whether a built prompt may be copied or saved.
 *
 * Intake mode (a Gravl prompt with no workout yet) is VALID as long as the
 * request is non-empty and the prompt honestly labels itself — such a prompt
 * contains the request and never the "no input provided" marker.
 */
export function evaluatePromptValidity(fullPrompt: string, request: string, options: PromptValidityOptions = {}): PromptValidity {
  const reasons: string[] = [];

  if (!options.allowEmptyRequest && !request.trim()) reasons.push('The request is empty.');
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
   * FULL context identity of the included Health Profile (the complete
   * `healthProfilePromptMetadata.promptContextHash`, NOT the shortened
   * display fingerprint). Any change to profile content changes this, marking
   * the prompt stale. A truncated fingerprint could collide and miss a real
   * change, so callers must pass the full hash here.
   */
  profileFingerprint?: string;
  /** Gravl-only: optional pasted workout text. */
  workoutText?: string;
  /** Gravl-only: whether screenshots were flagged. */
  hasScreenshots?: boolean;
  /** Whether the canonical planning-state context is included (DOS-WF-002A). */
  includePlanningState?: boolean;
  /**
   * FULL identity hash of the rendered planning-state block (NOT the
   * shortened display fingerprint) — changes whenever priorities, open
   * loops, reminders, or projects change, or a planning-state workflow is
   * built with an empty selection. Callers must pass the full hash here for
   * the same reason `profileFingerprint` does.
   */
  planningContextFingerprint?: string;
}

export interface Actability {
  ok: boolean;
  /** Explanatory message to surface when an action is refused. */
  message?: string;
}

/**
 * Defense-in-depth gate for copy/save/history/follow-up actions. Disabled
 * buttons are the first line of defense; every action handler ALSO calls this
 * before any clipboard write or local write, so a stale/invalid/mismatched
 * result can never be persisted or copied even if a disabled control is
 * bypassed. Pure and unit-testable — the component holds no guard logic of
 * its own.
 */
export function evaluateActability(input: {
  hasBuilt: boolean;
  validity: PromptValidity | null;
  builtConfigKey: string | null;
  currentConfigKey: string;
}): Actability {
  if (!input.hasBuilt) {
    return { ok: false, message: 'Build a prompt first — there is nothing to copy or save yet.' };
  }
  if (!input.validity || !input.validity.valid) {
    const why = input.validity?.reasons.join(' ') ?? 'the prompt is not valid.';
    return { ok: false, message: `This prompt can’t be copied or saved: ${why}` };
  }
  if (input.builtConfigKey === null || input.builtConfigKey !== input.currentConfigKey) {
    return { ok: false, message: 'Prompt is out of date — rebuild before copying or saving.' };
  }
  return { ok: true };
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
    includePlanningState: Boolean(parts.includePlanningState),
    planningContextFingerprint: parts.includePlanningState ? parts.planningContextFingerprint ?? 'none' : 'excluded',
  });
}
