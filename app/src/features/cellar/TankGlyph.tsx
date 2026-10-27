import type { WineColor } from '@/domain/types'
import { cx } from '@/lib/format'

/**
 * A little tank drawing with a wine level — used on the map, the dashboard and
 * the calculator. The fill colour follows the wine colour tokens.
 */
export function TankGlyph({ fill, color, size = 48, shape = 'tank', status, selected, className }: { fill: number; color?: WineColor; size?: number; shape?: 'tank' | 'tote' | 'barrel' | 'cube' | 'virtual'; status?: string; selected?: boolean; className?: string }) {
  const f = Math.max(0, Math.min(1, fill || 0))
  const fillColor = color === 'white' ? 'var(--white-wine)' : color === 'rosé' ? 'var(--rose-wine)' : color ? 'var(--red-wine)' : 'transparent'
  const w = size
  const h = size * (shape === 'tote' || shape === 'cube' ? 0.9 : shape === 'barrel' ? 0.8 : 1.25)
  const oos = status === 'out-of-service'
  const r = shape === 'tank' ? w * 0.22 : 4
  const bodyY = shape === 'tank' ? h * 0.08 : 2
  const bodyH = h - bodyY - 2
  const level = bodyY + bodyH * (1 - f)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={cx('tank-glyph overflow-visible', className)} aria-hidden>
      <defs>
        <clipPath id={`clip-${w}-${shape}-${Math.round(f * 1000)}-${color ?? 'x'}`}>
          <rect x={1} y={bodyY} width={w - 2} height={bodyH} rx={r} />
        </clipPath>
      </defs>
      {selected && <rect x={-3} y={bodyY - 3} width={w + 6} height={bodyH + 6} rx={r + 3} fill="none" stroke="var(--accent)" strokeWidth={2} />}
      <rect x={1} y={bodyY} width={w - 2} height={bodyH} rx={r} fill="var(--surface-2)" stroke={oos ? 'var(--danger)' : 'var(--border-strong)'} strokeWidth={1.25} strokeDasharray={oos ? '3 2' : undefined} />
      {f > 0 && (
        <g clipPath={`url(#clip-${w}-${shape}-${Math.round(f * 1000)}-${color ?? 'x'})`}>
          <rect className="tank-fill" x={1} y={level} width={w - 2} height={bodyH} fill={fillColor} opacity={0.9} />
          <rect x={1} y={level} width={w - 2} height={1.5} fill="white" opacity={0.35} />
        </g>
      )}
      {shape === 'tank' && <rect x={w * 0.35} y={0} width={w * 0.3} height={bodyY + 1} rx={2} fill="var(--border-strong)" />}
      {shape === 'barrel' && (
        <>
          <line x1={w * 0.25} x2={w * 0.25} y1={bodyY} y2={bodyY + bodyH} stroke="var(--border-strong)" strokeWidth={1} />
          <line x1={w * 0.75} x2={w * 0.75} y1={bodyY} y2={bodyY + bodyH} stroke="var(--border-strong)" strokeWidth={1} />
        </>
      )}
      {oos && <line x1={3} y1={bodyY + 3} x2={w - 3} y2={bodyY + bodyH - 3} stroke="var(--danger)" strokeWidth={1.5} />}
    </svg>
  )
}
