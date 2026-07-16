/**
 * Word-boundary term match (DOS-WF-001R-A).
 *
 * Replaces the previous unanchored `text.includes(term)` scoring, which let
 * fragments of unrelated words score against the keyword tables — e.g.
 * "postpone" → "post", "weeknight" → "week", "homework" → "work",
 * "juice cleanse" → "clean". A term now matches only when it is delimited by
 * a string edge or a non-alphanumeric character on both sides, so multi-word
 * and hyphenated terms ("plan the week", "side-income", "clean up") still match
 * naturally while a substring buried inside a larger word does not.
 *
 * A single optional trailing "s" is tolerated so singular keywords still match
 * their common plural ("workout" → "workouts", "meal" → "meals") without
 * needing a second table entry. The plural "s" is only accepted immediately
 * before a boundary, so it never reopens a collision: "workshop", "cleanse",
 * and "postpone" still fail because the character after the "s" (or after the
 * term) is not a boundary.
 *
 * `text` is expected to be already lowercased (callers lowercase once).
 */
const cache = new Map<string, RegExp>();

export function matchesTerm(text: string, term: string): boolean {
  let re = cache.get(term);
  if (!re) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Leading edge/boundary is consumed; an optional plural "s" then a trailing
    // boundary lookahead so adjacent terms sharing a delimiter still each match.
    re = new RegExp(`(?:^|[^a-z0-9])${escaped}s?(?=[^a-z0-9]|$)`);
    cache.set(term, re);
  }
  return re.test(text);
}
