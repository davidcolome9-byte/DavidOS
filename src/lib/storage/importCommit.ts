/**
 * Centralized draft-aware commit for backup imports (DOS-STAB-001A).
 *
 * EVERY accepted import — with or without an unsaved Health Profile draft —
 * goes through the SAME journal-backed destructive persistence boundary that
 * StoreProvider, Reset, and Prune use (commitDestructiveState): the complete
 * imported candidate becomes exactly one new journal generation whose head
 * advancement is verified before the caller may replace active state or
 * report success. There is no rollback path and no legacy-key write here.
 *
 * Draft rules:
 *
 *  - The draft check happens HERE, at the moment of apply — not only at
 *    file-select time. A draft that came into existence after an earlier
 *    check (another tab, a dialog left open) blocks the commit instead of
 *    being silently erased.
 *  - When a confirmed import discards a draft, the imported state is written
 *    durably FIRST and the draft is cleared only after the verified head
 *    advancement. A failed commit aborts the whole import: committed journal
 *    authority and draft are both left exactly as they were.
 *
 * Results carry only value-free reason codes; no draft or imported values
 * ever appear in them (nothing here logs, either).
 */
import type { AppState } from '../types';
import { hasHealthDraft, clearHealthDraft } from '../health/profileDraft';
import type {
  DestructiveCommitFailureReason,
  DestructiveCommitResult,
} from './journalPersistence';

export type ImportCommitResult =
  | { ok: true }
  /**
   * draft_blocked — an unsaved Health Profile draft exists and its discard was
   *   not explicitly confirmed; nothing was changed. Re-raise the choice.
   * commit_failed — the journal transaction was refused by a persistence
   *   guard or failed; `cause` carries the value-free reason and `outcome`
   *   whether the stored result is proven safe or honestly uncertain.
   *   Active state and any draft are untouched either way.
   */
  | { ok: false; reason: 'draft_blocked' }
  | {
      ok: false;
      reason: 'commit_failed';
      cause: DestructiveCommitFailureReason;
      outcome: 'safe_failure' | 'uncertain';
    };

export interface ImportCommitOptions {
  /** True only when the user explicitly chose "discard draft and import". */
  discardDraftConfirmed: boolean;
  /**
   * The committed journal generation the caller's CURRENT synchronous
   * authority snapshot reported — captured at commit time, never from a
   * closure taken before an await. The journal transaction re-reads
   * authority inside the exclusive lock and refuses a stale expectation
   * before any candidate generation is created.
   */
  expectedGeneration: string | null;
  /** The store's shared destructive journal transaction (commitDestructiveState). */
  commit: (
    candidate: AppState,
    expectedGeneration: string | null,
  ) => Promise<DestructiveCommitResult>;
  /** Injectable for tests; defaults to the app's real draft storage. */
  storage?: Storage | null;
}

/**
 * Durably commit an already-validated imported candidate with draft
 * protection. `ok: true` means the candidate is the verified journal head —
 * only then may the caller replace active React state and report success.
 */
export async function commitImport(
  next: AppState,
  opts: ImportCommitOptions,
): Promise<ImportCommitResult> {
  const draftExists =
    opts.storage === undefined ? hasHealthDraft() : hasHealthDraft(opts.storage);
  if (draftExists && !opts.discardDraftConfirmed) return { ok: false, reason: 'draft_blocked' };

  let result: DestructiveCommitResult;
  try {
    result = await opts.commit(next, opts.expectedGeneration);
  } catch {
    // The transaction boundary itself blew up mid-flight — what the journal
    // now holds is unknown, so the outcome is honestly UNCERTAIN.
    result = { ok: false, reason: 'lock_callback_failed', outcome: 'uncertain' };
  }
  if (!result.ok) {
    return { ok: false, reason: 'commit_failed', cause: result.reason, outcome: result.outcome };
  }

  // Only now — after the verified head advancement — may the draft go.
  if (draftExists) {
    if (opts.storage === undefined) clearHealthDraft();
    else clearHealthDraft(opts.storage);
  }
  return { ok: true };
}
