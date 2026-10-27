import type { WineColor } from './types'

/**
 * Lot codes follow the cellar convention  <CLIENT><VARIETY><YY>-<SEQ>[suffix]
 * e.g. GRUBA25-01  →  client GRU, Barbera, 2025, lot 01
 *      MNATP21-01W →  client MNA, Tempranillo, 2021, lot 01, suffix W
 */
export const VARIETY_CODES: Record<string, string> = {
  BA: 'Barbera',
  CS: 'Cabernet Sauvignon',
  CF: 'Cabernet Franc',
  CH: 'Chardonnay',
  CHB: 'Chenin Blanc',
  PN: 'Pinot Noir',
  PG: 'Pinot Gris',
  ZN: 'Zinfandel',
  ZIN: 'Zinfandel',
  SB: 'Sauvignon Blanc',
  TP: 'Tempranillo',
  ML: 'Merlot',
  MV: 'Mourvèdre',
  SY: 'Syrah',
  GR: 'Grenache',
  PS: 'Petite Sirah',
  VI: 'Viognier',
  RS: 'Riesling',
  MU: 'Muscat',
  ARR: 'Red Blend',
  RED: 'Red Blend',
  WHT: 'White Blend',
  ROSE: 'Rosé',
}

export const WHITE_VARIETIES = new Set([
  'Chardonnay',
  'Chenin Blanc',
  'Sauvignon Blanc',
  'Pinot Gris',
  'Viognier',
  'Riesling',
  'Muscat',
  'White Blend',
  'Albariño',
  'Semillon',
  'Gewürztraminer',
  'Vermentino',
])

export function colorForVariety(variety: string, code?: string): WineColor {
  if (/ros[eé]/i.test(variety) || (code && /ROSE/i.test(code))) return 'rosé'
  if (WHITE_VARIETIES.has(variety)) return 'white'
  if (code && /W$/.test(code.split('-')[1] ?? '') && !WHITE_VARIETIES.has(variety)) {
    // suffix W after the sequence (e.g. MNATP21-01W) — the cellar's "W" lots
    return 'red'
  }
  return 'red'
}

export interface ParsedCode {
  client?: string
  varietyCode?: string
  variety?: string
  vintage?: number
  seq?: string
  suffix?: string
}

export function parseLotCode(code: string): ParsedCode {
  const m = code.match(/^([A-Z]+?)(\d{2})-(\d{2})([A-Za-z]*)$/)
  if (!m) return {}
  const letters = m[1]
  const vintage = 2000 + Number(m[2])
  // try longest variety suffix first (3 letters, then 2)
  for (const len of [4, 3, 2]) {
    if (letters.length > len) {
      const vc = letters.slice(-len)
      if (VARIETY_CODES[vc]) {
        return { client: letters.slice(0, -len), varietyCode: vc, variety: VARIETY_CODES[vc], vintage, seq: m[3], suffix: m[4] || undefined }
      }
    }
  }
  return { client: letters.slice(0, 3), vintage, seq: m[3], suffix: m[4] || undefined }
}

/** Suggest the next sequence for a client/variety/vintage combination */
export function nextLotCode(existing: string[], client: string, varietyCode: string, vintage: number): string {
  const yy = String(vintage).slice(-2)
  const prefix = `${client}${varietyCode}${yy}-`
  const seqs = existing.filter((c) => c.startsWith(prefix)).map((c) => Number(c.slice(prefix.length, prefix.length + 2)) || 0)
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1
  return `${prefix}${String(next).padStart(2, '0')}`
}
