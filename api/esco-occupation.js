export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { role = '' } = req.body ?? {}

  if (!role.trim()) {
    return res.status(400).json({ error: 'role is required' })
  }

  try {
    // Step 1: search for the occupation
    const searchUrl = new URL('https://ec.europa.eu/esco/api/search')
    searchUrl.searchParams.set('text', role.trim())
    searchUrl.searchParams.set('language', 'en')
    searchUrl.searchParams.set('type', 'occupation')
    searchUrl.searchParams.set('selectedVersion', 'v1.2.0')
    searchUrl.searchParams.set('limit', '3')

    const searchRes = await fetch(searchUrl.toString())
    if (!searchRes.ok) {
      throw new Error(`ESCO search responded with ${searchRes.status}`)
    }

    const searchData = await searchRes.json()
    const results = searchData?._embedded?.results ?? []

    if (results.length === 0) {
      return res.status(404).json({ error: 'Occupation not found in ESCO' })
    }

    const first = results[0]
    const occupationUri   = first.uri
    const occupationLabel = first.preferredLabel?.en ?? first.title ?? ''

    // Validate that the returned label is close enough to what the user typed
    const levenshtein = (a, b) => {
      const m = a.length, n = b.length
      const dp = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
      )
      for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
          dp[i][j] = a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      return dp[m][n]
    }
    const normalize = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean)
    const wa = normalize(role.trim())
    const wb = normalize(occupationLabel)
    const matched = wa.filter(word => wb.some(label => levenshtein(word, label) <= 1)).length
    if (wa.length === 0 || matched / wa.length < 0.5) {
      return res.status(404).json({ error: 'Occupation not found in ESCO. Please check the spelling and try again.' })
    }

    // Step 2: fetch the occupation resource to get skill relationships
    const resourceUrl = new URL('https://ec.europa.eu/esco/api/resource/occupation')
    resourceUrl.searchParams.set('uri', occupationUri)
    resourceUrl.searchParams.set('language', 'en')
    resourceUrl.searchParams.set('selectedVersion', 'v1.2.0')

    const resourceRes = await fetch(resourceUrl.toString())
    if (!resourceRes.ok) {
      throw new Error(`ESCO resource responded with ${resourceRes.status}`)
    }

    const resourceData = await resourceRes.json()

    const rawEssential = resourceData?._links?.hasEssentialSkill ?? []
    const rawOptional  = resourceData?._links?.hasOptionalSkill  ?? []

    const essentialSkills = rawEssential.map(s => ({ uri: s.uri, label: s.title }))
    const optionalSkills  = rawOptional.map(s  => ({ uri: s.uri, label: s.title }))

    return res.status(200).json({
      occupation:     { uri: occupationUri, label: occupationLabel },
      essentialSkills,
      optionalSkills,
    })

  } catch (err) {
    console.error('[API] ESCO occupation error:', err.message)
    return res.status(500).json({ error: 'ESCO API error', detail: err.message })
  }
}
