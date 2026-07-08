import { describe, expect, it } from 'vitest';
import { extractFitnessData, buildRawExcerpt } from '../workflows/fitnessExtraction';

const SAVED = '2026-07-08T12:00:00.000Z';

describe('extractFitnessData', () => {
  it('extracts labeled macros with high confidence', () => {
    const r = extractFitnessData(
      '2026-07-05. Calories: 2100, protein 197g, carbs 173, fat 71g, fiber 13.8g, water 3200 mL',
      SAVED,
    );
    expect(r.extract.nutrition?.calories?.value).toContain('2100');
    expect(r.extract.nutrition?.protein?.value).toBe('197');
    expect(r.extract.nutrition?.carbs?.value).toBe('173');
    expect(r.extract.nutrition?.fat?.value).toBe('71');
    expect(r.extract.nutrition?.fiber?.value).toBe('13.8');
    expect(r.extract.nutrition?.water?.value.toLowerCase()).toContain('ml');
    expect(r.weakExtraction).toBe(false);
  });

  it('extracts recovery metrics and shorthand macros', () => {
    const r = extractFitnessData('today — HRV 66, RHR 53, sleep score 71, P: 190, steps 8,200', SAVED);
    expect(r.extract.recovery?.hrv?.value).toBe('66');
    expect(r.extract.recovery?.restingHeartRate?.value).toBe('53');
    expect(r.extract.sleep?.score?.value).toBe('71');
    expect(r.extract.nutrition?.protein?.confidence).toBe('medium');
    expect(r.extract.activity?.steps?.value).toBe('8,200');
  });

  it('extracts weight and workout', () => {
    const r = extractFitnessData('7/5/26 weighed in at 190.2. Workout: Push day, 53 min', SAVED);
    expect(r.extract.weight?.value).toBe('190.2');
    expect(r.extract.activity?.workout?.value).toContain('Push day');
  });

  it('separates low-confidence pain/fatigue as possible values', () => {
    const r = extractFitnessData(
      '2026-07-05 calories 1900 protein 185 steps 9000. Lower back felt tight, kind of dragging by noon.',
      SAVED,
    );
    expect(r.possible.some((p) => p.label === 'Pain')).toBe(true);
    expect(r.possible.some((p) => p.label === 'Fatigue')).toBe(true);
    expect(r.trusted.some((t) => t.label === 'Pain')).toBe(false);
  });

  it('marks extraction weak when fewer than 3 trusted fields', () => {
    const r = extractFitnessData('2026-07-05 felt okay, went for a walk with the dogs', SAVED);
    expect(r.weakExtraction).toBe(true);
    expect(r.extract.rawFallback).toBeTruthy();
  });

  it('marks extraction weak when date is unknown even with metrics', () => {
    const r = extractFitnessData('calories 2000 protein 180 steps 9000 water 3 L', SAVED);
    expect(r.extract.dateConfidence).toBe('unknown');
    expect(r.weakExtraction).toBe(true);
  });
});

describe('buildRawExcerpt', () => {
  it('prefers keyword-bearing lines', () => {
    const noise = 'random preamble line\n'.repeat(30);
    const text = noise + 'sleep was 6 hours\ncalories around 2000\n' + noise;
    const excerpt = buildRawExcerpt(text, 200);
    expect(excerpt).toContain('sleep');
    expect(excerpt).toContain('calories');
    expect(excerpt.length).toBeLessThanOrEqual(200);
  });

  it('falls back to the first chunk when no keywords exist', () => {
    const text = ('lorem ipsum dolor sit amet. '.repeat(80)).trim();
    const excerpt = buildRawExcerpt(text, 300);
    expect(excerpt.startsWith('lorem ipsum')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(300);
  });
});
