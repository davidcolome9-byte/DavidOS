import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppState, AuditLogEntry } from '../lib/types';
import { buildDefaultState } from '../data/defaultState';
import { loadPersistedState, persistState } from '../lib/storage/localStore';
import { appendAudit, makeAuditEntry } from '../lib/audit/auditLog';

type Updater = (fn: (state: AppState) => AppState) => void;

interface StoreValue {
  state: AppState;
  update: Updater;
  /** Convenience: append an audit entry in one call. */
  audit: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadPersistedState() ?? buildDefaultState());

  useEffect(() => {
    persistState(state);
  }, [state]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
  }, [state.settings.theme]);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      update: (fn) => setState(fn),
      audit: (entry) => setState((s) => appendAudit(s, makeAuditEntry(entry))),
    }),
    [state],
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
