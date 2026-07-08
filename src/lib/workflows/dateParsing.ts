import type { DateConfidence } from '../types';

export interface ParsedEntryDate {
  entryDate?: string; // YYYY-MM-DD
  dateConfidence: DateConfidence;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
}

function localIso(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

/**
 * Conservative natural date parsing for handoff entries.
 * Explicit formats (ISO, "July 8, 2026", 7/8/26) → confidence "explicit".
 * Relative words (today / yesterday / this morning / last night) resolved
 * against the local clock → "relative_resolved". Anything else → "unknown".
 */
export function parseEntryDate(text: string, now: Date = new Date()): ParsedEntryDate {
  // ISO: 2026-07-08
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const d = iso(+isoMatch[1], +isoMatch[2], +isoMatch[3]);
    if (d) return { entryDate: d, dateConfidence: 'explicit' };
  }

  // Month name: July 8, 2026 / Jul 8 2026 / July 8 (year assumed = current)
  const monthMatch = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/);
  if (monthMatch) {
    const m = MONTHS[monthMatch[1].toLowerCase()];
    if (m) {
      const year = monthMatch[3] ? +monthMatch[3] : now.getFullYear();
      const d = iso(year, m, +monthMatch[2]);
      // Year-less dates are still explicit about month/day but we only accept
      // them with a stated year to stay conservative.
      if (d && monthMatch[3]) return { entryDate: d, dateConfidence: 'explicit' };
    }
  }

  // US short: 7/8/26 or 07/08/2026 (month/day/year — user is US-based)
  const usMatch = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/);
  if (usMatch) {
    let year = +usMatch[3];
    if (year < 100) year += 2000;
    const d = iso(year, +usMatch[1], +usMatch[2]);
    if (d) return { entryDate: d, dateConfidence: 'explicit' };
  }

  // Relative words, resolved in local time.
  const lower = text.toLowerCase();
  if (/\b(yesterday|last night)\b/.test(lower)) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { entryDate: localIso(y), dateConfidence: 'relative_resolved' };
  }
  if (/\b(today|tonight|this morning|this afternoon|this evening)\b/.test(lower)) {
    return { entryDate: localIso(now), dateConfidence: 'relative_resolved' };
  }

  return { dateConfidence: 'unknown' };
}
