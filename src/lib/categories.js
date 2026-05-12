export const CATEGORIES = [
  'Technical',
  'Soft Skills',
  'Domain Knowledge',
  'Languages',
  'Tools & Software',
  'Certifications',
  'Other',
]

// Maps legacy database values to their current display names.
// Skills already in Supabase with old names are shown under the correct heading.
const LEGACY_MAP = {
  'Domain':         'Domain Knowledge',
  'Tools':          'Tools & Software',
  'Certifications': 'Certifications',
}

// Returns the canonical display name for any category value.
export const displayCategory = cat => LEGACY_MAP[cat] ?? cat

// Returns display-ordered categories derived from an array of skill objects.
// Legacy names are mapped first, then ordered: known CATEGORIES first, unknown after.
export function orderedCategories(skills) {
  const displaySet = new Set(skills.map(s => displayCategory(s.category)))
  return [
    ...CATEGORIES.filter(c => displaySet.has(c)),
    ...[...displaySet].filter(c => !CATEGORIES.includes(c)).sort(),
  ]
}
