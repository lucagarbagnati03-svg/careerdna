import { useState } from 'react'
import './InterviewPrep.css'

const QUESTIONS_BY_TYPE = {
  Behavioral: [
    'Tell me about a time you had to learn something new quickly.',
    'Describe a situation where you had a conflict with a teammate. How did you resolve it?',
    'Tell me about your most challenging project and how you handled it.',
    'Give an example of a time you showed leadership.',
    'Describe a time you failed and what you learned from it.',
    'Tell me about a time you had to make a decision with incomplete information.',
  ],
  Technical: [
    'Walk me through how you approach debugging a complex issue.',
    'How do you ensure code quality in your projects?',
    'Describe your experience with system design.',
    'How do you stay up to date with new technologies?',
    'Tell me about a technical decision you made that you are proud of.',
    'How do you handle technical debt in a fast-moving team?',
  ],
  Situational: [
    'What would you do if you disagreed with your manager on a technical approach?',
    'How would you handle a situation where a deadline is impossible to meet?',
    'What would you do if you were given a project with unclear requirements?',
    'How would you handle a critical bug discovered right before a major release?',
    'What would you do if a coworker was consistently missing deadlines?',
  ],
}

const STAR_LABELS = { S: 'Situation', T: 'Task', A: 'Action', R: 'Result' }

export default function InterviewPrep() {
  const [type, setType] = useState('Behavioral')
  const [currentQ, setCurrentQ] = useState(0)
  const [answer, setAnswer] = useState('')
  const [savedAnswers, setSavedAnswers] = useState({})
  const [saved, setSaved] = useState(false)
  const [starSection, setStarSection] = useState('S')

  const questions = QUESTIONS_BY_TYPE[type]
  const question = questions[currentQ]
  const key = `${type}__${currentQ}`
  const existing = savedAnswers[key]

  function nextQ() {
    setCurrentQ(i => (i + 1) % questions.length)
    setAnswer('')
    setSaved(false)
    setStarSection('S')
  }

  function prevQ() {
    setCurrentQ(i => (i - 1 + questions.length) % questions.length)
    setAnswer('')
    setSaved(false)
    setStarSection('S')
  }

  function saveAnswer() {
    setSavedAnswers(prev => ({ ...prev, [key]: answer }))
    setSaved(true)
  }

  function switchType(t) {
    setType(t)
    setCurrentQ(0)
    setAnswer('')
    setSaved(false)
    setStarSection('S')
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Interview Prep</h1>
        <p className="page-subtitle">Practice answering interview questions using the STAR method.</p>
      </div>

      <div className="qtype-tabs">
        {Object.keys(QUESTIONS_BY_TYPE).map(t => (
          <button
            key={t}
            className={`qtype-tab ${type === t ? 'active' : ''}`}
            onClick={() => switchType(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="question-card">
        <div className="q-meta">
          Question {currentQ + 1} of {questions.length}
        </div>
        <p className="question-text">{question}</p>

        <div className="star-tabs">
          {Object.entries(STAR_LABELS).map(([k, label]) => (
            <button
              key={k}
              className={`star-tab ${starSection === k ? 'active' : ''}`}
              onClick={() => setStarSection(k)}
            >
              <span className="star-key">{k}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="star-hint">
          {starSection === 'S' && 'Describe the context and background of the situation.'}
          {starSection === 'T' && 'What was your specific role or task?'}
          {starSection === 'A' && 'What actions did you take? Be specific and use "I" not "we".'}
          {starSection === 'R' && 'What was the outcome? Quantify results if possible.'}
        </div>

        <textarea
          className="answer-textarea"
          placeholder={`Write your ${STAR_LABELS[starSection]} here…`}
          value={answer}
          onChange={e => { setAnswer(e.target.value); setSaved(false) }}
          rows={5}
        />

        {existing && !answer && (
          <div className="saved-answer">
            <div className="saved-label">Your saved answer:</div>
            <p>{existing}</p>
          </div>
        )}

        <div className="q-actions">
          <button className="btn-outline" onClick={prevQ}>← Prev</button>
          <button
            className="btn-primary"
            onClick={saveAnswer}
            disabled={!answer.trim()}
          >
            {saved ? '✓ Saved' : 'Save Answer'}
          </button>
          <button className="btn-outline" onClick={nextQ}>Next →</button>
        </div>
      </div>

      {Object.keys(savedAnswers).length > 0 && (
        <div className="saved-section">
          <h2 className="section-title">Saved Answers ({Object.keys(savedAnswers).length})</h2>
          {Object.entries(savedAnswers).map(([k, ans]) => {
            const [t, idx] = k.split('__')
            const q = QUESTIONS_BY_TYPE[t]?.[Number(idx)]
            return (
              <div key={k} className="saved-card">
                <div className="saved-q-type">{t}</div>
                <div className="saved-q-text">{q}</div>
                <p className="saved-q-answer">{ans}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
