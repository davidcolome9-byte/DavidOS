import type { Handoff, IncludedHandoffSnapshot, Workflow, WorkflowOutputMode } from '../types';
import { renderTemplate } from './templateRenderer';
import { extractFitnessData, buildRawExcerpt } from './fitnessExtraction';
import type { ExtractionResult } from './fitnessExtraction';
import { resolveCategory, resolveHistoryProfile, resolveOutputMode, historyTargetCount } from './workflowMeta';
import { sha256Hex } from '../utils/hash';

// ---------- Retrieval (Phase 4) ----------

/** Handoff content, tolerating legacy saves that used `output`. */
export function handoffContent(h: Handoff): string {
  return h.content ?? h.output ?? '';
}

/**
 * Pull prior saved handoffs for the same workflow.
 * - adaptive overfetch (target × 2), then filter/dedupe/trim
 * - include active + correction; missing status counts as active
 * - exclude superseded and anything corrected by a later handoff
 * - order by entryDate when reliable, falling back to savedAt, newest first
 */
export function getPriorHandoffs(all: Handoff[], workflowId: string, targetCount: number): Handoff[] {
  const sortKey = (h: Handoff) =>
    h.entryDate && h.dateConfidence !== 'unknown' ? `${h.entryDate}T12:00:00Z` : h.createdAt;

  const candidates = all
    .filter((h) => h.workflowId === workflowId)
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
    .slice(0, targetCount * 2);

  const correctedIds = new Set(
    candidates.filter((h) => h.correctsHandoffId).map((h) => h.correctsHandoffId as string),
  );

  return candidates
    .filter((h) => (h.status ?? 'active') !== 'superseded')
    .filter((h) => !correctedIds.has(h.id))
    .slice(0, targetCount);
}

// ---------- History formatting (Phase 5) ----------

interface FormattedHistory {
  text: string;
  snapshots: IncludedHandoffSnapshot[];
  rawFallbackCount: number;
}

function formatHistoryEntry(h: Handoff, extraction: ExtractionResult, allowLongExcerpt: boolean): string {
  const { extract, trusted, possible, weakExtraction } = extraction;
  const lines: string[] = [];
  lines.push(
    `Entry date: ${extract.entryDate ?? 'unknown'} | Saved: ${new Date(h.createdAt).toISOString().slice(0, 16).replace('T', ' ')} | Date confidence: ${extract.dateConfidence}`,
  );
  if (trusted.length > 0) {
    lines.push('', 'Trusted extracted metrics:');
    for (const t of trusted) lines.push(`- ${t.label}: ${t.field.value}`);
  }
  if (possible.length > 0) {
    lines.push('', 'Possible extracted values:');
    for (const p of possible) {
      lines.push(`- ${p.label}: “${p.field.value}” | ${p.field.confidence} confidence${p.field.sourceText ? ` | source: “${p.field.sourceText}”` : ''}`);
    }
  }
  if (weakExtraction) {
    const cap = allowLongExcerpt ? 1500 : 750;
    const excerpt = buildRawExcerpt(handoffContent(h), cap);
    lines.push('', 'Raw excerpt fallback:', 'Extraction was incomplete, so this excerpt is included for context:', `“${excerpt}”`);
  }
  return lines.join('\n');
}

function formatHistory(prior: Handoff[], fitnessMode: boolean): FormattedHistory {
  const snapshots: IncludedHandoffSnapshot[] = [];
  let rawFallbackCount = 0;
  const blocks: string[] = [];
  // With few prior entries, weak extractions may use the longer excerpt cap.
  const allowLongExcerpt = prior.length <= 2;

  prior.forEach((h, i) => {
    const content = handoffContent(h);
    const extraction = extractFitnessData(content, h.createdAt, fitnessMode);
    if (extraction.weakExtraction) rawFallbackCount += 1;
    snapshots.push({
      handoffId: h.id,
      sourceHandoffHash: h.contentHash ?? sha256Hex(content),
      entryDate: extraction.extract.entryDate,
      savedAt: h.createdAt,
      dateConfidence: extraction.extract.dateConfidence,
      extractionSummary: {
        highConfidenceFieldCount: extraction.trusted.filter((f) => f.field.confidence === 'high').length,
        mediumConfidenceFieldCount: extraction.trusted.filter((f) => f.field.confidence === 'medium').length,
        lowConfidenceFieldCount: extraction.possible.length,
        rawFallbackUsed: extraction.weakExtraction,
        weakExtraction: extraction.weakExtraction,
      },
    });
    blocks.push(`### Prior entry ${i + 1} of ${prior.length}\n${formatHistoryEntry(h, extraction, allowLongExcerpt)}`);
  });

  return { text: blocks.join('\n\n'), snapshots, rawFallbackCount };
}

// ---------- Analysis instructions (Phases 4 + 11) ----------

const CONTINUITY_RULES = `Continuity rules:
- Prioritize the New Entry to Analyze; prior context is supporting evidence.
- Use prior context for trends, continuity, recent changes, and inconsistencies.
- Treat trusted extracted metrics as usable history.
- Treat possible extracted values as uncertain clues, not confirmed facts.
- Mention uncertainty when dates, fields, or extracted values are unclear.
- Avoid reprinting all prior history unless useful.
- Do not let old entries override clear new information.`;

const DASHBOARD_INSTRUCTIONS = `Produce a dashboard-style full analysis in this format:

## Fitness Dashboard Analysis

Analysis confidence: High / Medium / Low

### Nutrition & Macros
[Analyze calories, protein, carbs, fats, fiber, meal timing, adherence, and missing data.]

### Hydration
[Analyze water intake and hydration context.]

### Activity & Steps
[Analyze steps, walking, active calories, general movement.]

### Training
[Analyze workout details, muscle groups, volume/intensity if present.]

### Recovery
[Analyze sleep, fatigue, HRV, resting HR, soreness, stress, body battery.]

### Pain / Injury Markers
[Include this section ONLY when relevant. Distinguish soreness, fatigue, joint discomfort, back pain, and nerve-like pain. Never diagnose. Flag severe or worsening neurological symptoms (numbness/tingling, leg weakness, radiating electrical pain, loss of function, escalation across entries) and recommend reducing risky loading and seeking professional medical input for severe, worsening, neurological, or persistent symptoms.]

### Body Metrics / Trend Notes
[Analyze weight, waist, body composition; only claim a trend if multiple entries support it.]

### What Changed Since Prior Entries?
[Include when prior history exists. If no meaningful change is detected, say so.]

### Action Items
[1–3 items when the entry is simple, recovery/pain is poor, or data quality is weak; 3–5 when enough clean data exists; never more than 5 unless explicitly requested.]

Analysis rules:
- Trend logic: use the most recent 1–3 entries for acute changes and the full window for recurring patterns. Distinguish: current-entry issue vs recent change vs recurring pattern vs insufficient data. Do not claim a trend unless multiple entries support it. Do not overreact to one-day noise.
- Action aggressiveness is context-sensitive: conservative when data is incomplete, pain/injury markers are present, recovery is poor, sleep is low, or the trend is unclear; moderate with enough reliable low-risk data; aggressive optimization only when multiple prior entries support a repeated (not one-day) issue and the action is safe and realistic.
- Missing data: analyze what is present; call out missing data only when it materially changes interpretation (e.g. sleep missing while discussing recovery, water missing while discussing hydration, pain details missing when injury markers appear).
- Macro/calorie consistency: treat logged totals as primary unless clearly inconsistent; label recalculated numbers as estimates; ignore tiny rounding differences; mention ~5–10% variance only if relevant; flag ~10–15% discrepancies; strongly flag >15%. Do not overcorrect messy entries (sauces, cooked/raw ambiguity, restaurant food, approximate portions).
- Give one overall confidence rating; add section-level confidence only when needed.
- Compare against the Personal Targets / Regimen Context when provided; if the profile looks old or incomplete, mention uncertainty rather than assuming targets are current.
- Address David by first name. Do not use a full name unless it appears in the profile.
- Never recommend medication, TRT, CPAP, or dosing changes. When profile context is present, respect the movement safety context at all times.`;

function analysisInstructions(mode: WorkflowOutputMode, workflow: Workflow, style: string, hasHistory: boolean, hasProfile: boolean): string {
  const base = renderTemplate(workflow, '(see New Entry above)', style)
    // The template's own {{input}} slot is served by the New Entry section;
    // strip the placeholder line remnant if the replacement left artifacts.
    .replace('(see New Entry above)', '(the content of the "New Entry to Analyze" section above)');

  const parts: string[] = [];
  switch (mode) {
    case 'clean_handoff_only':
      parts.push(base);
      break;
    case 'handoff_with_continuity_notes':
      parts.push(base);
      if (hasHistory) parts.push('', 'After the main output, add a short "Continuity notes" section: changes, follow-ups, or inconsistencies versus the prior context.', '', CONTINUITY_RULES);
      break;
    case 'analysis_recommendations':
      parts.push(base);
      parts.push('', 'Then analyze the entry against the prior context and give practical recommendations grounded only in available data.');
      if (hasHistory) parts.push('', CONTINUITY_RULES);
      break;
    case 'dashboard_full_analysis':
      parts.push(DASHBOARD_INSTRUCTIONS);
      if (hasHistory) parts.push('', CONTINUITY_RULES);
      if (!hasProfile) parts.push('', 'No saved Health Profile targets were available. Analyze only the provided entry and prior context.');
      parts.push('', `Workflow-specific rules:`, base);
      break;
    case 'custom':
      parts.push(base);
      break;
  }
  return parts.join('\n');
}

// ---------- Prompt assembly ----------

export interface BuiltPrompt {
  fullPrompt: string;
  currentOnly: string;
  promptHash: string;
  fingerprint: string;
  priorCount: number;
  historyProfile: string;
  rawFallbackCount: number;
  includedHandoffIds: string[];
  snapshots: IncludedHandoffSnapshot[];
  helperText: string;
  outputMode: WorkflowOutputMode;
}

export interface BuildPromptArgs {
  workflow: Workflow;
  input: string;
  style: string;
  allHandoffs: Handoff[];
  /** Rendered Health Profile block ('' when excluded/unavailable). */
  profileBlock?: string;
}

/**
 * Assemble the continuity-aware prompt:
 *   ## New Entry to Analyze
 *   ## Personal Targets / Regimen Context   (fitness workflows w/ profile)
 *   ## Prior Context for Analysis
 *   ## Analysis Instructions
 */
export function buildPrompt({ workflow, input, style, allHandoffs, profileBlock }: BuildPromptArgs): BuiltPrompt {
  const historyProfile = resolveHistoryProfile(workflow);
  const outputMode = resolveOutputMode(workflow);
  const fitnessMode = resolveCategory(workflow) === 'fitness_health';
  const target = historyTargetCount(historyProfile);

  const prior = getPriorHandoffs(allHandoffs, workflow.id, target);
  const history = formatHistory(prior, fitnessMode);

  const currentOnly = input.trim() || '(no input provided)';
  const sections: string[] = [];
  sections.push('## New Entry to Analyze', '', currentOnly);
  if (profileBlock) sections.push('', '## Personal Targets / Regimen Context', '', profileBlock);
  if (prior.length > 0) {
    sections.push('', '## Prior Context for Analysis', '', history.text);
  } else {
    sections.push('', '## Prior Context for Analysis', '', 'No prior saved handoffs exist for this workflow yet.');
  }
  sections.push('', '## Analysis Instructions', '', analysisInstructions(outputMode, workflow, style, prior.length > 0, Boolean(profileBlock)));

  const fullPrompt = sections.join('\n');
  const promptHash = sha256Hex(fullPrompt);
  const fingerprint = `${promptHash.slice(0, 8)} · ${fullPrompt.length.toLocaleString('en-US')} chars`;

  const helperText =
    prior.length === 0
      ? 'No prior saved handoffs found · Current handoff only'
      : `${prior.length} prior handoff${prior.length === 1 ? '' : 's'} included · ` +
        `${historyProfile === 'fitness_health' ? 'Health & Fitness history mode' : historyProfile === 'trend_analysis' ? 'Trend analysis mode' : 'Default history mode'}` +
        (history.rawFallbackCount > 0 ? ` · ${history.rawFallbackCount} entr${history.rawFallbackCount === 1 ? 'y' : 'ies'} used fallback excerpts` : '');

  return {
    fullPrompt,
    currentOnly,
    promptHash,
    fingerprint,
    priorCount: prior.length,
    historyProfile,
    rawFallbackCount: history.rawFallbackCount,
    includedHandoffIds: prior.map((h) => h.id),
    snapshots: history.snapshots,
    helperText,
    outputMode,
  };
}
