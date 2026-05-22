// Interview questions generation API - Updated with env vars
// Serverless function — runs on Vercel's Node.js runtime, never in the browser.
// Proxies the Groq API call so CORS restrictions don't apply.
// Requires: GROQ_API_KEY set in Vercel project environment variables (Settings → Environment Variables).

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY
  if (!apiKey) {
    console.error('[API] GROQ_API_KEY is not set in environment variables')
    return res.status(500).json({ error: 'AI service not configured. Missing API key.' })
  }

  const {
    activeRole       = 'General Professional',
    count            = 10,
    skills           = [],
    experiences      = [],
    previousQuestions = [],
  } = req.body ?? {}

  const role = (String(activeRole)).trim() || 'General Professional'

  // Mirror the formatProfile logic from src/lib/groq.js
  const skillsStr = skills.slice(0, 25)
    .map(s => `${s.name} (Level ${s.level}/5, ${s.category})`).join(', ') || 'None listed'

  const expStr = experiences.slice(0, 5).map(e => {
    const start = e.start_date?.slice(0, 7) ?? '?'
    const end   = e.end_date?.slice(0, 7)   ?? 'Present'
    const desc  = e.description ? ': ' + e.description.slice(0, 180) : ''
    return `${e.title} at ${e.company} (${start}–${end})${desc}`
  }).join('\n') || 'None listed'

  const avoidBlock = previousQuestions.length > 0
    ? `\n\nDo NOT use any of these questions that were already asked in previous sessions:\n${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\nGenerate completely fresh and different questions for this interview.`
    : ''

  const messages = [
    {
      role: 'system',
      content: `You are a professional interviewer conducting a job interview for the position of ${role}. Generate ${count} interview questions tailored specifically for this exact role.
Rules:
- Questions must sound natural when spoken aloud
- Mix behavioral (STAR-method) and ${role}-specific technical questions
- Vary difficulty: start medium, build to challenging, end reflective
- Reference the candidate's background where relevant
- Do NOT number the questions${avoidBlock}
Return ONLY a JSON array of question strings — no markdown, nothing else.
["question 1", "question 2", ...]`,
    },
    {
      role: 'user',
      content: `Role: ${role}\nSkills: ${skillsStr}\nExperiences:\n${expStr}`,
    },
  ]

  try {
    console.log(`[API] Generating ${count} questions for role: ${role}`)

    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.7,
        max_tokens: Math.max(count * 80, 600),
      }),
    })

    if (groqRes.status === 429) {
      const err = await groqRes.json().catch(() => ({}))
      console.error('[API] Groq rate limit:', err)
      return res.status(429).json({
        error: 'Rate limit exceeded. Please wait a few minutes and try again.',
        status: 429,
      })
    }

    if (!groqRes.ok) {
      const err = await groqRes.json().catch(() => ({}))
      const msg = err?.error?.message ?? `Groq API error ${groqRes.status}`
      console.error('[API] Groq error:', groqRes.status, msg)
      return res.status(groqRes.status).json({ error: msg, status: groqRes.status })
    }

    const data     = await groqRes.json()
    const content  = data.choices?.[0]?.message?.content ?? '[]'
    const clean    = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
    const questions = JSON.parse(clean)

    if (!Array.isArray(questions)) {
      throw new Error('Invalid questions format returned by AI')
    }

    console.log(`[API] Returning ${Math.min(questions.length, count)} questions`)
    return res.status(200).json({ questions: questions.slice(0, count) })

  } catch (err) {
    console.error('[API] Interview question generation failed:', err)
    console.error('[API] Error details:', err.message)
    return res.status(500).json({ error: err.message || 'Failed to generate questions' })
  }
}
