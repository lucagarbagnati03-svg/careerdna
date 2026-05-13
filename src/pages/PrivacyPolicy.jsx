import { useNavigate } from 'react-router-dom'
import './Legal.css'

export default function PrivacyPolicy() {
  const navigate = useNavigate()

  return (
    <div className="legal-page">
      <div className="legal-inner">
        <button className="legal-back" onClick={() => navigate(-1)}>
          ← Back
        </button>

        <div className="legal-header">
          <div className="legal-logo">
            <span className="legal-logo-icon">🧬</span>
            <span className="legal-logo-name">CareerDNA</span>
          </div>
          <h1 className="legal-title">Privacy Policy</h1>
          <p className="legal-updated">Last updated: 13 May 2026</p>
        </div>

        <div className="legal-section">
          <h2>1. Data Controller</h2>
          <p>CareerDNA is operated as an independent software product. For any privacy-related enquiries, please contact us at the address listed in the Contact section below. We are committed to compliance with the EU General Data Protection Regulation (GDPR) and the Swiss Federal Act on Data Protection (nLPD).</p>
        </div>

        <div className="legal-section">
          <h2>2. What We Collect</h2>
          <p>We collect only the data necessary to provide the CareerDNA service:</p>
          <ul>
            <li><strong>Email address</strong> — collected at account registration, used solely for authentication and account management</li>
            <li><strong>Display name</strong> — optional name you may set in your profile settings</li>
            <li><strong>CV / Resume text</strong> — the text content extracted from PDF files you upload; no images or binary data are stored</li>
            <li><strong>Journal entries</strong> — text you voluntarily write to document your daily work experiences</li>
            <li><strong>Skills</strong> — skill names, categories and proficiency levels, either entered manually or AI-extracted from your content</li>
            <li><strong>Past experiences</strong> — job titles, company names, dates and descriptions you enter manually</li>
            <li><strong>Interview practice data</strong> — questions, your written answers, AI feedback scores and session history</li>
            <li><strong>Simulation session transcripts (text only)</strong> — the text transcribed from your speech during Live Simulation interviews; no audio is ever recorded or transmitted to any server</li>
            <li><strong>Preferences</strong> — your target role, cached skill gap analyses and interview question sets</li>
          </ul>
        </div>

        <div className="legal-section">
          <h2>3. How We Use Your Data</h2>
          <p>Your data is used exclusively to provide the CareerDNA service to you:</p>
          <ul>
            <li>Authenticate your account and maintain your session</li>
            <li>Display your career profile, skills and experience across the app</li>
            <li>Generate personalised AI insights using Groq (skill extraction, gap analysis, interview question generation, feedback)</li>
            <li>Store your progress and history so it persists between sessions</li>
          </ul>
          <p>We do not sell, share, or disclose your personal data to any third party for marketing or commercial purposes.</p>
        </div>

        <div className="legal-section">
          <h2>4. AI Processing (Groq)</h2>
          <p>CareerDNA uses the Groq API (llama-3.3-70b-versatile model) to process certain content — including CV text, journal entries, experience descriptions, and interview transcripts — for the purpose of skill extraction, gap analysis, and feedback generation.</p>
          <p><strong>Your data is never used to train Groq's AI models.</strong> Groq processes your data solely as a service provider under a data processing agreement. Groq's infrastructure is located in the United States. Processing occurs in real time on a per-request basis; your content is not retained by Groq after processing.</p>
          <p>For Groq's own privacy practices, see <a href="https://groq.com/privacy-policy/" target="_blank" rel="noopener noreferrer">groq.com/privacy-policy</a>.</p>
        </div>

        <div className="legal-section">
          <h2>5. Data Storage</h2>
          <p>All user data is stored in <strong>Supabase</strong>, a managed database platform hosted in the <strong>EU-West region (Ireland)</strong>. Data is encrypted at rest and in transit using industry-standard TLS/AES-256 encryption.</p>
          <p>Supabase acts as a data processor under a Data Processing Agreement compliant with GDPR Article 28. For Supabase's privacy practices, see <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">supabase.com/privacy</a>.</p>
        </div>

        <div className="legal-section">
          <h2>6. Voice Data Notice</h2>
          <p>The Live Simulation feature uses the <strong>Web Speech API</strong> built into your browser (Chrome/Edge) to transcribe your spoken answers. This transcription happens entirely <strong>locally in your browser</strong>. No audio stream, microphone recording, or audio file is ever sent to CareerDNA's servers or to any third party.</p>
          <p>Only the resulting text transcript is saved to your CareerDNA account in Supabase. You can delete any simulation session at any time from the Interview Prep page.</p>
        </div>

        <div className="legal-section legal-nda-section">
          <h2>7. Data Sensitivity &amp; Non-Disclosure Notice</h2>
          <p>By using CareerDNA's recording and analysis services, you acknowledge and agree to the following terms regarding data sensitivity and confidentiality:</p>
          <ol className="legal-nda-list">
            <li><strong>User Responsibility:</strong> You are solely responsible for the content of your voice and text recordings. CareerDNA is designed to capture professional achievements and skills, not trade secrets or proprietary corporate data.</li>
            <li><strong>Confidentiality &amp; NDAs:</strong> If your employment is subject to a Non-Disclosure Agreement (NDA) or any confidentiality obligation, you must ensure that your inputs do not violate such agreements. We strictly advise you to describe your activities in general, non-proprietary terms (e.g., focus on the process and results rather than specific client names, secret formulas, or unreleased product details).</li>
            <li><strong>Indemnification:</strong> CareerDNA shall not be held liable for any unauthorized disclosure of third-party confidential information resulting from your recordings. You agree to indemnify and hold CareerDNA harmless against any legal claims arising from a breach of your professional confidentiality obligations.</li>
            <li><strong>Privacy Commitment:</strong> While we employ a Privacy-First architecture (utilizing local transcription and sovereign AI models), no system is entirely immune to risk. Please exercise professional discretion in every interaction with the platform.</li>
          </ol>
        </div>

        <div className="legal-section">
          <h2>8. Data Retention</h2>
          <p>Your data is retained for as long as your account is active. You may delete any individual piece of content (journal entries, skills, experiences, CV, simulation sessions) at any time using the delete controls within the app.</p>
          <p>To request full account deletion and permanent erasure of all associated data, contact us using the details below. We will process your request within 30 days.</p>
        </div>

        <div className="legal-section">
          <h2>9. Your Rights (GDPR &amp; Swiss nLPD)</h2>
          <p>As a user in the European Union or Switzerland, you have the following rights regarding your personal data:</p>
          <ul>
            <li><strong>Right of access</strong> — you may request a copy of all personal data we hold about you</li>
            <li><strong>Right to rectification</strong> — you may correct inaccurate or incomplete data</li>
            <li><strong>Right to erasure</strong> — you may request deletion of your data ("right to be forgotten")</li>
            <li><strong>Right to portability</strong> — you may request your data in a structured, machine-readable format</li>
            <li><strong>Right to restriction</strong> — you may request that we limit processing of your data</li>
            <li><strong>Right to object</strong> — you may object to processing based on legitimate interest</li>
            <li><strong>Right to withdraw consent</strong> — you may withdraw consent at any time without affecting prior processing</li>
          </ul>
          <p>Most of these rights can be exercised directly within the app. For requests that require our assistance, contact us at the address below. Under the Swiss nLPD, the same rights apply and we will respond within the statutory timeframe.</p>
        </div>

        <div className="legal-section">
          <h2>10. Cookies and Local Storage</h2>
          <p>CareerDNA uses browser <strong>localStorage</strong> for the following non-tracking purposes:</p>
          <ul>
            <li>Storing your consent acknowledgement (<code>cdna_consent_v1</code>)</li>
            <li>Caching Skill Gap analysis results to reduce redundant AI API calls</li>
          </ul>
          <p>We do not use tracking cookies, advertising cookies, or any third-party analytics that collect personally identifiable information.</p>
        </div>

        <div className="legal-section">
          <h2>11. Changes to This Policy</h2>
          <p>We may update this Privacy Policy to reflect changes in our practices or legal requirements. When we do, we will update the "Last updated" date at the top of this page. For significant changes, we will notify you via the app.</p>
        </div>

        <div className="legal-section">
          <h2>12. Governing Law</h2>
          <p>This Privacy Policy is governed by the laws of the European Union (GDPR, Regulation 2016/679) and, for Swiss users, by the Swiss Federal Act on Data Protection (nLPD, effective 1 September 2023). Any disputes shall be resolved in the competent courts of the applicable jurisdiction.</p>
        </div>

        <div className="legal-divider" />

        <div className="legal-section">
          <h2>Contact</h2>
          <div className="legal-contact-box">
            <p>For privacy-related enquiries, data access requests, or to exercise your rights, please contact us at: <a href="mailto:lucagarbagnati03@gmail.com">lucagarbagnati03@gmail.com</a></p>
            <p style={{ marginTop: 8 }}>We aim to respond to all requests within <strong>30 calendar days</strong>.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
