import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { generateSimulationQuestions, analyzeSimulation } from '../lib/groq'
import './LiveSimulation.css'

// ── Browser capability check ──────────────────────────────────────────────────
const SR = window.webkitSpeechRecognition || window.SpeechRecognition

// Preferred voices in priority order — Daniel (en-GB) and Samantha (en-US) first
const PREFERRED_VOICES = ['Daniel', 'Samantha', 'Karen', 'Moira']

function getBestVoice() {
  // Only consider English voices — prevents browser from picking system locale (e.g. Italian)
  const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'))
  for (const name of PREFERRED_VOICES) {
    const match = voices.find(v => v.name === name)
    if (match) return match
  }
  // Fallback: prefer en-GB, then en-US, then any English
  return voices.find(v => v.lang === 'en-GB' && !v.name.toLowerCase().includes('compact'))
      || voices.find(v => v.lang === 'en-US' && !v.name.toLowerCase().includes('compact'))
      || voices.find(v => v.lang.startsWith('en'))
      || null
}
const hasSpeech   = !!SR
const hasSynthesis = 'speechSynthesis' in window

// ── Journal keyword matching ──────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','your','you',
  'how','what','tell','me','about','time','when','describe','situation','where','who',
  'why','would','did','have','has','been','was','is','are','that','this','it','they',
  'their','there','from','by','can','could','should','will','any','some','much','many',
  'just','then','if','do','does','made','make','take','took','give','gave','get','got',
  'had','he','she','we','my','our','his','her','role','position','company','work',
  'used','using','use','one','two','three','please','example','specific','most','more',
])

function extractKeywords(question) {
  return [...new Set(
    question.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w))
  )].slice(0, 5)
}

function findJournalMatch(question, entries) {
  const keywords = extractKeywords(question)
  if (keywords.length < 2) return null
  for (const entry of entries) {
    const content = (entry.content || '').toLowerCase()
    const matched = keywords.filter(kw => content.includes(kw))
    if (matched.length >= 2) {
      return matched.slice(0, 3).map(w => w[0].toUpperCase() + w.slice(1))
    }
  }
  return null
}

// ── Score helpers ─────────────────────────────────────────────────────────────
function scoreColor(n) {
  if (n >= 8) return 'var(--success)'
  if (n >= 5) return 'var(--warning)'
  return 'var(--danger)'
}
function scoreBg(n) {
  if (n >= 8) return 'rgba(74,222,128,0.1)'
  if (n >= 5) return 'rgba(251,191,36,0.1)'
  return 'rgba(248,113,113,0.1)'
}

// ── Wave bars (AI speaking indicator) ────────────────────────────────────────
function WaveIndicator() {
  const delays = ['0s', '0.12s', '0.24s', '0.36s', '0.24s', '0.12s', '0s']
  return (
    <div className="sim-wave">
      {delays.map((d, i) => (
        <div key={i} className="sim-wave-bar" style={{ animationDelay: d }} />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

// activeRole is always the role selected in the chip bar, passed explicitly by InterviewPrep.
// onSessionSaved(role, score) is called after a successful Supabase insert so InterviewPrep
// can update the readiness score for this role without re-mounting.
export default function LiveSimulation({ profile, activeRole, onBack, onSessionSaved }) {

  const [phase, setPhase]           = useState('setup')
  // setup | generating | interview | analyzing | report

  const [count, setCount]           = useState(10)
  const [questions, setQuestions]   = useState([])
  const [qIdx, setQIdx]             = useState(0)
  const [mode, setMode]             = useState('idle')
  // idle | speaking | listening

  const [transcript, setTranscript]   = useState('')
  const [answers, setAnswers]         = useState([])
  const [report, setReport]           = useState(null)
  const [sessionQA, setSessionQA]     = useState([])
  const [showSession, setShowSession] = useState(false)
  const [savedSessionId, setSavedSessionId] = useState(null)   // feature 1
  const [editingIdx, setEditingIdx]   = useState(null)         // feature 1
  const [editValue, setEditValue]     = useState('')           // feature 1
  const [recalculating, setRecalculating] = useState(false)   // feature 1
  const [hintKeywords, setHintKeywords] = useState([])        // feature 4
  const [showHint, setShowHint]       = useState(false)       // feature 4
  const [error, setError]             = useState('')

  // Refs: mutable values safe to read inside async callbacks / speech events
  const answersRef       = useRef([])
  const transcriptRef    = useRef('')
  const recognitionRef   = useRef(null)
  const questionsRef     = useRef([])
  const qIdxRef          = useRef(0)
  const listeningRef     = useRef(false)
  const journalEntriesRef= useRef([])   // feature 4: populated once at mount
  const hintTimerRef     = useRef(null) // feature 4

  useEffect(() => {
    hasSynthesis && window.speechSynthesis.getVoices()
    // Fetch journal entries once for keyword hint matching (feature 4)
    ;(async () => {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u?.id) return
      const { data } = await supabase
        .from('journal_entries').select('content').eq('user_id', u.id)
      journalEntriesRef.current = data ?? []
    })()
    return () => {
      window.speechSynthesis?.cancel()
      stopListening()
      clearTimeout(hintTimerRef.current)
    }
  }, [])

  // ── Start interview ─────────────────────────────────────────────────────────
  async function startInterview() {
    if (!hasSpeech || !hasSynthesis) {
      setError('Your browser does not support voice features. Please use Chrome or Edge.')
      return
    }
    setError('')
    setPhase('generating')
    try {
      // Fetch last 2 sessions for this role to avoid repeating questions
      const { data: { user: authUser } } = await supabase.auth.getUser()
      let previousQuestions = []
      if (authUser?.id && activeRole) {
        const { data: prevSessions } = await supabase
          .from('simulation_sessions')
          .select('questions_and_answers')
          .eq('user_id', authUser.id)
          .eq('target_role', activeRole)
          .order('created_at', { ascending: false })
          .limit(2)
        previousQuestions = (prevSessions ?? [])
          .flatMap(s => (s.questions_and_answers ?? []).map(qa => qa.question))
          .filter(Boolean)
      }

      // Pass activeRole and previously asked questions explicitly
      const qs = await generateSimulationQuestions(profile, count, activeRole, previousQuestions)
      questionsRef.current  = qs
      answersRef.current    = new Array(qs.length).fill('')
      qIdxRef.current       = 0
      setQuestions(qs)
      setQIdx(0)
      setTranscript('')
      setAnswers(new Array(qs.length).fill(''))
      setPhase('interview')
      speakQuestion(qs[0])
    } catch (err) {
      setError(err.message)
      setPhase('setup')
    }
  }

  // ── Speak a question via TTS ────────────────────────────────────────────────
  function speakQuestion(text) {
    setMode('speaking')
    setTranscript('')
    transcriptRef.current = ''

    window.speechSynthesis.cancel()

    const utt = new SpeechSynthesisUtterance(text)
    utt.lang  = 'en-GB'   // forces English; overridden per-voice below
    utt.rate  = 0.85
    utt.pitch = 1.0
    const chosenVoice = getBestVoice()
    if (chosenVoice) { utt.voice = chosenVoice; utt.lang = chosenVoice.lang }

    utt.onend = () => {
      setMode('listening')
      startListening()
      // Show journal hint for this question (feature 4)
      clearTimeout(hintTimerRef.current)
      setShowHint(false)
      const matched = findJournalMatch(text, journalEntriesRef.current)
      if (matched) {
        setHintKeywords(matched)
        setShowHint(true)
        hintTimerRef.current = setTimeout(() => setShowHint(false), 12000)
      }
    }

    // Fallback: if onend never fires (Chrome tab visibility bug), start after estimate
    const estimatedMs = Math.max((text.split(' ').length / 2.2) * 1000, 3000)
    const fallback = setTimeout(() => {
      if (!listeningRef.current) {
        setMode('listening')
        startListening()
      }
    }, estimatedMs + 4000)

    utt.onstart = () => clearTimeout(fallback)
    window.speechSynthesis.speak(utt)
  }

  // ── Start microphone ────────────────────────────────────────────────────────
  function startListening() {
    listeningRef.current = true
    const recognition = new SR()
    recognition.continuous      = true
    recognition.interimResults  = true
    recognition.lang            = 'en-US'

    recognition.onresult = (event) => {
      let final = '', interim = ''
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) final   += event.results[i][0].transcript + ' '
        else                          interim += event.results[i][0].transcript
      }
      const combined = (final + interim).trim()
      transcriptRef.current = combined
      setTranscript(combined)
    }

    recognition.onerror = (e) => {
      if (e.error !== 'no-speech') console.warn('Speech recognition error:', e.error)
    }

    // Restart automatically if it stops mid-answer (Chrome 60s limit)
    recognition.onend = () => {
      if (listeningRef.current) {
        try { recognition.start() } catch {}
      }
    }

    try { recognition.start() } catch {}
    recognitionRef.current = recognition
  }

  // ── Stop microphone ─────────────────────────────────────────────────────────
  function stopListening() {
    listeningRef.current = false
    try { recognitionRef.current?.stop() } catch {}
    recognitionRef.current = null
  }

  // ── User clicks Next Question ───────────────────────────────────────────────
  function handleNext() {
    window.speechSynthesis.cancel()
    stopListening()
    setMode('idle')

    const idx  = qIdxRef.current
    const saved = transcriptRef.current
    answersRef.current[idx] = saved

    // Sync display state
    setAnswers(prev => {
      const copy = [...prev]; copy[idx] = saved; return copy
    })

    const qs = questionsRef.current
    if (idx + 1 < qs.length) {
      const next = idx + 1
      qIdxRef.current = next
      setQIdx(next)
      setTranscript('')
      transcriptRef.current = ''
      speakQuestion(qs[next])
    } else {
      finishInterview()
    }
  }

  // ── End interview early ─────────────────────────────────────────────────────
  function handleEnd() {
    window.speechSynthesis.cancel()
    stopListening()
    // Save whatever we have so far
    const idx = qIdxRef.current
    answersRef.current[idx] = transcriptRef.current
    finishInterview()
  }

  // ── Analyze + save ──────────────────────────────────────────────────────────
  async function finishInterview() {
    setMode('idle')
    setPhase('analyzing')

    // activeRole is the chip-selected role — always lowercase-trimmed by InterviewPrep
    const role = (activeRole ?? '').trim() || null

    const qs  = questionsRef.current
    const as  = answersRef.current
    const qas = qs.map((q, i) => ({
      question_number: i + 1,
      question:        q,
      answer:          as[i]?.trim() || '',
    }))
    setSessionQA(qas)   // store for in-session review

    // ── Step 1: Groq analysis ──────────────────────────────────────────────
    let result
    try {
      result = await analyzeSimulation(qas, role)
      console.log('[LiveSimulation] Groq result:', result)
      setReport(result)
    } catch (err) {
      console.error('[LiveSimulation] Groq analysis failed:', err)
      setError('AI analysis failed: ' + err.message)
      setPhase('report')
      return
    }

    // ── Step 2: Get auth user directly (never trust useAuth state here) ────
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    console.log('[LiveSimulation] Auth — user_id:', authUser?.id ?? 'NULL', authError ?? '')

    if (!authUser?.id) {
      setError('Not logged in — session could not be saved.')
      setPhase('report')
      return
    }

    // ── Step 3: Build + insert payload ────────────────────────────────────
    const score = typeof result.score === 'number' ? Math.round(result.score) : null
    const payload = {
      user_id:               authUser.id,
      target_role:           role,
      questions_and_answers: qas,
      overall_score:         score,
      final_report: {
        score,
        strengths:    Array.isArray(result.strengths)    ? result.strengths    : [],
        improvements: Array.isArray(result.improvements) ? result.improvements : [],
        tip:          result.tip ?? '',
      },
    }
    console.log('[LiveSimulation] Inserting:', JSON.stringify(payload, null, 2))

    const { data: saved, error: saveError } = await supabase
      .from('simulation_sessions')
      .insert(payload)
      .select()
      .single()

    if (saveError) {
      console.error('[LiveSimulation] Insert failed:', saveError)
      setError(`Save failed (${saveError.code}): ${saveError.message}`)
    } else {
      console.log('[LiveSimulation] Saved — id:', saved?.id)
      setSavedSessionId(saved?.id ?? null)   // feature 1: needed for edits
      onSessionSaved?.(role, score)
    }

    setPhase('report')
  }

  // ── Edit answer + recalculate (feature 1) ────────────────────────────────────
  async function handleEditSave() {
    if (editingIdx === null) return
    setRecalculating(true)

    const updatedQA = sessionQA.map((qa, i) =>
      i === editingIdx ? { ...qa, answer: editValue } : qa
    )
    setSessionQA(updatedQA)
    setEditingIdx(null)

    const role = (activeRole ?? '').trim() || null

    // Persist updated Q&A to Supabase
    if (savedSessionId) {
      await supabase.from('simulation_sessions')
        .update({ questions_and_answers: updatedQA })
        .eq('id', savedSessionId)
    }

    // Re-analyze with updated answers
    try {
      const newReport = await analyzeSimulation(updatedQA, role)
      setReport(newReport)
      if (savedSessionId) {
        await supabase.from('simulation_sessions')
          .update({
            overall_score: typeof newReport.score === 'number' ? Math.round(newReport.score) : null,
            final_report: {
              score:        newReport.score,
              strengths:    newReport.strengths    ?? [],
              improvements: newReport.improvements ?? [],
              tip:          newReport.tip          ?? '',
            },
          })
          .eq('id', savedSessionId)
        onSessionSaved?.(role, newReport.score)
      }
    } catch (err) {
      setError('Recalculation failed: ' + err.message)
    }
    setRecalculating(false)
  }

  // ── Reset ───────────────────────────────────────────────────────────────────
  function handleReset() {
    window.speechSynthesis?.cancel()
    stopListening()
    answersRef.current    = []
    transcriptRef.current = ''
    questionsRef.current  = []
    qIdxRef.current       = 0
    setPhase('setup')
    setQuestions([])
    setQIdx(0)
    setMode('idle')
    setTranscript('')
    setAnswers([])
    setReport(null)
    setSessionQA([])
    setShowSession(false)
    setSavedSessionId(null)
    setEditingIdx(null)
    setEditValue('')
    setRecalculating(false)
    setShowHint(false)
    setHintKeywords([])
    clearTimeout(hintTimerRef.current)
    setError('')
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="sim-overlay">

      {/* ── SETUP ── */}
      {phase === 'setup' && (
        <div className="sim-card sim-setup">
          <div className="sim-logo">🎙</div>
          <h1 className="sim-title">Live Interview Simulation</h1>

          {activeRole && (
            <div className="sim-role-tag">{activeRole}</div>
          )}

          <p className="sim-desc">
            The AI will ask you questions out loud. Answer by speaking.
            The interview will feel like a real one — no pauses, no editing.
          </p>

          {!hasSpeech || !hasSynthesis ? (
            <div className="sim-browser-warn">
              ⚠ Voice features require Chrome or Edge. Please open this page in Chrome to use the simulation.
            </div>
          ) : (
            <>
              <div className="sim-count-label">Number of questions</div>
              <div className="sim-count-row">
                {[5, 10, 15].map(n => (
                  <button
                    key={n}
                    className={`sim-count-btn ${count === n ? 'active' : ''}`}
                    onClick={() => setCount(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>

              {error && <div className="sim-error">{error}</div>}

              <button className="sim-start-btn" onClick={startInterview}>
                Start Interview →
              </button>
            </>
          )}

          <button className="sim-back-link" onClick={onBack}>
            ← Back to Prep Mode
          </button>
        </div>
      )}

      {/* ── GENERATING ── */}
      {phase === 'generating' && (
        <div className="sim-card sim-center">
          <div className="sim-spinner" />
          <p className="sim-loading-title">Preparing your interview…</p>
          <p className="sim-loading-sub">
            Generating {count} personalized questions for{' '}
            <strong>{profile?.targetRole || 'your role'}</strong>
          </p>
        </div>
      )}

      {/* ── INTERVIEW ── */}
      {phase === 'interview' && (
        <div className="sim-interview">
          {/* Header */}
          <div className="sim-interview-header">
            <div className="sim-progress-wrap">
              <span className="sim-q-counter">Question {qIdx + 1} of {questions.length}</span>
              <div className="sim-progress-bar">
                <div
                  className="sim-progress-fill"
                  style={{ width: `${((qIdx + (mode === 'listening' ? 0.5 : 0)) / questions.length) * 100}%` }}
                />
              </div>
            </div>
            <button className="sim-end-btn" onClick={handleEnd}>End Interview</button>
          </div>

          {/* Question area */}
          <div className="sim-question-area">
            {/* State indicator */}
            <div className="sim-state-indicator">
              {mode === 'speaking' && (
                <div className="sim-speaking-wrap">
                  <WaveIndicator />
                  <span className="sim-state-label">AI speaking…</span>
                </div>
              )}
              {mode === 'listening' && (
                <div className="sim-listening-wrap">
                  <div className="sim-mic-pulse">
                    <div className="sim-mic-ring" />
                    <div className="sim-mic-ring sim-ring-2" />
                    <span className="sim-mic-icon">🎙</span>
                  </div>
                  <span className="sim-state-label">Listening…</span>
                </div>
              )}
              {mode === 'idle' && <div className="sim-state-gap" />}
            </div>

            {/* Question text */}
            <div className="sim-question-box">
              <p className="sim-question-text">
                {questions[qIdx]}
              </p>
            </div>

            {/* Live transcript */}
            {(mode === 'listening' || transcript) && (
              <div className="sim-transcript-wrap">
                <div className="sim-transcript-label">
                  {mode === 'listening' ? '● Recording' : 'Recorded'}
                </div>
                <p className="sim-transcript-text">
                  {transcript || <span className="sim-transcript-placeholder">Start speaking…</span>}
                </p>
              </div>
            )}
          </div>

          {/* Next button */}
          <div className="sim-interview-footer">
            <button
              className="sim-next-btn"
              onClick={handleNext}
              disabled={mode === 'speaking'}
            >
              {qIdx + 1 === questions.length ? 'Finish Interview ✓' : 'Next Question →'}
            </button>
          </div>
        </div>
      )}

      {/* ── ANALYZING ── */}
      {phase === 'analyzing' && (
        <div className="sim-card sim-center">
          <div className="sim-spinner" />
          <p className="sim-loading-title">Analyzing your interview…</p>
          <p className="sim-loading-sub">
            Reviewing your answers and generating your personalized performance report.
          </p>
        </div>
      )}

      {/* ── REPORT ── */}
      {phase === 'report' && (
        <div className="sim-card sim-report">
          <div className="sim-report-title">Interview Complete</div>

          {error && !report ? (
            <div className="sim-error">{error}</div>
          ) : report ? (
            <>
              {/* Score */}
              <div
                className="sim-report-score"
                style={{ color: scoreColor(report.score), background: scoreBg(report.score) }}
              >
                {report.score}
                <span className="sim-score-denom">/10</span>
              </div>
              <div className="sim-score-label">
                {report.score >= 8 ? 'Excellent performance' : report.score >= 5 ? 'Solid — room to grow' : 'Keep practicing'}
              </div>

              {/* Strengths + Improvements */}
              <div className="sim-report-cols">
                <div className="sim-report-col green">
                  <div className="sim-report-col-title">✓ Strengths</div>
                  <ul className="sim-report-list">
                    {report.strengths?.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
                <div className="sim-report-col amber">
                  <div className="sim-report-col-title">⚠ To Improve</div>
                  <ul className="sim-report-list">
                    {report.improvements?.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              </div>

              {/* Tip */}
              {report.tip && (
                <div className="sim-report-tip">
                  <span className="sim-tip-icon">◆</span>
                  <div>
                    <div className="sim-tip-label">Key Tip for Next Interview</div>
                    <p>{report.tip}</p>
                  </div>
                </div>
              )}
            </>
          ) : null}

          <div className="sim-report-actions">
            <button className="sim-start-btn" onClick={handleReset}>Try Again</button>
            <button className="sim-outline-btn" onClick={onBack}>← Back to Prep</button>
          </div>

          {/* View Full Session toggle */}
          {sessionQA.length > 0 && (
            <button
              className="sim-toggle-session-btn"
              onClick={() => setShowSession(v => !v)}
            >
              {showSession ? '▲ Hide Full Session' : '▼ View Full Session'}
            </button>
          )}

          {showSession && sessionQA.length > 0 && (
            <div className="sim-session-review">
              {sessionQA.map((qa, i) => (
                <div key={qa.question_number} className="sim-qa-item">
                  <div className="sim-qa-q">
                    <span className="sim-qa-num">Q{qa.question_number}</span>
                    {qa.question}
                  </div>
                  {editingIdx === i ? (
                    <textarea
                      className="sim-qa-edit-textarea"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      rows={4}
                      autoFocus
                    />
                  ) : (
                    <div className="sim-qa-answer-row">
                      {qa.answer
                        ? <p className="sim-qa-a">{qa.answer}</p>
                        : <p className="sim-qa-empty">No answer recorded</p>
                      }
                      <button
                        className="sim-qa-edit-btn"
                        title="Edit this answer"
                        onClick={() => { setEditingIdx(i); setEditValue(qa.answer || '') }}
                      >
                        ✎
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {editingIdx !== null && (
                <div className="sim-qa-save-row">
                  <button
                    className="sim-start-btn sim-recalc-btn"
                    onClick={handleEditSave}
                    disabled={recalculating}
                  >
                    {recalculating
                      ? <><span className="sim-inline-spinner" /> Recalculating…</>
                      : 'Save & Recalculate Feedback'}
                  </button>
                  <button
                    className="sim-outline-btn"
                    onClick={() => setEditingIdx(null)}
                    disabled={recalculating}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Journal hint popup — slides in from right when mic is active (feature 4) */}
      {phase === 'interview' && showHint && hintKeywords.length > 0 && (
        <div className="sim-hint-popup">
          <span className="sim-hint-bolt">⚡</span>
          <div className="sim-hint-tags">
            {hintKeywords.map((kw, i) => (
              <span key={kw}>
                {i > 0 && <span className="sim-hint-sep"> · </span>}
                <strong>{kw}</strong>
              </span>
            ))}
          </div>
          <button
            className="sim-hint-dismiss"
            onClick={() => { clearTimeout(hintTimerRef.current); setShowHint(false) }}
          >✕</button>
        </div>
      )}
    </div>
  )
}
