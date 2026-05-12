import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import {
  analyzeInterviewProfile,
  generateInterviewQuestions,
  evaluateInterviewAnswer,
  sleep,
} from '../lib/groq'
import './InterviewPrep.css'

// Normalize role: always lowercase + trimmed, everywhere in the app
const norm = r => (r ?? '').toLowerCase().trim()

function scoreColor(n) {
  if (n >= 8) return 'var(--success)'
  if (n >= 5) return 'var(--warning)'
  return 'var(--danger)'
}
function scoreBg(n) {
  if (n >= 8) return 'rgba(74,222,128,0.12)'
  if (n >= 5) return 'rgba(251,191,36,0.12)'
  return 'rgba(248,113,113,0.12)'
}
function readinessColor(n) {
  if (n >= 70) return 'var(--success)'
  if (n >= 40) return 'var(--warning)'
  return 'var(--danger)'
}

function calcReadiness(skills = [], experiences = [], sessions = [], cvUploaded = false) {
  const skillPts = Math.min(skills.length * 2, 25)
  const expPts   = Math.min(experiences.length * 8, 20)
  const cvPts    = cvUploaded ? 5 : 0
  const base     = skillPts + expPts + cvPts
  const bonus    = Math.min(
    sessions.reduce((sum, s) => {
      if ((s.score ?? 0) >= 7) return sum + 2
      if ((s.score ?? 0) >= 5) return sum + 1
      return sum
    }, 0), 30
  )
  const raw    = base + bonus
  const capped = sessions.length === 0 ? Math.min(raw, 55) : Math.min(raw, 95)
  return Math.max(0, capped)
}

function readinessMessage(score) {
  if (score >= 75) return 'Great preparation! Keep practicing to maintain your edge.'
  if (score >= 60) return 'Good progress — a few more practice sessions will sharpen your readiness.'
  return 'Complete more practice sessions to increase your readiness score.'
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function LoadingCard({ label }) {
  return (
    <div className="ip-loading-card">
      <span className="ip-loading-spinner" />
      <span className="ip-loading-label">{label}</span>
    </div>
  )
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="ip-section-header">
      <div className="ip-section-header-left">
        <h2 className="ip-section-title">{title}</h2>
        {subtitle && <span className="ip-section-subtitle">{subtitle}</span>}
      </div>
      {action}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function InterviewPrep() {
  const { user } = useAuth()
  const practiceRef = useRef(null)

  const [tab, setTab] = useState('prep')

  // Profile
  const [profile, setProfile]         = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [cvUploaded, setCvUploaded]   = useState(false)

  // Per-role cache: { "lawyer": { analysis, questions, readiness }, ... }
  const [roleData, setRoleData]       = useState({})
  const [activeRole, setActiveRole]   = useState('')
  const [allRoles, setAllRoles]       = useState([])

  // Analysis
  const [analysis, setAnalysis]               = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError]     = useState('')

  // Questions
  const [questions, setQuestions]               = useState([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [questionsError, setQuestionsError]     = useState('')

  // Practice
  const [activeQ, setActiveQ]     = useState(null)
  const [answer, setAnswer]       = useState('')
  const [evaluating, setEvaluating] = useState(false)
  const [feedback, setFeedback]   = useState(null)
  const [evalError, setEvalError] = useState('')

  // Sessions (all roles — filtered in UI)
  const [sessions, setSessions]               = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [expandedSession, setExpandedSession] = useState(null)

  useEffect(() => {
    if (!user) return
    loadProfile()
    loadSessions()
  }, [user])

  // ── Persist per-role data ───────────────────────────────────────────────────
  // Returns the updated roleData object so callers can chain without waiting for
  // the React state flush.
  async function persistRoleData(role, patch, currentRd) {
    const updated = {
      ...currentRd,
      [role]: { ...(currentRd[role] ?? {}), ...patch },
    }
    setRoleData(updated)
    await supabase.from('user_preferences')
      .upsert({ user_id: user.id, role_data: updated }, { onConflict: 'user_id' })
    return updated
  }

  // ── Load profile + determine initial role ───────────────────────────────────
  async function loadProfile() {
    setProfileLoading(true)
    let p, rd, initialRole
    try {
      const [
        { data: skillsData },
        { data: expData },
        { data: pref },
        { data: cvData },
        { data: sessionRolesData },
      ] = await Promise.all([
        supabase.from('skills').select('name, category, level').eq('user_id', user.id),
        supabase.from('experiences')
          .select('company, title, description, start_date, end_date')
          .eq('user_id', user.id).order('start_date', { ascending: false }),
        supabase.from('user_preferences')
          .select('target_role, role_data')
          .eq('user_id', user.id).maybeSingle(),
        supabase.from('user_cv').select('user_id').eq('user_id', user.id).maybeSingle(),
        supabase.from('interview_sessions')
          .select('target_role').eq('user_id', user.id).not('target_role', 'is', null),
      ])

      setCvUploaded(!!cvData)
      rd = pref?.role_data ?? {}
      setRoleData(rd)

      p = {
        skills:      skillsData ?? [],
        experiences: expData ?? [],
        targetRole:  norm(pref?.target_role),
      }
      setProfile(p)

      // All known roles = profile target + distinct practiced roles
      const practicedSet = new Set(
        (sessionRolesData ?? []).map(s => norm(s.target_role)).filter(Boolean)
      )
      const known = [...new Set([
        ...(p.targetRole ? [p.targetRole] : []),
        ...practicedSet,
      ])]
      setAllRoles(known)

      initialRole = p.targetRole || known[0] || ''
      setActiveRole(initialRole)
    } finally {
      setProfileLoading(false)
    }

    if (!p || !initialRole) return
    await loadRoleContent(initialRole, p, rd)
  }

  // ── Load or generate analysis + questions for a role ───────────────────────
  async function loadRoleContent(role, p, rd) {
    if (!role) return

    setAnalysis(null)
    setAnalysisError('')
    setQuestions([])
    setQuestionsError('')
    setActiveQ(null)
    setFeedback(null)

    const cached     = rd[role] ?? {}
    let   currentRd  = rd

    // Analysis
    if (cached.analysis) {
      setAnalysis(cached.analysis)
    } else {
      setAnalysisLoading(true)
      try {
        const a = await analyzeInterviewProfile({ ...p, targetRole: role })
        setAnalysis(a)
        currentRd = await persistRoleData(role, { analysis: a }, currentRd)
      } catch (err) {
        setAnalysisError(err.message)
      }
      setAnalysisLoading(false)
    }

    // Questions
    if (cached.questions?.length) {
      setQuestions(cached.questions)
    } else {
      setQuestionsLoading(true)
      if (!cached.analysis) await sleep(2500)   // rate-limit guard between two Groq calls
      try {
        const q = await generateInterviewQuestions({ ...p, targetRole: role })
        setQuestions(q)
        await persistRoleData(role, { questions: q }, currentRd)
      } catch (err) {
        setQuestionsError(err.message)
      }
      setQuestionsLoading(false)
    }
  }

  async function handleRoleChange(newRole) {
    if (newRole === activeRole || analysisLoading || questionsLoading) return
    setActiveRole(newRole)
    setExpandedSession(null)
    await loadRoleContent(newRole, profile, roleData)
  }

  // ── Sessions ────────────────────────────────────────────────────────────────
  async function loadSessions() {
    setSessionsLoading(true)
    try {
      const { data } = await supabase
        .from('interview_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(60)
      setSessions(data ?? [])
    } finally {
      setSessionsLoading(false)
    }
  }

  // ── Regenerate questions ────────────────────────────────────────────────────
  async function regenerate() {
    if (!profile || !activeRole) return
    setQuestionsLoading(true)
    setQuestionsError('')
    setQuestions([])
    setActiveQ(null)
    setFeedback(null)
    try {
      const q = await generateInterviewQuestions({ ...profile, targetRole: activeRole })
      setQuestions(q)
      await persistRoleData(activeRole, { questions: q }, roleData)
    } catch (err) {
      setQuestionsError(err.message)
    }
    setQuestionsLoading(false)
  }

  // ── Practice ────────────────────────────────────────────────────────────────
  function openPractice(q) {
    setActiveQ(q)
    setAnswer('')
    setFeedback(null)
    setEvalError('')
    setTimeout(() => practiceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  async function submitAnswer() {
    if (!answer.trim() || !activeQ || !activeRole) return
    setEvaluating(true)
    setEvalError('')
    setFeedback(null)
    try {
      const fb = await evaluateInterviewAnswer(activeQ.question, answer, activeRole)
      setFeedback(fb)

      await supabase.from('interview_sessions').insert({
        user_id:     user.id,
        target_role: activeRole,           // always normalized
        question:    activeQ.question,
        user_answer: answer,
        score:       fb.score,
        feedback:    fb,
      })

      // Recalculate readiness for this role only
      const roleSessions = [
        ...sessions.filter(s => norm(s.target_role) === activeRole),
        { score: fb.score },
      ]
      const newReadiness = calcReadiness(
        profile?.skills, profile?.experiences, roleSessions, cvUploaded
      )
      await persistRoleData(activeRole, { readiness: newReadiness }, roleData)

      // Add to known roles if first session for a new role
      setAllRoles(prev => prev.includes(activeRole) ? prev : [...prev, activeRole])

      loadSessions()
    } catch (err) {
      setEvalError(err.message)
    } finally {
      setEvaluating(false)
    }
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const filteredSessions = sessions.filter(s => norm(s.target_role) === activeRole)
  const readiness = calcReadiness(
    profile?.skills, profile?.experiences, filteredSessions, cvUploaded
  )
  const noData = profile && profile.skills.length === 0 && profile.experiences.length === 0

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page ip-page">

      {/* ── Mode tabs ── */}
      <div className="ip-mode-tabs">
        <button className={`ip-mode-tab ${tab === 'prep' ? 'active' : ''}`} onClick={() => setTab('prep')}>
          <span>◇</span> Prep Mode
        </button>
        <button className={`ip-mode-tab ${tab === 'live' ? 'active' : ''}`} onClick={() => setTab('live')}>
          <span>◈</span> Live Simulation
          <span className="ip-soon-badge">Soon</span>
        </button>
      </div>

      {/* ══ LIVE SIMULATION placeholder ══ */}
      {tab === 'live' && (
        <div className="ip-coming-soon">
          <div className="ip-cs-icon">◈</div>
          <h2 className="ip-cs-title">Live Simulation — Coming Soon</h2>
          <p className="ip-cs-sub">
            A real-time AI interviewer that asks follow-up questions, adapts to your answers,
            and gives a full debrief at the end. Switch to Prep Mode to get started now.
          </p>
          <button className="btn-primary ip-cs-btn" onClick={() => setTab('prep')}>
            Go to Prep Mode →
          </button>
        </div>
      )}

      {/* ══ PREP MODE ══ */}
      {tab === 'prep' && (
        <>
          {/* ── Role selector ── */}
          {!profileLoading && allRoles.length > 0 && (
            <div className="ip-role-bar">
              <span className="ip-role-bar-label">Role:</span>
              <div className="ip-role-chips">
                {allRoles.map(r => (
                  <button
                    key={r}
                    className={`ip-role-chip ${activeRole === r ? 'active' : ''}`}
                    onClick={() => handleRoleChange(r)}
                    disabled={analysisLoading || questionsLoading}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notices */}
          {!profileLoading && profile && !profile.targetRole && allRoles.length === 0 && (
            <div className="ip-notice">
              <span>◎</span>
              <div>
                <strong>No target role set</strong> — set one on the Skill Gap page to get personalized analysis.
                <Link to="/skill-gap" className="ip-notice-link"> Set a target role →</Link>
              </div>
            </div>
          )}
          {!profileLoading && noData && (
            <div className="ip-notice warn">
              <span>✦</span>
              <div>
                Add skills, experiences, or journal entries to get personalized questions.
                <Link to="/skills" className="ip-notice-link"> Add Skills →</Link>
              </div>
            </div>
          )}

          {/* ── STEP 1: Profile Analysis ── */}
          <div className="ip-section">
            <SectionHeader title="Profile Analysis" />

            {profileLoading || analysisLoading ? (
              <LoadingCard label={profileLoading
                ? 'Loading your profile…'
                : `AI is analyzing your profile for "${activeRole}" — this takes a few seconds…`}
              />
            ) : analysisError ? (
              <div className="ip-error">{analysisError}</div>
            ) : analysis ? (
              <div className="ip-analysis-card">
                {/* Readiness score */}
                <div className="ip-readiness">
                  <div className="ip-readiness-left">
                    <div className="ip-readiness-label">
                      Readiness score{activeRole ? ` for ${activeRole}` : ''}
                    </div>
                    <div className="ip-readiness-score" style={{ color: readinessColor(readiness) }}>
                      {readiness}
                      <span className="ip-readiness-max">/100</span>
                    </div>
                    <div className="ip-readiness-bar-track">
                      <div
                        className="ip-readiness-bar-fill"
                        style={{
                          width: `${readiness}%`,
                          background: readiness >= 70
                            ? 'linear-gradient(90deg,#4ade80,#22c55e)'
                            : readiness >= 40
                              ? 'linear-gradient(90deg,#fbbf24,#f59e0b)'
                              : 'linear-gradient(90deg,#f87171,#ef4444)',
                        }}
                      />
                    </div>
                    <p className="ip-readiness-message">{readinessMessage(readiness)}</p>
                  </div>
                </div>

                {/* Strengths + Improvements */}
                <div className="ip-analysis-cols">
                  <div className="ip-analysis-col strengths">
                    <div className="ip-col-header">
                      <span className="ip-col-dot green" />Your Strengths
                    </div>
                    <ul className="ip-list">
                      {analysis.strengths.map((s, i) => (
                        <li key={i} className="ip-list-item green">{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="ip-analysis-col improvements">
                    <div className="ip-col-header">
                      <span className="ip-col-dot amber" />Areas to Improve
                    </div>
                    <ul className="ip-list">
                      {analysis.improvements.map((s, i) => (
                        <li key={i} className="ip-list-item amber">{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Tip */}
                <div className="ip-tip">
                  <span className="ip-tip-icon">◆</span>
                  <div>
                    <div className="ip-tip-label">Interview Tip</div>
                    <p className="ip-tip-text">{analysis.tip}</p>
                  </div>
                </div>
              </div>
            ) : !profileLoading && !activeRole ? (
              <div className="ip-empty">
                <span>◎</span>
                <p>Select or set a role to see your profile analysis.</p>
              </div>
            ) : null}
          </div>

          {/* ── STEP 2: Likely Questions ── */}
          <div className="ip-section">
            <SectionHeader
              title="Likely Interview Questions"
              subtitle="All answers are evaluated using the STAR method (Situation · Task · Action · Result)"
              action={
                !questionsLoading && questions.length > 0 && (
                  <button className="ip-regen-btn" onClick={regenerate}>↻ Regenerate</button>
                )
              }
            />

            {profileLoading || questionsLoading ? (
              <LoadingCard label={
                analysisLoading || profileLoading
                  ? 'Preparing questions after analysis…'
                  : `AI is generating interview questions for "${activeRole}" — almost there…`
              } />
            ) : questionsError ? (
              <div className="ip-error">{questionsError}</div>
            ) : questions.length > 0 ? (
              <div className="ip-questions-list">
                {questions.map((q, i) => (
                  <div
                    key={i}
                    className={`ip-question-card ${activeQ?.question === q.question ? 'active' : ''}`}
                  >
                    <div className="ip-q-left">
                      <span className="ip-q-num">{i + 1}</span>
                      <div className="ip-q-body">
                        <span className={`ip-q-type-badge ${q.type}`}>{q.type}</span>
                        <p className="ip-q-text">{q.question}</p>
                      </div>
                    </div>
                    <button
                      className={`ip-practice-btn ${activeQ?.question === q.question ? 'active' : ''}`}
                      onClick={() => openPractice(q)}
                    >
                      {activeQ?.question === q.question ? 'Practicing' : 'Practice This →'}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* ── STEP 3: Guided Practice ── */}
          {activeQ && (
            <div className="ip-section ip-practice-section" ref={practiceRef}>
              <SectionHeader title="Guided Practice" />
              <div className="ip-practice-question">
                <span className={`ip-q-type-badge ${activeQ.type}`}>{activeQ.type}</span>
                <p className="ip-practice-q-text">{activeQ.question}</p>
              </div>

              <textarea
                className="ip-answer-textarea"
                placeholder="Write your full answer here…"
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                rows={7}
                disabled={evaluating}
              />

              {evalError && <div className="ip-error">{evalError}</div>}

              <div className="ip-practice-actions">
                <button
                  className="btn-primary ip-submit-btn"
                  onClick={submitAnswer}
                  disabled={evaluating || !answer.trim()}
                >
                  {evaluating
                    ? <><span className="ip-inline-spinner" /> Evaluating…</>
                    : 'Get AI Feedback →'}
                </button>
                <button className="btn-outline" onClick={() => { setActiveQ(null); setFeedback(null) }}>
                  Close
                </button>
              </div>

              {feedback && (
                <div className="ip-feedback">
                  <div className="ip-feedback-score-row">
                    <div
                      className="ip-score-badge"
                      style={{ color: scoreColor(feedback.score), background: scoreBg(feedback.score) }}
                    >
                      {feedback.score}<span className="ip-score-denom">/10</span>
                    </div>
                    <div className="ip-score-label">
                      {feedback.score >= 8 ? 'Strong answer' : feedback.score >= 5 ? 'Good start, needs work' : 'Needs significant improvement'}
                    </div>
                  </div>
                  <div className="ip-fb-block good">
                    <div className="ip-fb-label">✓ What went well</div>
                    <p>{feedback.good}</p>
                  </div>
                  <div className="ip-fb-block missing">
                    <div className="ip-fb-label">⚠ What was missing</div>
                    <p>{feedback.missing}</p>
                  </div>
                  <div className="ip-fb-block improve">
                    <div className="ip-fb-label">◆ How to improve</div>
                    <p>{feedback.improve}</p>
                  </div>
                  <div className="ip-fb-rewrite">
                    <div className="ip-fb-label">Example strong answer</div>
                    <p>{feedback.rewrite}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4: Past Sessions (filtered by active role) ── */}
          <div className="ip-section">
            <SectionHeader
              title="Past Practice Sessions"
              action={
                activeRole && (
                  <span className="ip-sessions-role-badge">{activeRole}</span>
                )
              }
            />

            {sessionsLoading ? (
              <LoadingCard label="Loading your session history…" />
            ) : filteredSessions.length === 0 ? (
              <div className="ip-empty">
                <span>◇</span>
                <p>
                  {activeRole
                    ? `No practice sessions for "${activeRole}" yet. Click "Practice This" above to start.`
                    : 'No practice sessions yet.'}
                </p>
              </div>
            ) : (
              <div className="ip-sessions-list">
                {filteredSessions.map(s => (
                  <div key={s.id} className="ip-session-card">
                    <div
                      className="ip-session-header"
                      onClick={() => setExpandedSession(expandedSession === s.id ? null : s.id)}
                    >
                      <div
                        className="ip-session-score"
                        style={{ color: scoreColor(s.score), background: scoreBg(s.score) }}
                      >
                        {s.score}/10
                      </div>
                      <div className="ip-session-meta">
                        <p className="ip-session-q">
                          {s.question?.slice(0, 90)}{s.question?.length > 90 ? '…' : ''}
                        </p>
                      </div>
                      <div className="ip-session-right">
                        <span className="ip-session-date">{fmtDate(s.created_at)}</span>
                        <span className="ip-session-chevron">{expandedSession === s.id ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {expandedSession === s.id && (
                      <div className="ip-session-body">
                        <div className="ip-session-section">
                          <div className="ip-session-label">Your answer</div>
                          <p className="ip-session-text">{s.user_answer}</p>
                        </div>
                        {s.feedback && (
                          <>
                            <div className="ip-session-section good">
                              <div className="ip-session-label">✓ What went well</div>
                              <p className="ip-session-text">{s.feedback.good}</p>
                            </div>
                            <div className="ip-session-section missing">
                              <div className="ip-session-label">⚠ What was missing</div>
                              <p className="ip-session-text">{s.feedback.missing}</p>
                            </div>
                            <div className="ip-session-section improve">
                              <div className="ip-session-label">◆ How to improve</div>
                              <p className="ip-session-text">{s.feedback.improve}</p>
                            </div>
                            {s.feedback.rewrite && (
                              <div className="ip-session-section rewrite">
                                <div className="ip-session-label">✦ Example Answer</div>
                                <p className="ip-session-text">{s.feedback.rewrite}</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
