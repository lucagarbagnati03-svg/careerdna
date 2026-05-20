// ─── Skill Gap shared utilities ────────────────────────────────────────────
// Single source of truth for skill-gap percentage calculation and localStorage
// caching. Import from here in every component — never duplicate this logic.

export function getSkillGapCache(role) {
  try {
    const raw = localStorage.getItem(`careerdna:role:${role.toLowerCase().trim()}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function setSkillGapCache(role, requirements) {
  try {
    localStorage.setItem(
      `careerdna:role:${role.toLowerCase().trim()}`,
      JSON.stringify(requirements)
    )
  } catch {}
}

/**
 * Calculate the weighted match percentage between a set of role requirements
 * and the skills a user actually has.
 *
 * @param {Array}  requirements  - Array of { name, importance } from Groq.
 *                                 importance must be 'essential' | 'preferred'.
 * @param {Set}    userSkillNames - Set of lowercase skill names from the DB.
 * @returns {number|null} 0-100 rounded integer, or null if no requirements.
 *
 * Weighting: essential skills count double.
 *   score = (essentialHave×2 + preferredHave) / (essential×2 + preferred) × 100
 */
export function calcMatchPct(requirements, userSkillNames) {
  if (!requirements?.length) return null
  const essential = requirements.filter(r => r.importance === 'essential')
  const preferred  = requirements.filter(r => r.importance === 'preferred')
  const essHave    = essential.filter(r => userSkillNames.has(r.name.toLowerCase())).length
  const prefHave   = preferred.filter(r => userSkillNames.has(r.name.toLowerCase())).length
  const denom      = essential.length * 2 + preferred.length
  return denom ? Math.round(((essHave * 2 + prefHave) / denom) * 100) : 0
}

export function pctColor(pct) {
  if (pct >= 70) return 'var(--success)'
  if (pct >= 40) return 'var(--warning)'
  return 'var(--danger)'
}

export function pctGradient(pct) {
  if (pct >= 70) return 'linear-gradient(90deg, #4ade80, #22c55e)'
  if (pct >= 40) return 'linear-gradient(90deg, #fbbf24, #f59e0b)'
  return 'linear-gradient(90deg, #f87171, #ef4444)'
}

export function pctGradientSvg(pct) {
  if (pct >= 70) return '#4ade80'
  if (pct >= 40) return '#fbbf24'
  return '#f87171'
}
