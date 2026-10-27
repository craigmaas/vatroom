import { useRef, useState } from 'react'
import type { Block } from '@/domain/types'
import { seriesColor } from '@/components/charts'
import { cx } from '@/lib/format'

/**
 * Vineyard block map: blocks are polygons on a 0..100 canvas. In edit mode you
 * can drag whole blocks and drag their corner handles; double-click a block edge
 * to add a corner. Simple on purpose — most vineyards are a handful of rectangles.
 */
export function BlockMap({ blocks, selectedId, onSelect, editable, onChange, compact }: { blocks: Block[]; selectedId?: string; onSelect?: (id: string) => void; editable?: boolean; onChange?: (b: Block) => void; compact?: boolean }) {
  const ref = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ id: string; corner?: number; start: { x: number; y: number }; orig: { x: number; y: number }[] } | null>(null)
  const varieties = [...new Set(blocks.map((b) => b.variety))]
  const colorFor = (b: Block) => b.color ?? seriesColor(varieties.indexOf(b.variety))
  const toSvg = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag || !onChange) return
    const p = toSvg(e)
    const dx = p.x - drag.start.x
    const dy = p.y - drag.start.y
    const b = blocks.find((x) => x.id === drag.id)
    if (!b) return
    const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 2) / 2))
    const shape = drag.corner === undefined ? drag.orig.map((pt) => ({ x: clamp(pt.x + dx), y: clamp(pt.y + dy) })) : drag.orig.map((pt, i) => (i === drag.corner ? { x: clamp(pt.x + dx), y: clamp(pt.y + dy) } : pt))
    onChange({ ...b, shape })
  }
  return (
    <svg
      ref={ref}
      viewBox="0 0 100 100"
      preserveAspectRatio={compact ? 'xMidYMid slice' : 'xMidYMid meet'}
      className={cx('w-full h-full select-none', editable ? 'cursor-move' : '')}
      onPointerMove={onMove}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setDrag(null)}
      role="img"
      aria-label="Vineyard block map"
    >
      <defs>
        <pattern id="rows" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(90)">
          <line x1="0" y1="0" x2="0" y2="2" stroke="rgba(0,0,0,0.08)" strokeWidth="0.4" />
        </pattern>
      </defs>
      <rect width="100" height="100" fill="var(--surface-2)" />
      <rect width="100" height="100" fill="url(#rows)" />
      {blocks.map((b) => {
        const shape = b.shape ?? [
          { x: 10, y: 10 },
          { x: 40, y: 10 },
          { x: 40, y: 40 },
          { x: 10, y: 40 },
        ]
        const pts = shape.map((p) => `${p.x},${p.y}`).join(' ')
        const cx0 = shape.reduce((s, p) => s + p.x, 0) / shape.length
        const cy0 = shape.reduce((s, p) => s + p.y, 0) / shape.length
        const sel = b.id === selectedId
        return (
          <g key={b.id}>
            <polygon
              points={pts}
              fill={colorFor(b)}
              fillOpacity={sel ? 0.75 : 0.5}
              stroke={sel ? 'var(--ink)' : 'var(--surface)'}
              strokeWidth={sel ? 1 : 0.6}
              onPointerDown={(e) => {
                onSelect?.(b.id)
                if (editable) {
                  e.stopPropagation()
                  setDrag({ id: b.id, start: toSvg(e), orig: shape })
                }
              }}
              className={cx(onSelect && 'cursor-pointer')}
            />
            {!compact && (
              <text x={cx0} y={cy0} textAnchor="middle" fontSize={3.4} fontWeight={600} fill="var(--ink)" pointerEvents="none">
                {b.name}
                <tspan x={cx0} dy={3.8} fontSize={2.6} fontWeight={400} fill="var(--ink-2)">
                  {b.variety}
                  {b.acres ? ` · ${b.acres} ac` : ''}
                </tspan>
              </text>
            )}
            {editable &&
              sel &&
              shape.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={1.6}
                  fill="var(--surface)"
                  stroke="var(--ink)"
                  strokeWidth={0.5}
                  className="cursor-crosshair"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    setDrag({ id: b.id, corner: i, start: toSvg(e), orig: shape })
                  }}
                />
              ))}
          </g>
        )
      })}
      {!compact && <text x={2} y={98} fontSize={2.4} fill="var(--ink-3)">N ↑ · drag blocks or corners in edit mode</text>}
    </svg>
  )
}
