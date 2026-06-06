export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { text = '', type = 'occupation', limit = 10 } = req.body ?? {}

  if (!text.trim()) {
    return res.status(400).json({ error: 'text is required' })
  }

  try {
    const url = new URL('https://ec.europa.eu/esco/api/search')
    url.searchParams.set('text', text.trim())
    url.searchParams.set('language', 'en')
    url.searchParams.set('type', type)
    url.searchParams.set('selectedVersion', 'v1.2.0')
    url.searchParams.set('limit', String(limit))

    const escoRes = await fetch(url.toString())

    if (!escoRes.ok || !(escoRes.headers.get('content-type') ?? '').includes('application/json')) {
      return res.status(200).json({ results: [] })
    }

    const data = await escoRes.json()
    return res.status(200).json({ results: data?._embedded?.results ?? [] })
  } catch {
    return res.status(200).json({ results: [] })
  }
}
