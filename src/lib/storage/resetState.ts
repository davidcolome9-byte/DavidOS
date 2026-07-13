import type { AppState } from '../types';
import { buildDefaultState } from '../../data/defaultState';

/**
 * Build the post-Reset state.
 *
 * Preserve semantics are EXACT, not fallback: an explicitly deleted
 * Health Profile (null) stays null through an ordinary Reset — only the
 * explicit "also delete" option may turn a non-null profile into null.
 * (A `?? fresh.healthProfile` fallback here once silently recreated
 * deleted profiles; see docs/DECISIONS.md 2026-07-13.)
 */
export function buildResetState(current: AppState, alsoDeleteHealth: boolean): AppState {
  const fresh = buildDefaultState();
  return {
    ...fresh,
    healthProfile: alsoDeleteHealth ? null : current.healthProfile,
  };
}
