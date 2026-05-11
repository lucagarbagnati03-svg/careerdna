import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import './DashboardLayout.css'

const NAV_GROUPS = [
  {
    label: 'Main',
    items: [
      { to: '/', label: 'Overview', icon: '◈', end: true },
      { to: '/journal', label: 'Daily Journal', icon: '✦' },
      { to: '/experiences', label: 'Past Experiences', icon: '◑' },
    ],
  },
  {
    label: 'Skills',
    items: [
      { to: '/skills', label: 'My Skills', icon: '◉' },
      { to: '/cv-scanner', label: 'CV Scanner', icon: '▤' },
      { to: '/skill-gap', label: 'Skill Gap', icon: '◎' },
    ],
  },
  {
    label: 'Career',
    items: [
      { to: '/interview-prep', label: 'Interview Prep', icon: '◇' },
    ],
  },
]

export default function DashboardLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/auth')
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-logo-icon">🧬</span>
          <span className="sidebar-logo-text">CareerDNA</span>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map(group => (
            <div key={group.label} className="nav-group">
              <div className="nav-group-label">{group.label}</div>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.email?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="user-details">
              <span className="user-email">{user?.email}</span>
            </div>
          </div>
          <button className="signout-btn" onClick={handleSignOut} title="Sign out">
            ⎋
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
