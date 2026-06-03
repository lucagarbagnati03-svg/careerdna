// CV skill extraction API
// Serverless function — runs on Vercel's Node.js runtime, never in the browser.
// Proxies the Groq CV scan so CORS restrictions don't apply.
// Requires: GROQ_API_KEY (or VITE_GROQ_API_KEY fallback) in Vercel environment variables.

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

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

  // Step A1: extract 5 skill-related keywords from the CV text (best-effort)
  let keywords = []
  try {
    const kwRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'user',
            content: `Extract exactly 5 short skill-related keywords (2-3 words max each) from this text. Return only a JSON array of strings, nothing else: ${truncated.slice(0, 2000)}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 128,
      }),
    })
    if (kwRes.ok) {
      const kwData    = await kwRes.json()
      const kwContent = kwData.choices?.[0]?.message?.content ?? '[]'
      const kwClean   = kwContent.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
      keywords = JSON.parse(kwClean)
    }
  } catch {
    // keyword extraction is best-effort; proceed with empty list if it fails
  }

  // Step A2: search ESCO for skills matching each keyword — run in parallel (best-effort)
  const escoByUri = new Map()

  await Promise.all(keywords.map(async (keyword) => {
    try {
      const searchUrl = new URL('https://ec.europa.eu/esco/api/search')
      searchUrl.searchParams.set('text', keyword)
      searchUrl.searchParams.set('language', 'en')
      searchUrl.searchParams.set('type', 'skill')
      searchUrl.searchParams.set('selectedVersion', 'v1.2.0')
      searchUrl.searchParams.set('limit', '5')

      const searchRes = await fetch(searchUrl.toString())
      if (!searchRes.ok) return

      const searchData = await searchRes.json()
      const results    = searchData?._embedded?.results ?? []

      for (const r of results) {
        if (r.uri && !escoByUri.has(r.uri)) {
          escoByUri.set(r.uri, {
            uri:   r.uri,
            label: r.preferredLabel?.en ?? r.title ?? '',
          })
        }
      }
    } catch {
      // individual keyword search failure is non-fatal
    }
  }))

  const escoSkills    = Array.from(escoByUri.values())
  const escoByLabel   = new Map(escoSkills.map(s => [s.label.toLowerCase(), s]))
  const escoLabelsList = escoSkills.map(s => s.label).join('\n')

  const escoPrompt = `You are a career skills extractor. From the following CV text, identify which skills the person has.
You MUST only choose skills from this official ESCO list — do not invent any skill not in this list.
Return a JSON array of objects with this exact format, nothing else:
[{ "name": "skill label exactly as written in the list", "category": "choose one of: Technical, Soft Skills, Domain Knowledge, Tools & Software, Language", "level": a number from 1 to 5 }]

CV text: ${truncated}

ESCO skills list:
${escoLabelsList}`

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
            { role: 'user', content: escoPrompt },
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
      const parsed  = JSON.parse(clean)

      if (!Array.isArray(parsed)) {
        throw new Error('Invalid skills format returned by AI')
      }

      // Enrich each skill with esco_uri and esco_label by matching label (case-insensitive)
      const skills = parsed.map(skill => {
        const matched = escoByLabel.get(skill.name.toLowerCase())
        return {
          ...skill,
          esco_uri:   matched?.uri   ?? null,
          esco_label: matched?.label ?? skill.name,
        }
      })

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
