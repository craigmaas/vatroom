/** Minimal RFC-4180 CSV parser (handles quoted fields with commas and newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

export function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text)
  if (!rows.length) return []
  const header = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {}
    header.forEach((h, i) => {
      if (h) o[h] = (r[i] ?? '').trim()
    })
    return o
  })
}

export function toCsv(rows: (string | number | undefined | null)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = c === undefined || c === null ? '' : String(c)
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    .join('\n')
}
