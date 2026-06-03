const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function callGroq(apiKey, prompt) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 1024,
      }),
    })

    if (res.status === 429) {
      const err = await res.json().catch(() => ({}))
      console.error(`[API] Groq rate limit (attempt ${attempt}):`, err)
      if (attempt < 3) { await sleep(attempt * 2000); continue }
      throw Object.assign(new Error('Rate limit exceeded. Please wait a few minutes and try again.'), { status: 429 })
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const msg = err?.error?.message ?? `Groq API error ${res.status}`
      console.error(`[API] Groq error (attempt ${attempt}):`, res.status, msg)
      if (attempt < 3) { await sleep(attempt * 2000); continue }
      throw Object.assign(new Error(msg), { status: res.status })
    }

    const data    = await res.json()
    const content = data.choices?.[0]?.message?.content ?? ''
    const clean   = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
    return JSON.parse(clean)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'AI service not configured. Missing API key.' })
  }

  const { action, role, skills, question, answer, questionsAndAnswers } = req.body ?? {}

  try {
    if (action === 'analyzeProfile') {
      const result = await callGroq(apiKey,
        `You are a career coach. Analyze this candidate's profile for the role of ${role}. Their skills are: ${skills}. Return a JSON object with: { readinessScore: number 0-100, strengths: string[], gaps: string[], advice: string }. Return only JSON, nothing else.`
      )
      return res.status(200).json(result)
    }

    if (action === 'generateQuestions') {
      const result = await callGroq(apiKey,
        `Generate 5 interview questions for the role of ${role}. The candidate has these skills: ${skills}. Return a JSON array of objects with: [{ question: string, tips: string, type: string }]. Return only JSON, nothing else.`
      )
      return res.status(200).json({ questions: result })
    }

    if (action === 'evaluateAnswer') {
      const result = await callGroq(apiKey,
        `You are an interview coach. Evaluate this answer for the role of ${role}. Question: ${question}. Answer: ${answer}. Candidate skills: ${skills}. Return a JSON object with: { score: number 0-100, feedback: string, improvements: string[] }. Return only JSON, nothing else.`
      )
      return res.status(200).json(result)
    }

    if (action === 'recalculateFeedback') {
      const result = await callGroq(apiKey,
        `You are an interview coach. Re-evaluate this complete interview session for the role of ${role}. Questions and answers: ${JSON.stringify(questionsAndAnswers)}. Return a JSON object with: { score: number 0-100, strengths: string[], improvements: string[], tip: string }. Return only JSON, nothing else.`
      )
      return res.status(200).json(result)
    }

    return res.status(400).json({ error: 'Unknown action' })

  } catch (err) {
    console.error('[API] interview-prep error:', err.message)
    return res.status(err.status ?? 500).json({ error: err.message || 'Internal server error' })
  }
}
