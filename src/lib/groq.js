const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function groqJSON(messages, maxTokens = 1024, temperature = 0.3, _attempt = 0) {
  const body = { model: 'llama-3.3-70b-versatile', messages, temperature, max_tokens: maxTokens }

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify(body),
  })

  // Rate limit — wait 6 s and retry once
  if (res.status === 429 && _attempt === 0) {
    await sleep(6000)
    return groqJSON(messages, maxTokens, temperature, 1)
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message ?? `Groq API error ${res.status}`
    // Surface a friendlier message for persistent rate limits
    if (res.status === 429) throw new Error('Rate limit reached. Please wait a moment and try again.')
    throw new Error(msg)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  const clean = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  return JSON.parse(clean)
}

function formatProfile({ skills = [], experiences = [], targetRole }) {
  const skillsStr = skills.slice(0, 25)
    .map(s => `${s.name} (Level ${s.level}/5, ${s.category})`).join(', ') || 'None listed'
  const expStr = experiences.slice(0, 5).map(e => {
    const start = e.start_date?.slice(0, 7) ?? '?'
    const end   = e.end_date?.slice(0, 7)   ?? 'Present'
    const desc  = e.description ? ': ' + e.description.slice(0, 180) : ''
    return `${e.title} at ${e.company} (${start}–${end})${desc}`
  }).join('\n') || 'None listed'
  return { skillsStr, expStr, role: targetRole || 'General Professional Role' }
}

// ── Interview: profile analysis ───────────────────────────────────────────────
export async function analyzeInterviewProfile(profile) {
  const { skillsStr, expStr, role } = formatProfile(profile)
  return groqJSON([
    {
      role: 'system',
      content: `You are a senior recruiter and career coach. Analyze a candidate profile for an interview.
Return ONLY a valid JSON object with this exact shape — no markdown, no extra text:
{
  "strengths": ["specific strength 1", "specific strength 2", "specific strength 3"],
  "improvements": ["gap or weakness 1", "gap or weakness 2", "gap or weakness 3"],
  "tip": "One specific, actionable interview tip personalized to this candidate."
}
strengths/improvements must reference the candidate's actual skills and experience.`,
    },
    {
      role: 'user',
      content: `Target role: ${role}\nSkills: ${skillsStr}\nExperiences:\n${expStr}`,
    },
  ], 800, 0.4)
}

// ── Interview: question generation ───────────────────────────────────────────
export async function generateInterviewQuestions(profile) {
  const { skillsStr, expStr, role } = formatProfile(profile)
  return groqJSON([
    {
      role: 'system',
      content: `You are a senior interviewer preparing questions for a candidate interview.
Generate 9 highly personalized interview questions. Mix behavioral (STAR-method) and role-specific technical.
Reference the candidate's actual background. Cover both strengths and potential gaps.
Return ONLY a JSON array of objects — no markdown:
[{"question": "...", "type": "behavioral"}, {"question": "...", "type": "technical"}, ...]
type must be exactly "behavioral" or "technical".`,
    },
    {
      role: 'user',
      content: `Target role: ${role}\nSkills: ${skillsStr}\nExperiences:\n${expStr}`,
    },
  ], 1200, 0.5)
}

// ── Interview: answer evaluation ──────────────────────────────────────────────
export async function evaluateInterviewAnswer(question, answer, targetRole) {
  return groqJSON([
    {
      role: 'system',
      content: `You are a senior interviewer evaluating an interview answer.
Return ONLY a valid JSON object — no markdown:
{
  "score": 7,
  "good": "What was strong about this answer (2-3 sentences).",
  "missing": "Key elements that were absent or weak (2-3 sentences).",
  "improve": "Specific, actionable advice to improve the answer (2-3 sentences).",
  "rewrite": "A complete rewritten example of a strong answer to this question."
}
score is 1-10. rewrite should be a full, well-structured response using the STAR method if behavioral.`,
    },
    {
      role: 'user',
      content: `Target role: ${targetRole || 'General'}\nQuestion: ${question}\nCandidate answer: ${answer}`,
    },
  ], 1200, 0.3)
}

const ROLE_ANALYSIS_PROMPT = `You are a senior career expert and hiring manager with deep knowledge of job markets worldwide.
Given a job title, return a JSON array of the key skills required for that role.
Each item must have:
- "name": skill name (concise, 1-4 words)
- "category": one of "Technical", "Soft Skills", "Domain Knowledge", "Languages", "Tools & Software", "Certifications", "Other"
- "importance": exactly "essential" or "preferred"

Rules:
- Return 12-16 skills total, covering a realistic mix of technical and soft skills for the role
- "essential" = must-have to get the job; "preferred" = nice to have / differentiator
- Be specific to the role (e.g. "Hotel Manager" needs "Revenue Management", "PMS Software", "Guest Relations")
- Return ONLY a valid JSON array, no markdown, no explanation.`

export async function analyzeRoleRequirements(role) {
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: ROLE_ANALYSIS_PROMPT },
        { role: 'user', content: `Job title: "${role}"` },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Groq API error ${res.status}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? '[]'
  const clean = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  return JSON.parse(clean)
}

const SYSTEM_PROMPT = `You are a career coach AI. Extract professional skills from a journal entry.
Return ONLY a JSON array. Each item must have:
- "name": skill name (concise, 1-4 words)
- "category": one of "Technical", "Soft Skills", "Domain Knowledge", "Languages", "Tools & Software", "Certifications", "Other"
- "level": integer 1-5 inferred from context (1=beginner, 3=intermediate, 5=expert)

Example output:
[{"name":"React","category":"Technical","level":4},{"name":"Communication","category":"Soft Skills","level":3}]

Return an empty array [] if no clear skills are mentioned. Never return anything except valid JSON.`

const CV_PROMPT = `You are an expert CV/resume parser. Extract every professional skill from the CV text provided.
Return ONLY a JSON array. Each item must have:
- "name": skill name (concise, 1-4 words)
- "category": one of "Technical", "Soft Skills", "Domain Knowledge", "Languages", "Tools & Software", "Certifications", "Other"
- "level": integer 1-5 inferred from experience depth (1=mentioned once, 3=used regularly, 5=expert/lead-level)

Be comprehensive: include technical skills, frameworks, tools, soft skills, domain expertise, languages, certifications.
Deduplicate. Return ONLY valid JSON, no markdown, no explanation.`

export async function extractSkillsFromCV(text) {
  const truncated = text.slice(0, 28000)
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: CV_PROMPT },
        { role: 'user', content: `CV text:\n\n${truncated}` },
      ],
      temperature: 0.2,
      max_tokens: 2048,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Groq API error ${res.status}`)
  }
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? '[]'
  const clean = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  return JSON.parse(clean)
}

export async function extractSkillsFromText(text) {
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Extract skills from this journal entry:\n\n${text}` },
      ],
      temperature: 0.2,
      max_tokens: 512,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Groq API error ${res.status}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? '[]'

  // Strip markdown code fences if the model wraps output
  const clean = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  return JSON.parse(clean)
}
