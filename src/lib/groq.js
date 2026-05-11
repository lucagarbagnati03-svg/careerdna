const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY

const ROLE_ANALYSIS_PROMPT = `You are a senior career expert and hiring manager with deep knowledge of job markets worldwide.
Given a job title, return a JSON array of the key skills required for that role.
Each item must have:
- "name": skill name (concise, 1-4 words)
- "category": one of "Technical", "Soft Skills", "Domain", "Tools", "Other"
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
- "category": one of "Technical", "Soft Skills", "Domain", "Tools", "Other"
- "level": integer 1-5 inferred from context (1=beginner, 3=intermediate, 5=expert)

Example output:
[{"name":"React","category":"Technical","level":4},{"name":"Communication","category":"Soft Skills","level":3}]

Return an empty array [] if no clear skills are mentioned. Never return anything except valid JSON.`

const CV_PROMPT = `You are an expert CV/resume parser. Extract every professional skill from the CV text provided.
Return ONLY a JSON array. Each item must have:
- "name": skill name (concise, 1-4 words)
- "category": one of "Technical", "Soft Skills", "Domain", "Tools", "Other"
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
