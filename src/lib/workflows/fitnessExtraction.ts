import type { DateConfidence } from '../types';
import { parseEntryDate } from './dateParsing';

export type FieldConfidence = 'high' | 'medium' | 'low';

export interface ExtractedField<T = string> {
  value: T;
  confidence: FieldConfidence;
  sourceText?: string;
}

export interface FitnessHistoryExtract {
  entryDate?: string;
  savedAt: string;
  dateConfidence: DateConfidence;
  weight?: ExtractedField;
  bodyMetrics?: ExtractedField;
  sleep?: { duration?: ExtractedField; score?: ExtractedField; notes?: ExtractedField };
  nutrition?: {
    calories?: ExtractedField; protein?: ExtractedField; carbs?: ExtractedField;
    fat?: ExtractedField; fiber?: ExtractedField; water?: ExtractedField; meals?: ExtractedField;
  };
  activity?: {
    steps?: ExtractedField; workout?: ExtractedField; cardio?: ExtractedField;
    activeCalories?: ExtractedField; notes?: ExtractedField;
  };
  recovery?: {
    pain?: ExtractedField; soreness?: ExtractedField; fatigue?: ExtractedField;
    stress?: ExtractedField; hrv?: ExtractedField; restingHeartRate?: ExtractedField;
    bodyBattery?: ExtractedField; notes?: ExtractedField;
  };
  rawFallback?: string;
}

/** Flatten every extracted field for counting/formatting. */
export function listExtractedFields(x: FitnessHistoryExtract): { label: string; field: ExtractedField }[] {
  const out: { label: string; field: ExtractedField }[] = [];
  const push = (label: string, field?: ExtractedField) => { if (field) out.push({ label, field }); };
  push('Weight', x.weight);
  push('Body metrics', x.bodyMetrics);
  push('Sleep', x.sleep?.duration);
  push('Sleep score', x.sleep?.score);
  push('Calories', x.nutrition?.calories);
  push('Protein', x.nutrition?.protein);
  push('Carbs', x.nutrition?.carbs);
  push('Fat', x.nutrition?.fat);
  push('Fiber', x.nutrition?.fiber);
  push('Water', x.nutrition?.water);
  push('Meals', x.nutrition?.meals);
  push('Steps', x.activity?.steps);
  push('Workout', x.activity?.workout);
  push('Cardio', x.activity?.cardio);
  push('Active calories', x.activity?.activeCalories);
  push('Pain', x.recovery?.pain);
  push('Soreness', x.recovery?.soreness);
  push('Fatigue', x.recovery?.fatigue);
  push('Stress', x.recovery?.stress);
  push('HRV', x.recovery?.hrv);
  push('Resting HR', x.recovery?.restingHeartRate);
  push('Body Battery', x.recovery?.bodyBattery);
  return out;
}

interface Pattern {
  set: (x: FitnessHistoryExtract, f: ExtractedField) => void;
  regex: RegExp;
  confidence: FieldConfidence;
  /** Which capture group holds the value (default 1). */
  group?: number;
}

const ensure = <K extends keyof FitnessHistoryExtract>(x: FitnessHistoryExtract, k: K, init: NonNullable<FitnessHistoryExtract[K]>) => {
  if (!x[k]) x[k] = init;
  return x[k] as NonNullable<FitnessHistoryExtract[K]>;
};

// Labeled value with unit → high. Number near a keyword → medium.
// Sentiment words alone → low. First match wins per field.
const PATTERNS: Pattern[] = [
  // Weight: "weight 190.2", "weighed in at 190", "scale: 190.2 lb", "body weight 190"
  { set: (x, f) => { x.weight = x.weight ?? f; }, confidence: 'high',
    regex: /(?:weight|weigh(?:ed)?(?:\s*[-:]?\s*in)?(?:\s+at)?|scale)\s*[:\-]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:lb|lbs|pounds)?/i },
  // Sleep duration: "slept 6h 20m", "sleep: 5.4 h", "6 hours of sleep"
  { set: (x, f) => { ensure(x, 'sleep', {}).duration = ensure(x, 'sleep', {}).duration ?? f; }, confidence: 'high',
    regex: /(?:slept|sleep(?:\s*duration)?)\s*[:\-]?\s*(\d{1,2}(?:\.\d+)?\s*h(?:ours?|rs?)?(?:\s*\d{1,2}\s*m(?:in(?:utes)?)?)?)/i },
  { set: (x, f) => { ensure(x, 'sleep', {}).duration = ensure(x, 'sleep', {}).duration ?? f; }, confidence: 'high',
    regex: /(\d{1,2}(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:of\s*)?sleep/i },
  // Sleep score
  { set: (x, f) => { ensure(x, 'sleep', {}).score = ensure(x, 'sleep', {}).score ?? f; }, confidence: 'high',
    regex: /sleep\s*score\s*[:\-]?\s*(\d{1,3})/i },
  // Calories: "calories: 1850", "1850 kcal", "cals 1850"
  { set: (x, f) => { ensure(x, 'nutrition', {}).calories = ensure(x, 'nutrition', {}).calories ?? f; }, confidence: 'high',
    regex: /(?:calories|kcal|cals?)\s*[:\-]?\s*([\d,]{3,5})/i },
  { set: (x, f) => { ensure(x, 'nutrition', {}).calories = ensure(x, 'nutrition', {}).calories ?? f; }, confidence: 'high',
    regex: /([\d,]{3,5})\s*(?:kcal|calories|cals)\b/i },
  // Protein: "protein 197g", "197g protein", "P: 197"
  { set: (x, f) => { ensure(x, 'nutrition', {}).protein = ensure(x, 'nutrition', {}).protein ?? f; }, confidence: 'high',
    regex: /protein\s*[:\-]?\s*(\d{2,3}(?:\.\d+)?)\s*g?/i },
  { set: (x, f) => { ensure(x, 'nutrition', {}).protein = ensure(x, 'nutrition', {}).protein ?? f; }, confidence: 'high',
    regex: /(\d{2,3}(?:\.\d+)?)\s*g\s*(?:of\s*)?protein/i },
  { set: (x, f) => { ensure(x, 'nutrition', {}).protein = ensure(x, 'nutrition', {}).protein ?? f; }, confidence: 'medium',
    regex: /\bP\s*[:\-]\s*(\d{2,3})/ },
  // Carbs: "carbs 173", "C: 173", "net carbs 120"
  { set: (x, f) => { ensure(x, 'nutrition', {}).carbs = ensure(x, 'nutrition', {}).carbs ?? f; }, confidence: 'high',
    regex: /(?:net\s*)?carbs?\s*[:\-]?\s*(\d{1,3}(?:\.\d+)?)\s*g?/i },
  { set: (x, f) => { ensure(x, 'nutrition', {}).carbs = ensure(x, 'nutrition', {}).carbs ?? f; }, confidence: 'medium',
    regex: /\bC\s*[:\-]\s*(\d{1,3})/ },
  // Fat: "fat 71g", "F: 71"
  { set: (x, f) => { ensure(x, 'nutrition', {}).fat = ensure(x, 'nutrition', {}).fat ?? f; }, confidence: 'high',
    regex: /\bfat\s*[:\-]?\s*(\d{1,3}(?:\.\d+)?)\s*g?/i },
  { set: (x, f) => { ensure(x, 'nutrition', {}).fat = ensure(x, 'nutrition', {}).fat ?? f; }, confidence: 'medium',
    regex: /\bF\s*[:\-]\s*(\d{1,3})/ },
  // Fiber
  { set: (x, f) => { ensure(x, 'nutrition', {}).fiber = ensure(x, 'nutrition', {}).fiber ?? f; }, confidence: 'high',
    regex: /fiber\s*[:\-]?\s*(\d{1,2}(?:\.\d+)?)\s*g?/i },
  // Water: "water 3500 mL", "3.5L water", "hydration: 100 oz"
  { set: (x, f) => { ensure(x, 'nutrition', {}).water = ensure(x, 'nutrition', {}).water ?? f; }, confidence: 'high',
    regex: /(?:water|hydration)\s*[:\-]?\s*([\d,.]+\s*(?:ml|l|liters?|oz|ounces?))/i },
  { set: (x, f) => { ensure(x, 'nutrition', {}).water = ensure(x, 'nutrition', {}).water ?? f; }, confidence: 'high',
    regex: /([\d,.]+\s*(?:ml|l|liters?|oz))\s*(?:of\s*)?water/i },
  // Steps: "steps 8200", "8,200 steps", "walked 8200 steps"
  { set: (x, f) => { ensure(x, 'activity', {}).steps = ensure(x, 'activity', {}).steps ?? f; }, confidence: 'high',
    regex: /steps?\s*[:\-]?\s*([\d,]{3,6})\b/i },
  { set: (x, f) => { ensure(x, 'activity', {}).steps = ensure(x, 'activity', {}).steps ?? f; }, confidence: 'high',
    regex: /([\d,]{3,6})\s*steps/i },
  // Workout: "workout: push day", "trained push", "push day", "leg day", "upper session"
  { set: (x, f) => { ensure(x, 'activity', {}).workout = ensure(x, 'activity', {}).workout ?? f; }, confidence: 'high',
    regex: /(?:workout|training|trained|session)\s*[:\-]?\s*([^\n.;]{3,60})/i },
  { set: (x, f) => { ensure(x, 'activity', {}).workout = ensure(x, 'activity', {}).workout ?? f; }, confidence: 'medium',
    regex: /\b((?:push|pull|upper|lower|leg|chest|back|shoulder|arm)s?\s*day)\b/i },
  // Cardio
  { set: (x, f) => { ensure(x, 'activity', {}).cardio = ensure(x, 'activity', {}).cardio ?? f; }, confidence: 'medium',
    regex: /\b(cardio|zone\s*2|incline\s*walk|treadmill|bike|rowing)\b[^\n]{0,40}/i },
  // HRV: "HRV 66"
  { set: (x, f) => { ensure(x, 'recovery', {}).hrv = ensure(x, 'recovery', {}).hrv ?? f; }, confidence: 'high',
    regex: /\bhrv\s*[:\-]?\s*(\d{2,3})/i },
  // RHR: "RHR 53", "resting HR 53", "resting heart rate: 53"
  { set: (x, f) => { ensure(x, 'recovery', {}).restingHeartRate = ensure(x, 'recovery', {}).restingHeartRate ?? f; }, confidence: 'high',
    regex: /(?:rhr|resting\s*(?:hr|heart\s*rate))\s*[:\-]?\s*(\d{2,3})/i },
  // Body battery
  { set: (x, f) => { ensure(x, 'recovery', {}).bodyBattery = ensure(x, 'recovery', {}).bodyBattery ?? f; }, confidence: 'high',
    regex: /body\s*battery\s*[:\-]?\s*(\d{1,3}(?:\s*[-/]\s*\d{1,3})?)/i },
  // Stress score
  { set: (x, f) => { ensure(x, 'recovery', {}).stress = ensure(x, 'recovery', {}).stress ?? f; }, confidence: 'high',
    regex: /stress\s*(?:score|avg|level)?\s*[:\-]\s*(\d{1,3})/i },
  // Pain — keyword/sentiment → low confidence, keep source text
  { set: (x, f) => { ensure(x, 'recovery', {}).pain = ensure(x, 'recovery', {}).pain ?? f; }, confidence: 'low', group: 0,
    regex: /[^\n.;]*\b(?:pain|back|l4|l5|sciatic|nerve|numb|tingl|radiat)\w*[^\n.;]*/i },
  { set: (x, f) => { ensure(x, 'recovery', {}).soreness = ensure(x, 'recovery', {}).soreness ?? f; }, confidence: 'low', group: 0,
    regex: /[^\n.;]*\bsore(?:ness)?\b[^\n.;]*/i },
  { set: (x, f) => { ensure(x, 'recovery', {}).fatigue = ensure(x, 'recovery', {}).fatigue ?? f; }, confidence: 'low', group: 0,
    regex: /[^\n.;]*\b(?:fatigue[d]?|exhausted|drained|dragging|wiped)\b[^\n.;]*/i },
];

const IMPORTANT_KEYWORDS = /sleep|calorie|kcal|protein|carb|fat|fiber|water|hydration|steps|walk|activity|workout|training|weight|scale|pain|sore|fatigue|recovery|hrv|rhr|stress|body battery|notes/i;

/** Keyword-centered excerpt for weak extractions. */
export function buildRawExcerpt(content: string, cap: number): string {
  const clean = content.trim();
  if (clean.length <= cap) return clean;
  const lines = clean.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const keywordLines = lines.filter((l) => IMPORTANT_KEYWORDS.test(l));
  const source = keywordLines.length > 0 ? keywordLines.join('\n') : clean;
  return source.length <= cap ? source : source.slice(0, cap - 1) + '…';
}

export interface ExtractionResult {
  extract: FitnessHistoryExtract;
  trusted: { label: string; field: ExtractedField }[];
  possible: { label: string; field: ExtractedField }[];
  weakExtraction: boolean;
}

/**
 * Regex/alias extraction of fitness metrics from a saved handoff.
 * High/medium confidence fields count as "trusted"; low confidence values are
 * "possible" clues. Fewer than 3 trusted fields or an unknown date marks the
 * extraction weak, which triggers a raw excerpt fallback.
 */
export function extractFitnessData(content: string, savedAt: string, structured = true): ExtractionResult {
  const { entryDate, dateConfidence } = parseEntryDate(content);
  const extract: FitnessHistoryExtract = { entryDate, savedAt, dateConfidence };

  if (structured) {
    for (const p of PATTERNS) {
      const m = content.match(p.regex);
      if (m) {
        const value = (p.group === 0 ? m[0] : m[1])?.trim().replace(/[,.;:]+$/, '');
        if (value) p.set(extract, { value, confidence: p.confidence, sourceText: m[0].trim().slice(0, 120) });
      }
    }
  }

  const all = listExtractedFields(extract);
  const trusted = all.filter((f) => f.field.confidence !== 'low');
  const possible = all.filter((f) => f.field.confidence === 'low');
  const weakExtraction = !structured || trusted.length < 3 || dateConfidence === 'unknown';

  if (weakExtraction) {
    // 750 default; more room allowed by the caller when history is thin.
    extract.rawFallback = buildRawExcerpt(content, 750);
  }

  return { extract, trusted, possible, weakExtraction };
}
