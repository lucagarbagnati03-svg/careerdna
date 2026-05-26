// CV skill extraction API
// Serverless function — runs on Vercel's Node.js runtime, never in the browser.
// Proxies the Groq CV scan so CORS restrictions don't apply.
// Requires: GROQ_API_KEY (or VITE_GROQ_API_KEY fallback) in Vercel environment variables.

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const CV_PROMPT = `You are an expert CV/resume parser. Extract every professional skill from the CV text provided.
Return ONLY a JSON array. Each item must have:
- "name": skill name (concise, 1-4 words)
- "category": one of "Technical", "Soft Skills", "Domain Knowledge", "Languages", "Tools & Software", "Certifications", "Other"
- "level": integer 1-5 inferred from experience depth (1=mentioned once, 3=used regularly, 5=expert/lead-level)

Be comprehensive: include technical skills, frameworks, tools, soft skills, domain expertise, languages, certifications.
Deduplicate. Return ONLY valid JSON, no markdown, no explanation.`

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY
  if (!apiKey) {
    console.error('[API] GROQ_API_KEY is not set in environment variables')
    return res.status(500).json({ error: 'AI service not configured. Missing API key.' })
  }

  const { cvText = '' } = req.body ?? {}

  if (!cvText || cvText.trim().length < 50) {
    return res.status(400).json({ error: 'cvText must be at least 50 characters' })
  }

  const truncated = cvText.slice(0, 28000)

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[API] CV scan attempt ${attempt}`)

      const groqRes = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: CV_PROMPT },
            { role: 'user',   content: `CV text:\n\n${truncated}` },
          ],
          temperature: 0.2,
          max_tokens: 2048,
        }),
      })

      if (groqRes.status === 429) {
        const err = await groqRes.json().catch(() => ({}))
        console.error(`[API] Groq rate limit (attempt ${attempt}):`, err)
        if (attempt < 3) {
          await sleep(attempt * 2000)
          continue
        }
        return res.status(429).json({
          error: 'Rate limit exceeded. Please wait a few minutes and try again.',
          status: 429,
        })
      }

      if (!groqRes.ok) {
        const err = await groqRes.json().catch(() => ({}))
        const msg = err?.error?.message ?? `Groq API error ${groqRes.status}`
        console.error(`[API] Groq error (attempt ${attempt}):`, groqRes.status, msg)
        if (attempt < 3) {
          await sleep(attempt * 2000)
          continue
        }
        return res.status(groqRes.status).json({ error: msg, status: groqRes.status })
      }

      const data    = await groqRes.json()
      const content = data.choices?.[0]?.message?.content ?? '[]'
      const clean   = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
      const skills  = JSON.parse(clean)

      if (!Array.isArray(skills)) {
        throw new Error('Invalid skills format returned by AI')
      }

      console.log(`[API] CV scan complete, extracted ${skills.length} skills`)
      return res.status(200).json({ skills })

    } catch (err) {
      console.error(`[API] CV scan failed (attempt ${attempt}):`, err.message)
      if (attempt < 3) {
        await sleep(attempt * 2000)
        continue
      }
      return res.status(500).json({ error: err.message || 'Failed to scan CV' })
    }
  }
}
