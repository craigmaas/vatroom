/** Unit helpers used across the cellar. Volumes are stored in US gallons. */

export const GAL_PER_LITER = 0.264172
export const LITERS_PER_GAL = 3.78541
export const CUBIC_INCHES_PER_GAL = 231
export const LB_PER_KG = 2.20462
export const G_PER_LB = 453.592
export const ML_PER_GAL = 3785.41

/** Standard 750 mL cases per gallon */
export const CASES_PER_GAL = 1 / (9 * GAL_PER_LITER) // 9 L per case

export function fmtGal(n: number | undefined | null, digits = 0): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return `${n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })} gal`
}

export function fmtNum(n: number | undefined | null, digits = 0): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: digits })
}

export function fmtMoney(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

export function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`
}

/** Convert an addition quantity into grams (or mL for liquids) for dose math. */
export function toBaseMass(qty: number, unit: string): { value: number; base: 'g' | 'mL' | 'ea' } {
  const u = unit.toLowerCase()
  switch (u) {
    case 'kg':
      return { value: qty * 1000, base: 'g' }
    case 'g':
      return { value: qty, base: 'g' }
    case 'lb':
    case 'lbs':
      return { value: qty * G_PER_LB, base: 'g' }
    case 'oz':
      return { value: qty * 28.3495, base: 'g' }
    case 'l':
      return { value: qty * 1000, base: 'mL' }
    case 'ml':
      return { value: qty, base: 'mL' }
    case 'gal':
      return { value: qty * ML_PER_GAL, base: 'mL' }
    default:
      return { value: qty, base: 'ea' }
  }
}

/**
 * Dose rate of an addition for a given lot volume. Returns g/L (or mL/L) and,
 * for SO2 sources, the resulting ppm of SO2 (KMBS is ~57% SO2 by weight).
 */
export function doseRate(qty: number, unit: string, lotGal: number, material: string): string {
  if (!lotGal) return ''
  const { value, base } = toBaseMass(qty, unit)
  if (base === 'ea') return ''
  const liters = lotGal * LITERS_PER_GAL
  const perLiter = value / liters
  const isSO2 = /so2|kmbs|metabisulf/i.test(material)
  if (isSO2 && base === 'g') {
    const ppm = perLiter * 1000 * 0.57
    return `${ppm.toFixed(0)} ppm SO₂`
  }
  if (perLiter < 0.01) return `${(perLiter * 1000).toFixed(1)} ${base === 'g' ? 'mg/L' : 'µL/L'}`
  return `${perLiter.toFixed(2)} ${base}/L`
}

export const ANALYTE_META: Record<string, { label: string; unit: string; short: string; digits: number }> = {
  brix: { label: 'Brix', unit: '°Bx', short: 'Brix', digits: 1 },
  ph: { label: 'pH', unit: '', short: 'pH', digits: 2 },
  ta: { label: 'Titratable acidity', unit: 'g/L', short: 'TA', digits: 1 },
  freeSO2: { label: 'Free SO₂', unit: 'ppm', short: 'FSO₂', digits: 0 },
  totalSO2: { label: 'Total SO₂', unit: 'ppm', short: 'TSO₂', digits: 0 },
  va: { label: 'Volatile acidity', unit: 'g/L', short: 'VA', digits: 2 },
  alcohol: { label: 'Alcohol', unit: '% v/v', short: 'ABV', digits: 1 },
  temp: { label: 'Temperature', unit: '°F', short: 'Temp', digits: 0 },
  rs: { label: 'Residual sugar', unit: 'g/L', short: 'RS', digits: 1 },
  malic: { label: 'Malic acid', unit: 'g/L', short: 'Malic', digits: 2 },
  dissolvedO2: { label: 'Dissolved O₂', unit: 'mg/L', short: 'DO', digits: 2 },
  turbidity: { label: 'Turbidity', unit: 'NTU', short: 'NTU', digits: 0 },
}
