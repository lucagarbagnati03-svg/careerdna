import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { extractTextFromPDF } from '../lib/pdfExtract'
import { extractSkillsFromCV } from '../lib/groq'
import './CVScanner.css'

const CATEGORIES = ['Technical', 'Soft Skills', 'Domain', 'Tools', 'Other']

const STEPS = [
  { id: 'extract', label: 'Reading PDF' },
  { id: 'analyze', label: 'AI analyzing skills' },
  { id: 'save',    label: 'Saving to profile' },
]

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function CVScanner() {
  const { user } = useAuth()

  // Persisted CV state
  const [storedCV, setStoredCV]     = useState(null)  // { cv_text, filename, uploaded_at }
  const [cvSkills, setCvSkills]     = useState([])
  const [loadingCV, setLoadingCV]   = useState(true)

  // Upload state
  const [file, setFile]             = useState(null)
  const [replacing, setReplacing]   = useState(false)
  const [dragging, setDragging]     = useState(false)

  // Scan state
  const [step, setStep]             = useState(null)
  const [result, setResult]         = useState(null)
  const [activeTab, setActiveTab]   = useState('cv')   // 'cv' | 'results'
  const [error, setError]           = useState('')
  const inputRef                    = useRef(null)

  useEffect(() => {
    if (user) loadStoredCV()
  }, [user])

  async function loadStoredCV() {
    setLoadingCV(true)
    try {
      const [{ data: cvData }, { data: skillsData }] = await Promise.all([
        supabase.from('user_cv').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('skills').select('*').eq('user_id', user.id).eq('source', 'cv')
          .order('category').order('name'),
      ])
      setStoredCV(cvData ?? null)
      setCvSkills(skillsData ?? [])

      // Restore last scan results from persisted columns
      if (cvData?.newly_added || cvData?.already_existed) {
        const newSkills = cvData.newly_added    ?? []
        const skipped   = cvData.already_existed ?? []
        setResult({ added: newSkills.length, skipped, newSkills, allExtracted: [...newSkills, ...skipped] })
      }
    } finally {
      setLoadingCV(false)
    }
  }

  // ── File handling ──────────────────────────────────────────────────

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.type === 'application/pdf') {
      setFile(dropped); setError('')
    } else {
      setError('Please drop a PDF file.')
    }
  }

  function handleFileChange(e) {
    const f = e.target.files[0]
    if (f) { setFile(f); setError('') }
  }

  function clearFile() {
    setFile(null); setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  function startReplacing() {
    setReplacing(true); setResult(null); setError('')
  }

  function cancelReplacing() {
    setReplacing(false); clearFile(); setStep(null); setResult(null)
  }

  // ── Scan ──────────────────────────────────────────────────────────

  async function handleScan() {
    if (!file) return
    setError('')
    setResult(null)

    try {
      // Step 1: read PDF
      setStep('extract')
      const text = await extractTextFromPDF(file)
      if (!text || text.length < 50) {
        throw new Error('Could not extract readable text. Make sure this is not a scanned image-only PDF.')
      }

      // Step 2: AI extraction
      setStep('analyze')
      const allExtracted = await extractSkillsFromCV(text)

      // Step 3: save
      setStep('save')

      // Delete old CV-sourced skills before saving new ones
      if (storedCV || replacing) {
        await supabase.from('skills').delete()
          .eq('user_id', user.id).eq('source', 'cv')
      }

      // Deduplicate against remaining (non-CV) skills
      const { data: nonCVSkills } = await supabase
        .from('skills').select('name')
        .eq('user_id', user.id)

      const existingNames = new Set((nonCVSkills ?? []).map(s => s.name.toLowerCase()))
      const newSkills     = allExtracted.filter(s => !existingNames.has(s.name.toLowerCase()))
      const skipped       = allExtracted.filter(s =>  existingNames.has(s.name.toLowerCase()))

      if (newSkills.length > 0) {
        await supabase.from('skills').insert(
          newSkills.map(s => ({ ...s, user_id: user.id, source: 'cv' }))
        )
      }

      // Upsert CV record — persist scan results alongside CV text
      await supabase.from('user_cv').upsert(
        {
          user_id:          user.id,
          cv_text:          text,
          filename:         file.name,
          uploaded_at:      new Date().toISOString(),
          newly_added:      newSkills,
          already_existed:  skipped,
        },
        { onConflict: 'user_id' }
      )

      setResult({ added: newSkills.length, skipped, newSkills, allExtracted })

      // Reload stored CV + skills
      await loadStoredCV()
      setStep(null)
      setActiveTab('results')
      setReplacing(false)
      clearFile()

    } catch (err) {
      console.error(err)
      setError(err.message)
      setStep(null)
    }
  }

  // ── Derived display flags ─────────────────────────────────────────

  const scanning   = !!step
  const hasTabs    = storedCV && !scanning && !replacing
  const showCVView = hasTabs && activeTab === 'cv'
  const showResults= hasTabs && activeTab === 'results'
  const showDrop   = !scanning && (!storedCV || replacing)

  if (loadingCV) {
    return (
      <div className="page">
        <div className="page-header"><h1 className="page-title">CV Scanner</h1></div>
        <div className="loading-text">Loading…</div>
      </div>
    )
  }

  return (
    <div className="page">
      {/* ── Page header ── */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">CV Scanner</h1>
          <p className="page-subtitle">Upload your CV and AI will extract your skills automatically.</p>
        </div>
        {storedCV && !replacing && !scanning && (
          <button className="btn-primary" onClick={startReplacing}>Replace CV</button>
        )}
      </div>

      {/* ── Tab switcher ── */}
      {hasTabs && (
        <div className="cv-tabs">
          <button
            className={`cv-tab ${activeTab === 'cv' ? 'active' : ''}`}
            onClick={() => setActiveTab('cv')}
          >
            <span className="cv-tab-icon">▤</span>
            My CV
            <span className="cv-tab-badge">{cvSkills.length}</span>
          </button>
          <button
            className={`cv-tab ${activeTab === 'results' ? 'active' : ''}`}
            onClick={() => setActiveTab('results')}
          >
            <span className="cv-tab-icon">✦</span>
            Last Scan Results
            {result && (
              <span className="cv-tab-badge new">{result.added} new</span>
            )}
          </button>
        </div>
      )}

      {/* ── CV view: stored card + skills ── */}
      {showCVView && (
        <>
          <div className="stored-cv-card">
            <div className="stored-cv-header">
              <span className="cv-file-icon">▤</span>
              <div className="stored-cv-meta">
                <div className="stored-cv-name">{storedCV.filename}</div>
                <div className="stored-cv-date">Uploaded {formatDate(storedCV.uploaded_at)}</div>
              </div>
            </div>
            {storedCV.cv_text && (
              <div className="cv-text-preview">
                {storedCV.cv_text.slice(0, 300).trim()}…
              </div>
            )}
          </div>

          <div className="cv-skills-section">
            <div className="cv-skills-header">
              <h2 className="section-title">Skills extracted from CV</h2>
              <span className="cv-skills-count">{cvSkills.length} skills</span>
            </div>
            {cvSkills.length === 0 ? (
              <div className="empty-state" style={{ paddingTop: 16 }}>
                <span>▤</span>
                <p>No skills extracted from this CV yet.</p>
              </div>
            ) : (
              CATEGORIES.map(cat => {
                const items = cvSkills.filter(s => s.category === cat)
                if (!items.length) return null
                return (
                  <div key={cat} className="results-group">
                    <div className="results-group-title">{cat}</div>
                    <div className="results-tags">
                      {items.map(s => (
                        <div key={s.id} className="result-tag">
                          <span className="result-tag-name">{s.name}</span>
                          <span className="result-tag-level">Lv {s.level}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      {/* ── Replace banner ── */}
      {replacing && !scanning && (
        <div className="replace-banner">
          <span>Replacing <strong>{storedCV?.filename}</strong> — old CV skills will be removed.</span>
          <button className="btn-outline-small" onClick={cancelReplacing}>Cancel</button>
        </div>
      )}

      {/* ── Drop zone ── */}
      {showDrop && (
        <div
          className={`drop-zone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !file && inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept="application/pdf"
            style={{ display: 'none' }} onChange={handleFileChange} />
          {file ? (
            <div className="file-info">
              <span className="file-icon">▤</span>
              <div>
                <div className="file-name">{file.name}</div>
                <div className="file-size">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
              <button className="file-remove" onClick={e => { e.stopPropagation(); clearFile() }}>×</button>
            </div>
          ) : (
            <div className="drop-prompt">
              <span className="drop-icon">▤</span>
              <p className="drop-text">Drop your CV here, or <span className="drop-link">browse</span></p>
              <p className="drop-hint">PDF files only</p>
            </div>
          )}
        </div>
      )}

      {error && <div className="cv-error">{error}</div>}

      {/* ── Scan button ── */}
      {file && !scanning && (
        <button className="btn-scan" onClick={handleScan}>
          {replacing ? 'Replace & Scan CV' : 'Scan CV with AI'}
        </button>
      )}

      {/* ── Progress stepper ── */}
      {scanning && (
        <div className="scan-progress">
          {STEPS.map((s, i) => {
            const stepIndex = STEPS.findIndex(x => x.id === step)
            const isDone    = i < stepIndex
            const isActive  = s.id === step
            return (
              <div key={s.id} className={`progress-step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
                <div className="progress-dot">
                  {isDone ? '✓' : isActive ? <span className="mini-spinner" /> : i + 1}
                </div>
                <span className="progress-label">{s.label}</span>
                {i < STEPS.length - 1 && <div className="progress-line" />}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Results view ── */}
      {showResults && !result && (
        <div className="no-results-placeholder">
          <span className="no-results-icon">✦</span>
          <p className="no-results-text">No scan results for this session yet.</p>
          <p className="no-results-sub">Upload a new CV to see what skills are extracted.</p>
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={startReplacing}>
            Replace CV
          </button>
        </div>
      )}

      {showResults && result && (
        <div className="scan-results">
          <div className="results-summary-row">
            <span className="results-count">{result.added}</span>
            <span className="results-label">new skills added</span>
            {result.skipped.length > 0 && (
              <span className="results-skipped">· {result.skipped.length} already in profile</span>
            )}
          </div>

          {result.newSkills.length > 0 && (
            <div className="results-section">
              <div className="results-section-label new">Newly added</div>
              {CATEGORIES.map(cat => {
                const items = result.newSkills.filter(s => s.category === cat)
                if (!items.length) return null
                return (
                  <div key={cat} className="results-group">
                    <div className="results-group-title">{cat}</div>
                    <div className="results-tags">
                      {items.map(s => (
                        <div key={s.name} className="result-tag new">
                          <span className="result-tag-name">{s.name}</span>
                          <span className="result-tag-level">Lv {s.level}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {result.skipped.length > 0 && (
            <div className="results-section">
              <div className="results-section-label existing">Already in profile</div>
              <div className="results-tags" style={{ marginTop: 8 }}>
                {result.skipped.map(s => (
                  <div key={s.name} className="result-tag existing">
                    <span className="result-tag-name">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.added === 0 && result.skipped.length === 0 && (
            <div className="empty-state" style={{ paddingTop: 24 }}>
              <span>▤</span><p>No skills found in this CV.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
