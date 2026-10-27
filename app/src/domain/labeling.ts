import type { LotComponent } from './types'

/**
 * US label-eligibility rules (27 CFR Part 4) computed from a lot's composition.
 *
 *  - Varietal:     ≥ 75% of the named grape (≥ 85% for AVA? no — AVA applies to origin)
 *  - Vintage:      ≥ 85% from the stated year; ≥ 95% if an AVA is stated
 *  - AVA:          ≥ 85% from the appellation
 *  - County:       ≥ 75%
 *  - State:        ≥ 75% federally (California requires 100% for "California")
 *  - Estate:       100% estate-grown, crushed, finished within the AVA
 *
 * These are decision aids, not legal advice; the compliance page says so too.
 */
export interface Share {
  label: string
  gallons: number
  pct: number
}

export function sharesBy(components: LotComponent[], key: (c: LotComponent) => string | undefined): Share[] {
  const total = components.reduce((s, c) => s + c.volumeGal, 0)
  const map = new Map<string, number>()
  for (const c of components) {
    const k = key(c) || 'Unknown'
    map.set(k, (map.get(k) ?? 0) + c.volumeGal)
  }
  return [...map.entries()]
    .map(([label, gallons]) => ({ label, gallons, pct: total ? (gallons / total) * 100 : 0 }))
    .sort((a, b) => b.gallons - a.gallons)
}

export interface EligibilityLine {
  rule: string
  claim: string
  pct: number
  threshold: number
  ok: boolean
  note?: string
}

export function labelEligibility(components: LotComponent[]): EligibilityLine[] {
  if (!components.length) return []
  const lines: EligibilityLine[] = []
  const variety = sharesBy(components, (c) => c.variety)[0]
  lines.push({
    rule: 'Varietal designation',
    claim: variety.label,
    pct: variety.pct,
    threshold: 75,
    ok: variety.pct >= 75,
    note: variety.pct < 75 ? 'Label as a blend or list varieties with percentages (must total 100%).' : undefined,
  })

  const ava = sharesBy(components, (c) => c.ava)[0]
  const avaOk = ava.label !== 'Unknown' && ava.pct >= 85
  lines.push({ rule: 'AVA appellation', claim: ava.label, pct: ava.pct, threshold: 85, ok: avaOk })

  const vintage = sharesBy(components, (c) => String(c.vintage))[0]
  const vintageThreshold = avaOk ? 95 : 85
  lines.push({
    rule: 'Vintage date',
    claim: vintage.label,
    pct: vintage.pct,
    threshold: vintageThreshold,
    ok: vintage.label !== 'NV' && vintage.pct >= vintageThreshold,
    note: avaOk ? '95% required when an AVA is stated.' : '85% with a county/state appellation.',
  })

  const county = sharesBy(components, (c) => c.county)[0]
  lines.push({ rule: 'County appellation', claim: county.label, pct: county.pct, threshold: 75, ok: county.label !== 'Unknown' && county.pct >= 75 })

  const state = sharesBy(components, (c) => c.state)[0]
  const stateThreshold = state.label === 'CA' ? 100 : 75
  lines.push({
    rule: 'State appellation',
    claim: state.label,
    pct: state.pct,
    threshold: stateThreshold,
    ok: state.label !== 'Unknown' && state.pct >= stateThreshold,
    note: state.label === 'CA' ? 'California law requires 100% California fruit.' : undefined,
  })

  const estateGal = components.filter((c) => c.estate).reduce((s, c) => s + c.volumeGal, 0)
  const total = components.reduce((s, c) => s + c.volumeGal, 0)
  const estatePct = total ? (estateGal / total) * 100 : 0
  lines.push({ rule: 'Estate bottled', claim: 'Estate', pct: estatePct, threshold: 100, ok: estatePct >= 100 })
  return lines
}
