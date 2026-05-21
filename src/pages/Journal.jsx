import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { extractSkillsFromText } from '../lib/groq'
import DatePicker from '../components/DatePicker'
import Experiences from './Experiences'
import './Journal.css'

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Inline mic SVG — no dependency, scales with font-size
function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
    </svg>
  )
}

export default function Journal() {
  const { user } = useAuth()
  const [entries,   setEntries]   = useState([])
  const [text,      setText]      = useState('')
  const [title,     setTitle]     = useState('')
  const [entryDate, setEntryDate] = useState(todayISO)
  const [isMobile,  setIsMobile]  = useState(() => window.innerWidth < 768)
  const [activeTab, setMobileTab] = useState('journal')
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [extracting, setExtracting] = useState({})

  // Voice dictation
  const recognitionRef    = useRef(null)  // SpeechRecognition instance
  const baseTextRef       = useRef('')    // snapshot of text when recording started
  const [listening,       setListening]       = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)

  useEffect(() => {
    setSpeechSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition))
  }, [])

  // Stop and release recognition on unmount
  useEffect(() => {
    return () => { recognitionRef.current?.abort() }
  }, [])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (user) loadEntries()
  }, [user])

  async function loadEntries() {
    setLoading(true)
    setLoadError('')
    try {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false })
      if (error) {
        console.error('Journal load error:', error)
        setLoadError(error.message)
      } else {
        setEntries(data ?? [])
      }
    } catch (err) {
      console.error('Journal load exception:', err)
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim() || !entryDate) return
    setSaving(true)
    setError('')
    const { error } = await supabase.from('journal_entries').insert({
      user_id:    user.id,
      title:      title.trim() || null,
      content:    text.trim(),
      entry_date: entryDate,
    })
    if (error) {
      setError(error.message)
    } else {
      setText('')
      setTitle('')
      setEntryDate(todayISO())
      await loadEntries()
    }
    setSaving(false)
  }

  async function deleteEntry(id) {
    await supabase.from('journal_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  async function handleExtract(entry) {
    setExtracting(prev => ({ ...prev, [entry.id]: 'loading' }))
    try {
      const skills = await extractSkillsFromText(entry.content)

      if (skills.length === 0) {
        setExtracting(prev => ({ ...prev, [entry.id]: { count: 0, skills: [] } }))
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
        [entry.id]: { count: newSkills.length, skills: newSkills },
      }))
    } catch (err) {
      console.error(err)
      setExtracting(prev => ({ ...prev, [entry.id]: 'error' }))
    }
  }

  function formatDate(iso) {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })
  }

  // ── Voice dictation ────────────────────────────────────────────────────────

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    const recognition       = new SR()
    recognition.continuous    = true
    recognition.interimResults = true
    recognition.lang          = navigator.language

    // Snapshot existing textarea content so new speech is always appended
    baseTextRef.current = text

    recognition.onresult = (event) => {
      let finalTranscript   = ''
      let interimTranscript = ''
      for (let i = 0; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) finalTranscript   += t
        else                           interimTranscript += t
      }
      const dictated = finalTranscript + interimTranscript
      const base     = baseTextRef.current
      const sep      = base.length > 0 && dictated.length > 0 ? ' ' : ''
      setText(base + sep + dictated)
    }

    recognition.onend   = () => setListening(false)
    recognition.onerror = (e) => {
      if (e.error !== 'aborted') console.warn('Speech recognition error:', e.error)
      setListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  function stopListening() {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }

  function toggleListening() {
    if (listening) stopListening()
    else startListening()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isMobile && activeTab === 'experiences') {
    return (
      <div className="page">
        <div className="journal-mobile-tabs">
          <button className="jmt-tab" onClick={() => setMobileTab('journal')}>✦ Journal</button>
          <button className="jmt-tab active">◑ Experiences</button>
        </div>
        <Experiences />
      </div>
    )
  }

  return (
    <div className="page">
      {isMobile && (
        <div className="journal-mobile-tabs">
          <button className="jmt-tab active">✦ Journal</button>
          <button className="jmt-tab" onClick={() => setMobileTab('experiences')}>◑ Experiences</button>
        </div>
      )}
      <div className="page-header">
        <h1 className="page-title">Daily Journal</h1>
        <p className="page-subtitle">Document your work episodes and achievements.</p>
      </div>

      <form onSubmit={handleSubmit} className="journal-form">
        <input
          className="journal-title-input"
          type="text"
          placeholder="Entry title (optional)"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />

        <div className="journal-date-row">
          <label className="journal-date-label">Episode date</label>
          <DatePicker value={entryDate} onChange={setEntryDate} required />
        </div>

        {/* Textarea wrapped for mic button positioning */}
        <div className="journal-textarea-wrap">
          <textarea
            className="journal-textarea"
            placeholder="What did you work on? What did you learn? Any wins or challenges?"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={5}
            required
          />
          {speechSupported && (
            <button
              type="button"
              className={`mic-btn ${listening ? 'listening' : ''}`}
              onClick={toggleListening}
              title={listening ? 'Stop dictation' : 'Dictate with voice'}
              aria-label={listening ? 'Stop voice dictation' : 'Start voice dictation'}
            >
              <MicIcon />
            </button>
          )}
        </div>

        {error && <div className="error-msg">{error}</div>}
        <button type="submit" className="btn-primary" disabled={saving || !text.trim() || !entryDate}>
          {saving ? 'Saving…' : '+ Add Entry'}
        </button>
      </form>

      <div className="entries-section">
        <h2 className="section-title">Past Entries</h2>
        {loading ? (
          <div className="loading-text">Loading…</div>
        ) : loadError ? (
          <div className="load-error">
            <strong>Could not load entries</strong>
            <p>{loadError}</p>
            <button className="btn-outline" onClick={loadEntries}>Retry</button>
          </div>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <span>✦</span>
            <p>No entries yet. Start documenting your journey above.</p>
          </div>
        ) : (
          <div className="entries-list">
            {entries.map(entry => {
              const state = extracting[entry.id]
              return (
                <div key={entry.id} className="entry-card">
                  <div className="entry-header">
                    <div>
                      <div className="entry-title">{entry.title || 'Untitled Entry'}</div>
                      <div className="entry-date">
                        {formatDate(entry.entry_date || entry.created_at?.slice(0, 10))}
                      </div>
                    </div>
                    <button
                      className="delete-btn"
                      onClick={() => deleteEntry(entry.id)}
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>

                  <p className="entry-content">{entry.content}</p>

                  <div className="entry-footer">
                    <button
                      className={`extract-btn ${state === 'loading' ? 'loading' : ''}`}
                      onClick={() => handleExtract(entry)}
                      disabled={state === 'loading'}
                    >
                      {state === 'loading' ? (
                        <><span className="spinner" /> Extracting…</>
                      ) : (
                        <>✦ Extract Skills</>
                      )}
                    </button>

                    {state && state !== 'loading' && state !== 'error' && (
                      <div className="extract-result">
                        {state.count === 0 ? (
                          <span className="extract-none">No new skills found</span>
                        ) : (
                          <>
                            <span className="extract-count">+{state.count} skill{state.count !== 1 ? 's' : ''} added:</span>
                            {state.skills.map(s => (
                              <span key={s.name} className="extract-tag">{s.name}</span>
                            ))}
                          </>
                        )}
                      </div>
                    )}

                    {state === 'error' && (
                      <span className="extract-error">Extraction failed — check your Groq API key</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
