import { Link } from 'react-router-dom';

interface MoreItem {
  to: string;
  icon: string;
  label: string;
  hint: string;
}

interface MoreGroup {
  title: string;
  items: MoreItem[];
}

// Secondary areas, grouped. Dashboard cards can replace this list later,
// but a simple grouped menu is the right altitude for v1.
const GROUPS: MoreGroup[] = [
  {
    title: 'Build',
    items: [
      { to: '/agents', icon: '🤖', label: 'Agents', hint: 'The 7 command-center agents' },
      { to: '/prompts', icon: '📜', label: 'Prompts', hint: 'Reusable prompt vault' },
      { to: '/context', icon: '🧠', label: 'Context', hint: 'Profile, preferences, constraints' },
      { to: '/planning', icon: '🗓️', label: 'Planning', hint: 'Daily brief & weekly review' },
    ],
  },
  {
    title: 'Personal',
    items: [
      { to: '/health', icon: '💪', label: 'Health Profile', hint: 'Targets & regimen for fitness workflows' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/settings', icon: '⚙️', label: 'Settings', hint: 'Appearance, integrations, about' },
      { to: '/logs', icon: '📋', label: 'Logs', hint: 'Audit log of every action' },
    ],
  },
  {
    title: 'Data',
    items: [
      { to: '/settings#data', icon: '💾', label: 'Export / Import / Reset', hint: 'Back up or restore all local data' },
    ],
  },
];

export default function MoreMenu() {
  return (
    <>
      <div className="card">
        <h2>More</h2>
        <p className="muted small">Everything that isn’t on the bottom bar.</p>
      </div>
      {GROUPS.map((group) => (
        <div className="card" key={group.title}>
          <h3>{group.title}</h3>
          <ul className="plain">
            {group.items.map((item) => (
              <li key={item.to}>
                <Link className="more-item" to={item.to}>
                  <span className="more-icon">{item.icon}</span>
                  <span className="more-text">
                    <strong>{item.label}</strong>
                    <span className="muted small">{item.hint}</span>
                  </span>
                  <span className="more-chev">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
