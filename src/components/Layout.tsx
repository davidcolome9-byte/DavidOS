import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useStore } from '../state/store';
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
  const { persistFailed, recovery, externalChange } = useStore();
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
          </div>
        )}
        {persistFailed && (
          <div className="notice risk-block" role="alert" style={{ borderStyle: 'solid' }}>
            <strong>⚠️ Saving to this device is failing.</strong>{' '}
            <span className="small">
              Recent changes exist only in memory and will be lost when this app
              closes. Free up storage or export a backup now (More → Settings → Data).
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
