import { NavLink, Outlet } from 'react-router-dom';

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
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>David<span>OS</span></h1>
        <span className="date">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </header>
      <main>
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
