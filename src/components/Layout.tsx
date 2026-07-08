import { NavLink, Outlet } from 'react-router-dom';

const NAV = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/agents', icon: '🤖', label: 'Agents' },
  { to: '/workflows', icon: '⚡', label: 'Workflows' },
  { to: '/projects', icon: '📁', label: 'Projects' },
  { to: '/prompts', icon: '📜', label: 'Prompts' },
  { to: '/context', icon: '🧠', label: 'Context' },
  { to: '/planning', icon: '🗓️', label: 'Planning' },
  { to: '/logs', icon: '📋', label: 'Logs' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
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
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
