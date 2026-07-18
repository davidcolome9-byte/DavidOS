/**
 * Centralized draft-aware commit for backup imports.
 *
 * The unsaved Health Profile draft lives in its own localStorage key
 * (src/lib/health/profileDraft.ts) and must never be destroyed by an import
 * except as part of an import that (a) the user explicitly confirmed after
 * being warned, and (b) actually committed durably. This module is the single
 * place that enforces both rules, so every import path shares them:
 *
 *  - The draft check happens HERE, at the moment of apply — not only at
 *    file-select time. A draft that came into existence after an earlier
 *    check (another tab, a dialog left open) blocks the commit instead of
 *    being silently erased.
 *  - When a confirmed import discards a draft, the imported state is written
 *    durably FIRST and the draft is cleared only after that write succeeded.
 *    A failed write aborts the whole import: stored state and draft are both
 *    left exactly as they were — never a partial mixture.
 *
 * Results carry only value-free reason codes; no draft or imported values
 * ever appear in them (nothing here logs, either).
 */
import type { AppState } from '../types';
import { hasHealthDraft, clearHealthDraft } from '../health/profileDraft';
import { persistState } from './localStore';

export type ImportCommitResult =
  | { ok: true }
  /**
   * draft_blocked — an unsaved Health Profile draft exists and its discard was
   *   not explicitly confirmed; nothing was changed. Re-raise the choice.
   * commit_failed — the durable write of the imported state failed (or writes
   *   are suppressed this session); nothing was changed and the draft is intact.
   */
  | { ok: false; reason: 'draft_blocked' | 'commit_failed' };

export interface ImportCommitOptions {
  /** True only when the user explicitly chose "discard draft and import". */
  discardDraftConfirmed: boolean;
  /**
   * False when this session must not write persisted state (boot recovery
   * suppressed persistence, or another tab holds newer state). A draft is
   * never destroyed without a durable commit, so this blocks the discard.
   */
  persistAllowed: boolean;
  /** Injectable for tests; defaults to the app's real draft storage. */
  storage?: Storage | null;
  /** Injectable for tests; defaults to the app's real persistence. */
  persist?: (state: AppState) => boolean;
}

/**
 * Commit an already-validated imported state with draft protection.
 * When no draft exists this is a pass-through `ok` — the caller applies the
 * import exactly as before (in-memory update + normal persistence effect).
 */
export function commitImport(next: AppState, opts: ImportCommitOptions): ImportCommitResult {
  const { storage, persist = persistState } = opts;
  if (!hasHealthDraft(storage)) return { ok: true };
  if (!opts.discardDraftConfirmed) return { ok: false, reason: 'draft_blocked' };
  let committed = false;
  if (opts.persistAllowed) {
    try {
      committed = persist(next);
    } catch {
      committed = false;
    }
  }
  if (!committed) return { ok: false, reason: 'commit_failed' };
  // Only now — after the imported state is durably stored — may the draft go.
  clearHealthDraft(storage);
  return { ok: true };
}
