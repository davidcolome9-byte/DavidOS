import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useStore } from '../state/store';
import { measureStorageUsage } from '../lib/storage/storageUsage';
import { downloadTextFile } from '../lib/storage/exportImport';
import StaleTabDialog from './StaleTabDialog';

// Primary bottom-nav tabs. Kept to 5 so touch targets stay large on a
// phone. Everything else lives under "More" (see MoreMenu.tsx).
const PRIMARY_NAV = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/workflows', icon: '⚡', label: 'Workflows' },
  { to: '/projects', icon: '📁', label: 'Projects' },
  { to: '/logs', icon: '📋', label: 'Logs' },
  { to: '/more', icon: '⋯', label: 'More' },
];

export default function Layout() {
  const { state, persistFailed, recovery, externalChange, committedGeneration, committedSequence } = useStore();
  // OL-003 protection: warn BEFORE storage runs out, while an export can still
  // be saved. The measurement enumerates localStorage, so it must recompute
  // AFTER the journal write lands, not on the memory-only state change that only
  // enqueues it — otherwise the meter reads one committed generation behind.
  // `committedGeneration`/`committedSequence` advance only on a verified commit
  // (or initial migration), so keying off them refreshes post-persistence
  // without any timeout, poll, reload, or extra state mutation. `state` stays a
  // dependency so a change is reflected promptly even before its commit lands.
  const storageLevel = useMemo(() => {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* unavailable */ }
    return measureStorageUsage(state, storage).level;
    // committedGeneration/committedSequence are intentional cache-busters: the
    // measurement reads localStorage (not these values directly), so it must
    // recompute when the committed generation advances, not only when `state`
    // changes. They are deliberately retained, not "unnecessary".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, committedGeneration, committedSequence]);
  // F-08: dismissing the stale dialog is a LOCAL view choice only. The stale
  // condition (`externalChange`) lives in the store and keeps persistence
  // suppressed, so a dismissed dialog can never permit an overwrite — the
  // dialog is simply replaced by a persistent warning that can reopen it.
  const [staleDialogDismissed, setStaleDialogDismissed] = useState(false);
  const staleDialogOpen = externalChange && !staleDialogDismissed;
  const headerRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const staleDetailsRef = useRef<HTMLButtonElement | null>(null);

  // While the stale dialog is open, everything behind it is inert: not
  // clickable, not focusable, and hidden from assistive technology.
  useEffect(() => {
    for (const ref of [headerRef, mainRef, navRef]) {
      const el = ref.current;
      if (!el) continue;
      el.toggleAttribute('inert', staleDialogOpen);
      if (staleDialogOpen) el.setAttribute('aria-hidden', 'true');
      else el.removeAttribute('aria-hidden');
    }
  }, [staleDialogOpen]);

  // After the dialog is dismissed, focus lands on the persistent stale
  // warning's reopen control so keyboard users are not stranded.
  useEffect(() => {
    if (externalChange && staleDialogDismissed) staleDetailsRef.current?.focus();
  }, [externalChange, staleDialogDismissed]);

  return (
    <div className="app-shell">
      {staleDialogOpen && <StaleTabDialog onDismiss={() => setStaleDialogDismissed(true)} />}
      <header className="app-header" ref={headerRef}>
        <h1>David<span>OS</span></h1>
        <span className="date">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </header>
      <main ref={mainRef}>
        {externalChange && staleDialogDismissed && (
          <div className="notice risk-block" role="alert" data-testid="crosstab-stale-banner" style={{ borderStyle: 'solid' }}>
            <strong>⚠️ This tab is out of date.</strong>{' '}
            <span className="small">
              DavidOS was changed in another tab, so saving from this tab stays
              paused — changes made here will not be written. Reload to continue
              with the latest saved data.
            </span>
            <div className="btn-row">
              <button className="primary" onClick={() => window.location.reload()}>Reload with latest</button>
              <button ref={staleDetailsRef} onClick={() => setStaleDialogDismissed(false)}>Show details</button>
            </div>
          </div>
        )}
        {recovery.message && (
          <div className="notice risk-block" role="alert" data-testid="recovery-banner" style={{ borderStyle: 'solid' }}>
            <strong>⚠️ Data recovery notice.</strong>{' '}
            <span className="small">{recovery.message}</span>
            {recovery.rawPreserved && recovery.recoveryKey && (
              <div className="btn-row">
                <button
                  data-testid="recovery-download-original"
                  onClick={() => {
                    // Byte-exact export of the untouched preserved original.
                    // Filename is fixed-format — never derived from the
                    // storage key (only used here as a lookup handle).
                    try {
                      const raw = window.localStorage.getItem(recovery.recoveryKey!);
                      if (raw !== null) {
                        const ts = new Date().toISOString().replace(/[:.]/g, '-');
                        downloadTextFile(raw, `davidos-preserved-original-${ts}.json`);
                      }
                    } catch {
                      /* storage unavailable — nothing to download */
                    }
                  }}
                >
                  Download preserved original
                </button>
              </div>
            )}
          </div>
        )}
        {storageLevel === 'critical' && !persistFailed && (
          <div className="notice risk-block" role="alert" data-testid="storage-critical-banner" style={{ borderStyle: 'solid' }}>
            <strong>⚠️ Device storage is nearly full.</strong>{' '}
            <span className="small">
              DavidOS keeps redundant crash-safe copies, and saving a change must write another full
              copy before the old one is removed — on this device that may soon fail. Your last saved
              data stays protected, but new or unsaved changes may not be written. Export a backup (a
              copy of your data that does not itself free storage or raise the browser’s limit) from{' '}
              <a href="#/settings">Settings → Data</a>. If pruning is available, pruning old saved
              prompts can reduce storage usage; pruning is unavailable whenever saving is paused or
              failing. Export and recovery downloads stay available. Nothing is deleted
              automatically.
            </span>
          </div>
        )}
        {persistFailed && (
          <div className="notice risk-block" role="alert" style={{ borderStyle: 'solid' }}>
            <strong>⚠️ Saving to this device is failing.</strong>{' '}
            <span className="small">
              Your last successfully saved data is still on this device and is not deleted. Changes
              made since then exist only in memory and will be lost if this app closes. Export a
              backup now to keep a copy of them (More → Settings → Data) — an export is only a copy:
              it does not free storage, raise the browser’s limit, or make saving work again.
              Pruning is unavailable while saving is failing, because a delete that cannot be saved
              is never performed.
            </span>
          </div>
        )}
        <Outlet />
      </main>
      <nav className="bottom-nav" ref={navRef}>
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
