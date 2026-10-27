import { format, formatDistanceToNowStrict, isToday, isYesterday, parseISO } from 'date-fns'

export function fmtDate(iso: string | undefined, withTime = false): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? parseISO(iso) : iso
  if (Number.isNaN(d.getTime())) return '—'
  return format(d, withTime ? 'MMM d, yyyy h:mm a' : 'MMM d, yyyy')
}

export function fmtShort(iso: string): string {
  const d = parseISO(iso)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d')
}

export function fmtRelative(iso: string | undefined): string {
  if (!iso) return '—'
  return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true })
}

export function toInputDateTime(iso: string): string {
  const d = parseISO(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function nowInput(): string {
  return toInputDateTime(new Date().toISOString())
}
export function fromInputDateTime(s: string): string {
  return new Date(s).toISOString()
}
export function toInputDate(iso?: string): string {
  const d = iso ? parseISO(iso) : new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export function download(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
