import { useId, useMemo, useState, type ReactNode } from 'react'
import { cx } from '@/lib/format'

/**
 * Small, dependency-free charts built to the dataviz method:
 *  - categorical hues assigned in fixed order (series-1..8), never cycled
 *  - thin marks, 2px gaps, recessive grid, direct labels where few series
 *  - hover layer on every plotted chart
 *  - text uses ink tokens, never the series color
 */
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)']

export function seriesColor(i: number) {
  return SERIES[Math.min(i, SERIES.length - 1)]
}

/* ------------------------------------------------------------------ Donut */
export interface Slice {
  label: string
  value: number
  color?: string
}
export function Donut({ slices, size = 150, thickness = 22, centre, className, maxSlices = 6 }: { slices: Slice[]; size?: number; thickness?: number; centre?: ReactNode; className?: string; maxSlices?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const data = useMemo(() => {
    const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value)
    if (sorted.length <= maxSlices) return sorted
    const head = sorted.slice(0, maxSlices - 1)
    const other = sorted.slice(maxSlices - 1).reduce((s, x) => s + x.value, 0)
    return [...head, { label: 'Other', value: other, color: 'var(--ink-3)' }]
  }, [slices, maxSlices])
  const total = data.reduce((s, x) => s + x.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  let offset = 0
  const gap = 2 // px gap between segments
  return (
    <div className={cx('flex items-center gap-5', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Composition">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
          {data.map((d, i) => {
            const len = total ? (d.value / total) * c : 0
            const dash = Math.max(0, len - gap)
            const el = (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color ?? seriesColor(i)}
                strokeWidth={hover === i ? thickness + 4 : thickness}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ transition: 'stroke-width 120ms' }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            )
            offset += len
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-center pointer-events-none">
          {hover !== null && data[hover] ? (
            <div>
              <div className="text-[11px] text-ink-3 leading-tight max-w-[80px] truncate">{data[hover].label}</div>
              <div className="font-semibold num text-ink">{total ? ((data[hover].value / total) * 100).toFixed(1) : 0}%</div>
            </div>
          ) : (
            centre
          )}
        </div>
      </div>
      <ul className="space-y-1.5 min-w-0">
        {data.map((d, i) => (
          <li key={d.label} className={cx('flex items-center gap-2 text-[13px] rounded px-1 -mx-1 transition-colors', hover === i && 'bg-surface-2')} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: d.color ?? seriesColor(i) }} />
            <span className="truncate text-ink-2">{d.label}</span>
            <span className="ml-auto num text-ink font-medium pl-3">{total ? ((d.value / total) * 100).toFixed(1) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ Line chart (time series) */
export interface SeriesDef {
  key: string
  label: string
  unit?: string
  points: { t: number; v: number }[]
}
export function LineChart({ series, height = 180, className, yLabel, target }: { series: SeriesDef[]; height?: number; className?: string; yLabel?: string; target?: { min?: number; max?: number } }) {
  const id = useId()
  const [hoverX, setHoverX] = useState<number | null>(null)
  const w = 600
  const h = height
  const pad = { l: 44, r: 12, t: 12, b: 26 }
  const all = series.flatMap((s) => s.points)
  if (!all.length) return <div className={cx('text-sm text-ink-3 py-8 text-center', className)}>No readings yet</div>
  const tMin = Math.min(...all.map((p) => p.t))
  const tMax = Math.max(...all.map((p) => p.t))
  let vMin = Math.min(...all.map((p) => p.v), target?.min ?? Infinity)
  let vMax = Math.max(...all.map((p) => p.v), target?.max ?? -Infinity)
  if (vMin === vMax) {
    vMin -= 1
    vMax += 1
  }
  const padV = (vMax - vMin) * 0.12
  vMin -= padV
  vMax += padV
  const x = (t: number) => pad.l + (tMax === tMin ? 0.5 : (t - tMin) / (tMax - tMin)) * (w - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - vMin) / (vMax - vMin)) * (h - pad.t - pad.b)
  const ticks = 4
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => vMin + ((vMax - vMin) * i) / ticks)
  const xTicks = Array.from({ length: 4 }, (_, i) => tMin + ((tMax - tMin) * i) / 3)
  const fmtT = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  // nearest point for hover
  const hovered = hoverX === null ? null : series.map((s) => ({ s, p: [...s.points].sort((a, b) => Math.abs(x(a.t) - hoverX) - Math.abs(x(b.t) - hoverX))[0] })).filter((d) => d.p)
  return (
    <div className={cx('relative', className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-auto"
        role="img"
        aria-label={yLabel ?? 'Trend'}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setHoverX(((e.clientX - rect.left) / rect.width) * w)
        }}
        onMouseLeave={() => setHoverX(null)}
      >
        {target && target.min !== undefined && target.max !== undefined && <rect x={pad.l} y={y(target.max)} width={w - pad.l - pad.r} height={Math.max(0, y(target.min) - y(target.max))} fill="var(--good)" opacity={0.08} />}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--ink-3)">
              {v.toFixed(Math.abs(vMax - vMin) < 3 ? 2 : Math.abs(vMax - vMin) < 20 ? 1 : 0)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={x(t)} y={h - 8} textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'} fontSize={10} fill="var(--ink-3)">
            {fmtT(t)}
          </text>
        ))}
        {series.map((s, i) => {
          const pts = [...s.points].sort((a, b) => a.t - b.t)
          const d = pts.map((p, j) => `${j ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={seriesColor(i)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, j) => (
                <circle key={j} cx={x(p.t)} cy={y(p.v)} r={3.5} fill={seriesColor(i)} stroke="var(--surface)" strokeWidth={2} />
              ))}
            </g>
          )
        })}
        {hovered && hovered.length > 0 && (
          <g>
            <line x1={x(hovered[0].p.t)} x2={x(hovered[0].p.t)} y1={pad.t} y2={h - pad.b} stroke="var(--ink-3)" strokeDasharray="3 3" />
            {hovered.map(({ s, p }, i) => (
              <circle key={s.key} cx={x(p.t)} cy={y(p.v)} r={6} fill={seriesColor(i)} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        )}
        <defs>
          <clipPath id={id}>
            <rect x={pad.l} y={0} width={w - pad.l - pad.r} height={h} />
          </clipPath>
        </defs>
      </svg>
      {hovered && hovered.length > 0 && (
        <div className="absolute top-2 right-3 bg-surface border border-border rounded-lg shadow-card px-3 py-2 text-[12px] pointer-events-none">
          <div className="text-ink-3 mb-1">{new Date(hovered[0].p.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          {hovered.map(({ s, p }, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-sm" style={{ background: seriesColor(i) }} />
              <span className="text-ink-2">{s.label}</span>
              <span className="num font-medium text-ink ml-auto pl-3">
                {p.v} {s.unit}
              </span>
            </div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[12px]">
          {series.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5 text-ink-2">
              <span className="h-2 w-2 rounded-sm" style={{ background: seriesColor(i) }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ Horizontal bars */
export function Bars({ rows, max, format = (v) => String(v), className, color }: { rows: { label: string; value: number; sub?: string; tone?: string }[]; max?: number; format?: (v: number) => string; className?: string; color?: string }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className={cx('space-y-2', className)}>
      {rows.map((r, i) => (
        <li key={r.label + i} className="group">
          <div className="flex items-baseline justify-between text-[13px] mb-1">
            <span className="text-ink-2 truncate">{r.label}</span>
            <span className="num font-medium text-ink pl-3">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(1.5, (r.value / m) * 100)}%`, background: r.tone ?? color ?? 'var(--series-1)' }} />
          </div>
          {r.sub && <div className="text-[11px] text-ink-3 mt-0.5">{r.sub}</div>}
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ Sparkline */
export function Sparkline({ points, width = 90, height = 26, color = 'var(--series-1)' }: { points: number[]; width?: number; height?: number; color?: string }) {
  if (points.length < 2) return <span className="text-ink-3 text-[11px]">—</span>
  const min = Math.min(...points)
  const max = Math.max(...points)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * (width - 4) + 2).toFixed(1)},${(max === min ? height / 2 : height - 3 - ((p - min) / (max - min)) * (height - 6)).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
