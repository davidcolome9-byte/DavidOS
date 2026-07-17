import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppState, AuditLogEntry } from '../lib/types';
import { buildDefaultState } from '../data/defaultState';
import { loadPersistedState, persistState, STORAGE_KEY } from '../lib/storage/localStore';
import type { RecoveryInfo } from '../lib/storage/localStore';
import { appendAudit, makeAuditEntry } from '../lib/audit/auditLog';

type Updater = (fn: (state: AppState) => AppState) => void;

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
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [boot] = useState(() => {
    const loaded = loadPersistedState();
    return { initial: loaded.state ?? buildDefaultState(), recovery: loaded.recovery };
  });
  const [state, setState] = useState<AppState>(boot.initial);
  const [persistFailed, setPersistFailed] = useState(false);
  const [externalChange, setExternalChange] = useState(false);
  const { recovery } = boot;

  // Detect writes from OTHER tabs. The `storage` event fires only in tabs that
  // did NOT make the change, so any event for our key is inherently external —
  // this tab is now stale and must stop persisting.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setExternalChange(true);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    // When the loader could not preserve the original blob, persisting would
    // overwrite the only stored copy — suppressed for the whole session.
    if (!recovery.canPersist) return;
    // A stale tab must NEVER overwrite newer state written by another tab.
    if (externalChange) return;
    // Skip a redundant write when the serialized state already matches storage.
    // This avoids a no-op setItem on mount (loading the same state), which would
    // otherwise fire a `storage` event in OTHER tabs and falsely mark them stale.
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* unavailable */ }
    if (JSON.stringify(state) === stored) return;
    setPersistFailed(!persistState(state));
  }, [state, recovery.canPersist, externalChange]);

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
      update: (fn) => setState(fn),
      audit: (entry) => setState((s) => appendAudit(s, makeAuditEntry(entry))),
      persistFailed,
      recovery,
      externalChange,
    }),
    [state, persistFailed, recovery, externalChange],
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
