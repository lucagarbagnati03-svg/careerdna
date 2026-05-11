import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { extractSkillsFromText } from '../lib/groq'
import './Journal.css'

export default function Journal() {
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // extracting[entryId] = 'idle' | 'loading' | { count, skills } | 'error'
  const [extracting, setExtracting] = useState({})

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
        .order('created_at', { ascending: false })
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
    if (!text.trim()) return
    setSaving(true)
    setError('')
    const { error } = await supabase.from('journal_entries').insert({
      user_id: user.id,
      title: title.trim() || null,
      content: text.trim(),
    })
    if (error) {
      setError(error.message)
    } else {
      setText('')
      setTitle('')
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

      // Upsert skills — skip duplicates by name (case-insensitive) for this user
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
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  return (
    <div className="page">
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
        <textarea
          className="journal-textarea"
          placeholder="What did you work on today? What did you learn? Any wins or challenges?"
          value={text}
          onChange={e => setText(e.target.value)}
          rows={5}
          required
        />
        {error && <div className="error-msg">{error}</div>}
        <button type="submit" className="btn-primary" disabled={saving || !text.trim()}>
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
                      <div className="entry-date">{formatDate(entry.created_at)}</div>
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
