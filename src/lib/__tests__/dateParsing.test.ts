import { describe, expect, it } from 'vitest';
import { parseEntryDate } from '../workflows/dateParsing';

const NOW = new Date(2026, 6, 8, 14, 30); // July 8, 2026 local

describe('parseEntryDate', () => {
  it('parses ISO dates as explicit', () => {
    expect(parseEntryDate('Log for 2026-07-05: push day', NOW)).toEqual({
      entryDate: '2026-07-05',
      dateConfidence: 'explicit',
    });
  });

  it('parses month-name dates with year as explicit', () => {
    expect(parseEntryDate('July 5, 2026 — food log', NOW).entryDate).toBe('2026-07-05');
    expect(parseEntryDate('Jul 5 2026 training', NOW).dateConfidence).toBe('explicit');
  });

  it('parses US short dates', () => {
    expect(parseEntryDate('7/5/26 weigh-in 190.2', NOW).entryDate).toBe('2026-07-05');
    expect(parseEntryDate('07/05/2026 weigh-in', NOW).entryDate).toBe('2026-07-05');
  });

  it('resolves today/yesterday relative to local now', () => {
    expect(parseEntryDate('today: slept 6 hours', NOW)).toEqual({
      entryDate: '2026-07-08',
      dateConfidence: 'relative_resolved',
    });
    expect(parseEntryDate('last night was rough, HRV 58', NOW)).toEqual({
      entryDate: '2026-07-07',
      dateConfidence: 'relative_resolved',
    });
  });

  it('returns unknown when no date is present', () => {
    expect(parseEntryDate('protein 190g, felt fine', NOW).dateConfidence).toBe('unknown');
  });

  it('rejects impossible dates rather than guessing', () => {
    expect(parseEntryDate('2026-13-40 nonsense', NOW).dateConfidence).toBe('unknown');
  });
});
