const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

function parseGroqJson(text) {
  let s = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  const startArr = s.indexOf('['), startObj = s.indexOf('{')
  let start = startArr === -1 ? startObj : startObj === -1 ? startArr : Math.min(startArr, startObj)
  if (start === -1) return null
  const end = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'))
  if (end === -1 || end < start) return null
  return JSON.parse(s.slice(start, end + 1))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { text = '' } = req.body ?? {}

  if (!text.trim()) {
    return res.status(400).json({ error: 'text is required' })
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'AI service not configured. Missing API key.' })
  }

  try {
    // Step 1: Ask Groq to extract 5 skill-related keywords from the text
    const keywordsRes = await fetch(GROQ_API_URL, {
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
            content: `Extract exactly 5 short skill-related keywords (2-3 words max each) from this text. Return only a JSON array of strings, nothing else: ${text}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 128,
      }),
    })

    if (!keywordsRes.ok) {
      const err = await keywordsRes.json().catch(() => ({}))
      throw new Error(err?.error?.message ?? `Groq API error ${keywordsRes.status}`)
    }

    const keywordsData    = await keywordsRes.json()
    const keywordsContent = keywordsData.choices?.[0]?.message?.content ?? '[]'
    let keywords = []
    try { keywords = parseGroqJson(keywordsContent) ?? [] } catch { keywords = [] }
    if (!Array.isArray(keywords)) keywords = []

    // Step 2: Search ESCO for skills matching each keyword — run in parallel
    const escoByUri = new Map() // uri → { uri, label }

    await Promise.all(keywords.map(async (keyword) => {
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
    }))

    const escoSkills    = Array.from(escoByUri.values())
    const escoLabelsList = escoSkills.map(s => s.label).join('\n')

    // Step 3: Ask Groq to identify which ESCO skills the person demonstrated
    const identifyRes = await fetch(GROQ_API_URL, {
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
            content: `You are a career skills extractor. From the following text, identify which skills the person demonstrated.
You MUST only choose skills from this official ESCO list — do not invent any skill not in this list.
Return a JSON array of objects with this exact format, nothing else:
[{ "name": "skill label exactly as written in the list", "category": "choose one of: Technical, Soft Skills, Domain Knowledge, Tools & Software, Language", "level": a number from 1 to 5 }]

Text: ${text}

ESCO skills list:
${escoLabelsList}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    })

    if (!identifyRes.ok) {
      const err = await identifyRes.json().catch(() => ({}))
      throw new Error(err?.error?.message ?? `Groq API error ${identifyRes.status}`)
    }

    const identifyData    = await identifyRes.json()
    const identifyContent = identifyData.choices?.[0]?.message?.content ?? '[]'
    let identified = []
    try { identified = parseGroqJson(identifyContent) ?? [] } catch { identified = [] }
    if (!Array.isArray(identified)) identified = []

    // Step 4: Match each identified skill back to the ESCO results by label (case-insensitive)
    const escoByLabel = new Map(escoSkills.map(s => [s.label.toLowerCase(), s]))

    const skills = identified.map(skill => {
      const matched = escoByLabel.get(skill.name.toLowerCase())
      return {
        name:       skill.name,
        category:   skill.category,
        level:      skill.level,
        esco_uri:   matched?.uri   ?? null,
        esco_label: matched?.label ?? skill.name,
      }
    })

    return res.status(200).json({ skills })

  } catch (err) {
    console.error('[API] Skill extraction failed:', err.message)
    return res.status(500).json({ error: 'Skill extraction failed', detail: err.message })
  }
}
