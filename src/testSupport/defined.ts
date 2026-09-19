/**
 * Test-only narrowing for indexed/optional lookups under noUncheckedIndexedAccess.
 * Throws with a readable message when the value is missing, so an absent fixture
 * fails the test at the lookup instead of being silenced by a non-null assertion
 * or surfacing later as an unrelated TypeError.
 */
export function defined<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${what} to be defined, but it was ${value === null ? 'null' : 'undefined'}.`);
  }
  return value;
}
