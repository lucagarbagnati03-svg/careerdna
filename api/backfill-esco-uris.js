const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const sbHeaders = {
    'apikey':        supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type':  'application/json',
  }

  // 1. Fetch all skills with no esco_uri
  let skills
  try {
    const fetchRes = await fetch(
      `${supabaseUrl}/rest/v1/skills?esco_uri=is.null&select=id,name`,
      { headers: sbHeaders }
    )
    if (!fetchRes.ok) {
      const text = await fetchRes.text()
      return res.status(500).json({ error: 'Failed to fetch skills from Supabase', detail: text })
    }
    skills = await fetchRes.json()
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch skills from Supabase', detail: err.message })
  }

  const total = skills.length
  let updated = 0
  let errors  = 0

  // 2. Process in batches of 5
  for (let i = 0; i < skills.length; i += 5) {
    const batch = skills.slice(i, i + 5)

    await Promise.all(batch.map(async skill => {
      try {
        // Search ESCO for the best matching skill
        const escoRes = await fetch(
          `https://ec.europa.eu/esco/api/search?text=${encodeURIComponent(skill.name)}&language=en&type=skill&selectedVersion=v1.2.0&limit=1`
        )
        if (!escoRes.ok) { errors++; return }

        const escoData = await escoRes.json()
        const first    = escoData._embedded?.results?.[0]
        if (!first) return  // no result — leave esco_uri null, don't count as error

        const esco_uri   = first.uri
        const esco_label = first.preferredLabel?.en ?? null
        if (!esco_uri) { errors++; return }

        // Update the skill in Supabase
        const patchRes = await fetch(
          `${supabaseUrl}/rest/v1/skills?id=eq.${skill.id}`,
          {
            method:  'PATCH',
            headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
            body:    JSON.stringify({ esco_uri, esco_label }),
          }
        )
        if (!patchRes.ok) { errors++; return }

        updated++
      } catch {
        errors++
      }
    }))

    // Wait 500ms between batches (skip after last batch)
    if (i + 5 < skills.length) await sleep(500)
  }

  return res.status(200).json({ updated, total, errors })
}
