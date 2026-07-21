import type { AppState } from '../types';
import {
  commitJournalState,
  migrateLegacyState,
  selectJournalAuthority,
} from './stateJournal';
import type {
  ExclusiveLockCoordinator,
  JournalAuthority,
  JournalCommitFailure,
} from './stateJournal';

export interface JournalPersistenceAuthority {
  committedGeneration: string | null;
  sequence: number;
  persistenceAvailable: boolean;
  reconciliationRequired: boolean;
  outcomeUncertain: boolean;
  externalChange: boolean;
  preservationFailed: boolean;
  writeQueued: boolean;
  writeRunning: boolean;
  lastFailure: JournalCommitFailure | 'invalid_legacy_state' | null;
}

export interface JournalPersistenceOptions {
  storage: Storage;
  coordinator?: ExclusiveLockCoordinator | null;
  committedGeneration: string | null;
  sequence: number;
  reconciliationRequired: boolean;
  preservationFailed: boolean;
  idFactory?: () => string;
}

export type DestructiveCommitFailureReason =
  | JournalCommitFailure
  | 'external_change'
  | 'preservation_failure'
  | 'persistence_suppressed';

export type DestructiveCommitResult =
  | { ok: true; authority: JournalAuthority; cleanupFailed: boolean }
  | {
      ok: false;
      reason: DestructiveCommitFailureReason;
      outcome: 'safe_failure' | 'uncertain';
    };

type Listener = (authority: JournalPersistenceAuthority) => void;

function equivalentState(raw: string | null, serialized: string): boolean {
  if (raw === null) return false;
  try {
    return JSON.stringify(JSON.parse(raw) as unknown) === serialized;
  } catch {
    return false;
  }
}

/**
 * One per StoreProvider. It serializes this tab's saves; the shared Web Lock
 * serializes all cooperating tabs. Persistence health deliberately lives
 * outside AppState so saving it can never trigger a recursive save.
 */
export class JournalPersistenceController {
  private authority: JournalPersistenceAuthority;
  private committedRaw: string | null = null;
  private pending: { state: AppState; serialized: string } | null = null;
  private listeners = new Set<Listener>();
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private draining: Promise<void> | null = null;

  constructor(private readonly options: JournalPersistenceOptions) {
    this.authority = {
      committedGeneration: options.committedGeneration,
      sequence: options.sequence,
      persistenceAvailable: false,
      reconciliationRequired: options.reconciliationRequired,
      outcomeUncertain: false,
      externalChange: false,
      preservationFailed: options.preservationFailed,
      writeQueued: false,
      writeRunning: false,
      lastFailure: null,
    };
  }

  getAuthority = (): JournalPersistenceAuthority => ({ ...this.authority });

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(patch: Partial<JournalPersistenceAuthority>): void {
    this.authority = { ...this.authority, ...patch };
    const snapshot = this.getAuthority();
    for (const listener of this.listeners) listener(snapshot);
  }

  initialize(): Promise<void> {
    if (this.initializing) return this.initializing;
    if (this.initialized) return Promise.resolve();
    this.initialized = true;
    if (this.authority.reconciliationRequired || this.authority.preservationFailed) {
      return Promise.resolve();
    }
    this.publish({ writeRunning: true });
    this.initializing = this.runInitialization().finally(() => {
      this.publish({ writeRunning: false });
      this.initializing = null;
      if (this.authority.persistenceAvailable && this.pending) this.startDrain();
    });
    return this.initializing;
  }

  private async runInitialization(): Promise<void> {
    const result = await migrateLegacyState({
      storage: this.options.storage,
      coordinator: this.options.coordinator,
      idFactory: this.options.idFactory,
    });
    if (result.ok) {
      this.acceptAuthority(result.authority);
      this.publish({ persistenceAvailable: true, lastFailure: null });
      return;
    }
    if (result.reason === 'no_legacy_state') {
      this.committedRaw = null;
      this.publish({ persistenceAvailable: true, lastFailure: null });
      return;
    }
    if (result.reason === 'reconciliation_required') {
      this.pending = null;
      this.publish({ reconciliationRequired: true, writeQueued: false, lastFailure: result.reason });
      return;
    }
    this.pending = null;
    this.publish({
      persistenceAvailable: false,
      outcomeUncertain: result.uncertain,
      writeQueued: false,
      lastFailure: result.reason,
    });
  }

  enqueue(state: AppState): void {
    if (this.authority.reconciliationRequired || this.authority.preservationFailed ||
        this.authority.outcomeUncertain || this.authority.externalChange) return;
    let serialized: string;
    try { serialized = JSON.stringify(state); }
    catch {
      this.publish({ persistenceAvailable: false, lastFailure: 'candidate_write_failed' });
      return;
    }
    if (equivalentState(this.committedRaw, serialized)) return;
    this.pending = { state, serialized };
    this.publish({ writeQueued: true });
    if (this.initialized && !this.initializing && this.authority.persistenceAvailable &&
        !this.authority.writeRunning) this.startDrain();
  }

  /**
   * Shared persist-first boundary for destructive state replacements. The
   * caller supplies the complete candidate (including its completion audit)
   * and the synchronously captured committed generation. Active React state
   * remains the caller's responsibility and must change only after success.
   */
  async commitDestructive(
    candidate: AppState,
    expectedGeneration: string | null,
  ): Promise<DestructiveCommitResult> {
    const before = this.authority;
    if (before.preservationFailed) {
      return { ok: false, reason: 'preservation_failure', outcome: 'safe_failure' };
    }
    if (before.reconciliationRequired) {
      return { ok: false, reason: 'reconciliation_required', outcome: 'safe_failure' };
    }
    if (before.externalChange) {
      return { ok: false, reason: 'external_change', outcome: 'safe_failure' };
    }
    if (before.committedGeneration !== expectedGeneration) {
      return { ok: false, reason: 'stale_authority', outcome: 'safe_failure' };
    }
    if (!before.persistenceAvailable || before.outcomeUncertain ||
        before.writeQueued || before.writeRunning || this.initializing || this.draining) {
      const reason = before.lastFailure === 'unsupported_lock'
        ? 'unsupported_lock'
        : 'persistence_suppressed';
      return { ok: false, reason, outcome: 'safe_failure' };
    }

    this.publish({ writeRunning: true });
    const result = await commitJournalState(candidate, {
      storage: this.options.storage,
      coordinator: this.options.coordinator,
      expectedGeneration,
      idFactory: this.options.idFactory,
    });
    if (result.ok) {
      this.acceptAuthority(result.authority);
      this.publish({ writeRunning: false, lastFailure: null });
      return result;
    }

    if (result.reason === 'stale_authority') {
      this.readExternalAuthority();
      this.publish({ writeRunning: false, writeQueued: false });
      return { ok: false, reason: result.reason, outcome: 'safe_failure' };
    }
    if (result.reason === 'reconciliation_required') {
      this.pending = null;
      this.publish({
        persistenceAvailable: false,
        reconciliationRequired: true,
        writeRunning: false,
        writeQueued: false,
        lastFailure: result.reason,
      });
      return { ok: false, reason: result.reason, outcome: 'safe_failure' };
    }

    this.pending = null;
    this.publish({
      persistenceAvailable: false,
      outcomeUncertain: result.uncertain,
      writeRunning: false,
      writeQueued: false,
      lastFailure: result.reason,
    });
    return {
      ok: false,
      reason: result.reason,
      outcome: result.uncertain ? 'uncertain' : 'safe_failure',
    };
  }

  private startDrain(): void {
    if (this.draining) return;
    this.draining = this.drain().finally(() => {
      this.draining = null;
      if (this.pending && this.authority.persistenceAvailable) this.startDrain();
    });
  }

  private async drain(): Promise<void> {
    while (this.pending && this.authority.persistenceAvailable &&
           !this.authority.externalChange && !this.authority.reconciliationRequired &&
           !this.authority.outcomeUncertain) {
      const candidate = this.pending;
      this.pending = null;
      if (equivalentState(this.committedRaw, candidate.serialized)) {
        this.publish({ writeQueued: false });
        continue;
      }
      this.publish({ writeQueued: false, writeRunning: true });
      const expectedGeneration = this.authority.committedGeneration;
      const result = await commitJournalState(candidate.state, {
        storage: this.options.storage,
        coordinator: this.options.coordinator,
        expectedGeneration,
        idFactory: this.options.idFactory,
      });
      if (result.ok) {
        this.acceptAuthority(result.authority);
        this.publish({ writeRunning: false, lastFailure: null });
        continue;
      }
      this.pending = null;
      if (result.reason === 'stale_authority') {
        this.readExternalAuthority();
        this.publish({ writeRunning: false, writeQueued: false });
        return;
      }
      if (result.reason === 'reconciliation_required') {
        this.publish({
          persistenceAvailable: false,
          reconciliationRequired: true,
          writeRunning: false,
          writeQueued: false,
          lastFailure: result.reason,
        });
        return;
      }
      this.publish({
        persistenceAvailable: false,
        outcomeUncertain: result.uncertain,
        writeRunning: false,
        writeQueued: false,
        lastFailure: result.reason,
      });
      return;
    }
  }

  private acceptAuthority(authority: JournalAuthority): void {
    this.committedRaw = authority.raw;
    this.publish({
      committedGeneration: authority.generationId,
      sequence: authority.sequence,
    });
  }

  /** Called only for the two controlled journal-head storage keys. */
  handleExternalHeadChange(): void {
    this.pending = null;
    this.readExternalAuthority();
  }

  private readExternalAuthority(): void {
    try {
      const selected = selectJournalAuthority(this.options.storage);
      if (selected.reconciliationNeeded) {
        this.publish({
          persistenceAvailable: false,
          reconciliationRequired: true,
          externalChange: true,
          writeQueued: false,
        });
        return;
      }
      if (selected.authority &&
          (selected.authority.generationId !== this.authority.committedGeneration ||
           selected.authority.sequence > this.authority.sequence)) {
        this.acceptAuthority(selected.authority);
        this.publish({ persistenceAvailable: false, externalChange: true, writeQueued: false });
      }
    } catch {
      this.publish({
        persistenceAvailable: false,
        reconciliationRequired: true,
        externalChange: true,
        writeQueued: false,
      });
    }
  }

  async whenIdle(): Promise<void> {
    await this.initializing;
    while (this.draining) await this.draining;
  }
}
