import { useState } from 'react'
import './ConsentBanner.css'

const CONSENT_KEY = 'cdna_consent_v1'

export default function ConsentBanner() {
  const [visible, setVisible] = useState(() => {
    try { return !localStorage.getItem(CONSENT_KEY) } catch { return false }
  })

  if (!visible) return null

  function accept() {
    try { localStorage.setItem(CONSENT_KEY, 'true') } catch {}
    setVisible(false)
  }

  return (
    <div className="consent-overlay">
      <div className="consent-modal">
        <div className="consent-logo">
          <span className="consent-logo-icon">🧬</span>
          <span className="consent-logo-name">CareerDNA</span>
        </div>

        <p className="consent-subtitle">
          Before you continue, please review and accept our policies
        </p>

        <div className="consent-summary">
          <p>CareerDNA collects and processes the following personal data to provide its services:</p>
          <ul>
            <li><strong>Account email address</strong> — used for authentication and account management</li>
            <li><strong>CV / Resume text</strong> — extracted from uploaded PDFs and stored to build your skills profile</li>
            <li><strong>Journal entries</strong> — text you write to document your daily work experiences</li>
            <li><strong>Skills, past experiences and preferences</strong> — manually entered or AI-extracted profile data</li>
            <li><strong>Voice transcripts (text only)</strong> — during Live Simulation your speech is transcribed locally in your browser using the Web Speech API; only the resulting text is saved to our servers — no audio is ever recorded or transmitted</li>
          </ul>
          <p>Your data is stored in Supabase (EU-West region, Ireland) and processed by Groq AI for skill extraction and interview analysis. It is <strong>never used to train AI models</strong>.</p>
          <p>Under GDPR and the Swiss nLPD you have the right to access, correct, export, or delete your data at any time. See our Privacy Policy for full details.</p>
        </div>

        <div className="consent-links">
          <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
          <span className="consent-dot">·</span>
          <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
        </div>

        <button className="consent-accept-btn" onClick={accept}>
          I Accept &amp; Continue
        </button>
      </div>
    </div>
  )
}
