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

        <div className="consent-nda">
          <div className="consent-nda-header">⚠ Data Sensitivity &amp; Non-Disclosure Notice</div>
          <p>By using CareerDNA's recording and analysis services, you acknowledge and agree to the following terms regarding data sensitivity and confidentiality:</p>
          <ol>
            <li><strong>User Responsibility:</strong> You are solely responsible for the content of your voice and text recordings. CareerDNA is designed to capture professional achievements and skills, not trade secrets or proprietary corporate data.</li>
            <li><strong>Confidentiality &amp; NDAs:</strong> If your employment is subject to a Non-Disclosure Agreement (NDA) or any confidentiality obligation, you must ensure that your inputs do not violate such agreements. We strictly advise you to describe your activities in general, non-proprietary terms (e.g., focus on the process and results rather than specific client names, secret formulas, or unreleased product details).</li>
            <li><strong>Indemnification:</strong> CareerDNA shall not be held liable for any unauthorized disclosure of third-party confidential information resulting from your recordings. You agree to indemnify and hold CareerDNA harmless against any legal claims arising from a breach of your professional confidentiality obligations.</li>
            <li><strong>Privacy Commitment:</strong> While we employ a Privacy-First architecture (utilizing local transcription and sovereign AI models), no system is entirely immune to risk. Please exercise professional discretion in every interaction with the platform.</li>
          </ol>
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
