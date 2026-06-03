// ─── Skill Gap shared utilities ────────────────────────────────────────────
// Single source of truth for skill-gap percentage calculation.
// Requirements are persisted in Supabase (user_preferences.job_requirements)
// so every device always reads the same data — no localStorage, no divergence.

import { supabase } from './supabase'

function wordOverlap(a, b) {
  const words = s => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean))
  const wa = words(a), wb = words(b)
  const shared = [...wa].filter(w => wb.has(w)).length
  return shared / Math.max(wa.size, wb.size)
}

function skillMatchesReq(skill, req) {
  if (skill.esco_uri && req.uri && skill.esco_uri === req.uri) return true
  if (skill.name.toLowerCase() === req.name.toLowerCase()) return true
  if (wordOverlap(skill.name, req.name) > 0.5) return true
  return false
}

/**
 * Call Groq to generate job requirements for `role`, immediately persist
 * them to user_preferences.job_requirements, and return the array.
 * This is the only place that writes requirements to the database.
 *
 * @param {string} userId  - auth user id
 * @param {string} role    - already normalised (lowercase, trimmed)
 * @returns {Array}        - requirements array from Groq
 */
export async function analyzeAndSaveRequirements(userId, role) {
  const res = await fetch('/api/esco-occupation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `ESCO API error ${res.status}`)
  }

  const { essentialSkills, optionalSkills } = await res.json()

  const reqs = [
    ...essentialSkills.map(s => ({ name: s.label, importance: 'essential', category: 'Other', uri: s.uri })),
    ...optionalSkills.map(s  => ({ name: s.label, importance: 'preferred', category: 'Other', uri: s.uri })),
  ]

  // DB save is best-effort: if job_requirements column doesn't exist yet (migration
  // not run) the upsert will fail, but we still return reqs so the UI works this session.
  try {
    await supabase.from('user_preferences').upsert(
      { user_id: userId, target_role: role, job_requirements: reqs },
      { onConflict: 'user_id' }
    )
  } catch (err) {
    console.warn('[skillGap] job_requirements not saved to DB:', err.message)
  }
  return reqs
}

/**
 * Calculate the weighted match percentage between a set of role requirements
 * and the skills a user actually has.
 *
 * @param {Array} requirements - Array of { name, importance, uri? } from ESCO.
 *                               importance must be 'essential' | 'preferred'.
 * @param {Array} userSkills   - Full skill objects from the DB ({ name, esco_uri, … }).
 * @returns {number|null} 0-100 rounded integer, or null if no requirements.
 *
 * A requirement is considered matched if ANY user skill satisfies skillMatchesReq:
 *   1. esco_uri match (both non-null)
 *   2. exact name match (case-insensitive)
 *   3. word overlap > 0.5
 *
 * Weighting: essential skills count double.
 *   score = (essentialHave×2 + preferredHave) / (essential×2 + preferred) × 100
 */
export function calcMatchPct(requirements, userSkills) {
  if (!requirements?.length) return null
  const essential = requirements.filter(r => r.importance === 'essential')
  const preferred  = requirements.filter(r => r.importance === 'preferred')
  const essHave    = essential.filter(r => userSkills.some(s => skillMatchesReq(s, r))).length
  const prefHave   = preferred.filter(r => userSkills.some(s => skillMatchesReq(s, r))).length
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
