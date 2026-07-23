import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppState, AuditLogEntry } from '../lib/types';
import { buildDefaultState } from '../data/defaultState';
import { loadPersistedState } from '../lib/storage/localStore';
import type { RecoveryInfo } from '../lib/storage/localStore';
import { JournalPersistenceController } from '../lib/storage/journalPersistence';
import type {
  DestructiveCommitResult,
  JournalPersistenceAuthority,
} from '../lib/storage/journalPersistence';
import { JOURNAL_HEAD_KEYS } from '../lib/storage/stateJournal';
import { appendAudit, makeAuditEntry } from '../lib/audit/auditLog';

type Updater = (fn: (state: AppState) => AppState) => void;

/**
 * Synchronous snapshot of everything a destructive commit needs at the exact
 * moment it executes: the current state and the live persistence-authority
 * flags. Read through refs, so it is correct even when an async flow (e.g.
 * awaiting File.text()) resumes after events that React has not re-rendered
 * yet — pre-await closures must never be used to authorize a commit.
 */
export interface AuthoritySnapshot {
  state: AppState;
  canPersist: boolean;
  externalChange: boolean;
  persistFailed: boolean;
  commitUncertain: boolean;
  committedGeneration: string | null;
  committedSequence: number;
  persistenceAvailable: boolean;
  reconciliationRequired: boolean;
  outcomeUncertain: boolean;
  preservationFailed: boolean;
  writeQueued: boolean;
  writeRunning: boolean;
}

interface StoreValue {
  state: AppState;
  update: Updater;
  /** Convenience: append an audit entry in one call. */
  audit: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => void;
  /** True while writes to localStorage are failing (quota/unavailable). */
  persistFailed: boolean;
  /** How boot-time state loading went (repair/quarantine details for the UI). */
  recovery: RecoveryInfo;
  /**
   * True once another browser tab has written newer DavidOS state. This tab is
   * now stale: it stops persisting (so it cannot clobber the newer state) and
   * the UI shows a blocking reload prompt. No automatic merge is attempted.
   */
  externalChange: boolean;
  /**
   * True once a durable commit this session ended with an unconfirmed outcome
   * (verification failure or uncertain rollback). Automatic persistence stays
   * suppressed until a reload re-establishes authority — a follow-up write
   * could destroy data whose current stored form is unknown.
   */
  commitUncertain: boolean;
  /**
   * Identity of the last verified-committed journal generation, and its
   * sequence. Both advance ONLY after a durable, read-back-verified commit (or
   * the initial legacy migration / an accepted external head change) has landed
   * in localStorage — see `JournalPersistenceController.acceptAuthority`. They
   * are ephemeral in-memory React state (never themselves persisted) and are
   * exposed so passive readers of localStorage (the storage meter) can recompute
   * AFTER the committed bytes exist, not on the memory-only state change that
   * merely enqueues the write. Reading storage in response never writes, so this
   * cannot create a persistence feedback loop.
   */
  committedGeneration: string | null;
  committedSequence: number;
  /** Synchronous current-authority snapshot — see AuthoritySnapshot. */
  getAuthority: () => AuthoritySnapshot;
  commitDestructiveState: (
    candidate: AppState,
    expectedGeneration: string | null,
  ) => Promise<DestructiveCommitResult>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [boot] = useState(() => {
    const loaded = loadPersistedState();
    let storage: Storage | null = null;
    try { storage = localStorage; } catch { /* unavailable */ }
    return { initial: loaded.state ?? buildDefaultState(), recovery: loaded.recovery, loaded, storage };
  });
  // Lazy useState initializer, not a ref written during render: the controller
  // is created exactly once per provider and is stable across renders, without
  // reading or mutating a ref mid-render.
  const [controller] = useState<JournalPersistenceController | null>(() =>
    boot.storage
      ? new JournalPersistenceController({
          storage: boot.storage,
          committedGeneration: boot.loaded.committedGeneration,
          sequence: boot.loaded.committedSequence,
          reconciliationRequired: boot.loaded.journalReconciliationNeeded,
          preservationFailed: !boot.recovery.canPersist,
        })
      : null,
  );
  const initialJournalAuthority: JournalPersistenceAuthority = controller?.getAuthority() ?? {
    committedGeneration: boot.loaded.committedGeneration,
    sequence: boot.loaded.committedSequence,
    persistenceAvailable: false,
    reconciliationRequired: boot.loaded.journalReconciliationNeeded,
    outcomeUncertain: false,
    externalChange: false,
    preservationFailed: !boot.recovery.canPersist,
    writeQueued: false,
    writeRunning: false,
    lastFailure: 'storage_unavailable',
  };
  const [state, setState] = useState<AppState>(boot.initial);
  const [persistFailed, setPersistFailed] = useState(false);
  const [externalChange, setExternalChange] = useState(false);
  const [commitUncertain, setCommitUncertain] = useState(false);
  const [journalAuthority, setJournalAuthority] = useState(initialJournalAuthority);
  const { recovery } = boot;

  // Live mirrors for getAuthority(): refs are updated synchronously (event
  // handlers, state updaters, effects) so an async flow that resumes
  // mid-render-cycle still sees the truth, not a stale render's values.
  const stateRef = useRef(state);
  const persistFailedRef = useRef(false);
  const externalChangeRef = useRef(false);
  const commitUncertainRef = useRef(false);
  const journalAuthorityRef = useRef(initialJournalAuthority);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!controller) {
      persistFailedRef.current = true;
      setPersistFailed(true);
      return;
    }
    return controller.subscribe((authority) => {
      journalAuthorityRef.current = authority;
      setJournalAuthority(authority);
      if (authority.externalChange) {
        externalChangeRef.current = true;
        setExternalChange(true);
      }
      if (authority.outcomeUncertain) {
        commitUncertainRef.current = true;
        setCommitUncertain(true);
      }
      if (authority.lastFailure && !authority.externalChange && !authority.reconciliationRequired) {
        persistFailedRef.current = true;
        setPersistFailed(true);
      }
    });
  }, [controller]);

  useEffect(() => {
    void controller?.initialize();
  }, [controller]);

  // Only the two controlled journal heads can change canonical authority.
  // Legacy-key and unrelated events cannot override an active journal.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!JOURNAL_HEAD_KEYS.includes(e.key as (typeof JOURNAL_HEAD_KEYS)[number])) return;
      controller?.handleExternalHeadChange();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [controller]);

  useEffect(() => {
    controller?.enqueue(state);
  }, [controller, state]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
    // Keep the browser/PWA chrome color in sync with the theme.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', state.settings.theme === 'light' ? '#f1f5f9' : '#0f172a');
  }, [state.settings.theme]);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      // The ref is synced inside the updater so a getAuthority() call later in
      // the SAME event handler already sees the queued state (idempotent
      // assignment — safe under StrictMode double-invocation).
      update: (fn) =>
        setState((prev) => {
          const next = fn(prev);
          stateRef.current = next;
          return next;
        }),
      audit: (entry) =>
        setState((s) => {
          const next = appendAudit(s, makeAuditEntry(entry));
          stateRef.current = next;
          return next;
        }),
      persistFailed,
      recovery,
      externalChange,
      commitUncertain,
      // Read from the reactive `journalAuthority` (a memo dependency), NOT the
      // ref, so consumers receive a fresh value only once a commit has been
      // verified and published — this is the post-persistence refresh signal.
      committedGeneration: journalAuthority.committedGeneration,
      committedSequence: journalAuthority.sequence,
      getAuthority: () => ({
        state: stateRef.current,
        canPersist: recovery.canPersist && journalAuthorityRef.current.persistenceAvailable &&
          !externalChangeRef.current && !commitUncertainRef.current &&
          !journalAuthorityRef.current.reconciliationRequired,
        externalChange: externalChangeRef.current,
        persistFailed: persistFailedRef.current,
        commitUncertain: commitUncertainRef.current,
        committedGeneration: journalAuthorityRef.current.committedGeneration,
        committedSequence: journalAuthorityRef.current.sequence,
        persistenceAvailable: journalAuthorityRef.current.persistenceAvailable,
        reconciliationRequired: journalAuthorityRef.current.reconciliationRequired,
        outcomeUncertain: journalAuthorityRef.current.outcomeUncertain,
        preservationFailed: journalAuthorityRef.current.preservationFailed,
        writeQueued: journalAuthorityRef.current.writeQueued,
        writeRunning: journalAuthorityRef.current.writeRunning,
      }),
      commitDestructiveState: async (candidate, expectedGeneration) => {
        if (!controller) {
          return { ok: false, reason: 'persistence_suppressed', outcome: 'safe_failure' };
        }
        return controller.commitDestructive(candidate, expectedGeneration);
      },
    }),
    // `journalAuthority` is deliberately retained: the memo body reads
    // persistence health through refs (so getAuthority() is always current),
    // but consumers must still receive a fresh context value when committed
    // authority changes. It is intentionally not "unnecessary".
    [controller, state, persistFailed, recovery, externalChange, commitUncertain, journalAuthority],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

/** Generic upsert for id-keyed lists. */
export function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [item, ...list];
  const next = [...list];
  next[idx] = item;
  return next;
}

export function removeById<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((x) => x.id !== id);
}
