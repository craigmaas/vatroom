import type { Addition, Analyte, Lot, LotComponent, LotEvent, Measurement, Vessel, VesselHold } from '@/domain/types'
import { csvToObjects } from './csv'
import { colorForVariety, parseLotCode } from '@/domain/lot-codes'
import { doseRate } from '@/domain/units'

/**
 * Importer for Blended ("blendedtech.com") lot-history and composition exports.
 *
 * Blended writes one CSV row per timestamp with a comma-joined "Actions" cell in
 * a small, regular grammar. We parse that grammar into typed events and replay
 * them to reconstruct where the wine is and how much there is. The replay also
 * self-corrects: when a transfer moves more wine out of a vessel than we think
 * it holds (e.g. after a "Combined" whose other half we never saw) we trust the
 * transfer, since the cellar measured it.
 */

export interface ImportResult {
  lot: Lot
  events: LotEvent[]
  /** vessel codes referenced that the caller may need to create */
  vesselCodes: Set<string>
  warnings: string[]
}

interface Ctx {
  orgId: string
  lotId: string
  holds: Map<string, number> // vessel code → gallons
  idGen: () => string
  warnings: string[]
  vesselCodes: Set<string>
  lot: Lot
}

const MONTHS_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?$/i

export function parseBlendedDate(s: string): string {
  const m = s.trim().match(MONTHS_DATE)
  if (!m) return new Date(s).toISOString()
  let hour = Number(m[4] ?? 0)
  const min = Number(m[5] ?? 0)
  const ampm = m[6]?.toUpperCase()
  if (ampm === 'PM' && hour < 12) hour += 12
  if (ampm === 'AM' && hour === 12) hour = 0
  const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), hour, min)
  return d.toISOString()
}

const num = (s: string) => Number(String(s).replace(/,/g, ''))

export function parseAddition(s: string): Addition | null {
  const t = s.trim()
  if (!t) return null
  // "3.0 kg Oenotannin Oenogal" | "53 DANMIL 30" | "0.26 lb SO2 - KMBS" | "200 mL Scottzyme Pec5L"
  const m = t.match(/^([\d.,]+)\s*(kg|g|lb|lbs|oz|L|mL|gal|ea)?\s+(.+)$/i)
  if (!m) return { material: t, qty: 1, unit: 'ea' }
  const unit = m[2] ? normaliseUnit(m[2]) : 'ea'
  return { material: m[3].trim().replace(/\s*-\s*/g, ' - ').replace(/SO2-KMBS/i, 'SO2 - KMBS'), qty: num(m[1]), unit }
}

function normaliseUnit(u: string) {
  const l = u.toLowerCase()
  if (l === 'lbs') return 'lb'
  if (l === 'ml') return 'mL'
  if (l === 'l') return 'L'
  return l
}

/** Split a Blended actions cell on top-level commas, keeping "Lot updated: a: b, c: d" together */
export function splitActions(cell: string): string[] {
  const parts = cell.split(/,\s*(?=[A-Z0-9])/)
  const out: string[] = []
  for (const p of parts) {
    const s = p.trim()
    if (!s) continue
    const prev = out[out.length - 1]
    // merge "key: value" fragments back into a preceding "Lot updated:" action
    if (prev && /^Lot updated:/.test(prev) && /^(bond|tax class|stage|name|fermentation plan|tags):/i.test(s)) {
      out[out.length - 1] += ', ' + s
    } else if (prev && /^Combined /.test(prev) && !/ into /.test(prev)) {
      // "Combined A, B into A" — the lot list is comma separated
      out[out.length - 1] += ', ' + s
    } else out.push(s)
  }
  return out
}

const MEASURE_COLUMNS: Record<string, Analyte> = {
  Brix: 'brix',
  pH: 'ph',
  TA: 'ta',
  'Free SO2': 'freeSO2',
  'Total SO2': 'totalSO2',
  VA: 'va',
  Alcohol: 'alcohol',
  Temp: 'temp',
  RS: 'rs',
  Malic: 'malic',
}

function parseMeasurement(analyte: Analyte, raw: string): Measurement | null {
  const m = raw.trim().match(/^([\d.]+)\s*(.*)$/)
  if (!m) return null
  return { analyte, value: Number(m[1]), unit: m[2] || '' }
}

function totalGal(holds: Map<string, number>) {
  let t = 0
  for (const g of holds.values()) t += g
  return t
}

function mkEvent(ctx: Ctx, at: string, partial: Omit<LotEvent, 'id' | 'orgId' | 'lotId' | 'at' | 'official' | 'volumeAfterGal'> & { official?: boolean }): LotEvent {
  return {
    id: ctx.idGen(),
    orgId: ctx.orgId,
    lotId: ctx.lotId,
    at,
    official: partial.official ?? true,
    volumeAfterGal: Math.round(totalGal(ctx.holds)),
    ...partial,
  }
}

function singleVessel(holds: Map<string, number>): string | undefined {
  const keys = [...holds.keys()].filter((k) => (holds.get(k) ?? 0) > 0)
  return keys.length === 1 ? keys[0] : keys.length ? keys[keys.length - 1] : undefined
}

function adjustVolume(ctx: Ctx, delta: number, vesselCode?: string) {
  const target = vesselCode ?? singleVessel(ctx.holds)
  if (!target) {
    if (delta > 0) ctx.holds.set('__unassigned', (ctx.holds.get('__unassigned') ?? 0) + delta)
    return
  }
  ctx.holds.set(target, Math.max(0, (ctx.holds.get(target) ?? 0) + delta))
}

function setTotal(ctx: Ctx, gallons: number) {
  const target = singleVessel(ctx.holds)
  if (target) {
    const others = totalGal(ctx.holds) - (ctx.holds.get(target) ?? 0)
    ctx.holds.set(target, Math.max(0, gallons - others))
  } else ctx.holds.set('__unassigned', gallons)
}

function applyAction(ctx: Ctx, at: string, action: string, events: LotEvent[]) {
  const a = action.trim()
  let m: RegExpMatchArray | null

  if (/^Lot created$/i.test(a)) {
    events.push(mkEvent(ctx, at, { kind: 'created', summary: 'Lot created' }))
    return
  }
  if ((m = a.match(/^Transferred ([\d.,]+) gal from (.+?) to (.+)$/i))) {
    const gal = num(m[1])
    const from = m[2].trim()
    const to = m[3].trim()
    ctx.vesselCodes.add(from)
    ctx.vesselCodes.add(to)
    const have = ctx.holds.get(from) ?? 0
    if (gal > have + 0.5) {
      // trust the measured transfer; reconcile unseen inflows (combines, unseen press fractions)
      const unassigned = ctx.holds.get('__unassigned') ?? 0
      ctx.holds.delete('__unassigned')
      if (have + unassigned < gal - 0.5) ctx.warnings.push(`${ctx.lot.code}: transfer of ${gal} gal from ${from} exceeds tracked ${Math.round(have + unassigned)} gal — reconciled to the transfer`)
      ctx.holds.set(from, gal)
    }
    if (from === to) {
      ctx.holds.set(to, gal)
    } else {
      ctx.holds.set(from, Math.max(0, (ctx.holds.get(from) ?? 0) - gal))
      if ((ctx.holds.get(from) ?? 0) < 0.5) ctx.holds.delete(from)
      ctx.holds.set(to, (ctx.holds.get(to) ?? 0) + gal)
    }
    events.push(mkEvent(ctx, at, { kind: 'transfer', summary: a, gallons: gal, fromVesselId: from, toVesselId: to, vesselIds: [from, to] }))
    return
  }
  if ((m = a.match(/^Transferred ([\d.,]+) gal to (.+)$/i))) {
    const gal = num(m[1])
    const to = m[2].trim()
    ctx.vesselCodes.add(to)
    const unassigned = ctx.holds.get('__unassigned') ?? 0
    ctx.holds.delete('__unassigned')
    ctx.holds.set(to, (ctx.holds.get(to) ?? 0) + Math.max(gal, 0))
    if (unassigned > gal + 0.5) ctx.holds.set('__unassigned', unassigned - gal)
    events.push(mkEvent(ctx, at, { kind: 'transfer', summary: a, gallons: gal, toVesselId: to, vesselIds: [to] }))
    return
  }
  if ((m = a.match(/^Loss of ([\d.,]+) gal(?:\s*-\s*(.+))?$/i))) {
    const gal = num(m[1])
    adjustVolume(ctx, -gal)
    events.push(mkEvent(ctx, at, { kind: 'loss', summary: a, gallons: gal, reason: m[2]?.trim() || 'Operations' }))
    return
  }
  if ((m = a.match(/^Adjustment of ([\d.,]+) gal(?:\s*-\s*(.+))?$/i))) {
    const gal = num(m[1])
    adjustVolume(ctx, gal)
    events.push(mkEvent(ctx, at, { kind: 'gain', summary: a, gallons: gal, reason: m[2]?.trim() || 'Operations' }))
    return
  }
  // "X pressed: kept N gal in current lot, into Y"
  if ((m = a.match(/^(\S+) pressed: kept ([\d.,]+) gal in current lot(?:, into (.+))?$/i))) {
    const kept = num(m[2])
    const before = totalGal(ctx.holds)
    setTotal(ctx, kept)
    const moved = Math.max(0, before - kept)
    events.push(mkEvent(ctx, at, { kind: 'press', summary: a, gallons: moved || undefined, relatedLotId: m[3]?.trim(), reason: 'press fraction' }))
    return
  }
  // "Y pressed into X" — inflow from another lot (press fraction returned)
  if ((m = a.match(/^(\S+) pressed into (\S+)$/i))) {
    events.push(mkEvent(ctx, at, { kind: 'press', summary: a, relatedLotId: m[1] }))
    return
  }
  // "X split: kept N gal in current lot, into Y"  |  "X split into Y, kept N gal in current lot"
  if ((m = a.match(/^(\S+) split: kept ([\d.,]+) gal in current lot(?:, into (.+))?$/i)) || (m = a.match(/^(\S+) split into (\S+), kept ([\d.,]+) gal in current lot$/i))) {
    const isAlt = /split into/.test(a)
    const kept = num(isAlt ? m[3] : m[2])
    const target = (isAlt ? m[2] : m[3])?.trim()
    const before = totalGal(ctx.holds)
    setTotal(ctx, kept)
    const moved = Math.max(0, before - kept)
    const inBond = target ? /transfer in bond/i.test(target) : false
    events.push(
      mkEvent(ctx, at, {
        kind: inBond ? 'transfer-in-bond' : 'split',
        summary: a,
        gallons: Math.round(moved * 10) / 10 || undefined,
        relatedLotId: target,
        reason: inBond ? 'Transferred in bond to another bonded premises' : undefined,
      }),
    )
    return
  }
  // "X split into Y" (volume unknown)
  if ((m = a.match(/^(\S+) split into (\S+)$/i))) {
    events.push(mkEvent(ctx, at, { kind: 'split', summary: a, relatedLotId: m[2] }))
    return
  }
  if ((m = a.match(/^Combined (.+) into (\S+)$/i))) {
    const parts = m[1].split(/,\s*/).map((s) => s.trim())
    const others = parts.filter((p) => p !== ctx.lot.code)
    events.push(mkEvent(ctx, at, { kind: 'combine', summary: a, relatedLotId: others[0] }))
    return
  }
  if ((m = a.match(/^Lot updated:\s*(.+)$/i))) {
    const details = m[1]
    const kv: Record<string, string> = {}
    const re = /(bond|tax class|stage|name|fermentation plan|tags):\s*([^,]+(?:\([^)]*\))?[^,]*)/gi
    let mm: RegExpExecArray | null
    while ((mm = re.exec(details))) kv[mm[1].toLowerCase()] = mm[2].trim()
    if (kv.bond) {
      const b = kv.bond.match(/\(([^)]+)\)/)
      if (b) ctx.lot.bondNumber = b[1]
    }
    if (kv['tax class']) {
      const t = kv['tax class']
      ctx.lot.taxClass = /≤\s*16|<=\s*16/.test(t) ? 'still ≤16%' : /16.*21/.test(t) ? 'still 16–21%' : /21.*24/.test(t) ? 'still 21–24%' : /sparkling/i.test(t) ? 'sparkling' : ctx.lot.taxClass
    }
    if (kv['fermentation plan']) ctx.lot.fermentationPlan = kv['fermentation plan']
    if (kv.tags) {
      const tm = kv.tags.match(/Marketing Name:\s*(.+)/i)
      if (tm) ctx.lot.marketingName = tm[1].trim()
      ctx.lot.tags = Array.from(new Set([...ctx.lot.tags, kv.tags]))
    }
    if (kv.stage) {
      const s = kv.stage.replace(/\s*-\s*/g, '-')
      const stage = normaliseStage(s)
      ctx.lot.stage = stage
      events.push(mkEvent(ctx, at, { kind: 'stage', summary: `Stage → ${stage}`, reason: stage }))
    }
    const rest = Object.entries(kv)
      .filter(([k]) => k !== 'stage')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    if (rest) events.push(mkEvent(ctx, at, { kind: 'update', summary: `Lot updated: ${rest}` }))
    return
  }
  // operations: Crush, Cold soak, Pump over, Rack/Racking, Yeast Inoculum, etc.
  const op = a.replace(/^Racking$/i, 'Rack').replace(/^Yeast Inoculum$/i, 'Yeast inoculation')
  const kind = /^crush/i.test(op) ? 'crush' : 'operation'
  events.push(mkEvent(ctx, at, { kind, summary: op, reason: op }))
}

export function normaliseStage(s: string): Lot['stage'] {
  const l = s.toLowerCase()
  if (l.startsWith('post')) return 'Post-fermentation'
  if (l.startsWith('malo')) return 'Malolactic fermentation'
  if (l.startsWith('ferment')) return 'Fermentation'
  if (l.startsWith('aging')) return 'Aging'
  if (l.startsWith('process')) return 'Processing'
  if (l.startsWith('intake')) return 'Intake'
  if (l.startsWith('cold')) return 'Cold soak'
  if (l.startsWith('blend')) return 'Blending'
  if (l.startsWith('stab')) return 'Stabilization'
  if (l.startsWith('bottl')) return l.includes('ready') ? 'Bottling ready' : 'Bottled'
  return 'Aging'
}

export function parseCompositionCsv(text: string, idGen: () => string): LotComponent[] {
  return csvToObjects(text).map((r) => ({
    id: idGen(),
    sourceName: r['Source name'],
    volumeGal: Number(r['Volume']) || 0,
    type: (r['Type'] as LotComponent['type']) || 'Other',
    variety: r['Variety'] || 'Other',
    vintage: /^\d{4}$/.test(r['Vintage']) ? Number(r['Vintage']) : 'NV',
    clone: r['Clone'] || undefined,
    dateReceived: r['Date received'] || undefined,
    pickBrix: r['Pick brix'] ? Number(r['Pick brix']) : undefined,
    vineyardName: r['Vineyard'] || undefined,
    state: r['State'] || undefined,
    county: r['County'] || undefined,
    district: r['District'] || undefined,
    ava: r['AVA'] || undefined,
    estate: /true/i.test(r['Estate?'] ?? ''),
    notes: r['Notes'] || undefined,
  }))
}

export interface ImportOptions {
  orgId: string
  code: string
  historyCsv: string
  compositionCsv?: string
  idGen: () => string
  /** vessel lookup so holds can be resolved to ids; unknown codes are returned in vesselCodes */
  vesselByCode: (code: string) => Vessel | undefined
}

export function importBlendedLot(opts: ImportOptions): ImportResult {
  const { orgId, code, idGen } = opts
  const parsed = parseLotCode(code)
  const components = opts.compositionCsv ? parseCompositionCsv(opts.compositionCsv, idGen) : []
  const varietyFromComposition = components.length
    ? [...components.reduce((m, c) => m.set(c.variety, (m.get(c.variety) ?? 0) + c.volumeGal), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0][0]
    : undefined
  const variety = varietyFromComposition ?? parsed.variety ?? 'Red Blend'
  const lot: Lot = {
    id: idGen(),
    orgId,
    code,
    client: parsed.client,
    vintage: parsed.vintage ?? 'NV',
    variety,
    color: colorForVariety(variety, code),
    stage: 'Aging',
    taxClass: 'still ≤16%',
    bondNumber: '',
    tags: [],
    components,
    holds: [],
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const ctx: Ctx = { orgId, lotId: lot.id, holds: new Map(), idGen, warnings: [], vesselCodes: new Set(), lot }
  const rows = csvToObjects(opts.historyCsv)
  const events: LotEvent[] = []

  for (const r of rows) {
    if (!r['Date']) continue
    const at = parseBlendedDate(r['Date'])
    const actions = r['Actions'] ? splitActions(r['Actions']) : []
    for (const a of actions) applyAction(ctx, at, a, events)

    const measurements: Measurement[] = []
    for (const [col, analyte] of Object.entries(MEASURE_COLUMNS)) {
      if (r[col]) {
        const mm = parseMeasurement(analyte, r[col])
        if (mm) measurements.push(mm)
      }
    }
    if (measurements.length) {
      events.push(mkEvent(ctx, at, { kind: 'measurement', summary: measurements.map((mm) => `${analyteLabel(mm.analyte)} ${mm.value}${mm.unit ? ' ' + mm.unit : ''}`).join(', '), measurements }))
    }
    if (r['Additions']) {
      const adds = r['Additions'].split(/,\s*(?=[\d.]+\s)/).map(parseAddition).filter((x): x is Addition => !!x)
      const vol = totalGal(ctx.holds)
      for (const ad of adds) ad.rate = doseRate(ad.qty, ad.unit, vol, ad.material)
      const vesselIds = r['Vessels'] ? r['Vessels'].split(/,\s*/) : undefined
      vesselIds?.forEach((v) => ctx.vesselCodes.add(v))
      events.push(mkEvent(ctx, at, { kind: 'addition', summary: adds.map((x) => `${x.qty} ${x.unit === 'ea' ? '' : x.unit + ' '}${x.material}`).join(', '), additions: adds, vesselIds, notes: r['Notes'] || undefined }))
    } else if (r['Notes'] && !actions.length && !measurements.length) {
      events.push(mkEvent(ctx, at, { kind: 'note', summary: r['Notes'], notes: r['Notes'], official: false }))
    } else if (r['Notes'] && events.length) {
      events[events.length - 1].notes = r['Notes']
    }
  }

  // derive created date and final holds
  const created = events.find((e) => e.kind === 'created') ?? events[0]
  if (created) lot.createdAt = created.at
  lot.updatedAt = events.length ? events[events.length - 1].at : lot.createdAt
  const holds: VesselHold[] = []
  for (const [vcode, gal] of ctx.holds) {
    if (vcode === '__unassigned' || gal < 0.5) continue
    holds.push({ vesselId: vcode, gallons: Math.round(gal) })
  }
  lot.holds = holds
  // In Blended, "-BG" vessels are barrel groups and "-VG" are virtual groups
  return { lot, events, vesselCodes: ctx.vesselCodes, warnings: ctx.warnings }
}

function analyteLabel(a: Analyte) {
  return { brix: 'Brix', ph: 'pH', ta: 'TA', freeSO2: 'Free SO₂', totalSO2: 'Total SO₂', va: 'VA', alcohol: 'Alc', temp: 'Temp', rs: 'RS', malic: 'Malic', dissolvedO2: 'DO', turbidity: 'NTU' }[a]
}
