import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { CATEGORIES, orderedCategories, displayCategory } from '../lib/categories'
import CVScanner from './CVScanner'
import './Skills.css'

function wordOverlap(a, b) {
  const words = s => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean))
  const wa = words(a), wb = words(b)
  const shared = [...wa].filter(w => wb.has(w)).length
  return shared / Math.max(wa.size, wb.size)
}

export default function Skills() {
  const { user } = useAuth()
  const [skills,    setSkills]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [skillName, setSkillName] = useState('')
  const [category,  setCategory]  = useState('Technical')
  const [level,     setLevel]     = useState(3)
  const [saving,    setSaving]    = useState(false)
  const [dupMessage, setDupMessage] = useState('')

  const [isMobile,       setIsMobile]       = useState(() => window.innerWidth < 768)
  const [activeSkillTab, setActiveSkillTab] = useState('skills')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (user) loadSkills()
  }, [user])

  async function loadSkills() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('skills')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      setSkills(data ?? [])
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!skillName.trim()) return
    setSaving(true)
    setDupMessage('')

    const typed = skillName.trim()
    let name = typed, esco_uri = null, esco_label = null

    // ESCO skill lookup — normalize the name to the canonical ESCO label
    try {
      const escoRes = await fetch('/api/esco-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: typed, type: 'skill', limit: 1 }),
      })
      if (escoRes.ok) {
        const escoData = await escoRes.json()
        const first = escoData.results?.[0]
        if (first) {
          name       = first.preferredLabel?.en ?? typed
          esco_uri   = first.uri               ?? null
          esco_label = first.preferredLabel?.en ?? null
        }
      }
    } catch {
      // ESCO unreachable — save with the typed name as-is
    }

    // Deduplication against existing skills (same rules as Journal/Experiences)
    const isDuplicate =
      skills.some(s => s.name.toLowerCase() === name.toLowerCase()) ||
      (esco_uri && skills.some(s => s.esco_uri === esco_uri)) ||
      skills.some(s => wordOverlap(name, s.name) > 0.6)

    if (isDuplicate) {
      setDupMessage('Similar skill already in your profile')
      setSaving(false)
      return
    }

    await supabase.from('skills').insert({
      user_id: user.id,
      name,
      category,
      level: Number(level),
      esco_uri,
      esco_label,
    })
    setSkillName('')
    setLevel(3)
    await loadSkills()
    setSaving(false)
  }

  async function deleteSkill(id) {
    await supabase.from('skills').delete().eq('id', id)
    setSkills(prev => prev.filter(s => s.id !== id))
  }

  const cats    = orderedCategories(skills)
  const grouped = Object.fromEntries(
    cats.map(cat => [cat, skills.filter(s => displayCategory(s.category) === cat)])
  )

  // Mobile CV Scanner tab — render full CVScanner inside the tab shell
  if (isMobile && activeSkillTab === 'cv') {
    return (
      <div className="page">
        <div className="skills-mobile-tabs">
          <button className="smt-tab" onClick={() => setActiveSkillTab('skills')}>◉ My Skills</button>
          <button className="smt-tab active">▤ CV Scanner</button>
        </div>
        <div className="skills-cv-tab-content">
          <CVScanner />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {/* Mobile-only tab switcher — hidden on desktop via CSS */}
      {isMobile && (
        <div className="skills-mobile-tabs">
          <button className="smt-tab active">◉ My Skills</button>
          <button className="smt-tab" onClick={() => setActiveSkillTab('cv')}>▤ CV Scanner</button>
        </div>
      )}

      <div className="page-header">
        <h1 className="page-title">My Skills</h1>
        <p className="page-subtitle">Track your competencies and proficiency levels.</p>
      </div>

      <form onSubmit={handleAdd} className="skill-form">
        <input
          className="skill-input"
          type="text"
          placeholder="Skill name (e.g. React, SQL, Leadership)"
          value={skillName}
          onChange={e => setSkillName(e.target.value)}
          required
        />
        {/* Desktop: standard select */}
        <select
          className="skill-select"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Mobile: tappable chip selector */}
        <div className="skill-cat-chips">
          {CATEGORIES.map(c => (
            <button
              key={c}
              type="button"
              className={`skill-cat-chip ${category === c ? 'active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="level-picker">
          <span className="level-label">Level: <strong>{level}</strong>/5</span>
          <input
            type="range"
            min={1} max={5}
            value={level}
            onChange={e => setLevel(e.target.value)}
            className="level-range"
          />
        </div>
        <button type="submit" className="btn-primary" disabled={saving || !skillName.trim()}>
          {saving ? 'Adding…' : '+ Add Skill'}
        </button>
        {dupMessage && (
          <p style={{ fontSize: '13px', color: 'var(--danger)', marginTop: '4px' }}>{dupMessage}</p>
        )}
      </form>

      {loading ? (
        <div className="loading-text">Loading…</div>
      ) : skills.length === 0 ? (
        <div className="empty-state">
          <span>◉</span>
          <p>No skills yet. Add your first skill above.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="skill-group">
            <h2 className="skill-group-title">{cat}</h2>
            <div className="skills-grid">
              {items.map(skill => (
                <div key={skill.id} className="skill-card">
                  <div className="skill-card-top">
                    <span className="skill-name">{skill.name}</span>
                    <button className="delete-btn" onClick={() => deleteSkill(skill.id)}>×</button>
                  </div>
                  <div className="skill-bar-track">
                    <div
                      className="skill-bar-fill"
                      style={{ width: `${(skill.level / 5) * 100}%` }}
                    />
                  </div>
                  <span className="skill-level-text">Level {skill.level} / 5</span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
