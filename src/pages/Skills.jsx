import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { CATEGORIES, orderedCategories, displayCategory } from '../lib/categories'
import CVScanner from './CVScanner'
import './Skills.css'

export default function Skills() {
  const { user } = useAuth()
  const [skills,    setSkills]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [skillName, setSkillName] = useState('')
  const [category,  setCategory]  = useState('Technical')
  const [level,     setLevel]     = useState(3)
  const [saving,    setSaving]    = useState(false)

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
    await supabase.from('skills').insert({
      user_id: user.id,
      name: skillName.trim(),
      category,
      level: Number(level),
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
