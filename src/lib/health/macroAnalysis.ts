import type { HealthFitnessProfile } from '../types';
import { extractFitnessData } from '../workflows/fitnessExtraction';

type MacroKind = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'water';
type MacroUnit = 'kcal' | 'g' | 'mL';

interface MacroTarget {
  kind: MacroKind;
  label: string;
  unit: MacroUnit;
  target?: number;
  current?: number;
  targetMode: 'target' | 'floor' | 'flexible';
}

export interface MacroGap {
  kind: MacroKind;
  label: string;
  unit: MacroUnit;
  target?: number;
  current?: number;
  remaining?: number;
  overBy?: number;
  targetMode: 'target' | 'floor' | 'flexible';
  status: 'missing_current' | 'no_target' | 'below' | 'near' | 'met' | 'over';
}

export interface MacroTargetSnapshot {
  text: string;
  gaps: MacroGap[];
  hasNutritionData: boolean;
}

function parseNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function parseWaterMl(value?: string): number | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase().replace(/,/g, '');
  const amount = parseNumber(normalized);
  if (amount === undefined) return undefined;
  if (/\boz|ounce/.test(normalized)) return amount * 29.5735;
  if (/\bl\b|liter/.test(normalized) && !/\bml\b/.test(normalized)) return amount * 1000;
  return amount;
}

function roundMacro(value: number, unit: MacroUnit): number {
  if (unit === 'kcal' || unit === 'mL') return Math.round(value);
  return Math.round(value * 10) / 10;
}

function fmt(value: number | undefined, unit: MacroUnit): string {
  if (value === undefined) return 'not parsed';
  return `${roundMacro(value, unit).toLocaleString('en-US')}${unit === 'g' ? 'g' : ` ${unit}`}`;
}

function gapStatus(m: MacroTarget): MacroGap {
  if (m.current === undefined) {
    return { ...m, status: 'missing_current' };
  }
  if (m.target === undefined || m.targetMode === 'flexible') {
    return { ...m, status: 'no_target' };
  }

  const delta = m.target - m.current;
  if (delta > 0) {
    const ratio = m.current / m.target;
    return {
      ...m,
      remaining: roundMacro(delta, m.unit),
      status: ratio >= 0.9 ? 'near' : 'below',
    };
  }
  return {
    ...m,
    remaining: 0,
    overBy: roundMacro(Math.abs(delta), m.unit),
    status: m.targetMode === 'floor' ? 'met' : 'over',
  };
}

function formatLine(g: MacroGap): string {
  if (g.status === 'missing_current') {
    return `- ${g.label}: target ${fmt(g.target, g.unit)} | current not parsed from the new entry.`;
  }
  if (g.status === 'no_target') {
    return `- ${g.label}: no hard target in profile | current ${fmt(g.current, g.unit)} | treat as flexible context.`;
  }

  const targetLabel = g.targetMode === 'floor' ? 'floor' : 'target';
  const base = `- ${g.label}: ${targetLabel} ${fmt(g.target, g.unit)} | current ${fmt(g.current, g.unit)}`;
  if (g.status === 'over') return `${base} | over by ${fmt(g.overBy, g.unit)}.`;
  if (g.status === 'met') return `${base} | floor met.`;
  return `${base} | remaining ${fmt(g.remaining, g.unit)}.`;
}

function buildRecommendations(gaps: MacroGap[]): string[] {
  const recs: string[] = [];
  const calories = gaps.find((g) => g.kind === 'calories');
  const protein = gaps.find((g) => g.kind === 'protein');
  const fat = gaps.find((g) => g.kind === 'fat');
  const fiber = gaps.find((g) => g.kind === 'fiber');
  const water = gaps.find((g) => g.kind === 'water');

  const proteinRemaining = protein?.remaining ?? 0;
  const caloriesRemaining = calories?.remaining ?? 0;
  const fatOverOrTight =
    fat?.status === 'over' ||
    (fat?.target !== undefined && fat.current !== undefined && fat.current >= fat.target * 0.85);

  if (proteinRemaining >= 25) {
    recs.push(
      fatOverOrTight
        ? 'Prioritize lean protein for the next feeding; avoid making the protein catch-up high-fat.'
        : 'Protein is the main gap; anchor the next meal or snack around a high-protein item.',
    );
  }
  if (calories?.status === 'over') {
    recs.push('Calories are already over target; do not chase extra calories unless training/recovery context clearly justifies it.');
  } else if (proteinRemaining > 0 && caloriesRemaining > 0 && proteinRemaining * 4 > caloriesRemaining * 0.65) {
    recs.push('The remaining calorie budget is tight relative to the protein gap, so choose very lean protein.');
  } else if (caloriesRemaining >= 600 && proteinRemaining >= 40) {
    recs.push('A full protein-centered meal still fits; pair lean protein with carbs or fiber based on training timing.');
  }
  if ((fiber?.remaining ?? 0) >= 10) {
    recs.push('Fiber is materially behind; add fruit, oats, beans, vegetables, or another high-fiber carb source if digestion allows.');
  }
  if ((water?.remaining ?? 0) >= 750) {
    recs.push('Hydration is still meaningfully short; spread the remaining water instead of forcing it all at once.');
  }

  return recs.slice(0, 4);
}

export function buildMacroTargetSnapshot(
  profile: HealthFitnessProfile | null,
  input: string,
): MacroTargetSnapshot {
  if (!profile?.nutritionTargets) return { text: '', gaps: [], hasNutritionData: false };

  const extracted = extractFitnessData(input, new Date().toISOString(), true).extract.nutrition;
  const targets = profile.nutritionTargets;
  const metrics: MacroTarget[] = [
    {
      kind: 'calories',
      label: 'Calories',
      unit: 'kcal',
      target: targets.calories,
      current: parseNumber(extracted?.calories?.value),
      targetMode: 'target',
    },
    {
      kind: 'protein',
      label: 'Protein',
      unit: 'g',
      target: targets.proteinGrams,
      current: parseNumber(extracted?.protein?.value),
      targetMode: 'floor',
    },
    {
      kind: 'carbs',
      label: 'Carbs',
      unit: 'g',
      target: targets.carbGrams,
      current: parseNumber(extracted?.carbs?.value),
      targetMode: targets.carbGrams === undefined ? 'flexible' : 'target',
    },
    {
      kind: 'fat',
      label: 'Fat',
      unit: 'g',
      target: targets.fatGrams,
      current: parseNumber(extracted?.fat?.value),
      targetMode: 'target',
    },
    {
      kind: 'fiber',
      label: 'Fiber',
      unit: 'g',
      target: targets.fiberGrams,
      current: parseNumber(extracted?.fiber?.value),
      targetMode: 'floor',
    },
    {
      kind: 'water',
      label: 'Water',
      unit: 'mL',
      target: targets.waterMl,
      current: parseWaterMl(extracted?.water?.value),
      targetMode: 'floor',
    },
  ];

  const gaps = metrics.map(gapStatus);
  const hasNutritionData = gaps.some((g) => g.current !== undefined);
  if (!hasNutritionData) return { text: '', gaps, hasNutritionData };

  const recs = buildRecommendations(gaps);
  const lines = [
    'Parsed macro comparison from the new entry. If the screenshot/OCR text is incomplete, treat this as provisional and ask for the exact visible totals before making hard calls.',
    '',
    ...gaps.filter((g) => g.current !== undefined || g.target !== undefined).map(formatLine),
  ];
  if (recs.length > 0) {
    lines.push('', 'MacroPilot-style correction cues:', ...recs.map((r) => `- ${r}`));
  }

  return { text: lines.join('\n'), gaps, hasNutritionData };
}
