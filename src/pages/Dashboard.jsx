import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { displayCategory } from '../lib/categories'
import { getSkillGapCache, calcMatchPct, pctColor } from '../lib/skillGap'
import './Dashboard.css'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function truncate(str, n) {
  if (!str) return ''
  return str.length > n ? str.slice(0, n).trimEnd() + '…' : str
}

export default function Dashboard() {
  const { user } = useAuth()

  const firstName = user?.user_metadata?.full_name
    || user?.user_metadata?.display_name
    || user?.email?.split('@')[0]
    || 'there'

  const [isMobile,        setIsMobile]        = useState(() => window.innerWidth < 768)
  const [showAllActivity, setShowAllActivity] = useState(false)
  const [showAllSkills,   setShowAllSkills]   = useState(false)
  const [stats,           setStats]           = useState({ journal: '—', skills: '—', experiences: '—' })
  const [targetRole,      setTargetRole]      = useState(null)
  const [recentEntries,   setRecentEntries]   = useState([])
  const [topSkills,       setTopSkills]       = useState([])
  const [gapPct,          setGapPct]          = useState(null)
  const [loading,         setLoading]         = useState(true)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (user) load()
  }, [user])

  async function load() {
    setLoading(true)
    try {
      const [
        { count: jCount },
        { count: sCount },
        { count: eCount },
        { data: pref },
        { data: entries },
        { data: skills },
        { data: allSkills },
      ] = await Promise.all([
        supabase.from('journal_entries').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('skills').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('experiences').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('user_preferences').select('target_role').eq('user_id', user.id).maybeSingle(),
        supabase.from('journal_entries').select('id, title, content, created_at')
          .eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('skills').select('name, category, level')
          .eq('user_id', user.id).order('level', { ascending: false }).limit(10),
        // Fetch all skills (no limit) for gap calculation — same query as SkillGap.jsx
        supabase.from('skills').select('name, level, category').eq('user_id', user.id),
      ])

      setStats({ journal: jCount ?? 0, skills: sCount ?? 0, experiences: eCount ?? 0 })
      setRecentEntries(entries ?? [])
      setTopSkills(skills ?? [])

      const role = pref?.target_role ?? null
      setTargetRole(role)

      if (role) {
        const reqs        = getSkillGapCache(role)
        // Build the same Set that calcMatchPct expects: lowercase names of all user skills
        const userSkillNames = new Set((allSkills ?? []).map(s => s.name.toLowerCase()))
        const pct         = reqs ? calcMatchPct(reqs, userSkillNames) : null
        setGapPct(pct)
      }
    } finally {
      setLoading(false)
    }
  }

  const STAT_CARDS = [
    { label: 'Journal Entries', value: stats.journal, icon: '✦', to: '/journal' },
    { label: 'Skills Tracked',  value: stats.skills,  icon: '◉', to: '/skills'  },
    { label: 'Experiences',     value: stats.experiences, icon: '◑', to: '/experiences' },
    {
      label: 'Target Role',
      value: targetRole ?? 'Not set',
      icon: '◎',
      to: '/skill-gap',
      isText: true,
    },
  ]

  // Desktop: always slice to original limits. Mobile: controlled by show-all toggles.
  const visibleEntries = isMobile
    ? (showAllActivity ? recentEntries : recentEntries.slice(0, 3))
    : recentEntries.slice(0, 3)

  const visibleSkills = isMobile
    ? (showAllSkills ? topSkills : topSkills.slice(0, 3))
    : topSkills.slice(0, 5)

  return (
    <div className="dashboard">

      {/* ── Hero header ── */}
      <div className="db-hero">
        <div className="db-hero-left">
          <span className="db-mobile-brand-icon">🧬</span>
          <div className="db-hero-text">
            <p className="db-greeting">{greeting()}</p>
            <h1 className="db-title">{firstName}</h1>
            <p className="db-subtitle">Here's what's happening with your career profile.</p>
          </div>
        </div>
        <div className="db-quick-actions">
          <Link to="/journal"        className="qa-btn primary">+ Log Today</Link>
          <Link to="/skills"         className="qa-btn">View Skills</Link>
          <Link to="/interview-prep" className="qa-btn">Practice Interview</Link>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="db-stats-row">
        {STAT_CARDS.map(card => (
          <Link key={card.label} to={card.to} className="db-stat-card">
            <div className="db-stat-icon">{card.icon}</div>
            <div className={`db-stat-value ${card.isText ? 'is-text' : ''}`}>
              {loading ? '—' : card.value}
            </div>
            <div className="db-stat-label">{card.label}</div>
          </Link>
        ))}
      </div>

      {/* ── Main content grid ── */}
      <div className="db-grid">

        {/* Left column */}
        <div className="db-col-left">

          {/* Recent activity */}
          <div className="db-section">
            <div className="db-section-header">
              <h2 className="db-section-title">Recent Journal Activity</h2>
              <Link to="/journal" className="db-section-link">View all →</Link>
            </div>
            {loading ? (
              <div className="db-skeleton-list">
                {[1,2,3].map(i => <div key={i} className="db-skeleton" />)}
              </div>
            ) : recentEntries.length === 0 ? (
              <div className="db-empty">
                <span>✦</span>
                <p>No journal entries yet.</p>
                <Link to="/journal" className="db-empty-cta">Write your first entry →</Link>
              </div>
            ) : (
              <>
                <div className="db-activity-list">
                  {visibleEntries.map(entry => (
                    <Link key={entry.id} to="/journal" className="db-activity-item">
                      <div className="db-activity-dot" />
                      <div className="db-activity-body">
                        <div className="db-activity-top">
                          <span className="db-activity-title">
                            {entry.title || 'Untitled Entry'}
                          </span>
                          <span className="db-activity-date">{fmtDate(entry.created_at)}</span>
                        </div>
                        <p className="db-activity-preview">
                          {truncate(entry.content, 120)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
                {isMobile && recentEntries.length > 3 && (
                  <button className="db-show-more-btn" onClick={() => setShowAllActivity(v => !v)}>
                    {showAllActivity ? 'Show less' : `Show ${recentEntries.length - 3} more`}
                  </button>
                )}
              </>
            )}
          </div>

        </div>

        {/* Right column */}
        <div className="db-col-right">

          {/* Top skills */}
          <div className="db-section">
            <div className="db-section-header">
              <h2 className="db-section-title">Top Skills</h2>
              <Link to="/skills" className="db-section-link">All skills →</Link>
            </div>
            {loading ? (
              <div className="db-skeleton-list">
                {[1,2,3,4,5].map(i => <div key={i} className="db-skeleton short" />)}
              </div>
            ) : topSkills.length === 0 ? (
              <div className="db-empty">
                <span>◉</span>
                <p>No skills tracked yet.</p>
                <Link to="/skills" className="db-empty-cta">Add your first skill →</Link>
              </div>
            ) : (
              <>
                <div className="db-skills-list">
                  {visibleSkills.map((skill, i) => (
                    <div key={skill.name} className="db-skill-row">
                      <div className="db-skill-rank">#{i + 1}</div>
                      <div className="db-skill-info">
                        <div className="db-skill-top">
                          <span className="db-skill-name">{skill.name}</span>
                          <span className="db-skill-level">Lv {skill.level}</span>
                        </div>
                        <div className="db-skill-bar-track">
                          <div
                            className="db-skill-bar-fill"
                            style={{ width: `${(skill.level / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="db-skill-cat">{displayCategory(skill.category)}</span>
                    </div>
                  ))}
                </div>
                {isMobile && topSkills.length > 3 && (
                  <button className="db-show-more-btn" onClick={() => setShowAllSkills(v => !v)}>
                    {showAllSkills ? 'Show less' : `Show ${topSkills.length - 3} more`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Skill gap summary */}
          <div className="db-section">
            <div className="db-section-header">
              <h2 className="db-section-title">Skill Gap</h2>
              <Link to="/skill-gap" className="db-section-link">Analyze →</Link>
            </div>
            {loading ? (
              <div className="db-skeleton tall" />
            ) : targetRole ? (
              <Link to="/skill-gap" className="db-gap-card">
                <div className="db-gap-role">{targetRole}</div>
                {gapPct !== null ? (
                  <>
                    <div className="db-gap-pct" style={{ color: pctColor(gapPct) }}>
                      {gapPct}%
                    </div>
                    <div className="db-gap-bar-track">
                      <div
                        className="db-gap-bar-fill"
                        style={{
                          width: `${gapPct}%`,
                          background: gapPct >= 70
                            ? 'linear-gradient(90deg, #4ade80, #22c55e)'
                            : gapPct >= 40
                              ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                              : 'linear-gradient(90deg, #f87171, #ef4444)',
                        }}
                      />
                    </div>
                    <div className="db-gap-label">profile match</div>
                  </>
                ) : (
                  <div className="db-gap-no-analysis">
                    Role set — open Skill Gap to run analysis
                    <span className="db-gap-arrow">→</span>
                  </div>
                )}
              </Link>
            ) : (
              <Link to="/skill-gap" className="db-gap-cta">
                <span className="db-gap-cta-icon">◎</span>
                <div>
                  <div className="db-gap-cta-title">Set a target role</div>
                  <div className="db-gap-cta-sub">
                    AI will map required skills and show your readiness.
                  </div>
                </div>
                <span className="db-gap-arrow">→</span>
              </Link>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
