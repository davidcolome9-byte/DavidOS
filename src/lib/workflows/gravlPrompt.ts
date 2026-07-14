import type { BuiltPrompt } from './continuity';
import type { HealthFitnessProfile } from '../types';
import { sha256Hex } from '../utils/hash';

/**
 * Gravl Workout Review & Optimization prompt builder (DOS-WF-001).
 *
 * Produces ONE provider-neutral "Universal AI Prompt" that reviews and
 * optimizes a Gravl-provided workout. No AI is called here — the output is
 * text David copies into ChatGPT or Claude himself. The prompt itself never
 * names a specific provider.
 *
 * Two modes:
 *   - review: a workout is present (pasted text and/or screenshots flagged)
 *   - intake: no workout content yet → the prompt asks for it, honestly labeled
 *
 * The returned object is shape-compatible with the shared BuiltPrompt so the
 * Workflow Runner treats it like any other built prompt (copy / save / guards).
 */

export type GravlMode = 'review' | 'intake';

export interface GravlPromptArgs {
  /** David's request — hard-required, non-empty after trim. */
  request: string;
  /** Optional pasted Gravl workout text. */
  workoutText?: string;
  /** David indicates he has Gravl screenshots (DavidOS cannot read them). */
  hasScreenshots?: boolean;
  /**
   * Rendered Health Profile block, already filtered to relevant context with
   * medications/supplements EXCLUDED. Undefined/empty when not included.
   */
  profileBlock?: string;
  /** Structured profile, used only for the phase/constraints summary. */
  healthProfile?: HealthFitnessProfile | null;
}

export interface GravlBuiltPrompt extends BuiltPrompt {
  mode: GravlMode;
  /** Honest label shown in intake mode. */
  intakeNotice?: string;
}

const INTAKE_NOTICE = 'No Gravl workout added. This prompt will ask for it.';

function phaseAndConstraints(profile: HealthFitnessProfile | null | undefined, hasProfileBlock: boolean): string {
  const bits: string[] = [];
  const g = profile?.goals;
  if (g?.primaryGoal) bits.push(`Primary goal: ${g.primaryGoal.replace(/_/g, ' ')}.`);
  const t = profile?.trainingPlan;
  if (t?.weeklyFrequency) bits.push(`Training frequency: ${t.weeklyFrequency}.`);
  if (t?.split) bits.push(`Split: ${t.split}.`);
  if (t?.preferredStyle) bits.push(`Preferred style: ${t.preferredStyle}.`);
  if (bits.length === 0) {
    return hasProfileBlock
      ? 'Infer the current phase and constraints from the health and fitness context above. If the phase is unclear, ask David rather than assuming.'
      : 'No phase or constraints were provided. Ask David what training phase he is in and what his constraints are before making strong recommendations.';
  }
  bits.push('If any of this looks out of date, ask David to confirm before relying on it.');
  return bits.join(' ');
}

function workoutInformation(mode: GravlMode, workoutText: string, hasScreenshots: boolean): string {
  const lines: string[] = [];
  if (workoutText.trim()) {
    lines.push('David pasted the following Gravl workout:', '', workoutText.trim());
  }
  if (hasScreenshots) {
    if (lines.length) lines.push('');
    lines.push(
      'David has Gravl workout screenshots. This tool cannot read images. The ' +
        'screenshots will be attached in the AI app after this prompt is pasted in — ' +
        'review them there. Do not assume their contents until you can see them.',
    );
  }
  if (mode === 'intake') {
    lines.push(
      'No Gravl workout has been provided yet. Begin by asking David to paste his ' +
        'current Gravl workout (or describe it). Do not invent or replace the workout ' +
        'unless David explicitly asks for a new one or says Gravl gave him nothing usable.',
    );
  }
  return lines.join('\n');
}

export function buildGravlPrompt(args: GravlPromptArgs): GravlBuiltPrompt {
  const request = args.request.trim();
  const workoutText = args.workoutText ?? '';
  const hasScreenshots = Boolean(args.hasScreenshots);
  const hasWorkoutContent = Boolean(workoutText.trim()) || hasScreenshots;
  const mode: GravlMode = hasWorkoutContent ? 'review' : 'intake';
  const profileBlock = args.profileBlock && args.profileBlock.trim() ? args.profileBlock.trim() : '';

  const objective =
    mode === 'review'
      ? 'Review the Gravl-provided workout below and optimize it for David. Judge what to ' +
        'keep, modify, or replace, and flag anything that looks unsafe.'
      : 'David has not provided a Gravl workout yet. Ask him for it, then review and optimize ' +
        'it. Do not build a workout from scratch unless he explicitly asks for one or says ' +
        'Gravl gave him nothing usable.';

  const sections: string[] = [];
  sections.push('# Universal AI Prompt');

  sections.push('', '## Role', '',
    'You are an experienced strength and conditioning coach and program reviewer helping ' +
    'David get the most out of the workout his Gravl app generated. You give specific, ' +
    'actionable, safety-aware feedback and you never guess when you can ask.');

  sections.push('', '## Objective', '', objective);

  sections.push('', "## David's Request", '', request);

  sections.push('', '## Available Gravl Workout Information', '',
    workoutInformation(mode, workoutText, hasScreenshots));

  sections.push('', '## Relevant Health and Fitness Context', '',
    profileBlock || 'No Health Profile context was included for this prompt.');

  sections.push('', '## Current Phase and Constraints', '',
    phaseAndConstraints(args.healthProfile, Boolean(profileBlock)));

  sections.push('', '## Analysis Requirements', '',
    [
      'For each part of the workout, decide and label one of: Keep, Modify, Replace, or Possibly unsafe.',
      'Give a phase-fit judgment: does this workout match David’s current training phase and goals?',
      'Review volume, intensity, frequency, and exercise order.',
      'Turn every recommendation into exact changes David can enter directly into Gravl (specific exercises, sets, reps, loads, or order).',
      'Where information is missing, ask David a specific question instead of assuming.',
    ].map((s) => `- ${s}`).join('\n'));

  sections.push('', '## Required Output', '',
    [
      'A short overall assessment (is this workout appropriate right now?).',
      'A per-item breakdown labeled Keep / Modify / Replace / Possibly unsafe, each with a one-line reason.',
      'A phase-fit verdict.',
      'A concrete "Enter this into Gravl" list of exact changes.',
      'A "Questions for David" list covering anything you had to leave uncertain.',
    ].map((s) => `- ${s}`).join('\n'));

  sections.push('', '## Missing-Information Handling', '',
    'Do not fill gaps with assumptions. When a detail is missing or ambiguous, ask David a ' +
    'direct question. Only create a fresh workout when David explicitly requests one or says ' +
    'Gravl gave him nothing usable.');

  sections.push('', '## Safety Boundaries', '',
    'Do not diagnose. Do not recommend medications, supplements, or dosing changes. Respect ' +
    'David’s movement-safety context at all times — in particular avoid axial loading given a ' +
    'lower-back (L4/L5) history, and flag any exercise likely to provoke back, leg, nerve-like, ' +
    'weakness, or radiating symptoms. For severe, worsening, neurological, or persistent ' +
    'symptoms, recommend he seek professional medical input rather than pushing through.');

  const fullPrompt = sections.join('\n');
  const promptHash = sha256Hex(fullPrompt);
  const fingerprint = `${promptHash.slice(0, 8)} · ${fullPrompt.length.toLocaleString('en-US')} chars`;

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
    helperText:
      mode === 'intake'
        ? `Intake mode · ${INTAKE_NOTICE}`
        : 'Review mode · Gravl workout information included.',
    outputMode: 'custom',
    mode,
    intakeNotice: mode === 'intake' ? INTAKE_NOTICE : undefined,
  };
}
