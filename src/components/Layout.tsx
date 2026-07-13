import { NavLink, Outlet } from 'react-router-dom';
import { useStore } from '../state/store';

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
  const { persistFailed, recovery } = useStore();
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>David<span>OS</span></h1>
        <span className="date">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </header>
      <main>
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
      <nav className="bottom-nav">
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
