// Interview session analysis API - Updated with env vars
// Serverless function — runs on Vercel's Node.js runtime, never in the browser.
// Proxies the Groq analysis call so CORS restrictions don't apply.
// Requires: GROQ_API_KEY (or VITE_GROQ_API_KEY fallback) in Vercel environment variables.

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

  const { questionsAndAnswers = [], targetRole = '' } = req.body ?? {}

  if (!Array.isArray(questionsAndAnswers) || questionsAndAnswers.length === 0) {
    return res.status(400).json({ error: 'questionsAndAnswers must be a non-empty array' })
  }

  const role = (targetRole || 'General Professional').trim()

  // Build transcript — mirrors analyzeSimulation in src/lib/groq.js
  const transcript = questionsAndAnswers
    .map((qa, i) =>
      `Q${i + 1}: ${qa.question}\nA${i + 1}: ${(qa.answer ?? '').trim() || '(no answer given)'}`
    )
    .join('\n\n')

  const messages = [
    {
      role: 'system',
      content: `You are a senior interviewer who has just conducted a full mock interview for the role of ${role}.
You have read every question and every answer in this session. Your feedback MUST be deeply grounded in what the candidate actually said.

Rules — follow every one or the feedback is useless:
- STRENGTHS: Name 3 things the candidate genuinely did well, quoting or paraphrasing what they actually said. Start each with "In your answer to Q[N]..." or "When you described...". Never write a strength that could apply to any candidate.
- IMPROVEMENTS: Identify 3 specific gaps in the actual answers. Reference the question number and what was missing or weak. Example: "Your answer to Q4 described the situation but never explained what actions YOU personally took." Never write "improve your communication skills" or any other generic advice.
- TIP: Write one single actionable tip that is unique to THIS session and THIS candidate's performance. It must reference the role (${role}) and something specific they did or failed to do in these exact answers. It must be something they can do differently in their very next practice session — not a general directive like "prepare more examples". If every answer lacked quantified results, say exactly that and give a formula to fix it. If they spoke confidently but skipped the Result step repeatedly, point to question numbers and tell them exactly how to add it.
- SCORE: 1-10 based on how ready this candidate is for a real ${role} interview right now.
- Each simulation session must produce a different and unique tip based on the specific answers given. Never repeat generic advice.

Return ONLY a valid JSON object — no markdown, no explanation:
{
  "score": 7,
  "strengths": ["In your answer to Q2, you clearly described...", "...", "..."],
  "improvements": ["Your answer to Q5 listed tasks but never explained the outcome...", "...", "..."],
  "tip": "Specific, unique, actionable tip referencing this session."
}`,
    },
    {
      role: 'user',
      content: `Role: ${role}\n\nFull interview transcript:\n\n${transcript}`,
    },
  ]

  try {
    console.log(`[API] Analyzing simulation for role: ${role}, answers: ${questionsAndAnswers.length}`)

    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.4,
        max_tokens: 1200,
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

    const data    = await groqRes.json()
    const content = data.choices?.[0]?.message?.content ?? '{}'
    const clean   = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
    const report  = JSON.parse(clean)

    console.log('[API] Analysis complete, score:', report?.score)
    return res.status(200).json(report)

  } catch (err) {
    console.error('[API] Simulation analysis failed:', err)
    console.error('[API] Error details:', err.message)
    return res.status(500).json({ error: err.message || 'Failed to analyze simulation' })
  }
}
