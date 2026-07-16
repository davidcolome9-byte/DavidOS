import type { HealthFitnessProfile, HealthProfilePromptMetadata } from '../types';
import { sha256Hex } from '../utils/hash';

const PROFILE_KEYWORD_PRIORITY = [
  /calorie|kcal|macro|protein|carb|fat|fiber|water|nutrition/i,
  /training|workout|split|hypertrophy|volume|frequency/i,
  /restriction|axial|injur|l4|l5|laminectomy|back/i,
  /sleep|recovery|hrv|rhr|baseline/i,
  /steps|cardio|walk/i,
  /medication|supplement|trt|cpap/i,
  /dexa|seca|body composition|body fat|waist|weight/i,
  /coach|preference|style/i,
];

function keywordExcerpt(text: string, cap: number): string {
  if (text.length <= cap) return text;
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const scored = sentences.map((s) => {
    const idx = PROFILE_KEYWORD_PRIORITY.findIndex((re) => re.test(s));
    return { s, priority: idx === -1 ? PROFILE_KEYWORD_PRIORITY.length : idx };
  });
  scored.sort((a, b) => a.priority - b.priority);
  const picked: string[] = [];
  let len = 0;
  for (const { s } of scored) {
    if (len + s.length + 1 > cap) continue;
    picked.push(s);
    len += s.length + 1;
  }
  return picked.join(' ');
}

export interface ProfilePromptBlock {
  text: string;
  metadata: HealthProfilePromptMetadata;
  /** True when the profile exists but had nothing usable to insert. */
  empty: boolean;
}

// Values in [brackets] are unfilled placeholders — never inserted into prompts.
const isPlaceholder = (v: unknown): boolean => typeof v === 'string' && v.trim().startsWith('[');

const line = (label: string, value: unknown): string | null =>
  value === undefined || value === null || value === '' || isPlaceholder(value)
    ? null
    : `- ${label}: ${value}`;

const listLine = (label: string, values?: string[]): string | null => {
  const real = (values ?? []).filter((v) => !isPlaceholder(v));
  return real.length > 0 ? `- ${label}: ${real.join('; ')}` : null;
};

/**
 * Gravl-safe field whitelist (DOS-WF-001). When `gravlSafe` is set, ONLY
 * these training-relevant, non-private paths may enter the prompt, and the
 * free-text promptSummary / freeformContext are dropped entirely (they can
 * reintroduce medications, supplements, or unrelated medical detail that a
 * structured-field exclusion alone would not catch). An explicit whitelist
 * is preferred over keyword redaction: adding a new field is inert for Gravl
 * until it is deliberately listed here.
 */
const GRAVL_ALLOWED_PATHS = new Set<string>([
  'goals.primaryGoal', 'goals.goalNotes', 'goals.priorityNotes', 'goals.visualGoal',
  'trainingPlan.weeklyFrequency', 'trainingPlan.split', 'trainingPlan.preferredStyle',
  'trainingPlan.movementRestrictions', 'trainingPlan.currentTrainingNotes',
  'recoveryTargets.sleepHours', 'recoveryTargets.hrvBaseline', 'recoveryTargets.restingHeartRateBaseline',
  'activityTargets.stepsPerDay', 'activityTargets.cardioTarget',
  'bodyMetrics.height', 'bodyMetrics.currentWeight', 'bodyMetrics.goalWeight',
  'medicalContext.safetySummary',
]);

/**
 * Build the "## Personal Targets / Regimen Context" block (Phase 10).
 * Structured fields first, then Prompt Summary (or a keyword-prioritized
 * freeform excerpt). Returns hash/fingerprint metadata for logs — routine logs
 * never store the actual text.
 *
 * `gravlSafe` restricts output to GRAVL_ALLOWED_PATHS, force-excludes
 * medications/supplements, and drops the free-text summary. Non-Gravl callers
 * omit it and keep the full existing behavior unchanged.
 */
export function buildProfilePromptBlock(
  profile: HealthFitnessProfile,
  opts: { deepAnalysis?: boolean; excludeSupplementsMedications?: boolean; gravlSafe?: boolean } = {},
): ProfilePromptBlock {
  const gravlSafe = Boolean(opts.gravlSafe);
  const excludeMeds = gravlSafe || Boolean(opts.excludeSupplementsMedications);
  const fields: { path: string; text: string }[] = [];
  const add = (path: string, text: string | null) => {
    if (text && (!gravlSafe || GRAVL_ALLOWED_PATHS.has(path))) fields.push({ path, text });
  };

  const g = profile.goals;
  add('goals.primaryGoal', line('Primary goal', g?.primaryGoal?.replace(/_/g, ' ')));
  add('goals.goalNotes', line('Goal notes', g?.goalNotes));
  add('goals.priorityNotes', line('Priorities', g?.priorityNotes));
  add('goals.visualGoal', line('Visual goal', g?.visualGoal));

  const n = profile.nutritionTargets;
  const macroBits = [
    n?.calories !== undefined ? `${n.calories} kcal` : null,
    n?.proteinGrams !== undefined ? `protein ≥${n.proteinGrams} g` : null,
    n?.carbGrams !== undefined ? `carbs ${n.carbGrams} g` : null,
    n?.fatGrams !== undefined ? `fat ${n.fatGrams} g` : null,
    n?.fiberGrams !== undefined ? `fiber ${n.fiberGrams} g` : null,
    n?.waterMl !== undefined ? `water ${n.waterMl} mL` : null,
  ].filter(Boolean);
  add('nutritionTargets', macroBits.length > 0 ? `- Nutrition targets: ${macroBits.join(', ')}` : null);
  add('nutritionTargets.notes', line('Nutrition notes', n?.notes));

  const a = profile.activityTargets;
  add('activityTargets.stepsPerDay', line('Steps target', a?.stepsPerDay ? `${a.stepsPerDay}/day` : undefined));
  add('activityTargets.cardioTarget', line('Cardio', a?.cardioTarget));

  const r = profile.recoveryTargets;
  add('recoveryTargets.sleepHours', line('Sleep', r?.sleepHours));
  add('recoveryTargets.hrvBaseline', line('HRV baseline', r?.hrvBaseline));
  add('recoveryTargets.restingHeartRateBaseline', line('Resting HR baseline', r?.restingHeartRateBaseline));

  const t = profile.trainingPlan;
  add('trainingPlan.weeklyFrequency', line('Training frequency', t?.weeklyFrequency));
  add('trainingPlan.split', line('Split', t?.split));
  add('trainingPlan.preferredStyle', line('Style', t?.preferredStyle));
  add('trainingPlan.movementRestrictions', listLine('Movement restrictions', t?.movementRestrictions));
  add('trainingPlan.currentTrainingNotes', line('Current training notes', t?.currentTrainingNotes));

  const b = profile.bodyMetrics;
  add('bodyMetrics.height', line('Height', b?.height));
  add('bodyMetrics.currentWeight', line('Current weight', b?.currentWeight));
  add('bodyMetrics.goalWeight', line('Goal weight', b?.goalWeight));
  add('bodyMetrics.waist', line('Waist', b?.waist));
  add('bodyMetrics.bodyFatEstimate', line('Body fat estimate', b?.bodyFatEstimate));

  // Medications/supplements are excluded by default for some prompts (e.g. the
  // Gravl workout review) — they are not relevant to a training-plan critique.
  if (!excludeMeds) {
    const s = profile.supplementsMedications;
    // Compact baseline summary every time; deeper detail stays in the profile.
    const meds = [...(s?.supplements ?? []), ...(s?.medications ?? [])].filter((x) => !x.startsWith('['));
    add('supplementsMedications', meds.length > 0 ? `- Supplements/medications (context only — never recommend dosing changes): ${meds.join('; ')}` : null);
  }

  const ap = profile.analysisPreferences;
  add('analysisPreferences.coachingStyle', line('Coaching style', ap?.coachingStyle?.replace(/_/g, ' ')));
  add('analysisPreferences.outputDetail', line('Output detail', ap?.outputDetail));

  // Movement safety context is emitted whenever the included profile reports a
  // back-history or movement-restriction signal — compact summary per Phase 11.
  // The summary carries generic movement-safety guidance only; no specific
  // spinal level or diagnosis is baked into this source.
  const hasBackHistory =
    (profile.medicalContext?.injuryHistory ?? []).some((i) => /l4|l5|laminectomy|herniat/i.test(i)) ||
    (t?.movementRestrictions ?? []).some((i) => /axial/i.test(i));
  if (hasBackHistory) {
    add('medicalContext.safetySummary',
      '- Movement safety context: reported back-safety context. Avoid axial loading. Use caution ' +
      'with back, leg, nerve-like pain, weakness, or radiating symptoms.');
  }

  // Free-text summary can reintroduce excluded/private detail, so it is dropped
  // entirely under the Gravl-safe policy (structured whitelist only).
  let summaryText = '';
  let promptSummaryCharCount: number | undefined;
  let freeformExcerptCharCount: number | undefined;
  if (!gravlSafe && profile.promptSummary?.trim()) {
    summaryText = profile.promptSummary.trim();
    promptSummaryCharCount = summaryText.length;
  } else if (!gravlSafe && profile.freeformContext?.trim()) {
    const cap = opts.deepAnalysis ? 3000 : 1500;
    summaryText = keywordExcerpt(profile.freeformContext.trim(), cap);
    freeformExcerptCharCount = summaryText.length;
  }

  const empty = fields.length === 0 && !summaryText;
  const updated = profile.updatedAt ? new Date(profile.updatedAt) : null;
  const parts: string[] = [];
  parts.push(`Health Profile last updated: ${updated ? updated.toISOString().slice(0, 16).replace('T', ' ') : 'unknown'}`);
  if (fields.length > 0) parts.push('', fields.map((f) => f.text).join('\n'));
  if (summaryText) parts.push('', 'Additional context:', summaryText);
  parts.push('', 'Treat this as personal context and guidance, not hard rules; structured targets above take precedence over freeform context.');

  const text = empty ? '' : parts.join('\n');
  const hash = text ? sha256Hex(text) : undefined;

  return {
    text,
    empty,
    metadata: {
      healthProfileIncluded: !empty,
      includedFieldPaths: fields.map((f) => f.path),
      promptSummaryCharCount,
      freeformContextExcerptCharCount: freeformExcerptCharCount,
      promptContextHash: hash,
      promptContextFingerprint: text ? `${hash!.slice(0, 8)} · ${text.length.toLocaleString('en-US')} chars` : undefined,
      promptContextCharacterCount: text ? text.length : undefined,
      profileLastUpdatedAt: profile.updatedAt,
    },
  };
}
