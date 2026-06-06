const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

function parseGroqJson(text) {
  let s = (text ?? '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  const startArr = s.indexOf('['), startObj = s.indexOf('{')
  let start = startArr === -1 ? startObj : startObj === -1 ? startArr : Math.min(startArr, startObj)
  if (start === -1) return null
  const end = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'))
  if (end === -1 || end < start) return null
  return JSON.parse(s.slice(start, end + 1))
}

function isJsonResponse(r) {
  return r.ok && (r.headers.get('content-type') ?? '').includes('application/json')
}

async function groqChat(apiKey, messages, maxTokens, temperature) {
  const r = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: temperature ?? 0.3,
      max_tokens: maxTokens ?? 1024,
    }),
  })
  if (!r.ok) return null
  const data = await r.json()
  return data.choices?.[0]?.message?.content ?? null
}

// ESCO-backed extraction. Returns skill array on success, null to signal fallback needed.
async function extractWithEsco(text, apiKey) {
  // Step 1: extract keywords
  const kwContent = await groqChat(
    apiKey,
    [{ role: 'user', content: `Extract exactly 5 short skill-related keywords (2-3 words max each) from this text. Return only a JSON array of strings, nothing else: ${text}` }],
    128, 0.2,
  )
  let keywords = []
  try { keywords = parseGroqJson(kwContent) ?? [] } catch { keywords = [] }
  if (!Array.isArray(keywords) || keywords.length === 0) return null

  // Step 2: search ESCO — skip any keyword where ESCO returns non-JSON
  const escoByUri = new Map()
  await Promise.all(keywords.map(async keyword => {
    try {
      const url = new URL('https://ec.europa.eu/esco/api/search')
      url.searchParams.set('text', keyword)
      url.searchParams.set('language', 'en')
      url.searchParams.set('type', 'skill')
      url.searchParams.set('selectedVersion', 'v1.2.0')
      url.searchParams.set('limit', '5')
      const r = await fetch(url.toString())
      if (!isJsonResponse(r)) return
      const data = await r.json()
      for (const item of data?._embedded?.results ?? []) {
        if (item.uri && !escoByUri.has(item.uri)) {
          escoByUri.set(item.uri, { uri: item.uri, label: item.preferredLabel?.en ?? item.title ?? '' })
        }
      }
    } catch { /* skip this keyword */ }
  }))

  if (escoByUri.size === 0) return null  // ESCO gave nothing — trigger fallback

  const escoSkills = Array.from(escoByUri.values())
  const escoLabelsList = escoSkills.map(s => s.label).join('\n')

  // Step 3: identify which ESCO skills the person demonstrated
  const identifyContent = await groqChat(apiKey, [{
    role: 'user',
    content: `You are a career skills extractor. From the following text, identify which skills the person demonstrated.
You MUST only choose skills from this official ESCO list — do not invent any skill not in this list.
Return a JSON array of objects with this exact format, nothing else:
[{ "name": "skill label exactly as written in the list", "category": "choose one of: Technical, Soft Skills, Domain Knowledge, Tools & Software, Language", "level": a number from 1 to 5 }]

Text: ${text}

ESCO skills list:
${escoLabelsList}`,
  }])

  let identified = []
  try { identified = parseGroqJson(identifyContent) ?? [] } catch { identified = [] }
  if (!Array.isArray(identified)) identified = []

  // Step 4: match back to ESCO URIs by label
  const escoByLabel = new Map(escoSkills.map(s => [s.label.toLowerCase(), s]))
  return identified.map(skill => {
    const matched = escoByLabel.get((skill.name ?? '').toLowerCase())
    return {
      name:       skill.name,
      category:   skill.category,
      level:      skill.level,
      esco_uri:   matched?.uri   ?? null,
      esco_label: matched?.label ?? skill.name,
    }
  })
}

// Direct Groq extraction — used when ESCO is unavailable. Sets esco_uri/esco_label to null.
async function extractDirect(text, apiKey) {
  const content = await groqChat(apiKey, [{
    role: 'user',
    content: `Extract skills from this text. Return a JSON array of objects with { name, category, level } where category is one of: Technical, Soft Skills, Domain Knowledge, Tools & Software, Language. Level is 1-5. Return only valid JSON, nothing else.\n\nText: ${text}`,
  }])
  let skills = []
  try { skills = parseGroqJson(content) ?? [] } catch { skills = [] }
  if (!Array.isArray(skills)) skills = []
  return skills.map(s => ({ name: s.name, category: s.category, level: s.level, esco_uri: null, esco_label: null }))
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
    let skills = null
    try {
      skills = await extractWithEsco(text, apiKey)
    } catch (err) {
      console.error('[extract-skills] ESCO flow failed:', err.message)
    }

    if (!skills) {
      console.warn('[extract-skills] Falling back to direct Groq extraction')
      try {
        skills = await extractDirect(text, apiKey)
      } catch (err) {
        console.error('[extract-skills] Direct extraction failed:', err.message)
        skills = []
      }
    }

    return res.status(200).json({ skills: skills ?? [] })
  } catch (err) {
    console.error('[extract-skills] Unexpected error:', err.message)
    return res.status(200).json({ skills: [] })
  }
}
