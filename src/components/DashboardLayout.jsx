import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
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

  const [showModal, setShowModal]         = useState(false)
  const [displayName, setDisplayName]     = useState(
    user?.user_metadata?.full_name ?? user?.user_metadata?.display_name ?? ''
  )
  const [savingName, setSavingName]       = useState(false)
  const [resetSent, setResetSent]         = useState(false)
  const [resetError, setResetError]       = useState('')
  const [nameSuccess, setNameSuccess]     = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/auth')
  }

  async function handleSaveName() {
    if (!displayName.trim()) return
    setSavingName(true)
    setNameSuccess(false)
    await supabase.auth.updateUser({ data: { full_name: displayName.trim() } })
    setSavingName(false)
    setNameSuccess(true)
    setTimeout(() => setNameSuccess(false), 3000)
  }

  async function handlePasswordReset() {
    setResetError('')
    setResetSent(false)
    const { error } = await supabase.auth.resetPasswordForEmail(user?.email ?? '')
    if (error) setResetError(error.message)
    else setResetSent(true)
  }

  function openModal() {
    setDisplayName(user?.user_metadata?.full_name ?? user?.user_metadata?.display_name ?? '')
    setResetSent(false)
    setResetError('')
    setNameSuccess(false)
    setShowModal(true)
  }

  const initial = user?.email?.[0]?.toUpperCase() ?? '?'

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

        {/* Profile footer */}
        <div className="sidebar-profile">
          <div className="profile-avatar">{initial}</div>
          <div className="profile-info">
            <span className="profile-name">
              {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
            </span>
            <span className="profile-email">{user?.email}</span>
          </div>
          <div className="profile-actions">
            <button className="profile-btn" onClick={openModal} title="Edit profile">✎</button>
            <button className="profile-btn danger" onClick={handleSignOut} title="Sign out">⎋</button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      {/* Edit Profile modal */}
      {showModal && (
        <div className="profile-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="profile-modal">
            <div className="profile-modal-header">
              <h2 className="profile-modal-title">Edit Profile</h2>
              <button className="profile-modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>

            <div className="profile-modal-body">
              {/* Display name */}
              <div className="profile-field">
                <label>Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Your name"
                />
              </div>

              {nameSuccess && (
                <div className="profile-success">✓ Name saved successfully</div>
              )}

              <button
                className="profile-save-btn"
                onClick={handleSaveName}
                disabled={savingName || !displayName.trim()}
              >
                {savingName ? 'Saving…' : 'Save Name'}
              </button>

              {/* Email (read-only) */}
              <div className="profile-field">
                <label>Email <span className="profile-readonly">(read-only)</span></label>
                <input type="email" value={user?.email ?? ''} readOnly className="readonly" />
              </div>

              <div className="profile-divider" />

              {/* Password reset */}
              <div className="profile-reset-section">
                <p className="profile-reset-desc">
                  Send a password reset link to your email address.
                </p>
                <button className="profile-reset-btn" onClick={handlePasswordReset}>
                  Send Password Reset Email
                </button>
                {resetSent && (
                  <div className="profile-success">✓ Reset email sent — check your inbox</div>
                )}
                {resetError && (
                  <div className="profile-error">{resetError}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
