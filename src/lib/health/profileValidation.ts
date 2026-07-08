import type { HealthFitnessProfile } from '../types';
import { sha256Hex } from '../utils/hash';

export interface ValidationIssue {
  fieldPath: string;
  message: string;
}

export interface ValidationResult {
  errors: ValidationIssue[]; // block save
  warnings: ValidationIssue[]; // allow save, show notice
}

function num(path: string, value: number | undefined, errors: ValidationIssue[], warnings: ValidationIssue[], opts: { min?: number; warnBelow?: number; warnAbove?: number; label: string }) {
  if (value === undefined) return;
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    errors.push({ fieldPath: path, message: `${opts.label} is not a valid number.` });
    return;
  }
  if (opts.min !== undefined && value < opts.min) {
    errors.push({ fieldPath: path, message: `${opts.label} cannot be negative.` });
    return;
  }
  if (opts.warnBelow !== undefined && value < opts.warnBelow) {
    warnings.push({ fieldPath: path, message: `${opts.label} looks suspiciously low (${value}). Save anyway if intentional.` });
  }
  if (opts.warnAbove !== undefined && value > opts.warnAbove) {
    warnings.push({ fieldPath: path, message: `${opts.label} looks suspiciously high (${value}). Save anyway if intentional.` });
  }
}

/** Soft validation: block malformed/negative values, warn on suspicious ones. */
export function validateProfile(p: HealthFitnessProfile): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const n = p.nutritionTargets;
  num('nutritionTargets.calories', n?.calories, errors, warnings, { min: 0, warnBelow: 1000, warnAbove: 4500, label: 'Calorie target' });
  num('nutritionTargets.proteinGrams', n?.proteinGrams, errors, warnings, { min: 0, warnBelow: 60, warnAbove: 350, label: 'Protein target' });
  num('nutritionTargets.carbGrams', n?.carbGrams, errors, warnings, { min: 0, warnAbove: 700, label: 'Carb target' });
  num('nutritionTargets.fatGrams', n?.fatGrams, errors, warnings, { min: 0, warnBelow: 25, warnAbove: 250, label: 'Fat target' });
  num('nutritionTargets.fiberGrams', n?.fiberGrams, errors, warnings, { min: 0, warnAbove: 90, label: 'Fiber target' });
  num('nutritionTargets.waterMl', n?.waterMl, errors, warnings, { min: 0, warnBelow: 1000, warnAbove: 8000, label: 'Water target (mL)' });
  num('activityTargets.stepsPerDay', p.activityTargets?.stepsPerDay, errors, warnings, { min: 0, warnBelow: 1000, warnAbove: 40000, label: 'Step target' });
  num('goals.targetWeight', p.goals?.targetWeight, errors, warnings, { min: 0, warnBelow: 90, warnAbove: 400, label: 'Target weight' });
  num('goals.targetBodyFatPercent', p.goals?.targetBodyFatPercent, errors, warnings, { min: 0, warnBelow: 4, warnAbove: 60, label: 'Target body fat %' });
  return { errors, warnings };
}

/** Stable full-profile hash over the normalized (key-sorted) object. */
export function profileHash(p: HealthFitnessProfile): string {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>).sort().map((k) => [k, normalize((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return sha256Hex(JSON.stringify(normalize(p)));
}

/** Dotted paths of leaf fields that differ between two profiles (values not included). */
export function changedFieldPaths(a: HealthFitnessProfile | null, b: HealthFitnessProfile): string[] {
  const paths = new Set<string>();
  const walk = (x: unknown, y: unknown, prefix: string) => {
    if (x === y) return;
    const xObj = x && typeof x === 'object' && !Array.isArray(x);
    const yObj = y && typeof y === 'object' && !Array.isArray(y);
    if (xObj || yObj) {
      const keys = new Set([
        ...Object.keys((xObj ? x : {}) as Record<string, unknown>),
        ...Object.keys((yObj ? y : {}) as Record<string, unknown>),
      ]);
      for (const k of keys) {
        walk(
          xObj ? (x as Record<string, unknown>)[k] : undefined,
          yObj ? (y as Record<string, unknown>)[k] : undefined,
          prefix ? `${prefix}.${k}` : k,
        );
      }
      return;
    }
    if (JSON.stringify(x) !== JSON.stringify(y)) paths.add(prefix);
  };
  walk(a ?? {}, b, '');
  // Bookkeeping fields aren't interesting change signals.
  return [...paths].filter((p) => !/^(updatedAt|createdAt|id|seedMetadata\.)/.test(p)).sort();
}
