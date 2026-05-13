import { useNavigate } from 'react-router-dom'
import './Legal.css'

export default function TermsOfService() {
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
          <h1 className="legal-title">Terms of Service</h1>
          <p className="legal-updated">Last updated: 13 May 2026</p>
        </div>

        <div className="legal-section">
          <h2>1. Acceptance of Terms</h2>
          <p>By creating an account or using CareerDNA ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, you must not use the Service. These Terms apply to all users of CareerDNA.</p>
          <p>We reserve the right to update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the updated Terms.</p>
        </div>

        <div className="legal-section">
          <h2>2. Description of Service</h2>
          <p>CareerDNA is an AI-powered career preparation tool that helps users:</p>
          <ul>
            <li>Document and reflect on their professional experiences through a journal</li>
            <li>Extract and track their professional skills</li>
            <li>Analyse skill gaps against target job roles</li>
            <li>Prepare for job interviews with AI-generated questions and feedback</li>
            <li>Practice interviews through a voice-based live simulation</li>
            <li>Scan and analyse their CV for skill extraction</li>
          </ul>
          <p>The Service uses third-party AI providers (Groq) and database infrastructure (Supabase) to deliver its functionality.</p>
        </div>

        <div className="legal-section">
          <h2>3. User Responsibilities</h2>
          <p>By using CareerDNA, you agree to:</p>
          <ul>
            <li>Provide accurate information and keep your account details up to date</li>
            <li>Use the Service only for lawful purposes and in accordance with these Terms</li>
            <li>Not upload content that infringes third-party intellectual property rights</li>
            <li><strong>Not upload confidential, proprietary, or NDA-protected information</strong> belonging to your employer or any third party. CareerDNA is a personal career tool — you are solely responsible for ensuring the content you enter does not violate any confidentiality obligations you are subject to</li>
            <li>Not attempt to reverse-engineer, scrape, or abuse the Service or its underlying APIs</li>
            <li>Keep your login credentials secure and notify us immediately of any unauthorised access</li>
          </ul>
          <p>You are solely responsible for all content you create, upload, or generate through the Service.</p>
        </div>

        <div className="legal-section">
          <h2>4. AI-Generated Content Disclaimer</h2>
          <p>CareerDNA uses artificial intelligence (Groq's llama-3.3-70b-versatile model) to generate skill analyses, interview questions, gap assessments, and performance feedback. You acknowledge that:</p>
          <ul>
            <li>AI-generated outputs are <strong>suggestions only</strong> and do not constitute professional career advice, legal advice, or professional coaching</li>
            <li>AI outputs may be inaccurate, incomplete, or inappropriate for your specific circumstances</li>
            <li>You should exercise your own judgement before acting on any AI-generated recommendation</li>
            <li>CareerDNA makes no warranty regarding the accuracy, completeness, or fitness for purpose of AI-generated content</li>
          </ul>
          <p>For important career decisions, we recommend consulting a qualified career professional or coach.</p>
        </div>

        <div className="legal-section">
          <h2>5. Intellectual Property</h2>
          <p>The CareerDNA application, its design, code, and non-user-generated content are the intellectual property of the CareerDNA developer. You are granted a limited, non-exclusive, non-transferable licence to use the Service for your personal career development purposes only.</p>
          <p>Content you create within CareerDNA (journal entries, skills, experience descriptions) remains your property. By using the Service, you grant CareerDNA a limited licence to process and display that content solely for the purpose of providing the Service to you.</p>
        </div>

        <div className="legal-section">
          <h2>6. Limitation of Liability</h2>
          <p>To the fullest extent permitted by applicable law, CareerDNA and its developer shall not be liable for:</p>
          <ul>
            <li>Any indirect, incidental, special, or consequential damages arising from your use of the Service</li>
            <li>Loss of data, loss of career opportunities, or employment outcomes</li>
            <li>The accuracy or completeness of AI-generated content</li>
            <li>Interruptions or errors in the Service caused by third-party providers (Groq, Supabase)</li>
          </ul>
          <p>The Service is provided "as is" and "as available" without any warranty of uninterrupted or error-free operation.</p>
        </div>

        <div className="legal-section">
          <h2>7. Termination</h2>
          <p>You may stop using the Service and request deletion of your account at any time by contacting us.</p>
          <p>We reserve the right to suspend or terminate your account if you violate these Terms or use the Service in a manner that is harmful to other users or to the Service's integrity.</p>
        </div>

        <div className="legal-section">
          <h2>8. Changes to Terms</h2>
          <p>We may update these Terms of Service from time to time. The "Last updated" date at the top of this page will reflect the most recent revision. For material changes, we will provide notice within the application. Continued use of the Service after any changes constitutes acceptance of the revised Terms.</p>
        </div>

        <div className="legal-section">
          <h2>9. Governing Law</h2>
          <p>These Terms of Service are governed by and construed in accordance with the laws of the European Union and, for users in Switzerland, by applicable Swiss law. Any disputes arising from these Terms or your use of the Service shall be subject to the exclusive jurisdiction of the competent courts of the applicable jurisdiction.</p>
        </div>

        <div className="legal-divider" />

        <div className="legal-section">
          <h2>Contact</h2>
          <div className="legal-contact-box">
            <p>For any questions regarding these Terms of Service, please contact us at: <a href="mailto:lucagarbagnati03@gmail.com">lucagarbagnati03@gmail.com</a></p>
          </div>
        </div>
      </div>
    </div>
  )
}
