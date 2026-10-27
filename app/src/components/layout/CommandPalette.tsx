import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Container, Grape, Wine, ArrowRight, Package } from 'lucide-react'
import { lotVolume, useOrgData } from '@/store/useStore'
import { cx } from '@/lib/format'
import { fmtGal } from '@/domain/units'

interface Item {
  id: string
  kind: 'lot' | 'vessel' | 'vineyard' | 'material' | 'page'
  title: string
  sub?: string
  to: string
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useOrgData()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    if (!data) return []
    const pages: Item[] = [
      { id: 'p-today', kind: 'page', title: 'Today', to: '/' },
      { id: 'p-lots', kind: 'page', title: 'Lots', to: '/lots' },
      { id: 'p-cellar', kind: 'page', title: 'Tank map', to: '/cellar' },
      { id: 'p-calc', kind: 'page', title: 'Tank calculator', to: '/cellar/calculator' },
      { id: 'p-work', kind: 'page', title: 'Work orders', to: '/work' },
      { id: 'p-harvest', kind: 'page', title: 'Harvest & crush', to: '/harvest' },
      { id: 'p-comp', kind: 'page', title: 'Compliance — TTB 5120.17', to: '/compliance' },
      { id: 'p-costs', kind: 'page', title: 'Costs & QuickBooks', to: '/costs' },
      { id: 'p-settings', kind: 'page', title: 'Settings', to: '/settings' },
    ]
    const lots: Item[] = data.lots.map((l) => ({ id: l.id, kind: 'lot', title: l.code, sub: `${l.variety} ${l.vintage} · ${fmtGal(lotVolume(l))} · ${l.stage}`, to: `/lots/${l.id}` }))
    const vessels: Item[] = data.vessels.map((v) => {
      const lot = data.lots.find((l) => l.holds.some((h) => h.vesselId === v.id))
      return { id: v.id, kind: 'vessel', title: v.code, sub: `${fmtGal(v.capacityGal)} ${v.type}${lot ? ` · ${lot.code}` : ' · empty'}`, to: `/cellar?vessel=${v.id}` }
    })
    const vineyards: Item[] = data.vineyards.map((v) => ({ id: v.id, kind: 'vineyard', title: v.name, sub: `${v.ava ?? v.county} · ${v.estate ? 'Estate' : v.grower ?? ''}`, to: `/vineyards/${v.id}` }))
    const materials: Item[] = data.materials.map((m) => ({ id: m.id, kind: 'material', title: m.name, sub: `${m.category} · ${m.onHand} ${m.unit}`, to: `/inventory?q=${encodeURIComponent(m.name)}` }))
    return [...lots, ...vessels, ...vineyards, ...materials, ...pages]
  }, [data])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items.filter((i) => i.kind === 'page' || i.kind === 'lot').slice(0, 10)
    const score = (i: Item) => {
      const t = i.title.toLowerCase()
      if (t === s) return 0
      if (t.startsWith(s)) return 1
      if (t.includes(s)) return 2
      if (i.sub?.toLowerCase().includes(s)) return 3
      return 99
    }
    return items
      .map((i) => ({ i, s: score(i) }))
      .filter((x) => x.s < 99)
      .sort((a, b) => a.s - b.s)
      .slice(0, 12)
      .map((x) => x.i)
  }, [q, items])

  useEffect(() => setIdx(0), [results.length])
  if (!open) return null
  const go = (it: Item) => {
    navigate(it.to)
    onClose()
  }
  const Icon = ({ kind }: { kind: Item['kind'] }) => (kind === 'lot' ? <Wine className="h-4 w-4" /> : kind === 'vessel' ? <Container className="h-4 w-4" /> : kind === 'vineyard' ? <Grape className="h-4 w-4" /> : kind === 'material' ? <Package className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />)
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal aria-label="Search">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-surface border border-border rounded-2xl shadow-pop overflow-hidden fade-up">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIdx((i) => Math.min(results.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIdx((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter' && results[idx]) go(results[idx])
          }}
          placeholder="Search lots, tanks, vineyards, materials…"
          className="w-full h-14 px-5 bg-transparent text-[16px] outline-none border-b border-border placeholder:text-ink-3"
        />
        <ul className="max-h-[50vh] overflow-y-auto py-2">
          {results.map((r, i) => (
            <li key={r.id}>
              <button onMouseEnter={() => setIdx(i)} onClick={() => go(r)} className={cx('w-full flex items-center gap-3 px-4 py-2.5 text-left', i === idx ? 'bg-accent-soft' : '')}>
                <span className={cx('h-8 w-8 rounded-lg grid place-items-center shrink-0', i === idx ? 'bg-surface text-accent' : 'bg-surface-2 text-ink-3')}>
                  <Icon kind={r.kind} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx('block font-medium', r.kind === 'lot' || r.kind === 'vessel' ? 'mono text-[14px]' : 'text-[14px]')}>{r.title}</span>
                  {r.sub && <span className="block text-[12px] text-ink-3 truncate">{r.sub}</span>}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-ink-3">{r.kind}</span>
              </button>
            </li>
          ))}
          {!results.length && <li className="px-5 py-8 text-center text-sm text-ink-3">Nothing matches “{q}”.</li>}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
