import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { analyzeRoleRequirements } from '../lib/groq'
import './SkillGap.css'

// Cache AI-generated requirements in localStorage so we don't re-call on every visit
function getCached(role) {
  try {
    const raw = localStorage.getItem(`careerdna:role:${role.toLowerCase().trim()}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function setCache(role, requirements) {
  try {
    localStorage.setItem(`careerdna:role:${role.toLowerCase().trim()}`, JSON.stringify(requirements))
  } catch {}
}

export default function SkillGap() {
  const { user } = useAuth()
  const [userSkills, setUserSkills] = useState([])
  const [roleInput, setRoleInput] = useState('')
  const [analyzedRole, setAnalyzedRole] = useState('')
  const [requirements, setRequirements] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [loadingPage, setLoadingPage] = useState(true)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!user) return
    async function load() {
      try {
        const [{ data: skillsData }, { data: prefData }] = await Promise.all([
          supabase.from('skills').select('name, level, category').eq('user_id', user.id),
          supabase.from('user_preferences').select('target_role').eq('user_id', user.id).maybeSingle(),
        ])
        setUserSkills(skillsData ?? [])

        const savedRole = prefData?.target_role ?? ''
        if (savedRole) {
          setRoleInput(savedRole)
          setAnalyzedRole(savedRole)
          const cached = getCached(savedRole)
          if (cached) setRequirements(cached)
          // If no cache, user will see the role pre-filled and can hit Analyze
        }
      } finally {
        setLoadingPage(false)
      }
    }
    load()
  }, [user])

  async function handleAnalyze(e) {
    e?.preventDefault()
    const role = roleInput.trim()
    if (!role) return
    setError('')
    setAnalyzing(true)
    setRequirements([])

    try {
      // Check cache first
      const cached = getCached(role)
      const reqs = cached ?? await analyzeRoleRequirements(role)
      if (!cached) setCache(role, reqs)

      setRequirements(reqs)
      setAnalyzedRole(role)

      // Persist role preference
      await supabase.from('user_preferences').upsert(
        { user_id: user.id, target_role: role },
        { onConflict: 'user_id' }
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  // Build a lookup map: lowercase skill name → level
  const userSkillMap = Object.fromEntries(
    userSkills.map(s => [s.name.toLowerCase(), s])
  )

  // Match each required skill against user's skills
  const gaps = requirements.map(req => {
    const match = userSkillMap[req.name.toLowerCase()]
    return { ...req, have: !!match, level: match?.level ?? 0 }
  })

  const essential = gaps.filter(g => g.importance === 'essential')
  const preferred = gaps.filter(g => g.importance === 'preferred')

  const essentialHave = essential.filter(g => g.have).length
  const preferredHave = preferred.filter(g => g.have).length
  const totalHave = essentialHave + preferredHave
  const total = gaps.length

  // Weight: essential skills count double
  const weightedScore = essential.length > 0 || preferred.length > 0
    ? Math.round(
        ((essentialHave * 2 + preferredHave) / (essential.length * 2 + preferred.length)) * 100
      )
    : 0

  const roleChanged = roleInput.trim().toLowerCase() !== analyzedRole.toLowerCase()

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Skill Gap</h1>
        <p className="page-subtitle">Type any job role and AI will analyze what skills you need.</p>
      </div>

      {/* Role input */}
      <form onSubmit={handleAnalyze} className="role-input-card">
        <div className="role-input-row">
          <div className="role-input-wrap">
            <span className="role-input-icon">◎</span>
            <input
              ref={inputRef}
              className="role-input"
              type="text"
              placeholder="e.g. Hotel Manager, Front Office Manager, Data Analyst…"
              value={roleInput}
              onChange={e => setRoleInput(e.target.value)}
              disabled={analyzing}
            />
          </div>
          <button
            type="submit"
            className="btn-analyze"
            disabled={analyzing || !roleInput.trim()}
          >
            {analyzing ? (
              <><span className="spinner" /> Analyzing…</>
            ) : roleChanged && analyzedRole ? (
              'Re-analyze'
            ) : (
              'Analyze Role'
            )}
          </button>
        </div>
        {error && <div className="gap-error">{error}</div>}
      </form>

      {/* Analyzing skeleton */}
      {analyzing && (
        <div className="analyzing-state">
          <span className="analyzing-spinner" />
          <span>Asking AI to map skills for <strong>{roleInput}</strong>…</span>
        </div>
      )}

      {/* Results */}
      {!analyzing && analyzedRole && requirements.length > 0 && (
        <>
          {/* Summary card */}
          <div className="gap-summary-card">
            <div className="gap-summary-left">
              <div className="gap-role-name">{analyzedRole}</div>
              <div className="gap-match-line">
                <span className="gap-match-pct" style={{ color: pctColor(weightedScore) }}>
                  {weightedScore}% match
                </span>
                <span className="gap-match-detail">
                  · {totalHave} of {total} skills matched
                </span>
              </div>

              {/* Progress bar */}
              <div className="gap-bar-track">
                <div
                  className="gap-bar-fill"
                  style={{
                    width: `${weightedScore}%`,
                    background: pctGradient(weightedScore),
                  }}
                />
              </div>

              <div className="gap-legend">
                <span className="legend-dot essential" />
                <span>{essentialHave}/{essential.length} essential</span>
                <span className="legend-dot preferred" />
                <span>{preferredHave}/{preferred.length} preferred</span>
              </div>
            </div>

            <div className="gap-ring-wrap">
              <svg viewBox="0 0 90 90" width="90" height="90">
                <circle cx="45" cy="45" r="38" fill="none" stroke="var(--border)" strokeWidth="7" />
                <circle
                  cx="45" cy="45" r="38"
                  fill="none"
                  stroke={pctGradientSvg(weightedScore)}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 38}`}
                  strokeDashoffset={`${2 * Math.PI * 38 * (1 - weightedScore / 100)}`}
                  transform="rotate(-90 45 45)"
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                />
              </svg>
              <span className="ring-pct" style={{ color: pctColor(weightedScore) }}>
                {weightedScore}%
              </span>
            </div>
          </div>

          {/* Essential skills */}
          {essential.length > 0 && (
            <div className="gap-section">
              <div className="gap-section-header">
                <span className="gap-section-title">Essential Skills</span>
                <span className="gap-section-badge">{essentialHave}/{essential.length} matched</span>
              </div>
              <div className="gap-grid">
                {essential.map(g => <SkillCard key={g.name} gap={g} />)}
              </div>
            </div>
          )}

          {/* Preferred skills */}
          {preferred.length > 0 && (
            <div className="gap-section">
              <div className="gap-section-header">
                <span className="gap-section-title">Preferred Skills</span>
                <span className="gap-section-badge">{preferredHave}/{preferred.length} matched</span>
              </div>
              <div className="gap-grid">
                {preferred.map(g => <SkillCard key={g.name} gap={g} />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!analyzing && !analyzedRole && !loadingPage && (
        <div className="empty-state">
          <span>◎</span>
          <p>Type a job role above and click <strong>Analyze Role</strong> to get started.</p>
        </div>
      )}

      {/* Cached role with no requirements loaded (user needs to re-analyze) */}
      {!analyzing && analyzedRole && requirements.length === 0 && !loadingPage && (
        <div className="reanalyze-prompt">
          <p>Click <strong>Analyze Role</strong> to generate requirements for <em>{analyzedRole}</em>.</p>
        </div>
      )}
    </div>
  )
}

function SkillCard({ gap }) {
  return (
    <div className={`skill-gap-card ${gap.have ? 'have' : 'missing'}`}>
      <div className="sgc-top">
        <span className={`sgc-status-dot ${gap.have ? 'have' : 'missing'}`} />
        <span className="sgc-name">{gap.name}</span>
        {gap.have && (
          <span className="sgc-level">Lv {gap.level}</span>
        )}
      </div>
      <div className="sgc-bottom">
        <span className="sgc-category">{gap.category}</span>
        <span className={`sgc-status-text ${gap.have ? 'have' : 'missing'}`}>
          {gap.have ? '✓ You have this' : '✗ Missing'}
        </span>
      </div>
    </div>
  )
}

function pctColor(pct) {
  if (pct >= 70) return 'var(--success)'
  if (pct >= 40) return 'var(--warning)'
  return 'var(--danger)'
}

function pctGradient(pct) {
  if (pct >= 70) return 'linear-gradient(90deg, #4ade80, #22c55e)'
  if (pct >= 40) return 'linear-gradient(90deg, #fbbf24, #f59e0b)'
  return 'linear-gradient(90deg, #f87171, #ef4444)'
}

function pctGradientSvg(pct) {
  if (pct >= 70) return '#4ade80'
  if (pct >= 40) return '#fbbf24'
  return '#f87171'
}
