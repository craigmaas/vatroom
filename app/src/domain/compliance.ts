import type { CrushRecord, Lot, LotEvent, OrgData, TaxClass } from './types'

/**
 * Compliance math. Everything here is derived from the event log so a report
 * can be regenerated for any period, and an auditor can trace every number
 * back to the operations that produced it.
 */

export const TAX_CLASSES: TaxClass[] = ['still ≤16%', 'still 16–21%', 'still 21–24%', 'artificially carbonated', 'sparkling', 'hard cider']

/** Federal excise rates per wine gallon (26 USC 5041) before CBMA credits */
export const EXCISE_RATES: Record<TaxClass, number> = {
  'still ≤16%': 1.07,
  'still 16–21%': 1.57,
  'still 21–24%': 3.15,
  'artificially carbonated': 3.3,
  sparkling: 3.4,
  'hard cider': 0.226,
}

/** CBMA credit per gallon on the first 30,000 gallons removed (still wine) */
export const CBMA_CREDIT_FIRST_30K = 1.0
export const CBMA_CREDIT_NEXT_100K = 0.9
export const CBMA_CREDIT_NEXT_620K = 0.535

export interface Period {
  start: Date
  end: Date // exclusive
  label: string
}

export function periodFor(kind: 'monthly' | 'quarterly' | 'annual', year: number, index: number): Period {
  if (kind === 'monthly') {
    const start = new Date(year, index, 1)
    const end = new Date(year, index + 1, 1)
    return { start, end, label: start.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }
  }
  if (kind === 'quarterly') {
    const start = new Date(year, index * 3, 1)
    const end = new Date(year, index * 3 + 3, 1)
    return { start, end, label: `Q${index + 1} ${year}` }
  }
  return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1), label: `Calendar ${year}` }
}

export interface BulkLine {
  taxClass: TaxClass
  onHandStart: number
  producedByFermentation: number
  receivedInBond: number
  gainsAdjustments: number
  transferredInBond: number
  bottled: number
  taxpaidRemovals: number
  losses: number
  onHandEnd: number
  /** book end computed from the ledger lines; difference vs. physical = shortage/overage */
  bookEnd: number
}

function inPeriod(e: LotEvent, p: Period) {
  const t = new Date(e.at).getTime()
  return t >= p.start.getTime() && t < p.end.getTime()
}

/** Volume of a lot at a moment in time, by replaying its events */
export function lotVolumeAt(events: LotEvent[], at: Date): number {
  const t = at.getTime()
  let v = 0
  for (const e of events) {
    if (new Date(e.at).getTime() >= t) break
    if (e.volumeAfterGal !== undefined) v = e.volumeAfterGal
  }
  return v
}

export function currentVolume(lot: Lot): number {
  return lot.holds.reduce((s, h) => s + h.gallons, 0)
}

/** Report of Wine Premises Operations (TTB F 5120.17) — Part I Section A, bulk wine */
export function bulkWineReport(data: OrgData, p: Period): BulkLine[] {
  const byLot = new Map<string, LotEvent[]>()
  for (const e of [...data.events].sort((a, b) => a.at.localeCompare(b.at))) {
    if (!byLot.has(e.lotId)) byLot.set(e.lotId, [])
    byLot.get(e.lotId)!.push(e)
  }
  const lines = new Map<TaxClass, BulkLine>()
  const line = (tc: TaxClass) => {
    if (!lines.has(tc))
      lines.set(tc, {
        taxClass: tc,
        onHandStart: 0,
        producedByFermentation: 0,
        receivedInBond: 0,
        gainsAdjustments: 0,
        transferredInBond: 0,
        bottled: 0,
        taxpaidRemovals: 0,
        losses: 0,
        onHandEnd: 0,
        bookEnd: 0,
      })
    return lines.get(tc)!
  }
  for (const lot of data.lots) {
    const evs = byLot.get(lot.id) ?? []
    const L = line(lot.taxClass)
    L.onHandStart += lotVolumeAt(evs, p.start)
    L.onHandEnd += lotVolumeAt(evs, p.end)
    for (const e of evs) {
      if (!inPeriod(e, p)) continue
      switch (e.kind) {
        case 'created': {
          // first volume on the books is "produced by fermentation" for grape lots, "received in bond" for bulk wine
          const firstVol = evs.find((x) => x.volumeAfterGal && x.volumeAfterGal > 0 && new Date(x.at).getTime() >= new Date(e.at).getTime())?.volumeAfterGal ?? 0
          const bulk = lot.components.length > 0 && lot.components.every((c) => c.type === 'Bulk Wine')
          if (bulk) L.receivedInBond += firstVol
          else L.producedByFermentation += firstVol
          break
        }
        case 'gain':
          L.gainsAdjustments += e.gallons ?? 0
          break
        case 'loss':
          L.losses += e.gallons ?? 0
          break
        case 'transfer-in-bond':
          L.transferredInBond += e.gallons ?? 0
          break
        case 'bottling':
          L.bottled += e.gallons ?? 0
          break
        case 'taxpaid-removal':
          L.taxpaidRemovals += e.gallons ?? 0
          break
        case 'receipt':
          L.receivedInBond += e.gallons ?? 0
          break
        default:
          break
      }
    }
  }
  for (const L of lines.values()) {
    L.bookEnd = L.onHandStart + L.producedByFermentation + L.receivedInBond + L.gainsAdjustments - L.transferredInBond - L.bottled - L.taxpaidRemovals - L.losses
  }
  return [...lines.values()].sort((a, b) => TAX_CLASSES.indexOf(a.taxClass) - TAX_CLASSES.indexOf(b.taxClass))
}

export interface MaterialsUsed {
  variety: string
  tons: number
  lots: number
}

/** Part IV — materials received and used in wine production (grape tons by variety) */
export function materialsReceived(crush: CrushRecord[], p: Period): MaterialsUsed[] {
  const map = new Map<string, MaterialsUsed>()
  for (const c of crush) {
    const t = new Date(c.date).getTime()
    if (t < p.start.getTime() || t >= p.end.getTime()) continue
    const m = map.get(c.variety) ?? { variety: c.variety, tons: 0, lots: 0 }
    m.tons += c.tons
    m.lots += 1
    map.set(c.variety, m)
  }
  return [...map.values()].sort((a, b) => b.tons - a.tons)
}

export interface ExciseLine {
  taxClass: TaxClass
  gallons: number
  rate: number
  gross: number
  credit: number
  net: number
}

/** Excise tax (TTB F 5000.24) summary for taxpaid removals in the period */
export function exciseSummary(data: OrgData, p: Period, ytdRemovedBefore = 0): ExciseLine[] {
  const byClass = new Map<TaxClass, number>()
  const lotById = new Map(data.lots.map((l) => [l.id, l]))
  for (const e of data.events) {
    if (e.kind !== 'taxpaid-removal' || !inPeriod(e, p)) continue
    const lot = lotById.get(e.lotId)
    if (!lot) continue
    byClass.set(lot.taxClass, (byClass.get(lot.taxClass) ?? 0) + (e.gallons ?? 0))
  }
  let cumulative = ytdRemovedBefore
  return [...byClass.entries()].map(([taxClass, gallons]) => {
    const rate = EXCISE_RATES[taxClass]
    const gross = gallons * rate
    // CBMA tiers
    let credit = 0
    let remaining = gallons
    const tiers: [number, number][] = [
      [30000, CBMA_CREDIT_FIRST_30K],
      [130000, CBMA_CREDIT_NEXT_100K],
      [750000, CBMA_CREDIT_NEXT_620K],
    ]
    for (const [cap, c] of tiers) {
      if (remaining <= 0) break
      const room = Math.max(0, cap - cumulative)
      const take = Math.min(room, remaining)
      credit += take * (taxClass === 'hard cider' ? Math.min(c, rate) : c)
      remaining -= take
      cumulative += take
    }
    return { taxClass, gallons, rate, gross, credit: Math.min(credit, gross), net: Math.max(0, gross - credit) }
  })
}

/** California Grape Crush Report rows (CDFA) — tons by variety / district / price */
export function grapeCrushReport(crush: CrushRecord[], year: number) {
  const map = new Map<string, { variety: string; district: string; tons: number; dollars: number; priced: number }>()
  for (const c of crush) {
    if (new Date(c.date).getFullYear() !== year) continue
    const key = `${c.variety}|${c.district ?? c.county}`
    const m = map.get(key) ?? { variety: c.variety, district: c.district ?? c.county, tons: 0, dollars: 0, priced: 0 }
    m.tons += c.tons
    if (c.pricePerTon) {
      m.dollars += c.pricePerTon * c.tons
      m.priced += c.tons
    }
    map.set(key, m)
  }
  return [...map.values()].map((m) => ({ ...m, avgPrice: m.priced ? m.dollars / m.priced : undefined })).sort((a, b) => a.variety.localeCompare(b.variety))
}

/** Alerts the compliance officer should see on the dashboard */
export function complianceAlerts(data: OrgData, now = new Date()): { level: 'warn' | 'danger' | 'info'; text: string; href?: string }[] {
  const alerts: { level: 'warn' | 'danger' | 'info'; text: string; href?: string }[] = []
  // lots with no bond assigned
  const noBond = data.lots.filter((l) => l.status === 'active' && !l.bondNumber)
  if (noBond.length) alerts.push({ level: 'warn', text: `${noBond.length} active lot${noBond.length > 1 ? 's' : ''} without a bond assignment`, href: '/lots?filter=no-bond' })
  // lots missing composition (origin cannot be proven on a label)
  const noComp = data.lots.filter((l) => l.status === 'active' && l.components.length === 0)
  if (noComp.length) alerts.push({ level: 'info', text: `${noComp.length} lot${noComp.length > 1 ? 's' : ''} have no composition on file — label claims cannot be substantiated`, href: '/lots?filter=no-composition' })
  // the 5120.17 for the previous period is due the 15th
  const day = now.getDate()
  if (day <= 15) {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    alerts.push({ level: day > 10 ? 'warn' : 'info', text: `TTB 5120.17 for ${prev.toLocaleString('en-US', { month: 'long' })} is due on the 15th`, href: '/compliance' })
  }
  // SO2 checks overdue: no free SO2 measurement in 60 days on aging lots
  const cutoff = now.getTime() - 60 * 86400000
  const stale = data.lots.filter((l) => {
    if (l.status !== 'active' || l.stage !== 'Aging') return false
    const last = [...data.events].filter((e) => e.lotId === l.id && e.measurements?.some((m) => m.analyte === 'freeSO2')).sort((a, b) => b.at.localeCompare(a.at))[0]
    return !last || new Date(last.at).getTime() < cutoff
  })
  if (stale.length) alerts.push({ level: 'info', text: `${stale.length} aging lot${stale.length > 1 ? 's' : ''} with no free SO₂ reading in 60 days`, href: '/lots?filter=so2-stale' })
  return alerts
}
