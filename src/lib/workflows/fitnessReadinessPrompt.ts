import type { BuiltPrompt } from './continuity';
import type { HealthFitnessProfile } from '../types';
import { sha256Hex } from '../utils/hash';

/**
 * Training Readiness & Recovery prompt builder (fitness-readiness).
 *
 * Produces ONE provider-neutral "Universal AI Prompt" that helps David decide
 * whether to train as planned, modify the session, do light recovery only,
 * rest and reassess, seek non-emergency medical advice, or stop and seek
 * urgent/emergency care. No AI is called here — the output is text David copies
 * into ChatGPT or Claude himself, and the prompt never names a provider.
 *
 * Hard safety contract (mirrors seed/workflows/fitness-readiness.json):
 *   - decision support only — the prompt never asks the AI to diagnose;
 *   - it never prescribes medication or treatment;
 *   - a wearable/HRV score is a SUPPORTING signal and never overrides symptoms;
 *   - it never promises certainty and never replaces professional care;
 *   - supplied red-flag facts force explicit emergency/urgent escalation text.
 *
 * The builder invents nothing. Symptoms arrive through David's free-text
 * request; recovery baselines arrive through the readiness-safe Health Profile
 * whitelist (nutrition, body metrics, medications, supplements, and free-text
 * notes are excluded upstream). Missing facts stay missing.
 *
 * The returned object is shape-compatible with the shared BuiltPrompt so the
 * Workflow Runner treats it like any other built prompt (copy / save / guards).
 */

export interface ReadinessPromptArgs {
  /** David's request — hard-required, non-empty after trim. */
  request: string;
  /**
   * Rendered Health Profile block, already restricted to the readiness-safe
   * field whitelist. Undefined/empty when the profile is not included — in that
   * case the built prompt contains no private profile facts at all.
   */
  profileBlock?: string;
  /** Structured profile, used only for a small training-context summary. */
  healthProfile?: HealthFitnessProfile | null;
}

export interface ReadinessBuiltPrompt extends BuiltPrompt {
  /** True when supplied text tripped an emergency/urgent red-flag signal. */
  redFlagged: boolean;
  /** The red-flag signals detected in the supplied text (for disclosure/tests). */
  redFlagSignals: string[];
  /** True when respiratory-illness signals were detected in the supplied text. */
  respiratoryIllness: boolean;
}

/**
 * Emergency / urgent red-flag phrases. Word-aware substring signals that, when
 * present in the SUPPLIED text, force a prominent escalation directive. This is
 * conservative escalation, not diagnosis — the phrase surfaces the concern; the
 * generated prompt still tells the downstream AI to escalate on ANY red flag,
 * detected here or not. Deliberately phrase-level (not single ambiguous words)
 * to avoid crying wolf on ordinary soreness.
 */
const RED_FLAG_SIGNALS: { label: string; patterns: RegExp[] }[] = [
  { label: 'chest pain / pressure / tightness', patterns: [/\bchest\s+(?:pain|pressure|tightness|tight|discomfort|heavy|heaviness)\b/, /\bpain\s+in\s+(?:my|the)\s+chest\b/, /\btight(?:ness)?\s+in\s+(?:my|the)\s+chest\b/] },
  { label: 'pain radiating to arm/jaw/back', patterns: [/\bradiat/, /\b(?:arm|jaw|shoulder|back)\s+pain\b.*\bchest\b/, /\bchest\b.*\b(?:arm|jaw|shoulder)\b/] },
  { label: 'trouble breathing / shortness of breath', patterns: [/\bshort(?:ness)?\s+of\s+breath\b/, /\bcan'?t\s+breathe\b/, /\b(?:trouble|difficulty|hard)\s+breathing\b/, /\bstruggling\s+to\s+breathe\b/, /\bgasping\b/] },
  { label: 'fainting / near-fainting / passing out', patterns: [/\bfaint/, /\bpass(?:ed|ing)?\s+out\b/, /\bblack(?:ed|ing)?\s+out\b/, /\bsyncope\b/, /\bnearly\s+collapsed\b/, /\bcollaps/] },
  { label: 'confusion / new neurological symptoms', patterns: [/\bconfus/, /\bslurred\s+speech\b/, /\bface\s+droop/, /\b(?:sudden|one[- ]sided)\s+(?:weakness|numbness)\b/, /\bnumbness\s+on\s+one\s+side\b/, /\bvision\s+loss\b/, /\bseizure\b/] },
  { label: 'possible heart attack / stroke', patterns: [/\bheart\s+attack\b/, /\bstroke\b/] },
  { label: 'palpitations / irregular heartbeat', patterns: [/\bpalpitation/, /\bheart\s+(?:racing|pounding|skipping)\b/, /\birregular\s+(?:heart\s*beat|heartbeat|pulse|rhythm)\b/] },
  { label: 'severe dehydration / cannot keep fluids down', patterns: [/\bsevere(?:ly)?\s+dehydrat/, /\bcan'?t\s+keep\s+(?:fluids|water|anything)\s+down\b/, /\bcannot\s+keep\s+(?:fluids|water|anything)\s+down\b/, /\bkeep\s+(?:fluids|water)\s+down\b/, /\bcoughing\s+up\s+blood\b/, /\bblood\s+in\b/] },
  { label: 'severe or rapidly worsening symptoms', patterns: [/\bsevere\b/, /\brapidly\s+worsening\b/, /\bgetting\s+much\s+worse\b/, /\bworst\b/] },
];

/**
 * Respiratory-illness signals. When present, the prompt incorporates the
 * conservative "do not resume normal activity until symptoms are improving
 * overall AND fever-free for 24h without fever-reducing medication" guidance.
 */
const RESPIRATORY_SIGNALS = [
  'cold', 'flu', 'influenza', 'fever', 'feverish', 'chills', 'cough', 'coughing',
  'sore throat', 'congestion', 'congested', 'runny nose', 'stuffy', 'sinus',
  'chest infection', 'bronchitis', 'respiratory', 'covid', 'sick', 'unwell', 'under the weather',
];

function scanRedFlags(text: string): string[] {
  const found: string[] = [];
  for (const { label, patterns } of RED_FLAG_SIGNALS) {
    if (patterns.some((re) => re.test(text))) found.push(label);
  }
  return found;
}

function hasRespiratory(text: string): boolean {
  return RESPIRATORY_SIGNALS.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text));
}

/** A small, non-fabricated training-context line from the saved profile. */
function trainingContext(profile: HealthFitnessProfile | null | undefined, hasProfileBlock: boolean): string {
  const bits: string[] = [];
  const t = profile?.trainingPlan;
  if (t?.weeklyFrequency) bits.push(`Usual training frequency: ${t.weeklyFrequency}.`);
  if (t?.split) bits.push(`Usual split: ${t.split}.`);
  if (t?.preferredStyle) bits.push(`Preferred style: ${t.preferredStyle}.`);
  const g = profile?.goals;
  if (g?.primaryGoal) bits.push(`Primary goal: ${g.primaryGoal.replace(/_/g, ' ')}.`);
  if (bits.length === 0) {
    return hasProfileBlock
      ? 'Infer the usual training context from the readiness context above only where it is stated; do not assume anything that was not provided.'
      : 'No saved training context was included. Do not assume a training history that was not provided.';
  }
  bits.push('If any of this looks out of date, ask David to confirm before relying on it.');
  return bits.join(' ');
}

export function buildReadinessPrompt(args: ReadinessPromptArgs): ReadinessBuiltPrompt {
  const request = args.request.trim();
  const profileBlock = args.profileBlock && args.profileBlock.trim() ? args.profileBlock.trim() : '';
  const lower = request.toLowerCase();

  // Red-flag / respiratory scanning is over the SUPPLIED request text only — we
  // never scan private profile free text (it is excluded upstream anyway).
  const redFlagSignals = scanRedFlags(lower);
  const redFlagged = redFlagSignals.length > 0;
  const respiratoryIllness = hasRespiratory(lower);

  const sections: string[] = [];
  sections.push('# Universal AI Prompt');

  // When supplied facts trip a red flag, the escalation directive is the FIRST
  // thing in the prompt so it cannot be missed or reasoned away.
  if (redFlagged) {
    sections.push(
      '',
      '## ⚠ Possible emergency red flags detected — read first',
      '',
      'David\'s description contains wording that can signal a medical emergency ' +
        `(${redFlagSignals.join('; ')}). Before giving any training guidance, tell David clearly ` +
        'that these symptoms can be serious and are NOT something to train through: if they are ' +
        'severe, sudden, or worsening he should STOP and seek urgent or emergency medical care now ' +
        '(for example, call local emergency services), and no wearable readiness score, HRV value, ' +
        'or fitness metric changes that. Do not attempt to diagnose the cause and do not reassure ' +
        'him that it is safe to train.',
    );
  }

  sections.push('', '## Role', '',
    'You are a cautious, experienced strength-and-conditioning and recovery coach helping David ' +
    'make a safe decision about today\'s training. You provide DECISION SUPPORT, not a diagnosis. ' +
    'You are not a doctor, you do not diagnose illness, injury, or overtraining, and you never ' +
    'prescribe medication or treatment. You err on the side of caution and you never guess when ' +
    'you can ask.');

  sections.push('', '## Objective', '',
    'Using only the facts David provides below, help him choose ONE readiness decision and explain ' +
    'why, staying conservative when the picture is unclear. The possible decisions are: train as ' +
    'planned; modify the session (reduced intensity/volume/duration/complexity); light recovery ' +
    'activity only; rest and reassess; seek non-emergency medical advice; or stop and seek urgent ' +
    'or emergency care. Do not select a medical diagnosis — decide readiness, not a condition.');

  sections.push('', "## David's Request", '', request);

  sections.push('', '## Readiness & Recovery Context', '',
    profileBlock
      ? 'The following readiness-relevant context comes from David\'s saved Health Profile (a ' +
        'readiness-specific whitelist — nutrition, body metrics, medications, supplements, and ' +
        'free-text notes are excluded):\n\n' + profileBlock
      : 'No Health Profile context was included for this prompt. Use only what David wrote in his ' +
        'request, and treat everything else as not provided.');

  sections.push('', '## Usual Training Context', '',
    trainingContext(args.healthProfile, Boolean(profileBlock)));

  // Data-handling discipline: preserve the distinctions and never fabricate.
  sections.push('', '## How to Handle the Facts', '',
    [
      'Use only the facts David actually supplied. Do not invent symptoms, numbers, or history.',
      'Preserve the difference between missing, unknown, unavailable, not measured, zero, and explicitly denied — never treat a missing value as if it were normal or reassuring.',
      'Treat wearable readiness scores and HRV as SUPPORTING context only, clearly separate from how David actually feels.',
      'Name the most important missing information that would change the decision, and ask for it instead of assuming.',
    ].map((s) => `- ${s}`).join('\n'));

  // The seven required output sections, in order.
  sections.push('', '## Required Output', '',
    [
      '1. **Readiness decision** — state exactly one: train as planned; modify session; recovery activity only; rest and reassess; seek non-emergency medical advice; or stop and seek urgent/emergency care.',
      '2. **Main reasons** — concise evidence from the supplied facts. Distinguish subjective symptoms from wearable/HRV metrics, and call out the key missing information.',
      '3. **Session modification (only if appropriate)** — which exercises or elements to avoid, and whether to reduce intensity, volume, duration, or complexity. Do not invent exact percentages the evidence does not support.',
      '4. **Recovery priorities** — sleep, hydration, nutrition, symptom monitoring, and light recovery activity where appropriate.',
      '5. **Reassessment conditions** — what to check later, what improvement is required before resuming harder training, and when worsening symptoms mean it is time for professional care.',
      '6. **Safety block** — explicit red flags to watch for, clear stop-training language, and emergency escalation when applicable.',
      '7. **Uncertainty statement** — restate that this is decision support and not a diagnosis, that wearables and HRV are supporting signals only, and that subjective symptoms and material changes from personal baseline carry more weight.',
    ].join('\n'));

  // Non-negotiable safety rules the downstream AI must follow.
  const safety: string[] = [
    'Escalate to urgent or emergency care — and say so plainly — for any of these supplied facts: severe, sudden, persistent, or exertional chest pain, pressure, or tightness; chest discomfort with shortness of breath, sweating, nausea, dizziness, or pain radiating to the arm, jaw, or back; significant trouble breathing; fainting, near-fainting, confusion, or new neurological symptoms; anything that looks like a possible heart attack or stroke; severe dehydration or an inability to keep fluids down with worsening weakness; or any other severe or rapidly worsening symptom.',
    'A normal or "good" wearable readiness score, HRV reading, or resting heart rate NEVER overrides these symptoms and never makes training safe on its own. Say this explicitly if David leans on a wearable score.',
    'Do not diagnose any illness, injury, or condition, and do not recommend, start, stop, or change any medication, supplement, or treatment.',
    'Do not treat the "neck check" (symptoms above vs below the neck) as a sufficient test for whether it is safe to train — use the whole picture, and stay conservative.',
    'Never promise certainty and never present this as a substitute for professional medical advice.',
  ];
  if (respiratoryIllness) {
    safety.push(
      'Respiratory-illness signals are present: advise that normal training should not resume until ' +
      'symptoms are improving overall AND David has been fever-free for at least 24 hours WITHOUT ' +
      'fever-reducing medication; until then favor rest or gentle recovery activity over hard training.',
    );
  }
  sections.push('', '## Safety Rules (non-negotiable)', '', safety.map((s) => `- ${s}`).join('\n'));

  sections.push('', '## Uncertainty & Boundaries', '',
    'This prompt produces decision support, not a diagnosis, and DavidOS is not a medical device. ' +
    'Wearables and HRV are supporting signals; subjective symptoms and material changes from ' +
    'David\'s personal baseline matter more. When the evidence is thin or conflicting, choose the ' +
    'more conservative option and recommend professional input rather than implying certainty.');

  const fullPrompt = sections.join('\n');
  const promptHash = sha256Hex(fullPrompt);
  const fingerprint = `${promptHash.slice(0, 8)} · ${fullPrompt.length.toLocaleString('en-US')} chars`;

  const helperBits = ['Readiness decision support · draft only'];
  helperBits.push(profileBlock ? 'Health Profile context included (readiness whitelist).' : 'No Health Profile context included.');
  if (redFlagged) helperBits.push('Emergency red-flag escalation added.');
  if (respiratoryIllness) helperBits.push('Respiratory-illness recovery guidance added.');

  return {
    fullPrompt,
    currentOnly: request,
    promptHash,
    fingerprint,
    priorCount: 0,
    historyProfile: 'fitness_health',
    rawFallbackCount: 0,
    includedHandoffIds: [],
    snapshots: [],
    helperText: helperBits.join(' · '),
    outputMode: 'custom',
    redFlagged,
    redFlagSignals,
    respiratoryIllness,
  };
}
