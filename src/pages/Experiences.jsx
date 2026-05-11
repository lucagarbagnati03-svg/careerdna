import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { extractSkillsFromText } from '../lib/groq'
import './Experiences.css'

const EMPTY_FORM = { company: '', title: '', start_date: '', end_date: '', description: '' }

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 40 }, (_, i) => CURRENT_YEAR - i)

// Full date picker with independent local state per field.
// value = "YYYY-MM-DD" | "". onChange is only called when all three are filled.
// A ref tracks the last value we emitted so we can distinguish an external reset
// (parent sets value="") from a partial-selection state (we never emitted).
function DatePicker({ value, onChange, required }) {
  const [day,   setDay]   = useState('')
  const [month, setMonth] = useState('')
  const [year,  setYear]  = useState('')
  const lastEmitted = useRef('')

  // Sync only on genuine external changes:
  // - external reset (parent sets value="" after a successful emission)
  // - external pre-fill (parent sets a complete date)
  useEffect(() => {
    if (!value && lastEmitted.current !== '') {
      // External reset — clear fields
      setDay(''); setMonth(''); setYear('')
      lastEmitted.current = ''
    } else if (value && value !== lastEmitted.current && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      // External pre-fill or update
      const [y, m, d] = value.split('-')
      setYear(y); setMonth(m); setDay(d)
      lastEmitted.current = value
    }
    // If value="" but lastEmitted="" too, this is just the initial mount — do nothing.
  }, [value])

  function emit(d, m, y) {
    if (d && m && y) {
      const full = `${y}-${m}-${d}`
      lastEmitted.current = full
      onChange(full)
    }
    // Deliberately do NOT call onChange('') for partial selections —
    // that would cause the parent to set value="" which clears local state.
  }

  const daysInMonth = (month && year)
    ? new Date(Number(year), Number(month), 0).getDate()
    : 31
  const days = Array.from({ length: daysInMonth }, (_, i) =>
    String(i + 1).padStart(2, '0')
  )

  function handleDay(d) {
    setDay(d)
    emit(d, month, year)
  }

  function handleMonth(m) {
    // Clamp day when the new month has fewer days
    const maxDay = new Date(Number(year || 2000), Number(m), 0).getDate()
    const clampedDay = day && Number(day) > maxDay ? String(maxDay).padStart(2, '0') : day
    setMonth(m)
    if (clampedDay !== day) setDay(clampedDay)
    emit(clampedDay, m, year)
  }

  function handleYear(y) {
    // Clamp day for the new year (leap-year edge case)
    const maxDay = month ? new Date(Number(y), Number(month), 0).getDate() : 31
    const clampedDay = day && Number(day) > maxDay ? String(maxDay).padStart(2, '0') : day
    setYear(y)
    if (clampedDay !== day) setDay(clampedDay)
    emit(clampedDay, month, y)
  }

  return (
    <div className="date-picker">
      <select value={day} onChange={e => handleDay(e.target.value)}
        required={required} className="day-select">
        <option value="">Day</option>
        {days.map(d => <option key={d} value={d}>{Number(d)}</option>)}
      </select>
      <select value={month} onChange={e => handleMonth(e.target.value)}
        required={required} className="month-select">
        <option value="">Month</option>
        {MONTHS.map((m, i) => (
          <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
        ))}
      </select>
      <select value={year} onChange={e => handleYear(e.target.value)}
        required={required} className="year-select">
        <option value="">Year</option>
        {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </div>
  )
}

export default function Experiences() {
  const { user } = useAuth()
  const [experiences, setExperiences] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [extracting, setExtracting] = useState({})   // id → 'loading' | { added, skills } | 'error'
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (user) loadExperiences()
  }, [user])

  async function loadExperiences() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('experiences')
        .select('*')
        .eq('user_id', user.id)
        .order('start_date', { ascending: false })
      if (!error) setExperiences(data ?? [])
    } finally {
      setLoading(false)
    }
  }

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.company.trim() || !form.title.trim() || !form.start_date) return
    setSaving(true)
    setError('')

    const { data, error } = await supabase
      .from('experiences')
      .insert({
        user_id: user.id,
        company: form.company.trim(),
        title: form.title.trim(),
        start_date: form.start_date,
        end_date: form.end_date || null,
        description: form.description.trim() || null,
      })
      .select()
      .single()

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    const newExp = data
    setExperiences(prev => [newExp, ...prev])
    setForm(EMPTY_FORM)
    setShowForm(false)
    setSaving(false)

    // Auto-extract skills from description if provided
    if (newExp.description) {
      extractSkillsForExperience(newExp)
    }
  }

  async function extractSkillsForExperience(exp) {
    setExtracting(prev => ({ ...prev, [exp.id]: 'loading' }))
    try {
      const context = `${exp.title} at ${exp.company}: ${exp.description}`
      const skills = await extractSkillsFromText(context)

      if (skills.length === 0) {
        setExtracting(prev => ({ ...prev, [exp.id]: { added: 0, skills: [] } }))
        return
      }

      const { data: existing } = await supabase
        .from('skills')
        .select('name')
        .eq('user_id', user.id)

      const existingNames = new Set((existing ?? []).map(s => s.name.toLowerCase()))
      const newSkills = skills.filter(s => !existingNames.has(s.name.toLowerCase()))

      if (newSkills.length > 0) {
        await supabase.from('skills').insert(
          newSkills.map(s => ({ ...s, user_id: user.id }))
        )
      }

      setExtracting(prev => ({
        ...prev,
        [exp.id]: { added: newSkills.length, skills: newSkills },
      }))
    } catch (err) {
      console.error(err)
      setExtracting(prev => ({ ...prev, [exp.id]: 'error' }))
    }
  }

  async function deleteExperience(id) {
    await supabase.from('experiences').delete().eq('id', id)
    setExperiences(prev => prev.filter(e => e.id !== id))
  }

  function formatDateRange(start, end) {
    const fmt = iso => {
      const [y, m] = iso.split('-')
      return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    }
    return `${fmt(start)} — ${end ? fmt(end) : 'Present'}`
  }

  function duration(start, end) {
    const s = new Date(start)
    const e = end ? new Date(end) : new Date()
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
    if (months < 12) return `${months}mo`
    const y = Math.floor(months / 12)
    const m = months % 12
    return m > 0 ? `${y}y ${m}mo` : `${y}y`
  }

  return (
    <div className="page">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Past Experiences</h1>
          <p className="page-subtitle">Document your work history. AI extracts skills automatically.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ Add Experience'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="exp-form">
          <div className="exp-form-row">
            <div className="exp-field">
              <label>Company *</label>
              <input
                type="text"
                placeholder="e.g. Marriott Hotels"
                value={form.company}
                onChange={e => setField('company', e.target.value)}
                required
              />
            </div>
            <div className="exp-field">
              <label>Job Title *</label>
              <input
                type="text"
                placeholder="e.g. Front Office Manager"
                value={form.title}
                onChange={e => setField('title', e.target.value)}
                required
              />
            </div>
          </div>
          <div className="exp-form-row">
            <div className="exp-field">
              <label>Start Date *</label>
              <DatePicker
                value={form.start_date}
                onChange={v => setField('start_date', v)}
                required
              />
            </div>
            <div className="exp-field">
              <label>End Date <span className="optional">(leave blank if current)</span></label>
              <DatePicker
                value={form.end_date}
                onChange={v => setField('end_date', v)}
              />
            </div>
          </div>
          <div className="exp-field">
            <label>What did you do? <span className="optional">(used for skill extraction)</span></label>
            <textarea
              placeholder="Describe your responsibilities, achievements, and what you worked on. The more detail, the better the skill extraction."
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              rows={4}
            />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <div className="exp-form-actions">
            <button type="submit" className="btn-primary" disabled={saving || !form.company || !form.title || !form.start_date}>
              {saving ? 'Saving…' : 'Save Experience'}
            </button>
          </div>
        </form>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="loading-text">Loading…</div>
      ) : experiences.length === 0 && !showForm ? (
        <div className="empty-state">
          <span>◑</span>
          <p>No experiences yet. Add your work history above.</p>
        </div>
      ) : (
        <div className="timeline">
          {experiences.map((exp, idx) => {
            const extState = extracting[exp.id]
            return (
              <div key={exp.id} className="timeline-item">
                <div className="timeline-line-wrap">
                  <div className="timeline-dot" />
                  {idx < experiences.length - 1 && <div className="timeline-line" />}
                </div>
                <div className="exp-card">
                  <div className="exp-card-header">
                    <div className="exp-card-meta">
                      <div className="exp-title-row">
                        <span className="exp-job-title">{exp.title}</span>
                        <span className="exp-duration">{duration(exp.start_date, exp.end_date)}</span>
                      </div>
                      <div className="exp-company">{exp.company}</div>
                      <div className="exp-dates">{formatDateRange(exp.start_date, exp.end_date)}</div>
                    </div>
                    <button className="delete-btn" onClick={() => deleteExperience(exp.id)} title="Delete">×</button>
                  </div>

                  {exp.description && (
                    <p className="exp-description">{exp.description}</p>
                  )}

                  {/* Skill extraction status */}
                  <div className="exp-skills-row">
                    {!extState && exp.description && (
                      <button
                        className="extract-btn"
                        onClick={() => extractSkillsForExperience(exp)}
                      >
                        ✦ Extract Skills
                      </button>
                    )}
                    {!extState && !exp.description && (
                      <span className="exp-no-desc">Add a description to extract skills</span>
                    )}
                    {extState === 'loading' && (
                      <span className="exp-extracting">
                        <span className="spinner" /> Extracting skills…
                      </span>
                    )}
                    {extState && extState !== 'loading' && extState !== 'error' && (
                      <div className="extract-result">
                        {extState.added === 0 ? (
                          <span className="extract-none">No new skills found</span>
                        ) : (
                          <>
                            <span className="extract-count">+{extState.added} skills added:</span>
                            {extState.skills.map(s => (
                              <span key={s.name} className="extract-tag">{s.name}</span>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                    {extState === 'error' && (
                      <span className="extract-error">Extraction failed</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
