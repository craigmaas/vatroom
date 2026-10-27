import { useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Printer, Ruler } from 'lucide-react'
import { useOrgData, useStore } from '@/store/useStore'
import { Button, Card, Field, Input, PageHeader, Segmented, Select, Stat, Table, Td, Th } from '@/components/ui'
import { buildStrappingTable, cylinderGalPerInch, gallonsAtHeight, gallonsFromDip, heightForGallons, totalHeightIn, bottomFullGal } from '@/domain/tank-geometry'
import { fmtGal, fmtNum, LITERS_PER_GAL } from '@/domain/units'
import { download, cx } from '@/lib/format'
import { toCsv } from '@/importers/csv'

/**
 * Tank calculator — "how much wine is in this tank?"
 * Enter a dip (from the top) or a liquid height (from the bottom), get gallons.
 * Or the reverse: how high will N gallons sit? Also prints a strapping table.
 */
export function TankCalculatorPage() {
  const data = useOrgData()
  const [params, setParams] = useSearchParams()
  const recordVolumeChange = useStore((s) => s.recordVolumeChange)
  const toast = useStore((s) => s.toast)
  const vessels = useMemo(() => (data?.vessels ?? []).filter((v) => v.geometry || v.strapping).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })), [data])
  const vesselId = params.get('vessel') ?? vessels[0]?.id ?? ''
  const vessel = vessels.find((v) => v.id === vesselId)
  const [mode, setMode] = useState<'dip' | 'height' | 'gallons'>('dip')
  const [inches, setInches] = useState('')
  const [targetGal, setTargetGal] = useState('')
  const [unit, setUnit] = useState<'in' | 'cm'>('in')

  const lot = useMemo(() => data?.lots.find((l) => l.status === 'active' && l.holds.some((h) => h.vesselId === vesselId)), [data, vesselId])
  const held = lot?.holds.find((h) => h.vesselId === vesselId)?.gallons ?? 0

  if (!data) return null
  const H = vessel ? totalHeightIn(vessel) : 0
  const toIn = (v: number) => (unit === 'cm' ? v / 2.54 : v)
  const fromIn = (v: number) => (unit === 'cm' ? v * 2.54 : v)
  const n = Number(inches)
  let gallons: number | null = null
  let liquidHeight: number | null = null
  if (vessel && inches !== '' && !Number.isNaN(n)) {
    if (mode === 'dip') {
      liquidHeight = Math.max(0, H - toIn(n))
      gallons = gallonsFromDip(vessel, toIn(n))
    } else if (mode === 'height') {
      liquidHeight = Math.min(H, toIn(n))
      gallons = gallonsAtHeight(vessel, toIn(n))
    }
  }
  if (vessel && mode === 'gallons' && targetGal !== '') {
    liquidHeight = heightForGallons(vessel, Number(targetGal))
    gallons = Number(targetGal)
  }
  const galPerInch = vessel?.geometry ? cylinderGalPerInch(vessel.geometry.diameterIn) : null
  const diff = gallons !== null && lot ? gallons - held : null

  const applyAsBook = () => {
    if (!lot || gallons === null || diff === null || Math.abs(diff) < 0.5) return
    recordVolumeChange(lot.id, diff < 0 ? 'loss' : 'gain', Math.abs(Math.round(diff)), diff < 0 ? 'Inventory shortage (dip)' : 'Inventory overage (dip)', new Date().toISOString(), vesselId)
    toast({ title: 'Book volume reconciled', body: `${lot.code} in ${vessel?.code}: ${fmtGal(held)} → ${fmtGal(Math.round(gallons))}`, tone: 'good' })
  }

  return (
    <div>
      <PageHeader eyebrow="Cellar" title="Tank calculator" subtitle="Turn a dip stick reading into gallons — or find the fill height for a target volume." />
      <div className="grid lg:grid-cols-[380px_1fr] gap-4">
        <div className="space-y-4">
          <Card>
            <Field label="Vessel">
              <Select value={vesselId} onChange={(e) => setParams({ vessel: e.target.value })}>
                {vessels.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} — {fmtGal(v.capacityGal)}
                    {v.name ? ` · ${v.name}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            {vessel && (
              <div className="mt-3 text-[12px] text-ink-3 space-y-0.5">
                {vessel.geometry && (
                  <div>
                    Ø {vessel.geometry.diameterIn}″ · sidewall {vessel.geometry.sidewallIn}″ · {vessel.geometry.bottom} bottom {vessel.geometry.bottomHeightIn ? `${vessel.geometry.bottomHeightIn}″` : ''}
                  </div>
                )}
                {galPerInch && <div className="num">{galPerInch.toFixed(2)} gal per inch of sidewall · {(galPerInch / 2.54).toFixed(2)} gal per cm</div>}
                {vessel.strapping?.length ? <div className="text-good">Using the manufacturer strapping chart ({vessel.strapping.length} points)</div> : vessel.geometry?.estimated ? <div className="text-warn">Geometry is estimated from capacity. Measure the tank and edit its specs on the tank map for accurate numbers.</div> : null}
                {lot && (
                  <div>
                    Holds{' '}
                    <Link to={`/lots/${lot.id}`} className="mono text-accent">
                      {lot.code}
                    </Link>{' '}
                    · book {fmtGal(held)}
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-2">
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'dip', label: 'Dip' },
                  { value: 'height', label: 'Height' },
                  { value: 'gallons', label: 'Target gal' },
                ]}
              />
            </div>
            <div className="mt-3">
              {mode !== 'gallons' ? (
                <Field label={mode === 'dip' ? 'Distance from the top of the sidewall down to the wine' : 'Liquid height from the lowest point of the tank'}>
                  <div className="flex gap-2">
                    <Input type="number" step="any" min={0} value={inches} onChange={(e) => setInches(e.target.value)} placeholder="0" className="text-[18px] h-11 num" autoFocus />
                    <Segmented
                      value={unit}
                      onChange={setUnit}
                      options={[
                        { value: 'in', label: 'in' },
                        { value: 'cm', label: 'cm' },
                      ]}
                    />
                  </div>
                </Field>
              ) : (
                <Field label="How many gallons do you want in the tank?">
                  <Input type="number" step="any" min={0} value={targetGal} onChange={(e) => setTargetGal(e.target.value)} placeholder="0" className="text-[18px] h-11 num" autoFocus />
                </Field>
              )}
            </div>
          </Card>

          {vessel && gallons !== null && (
            <Card tone="accent">
              <div className="text-[12px] uppercase tracking-wider opacity-80">{mode === 'gallons' ? 'Fill to' : 'Wine in tank'}</div>
              {mode === 'gallons' ? (
                <>
                  <div className="display text-[44px] leading-none num mt-1">
                    {fromIn(liquidHeight!).toFixed(1)} {unit}
                  </div>
                  <div className="text-sm opacity-90 mt-2">
                    from the bottom · dip of {fromIn(H - liquidHeight!).toFixed(1)} {unit} from the top
                  </div>
                </>
              ) : (
                <>
                  <div className="display text-[44px] leading-none num mt-1">{fmtNum(gallons)} gal</div>
                  <div className="text-sm opacity-90 mt-2 num">
                    {fmtNum(gallons * LITERS_PER_GAL)} L · {Math.round((gallons / vessel.capacityGal) * 100)}% full · {fmtGal(vessel.capacityGal - gallons)} headspace
                  </div>
                </>
              )}
              {diff !== null && mode !== 'gallons' && (
                <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between gap-3">
                  <div className="text-sm">
                    vs. book <span className="num font-semibold">{fmtGal(held)}</span>: <span className={cx('num font-semibold', Math.abs(diff) > held * 0.02 && 'underline decoration-wavy')}>{diff >= 0 ? '+' : ''}{fmtNum(diff)} gal</span>
                  </div>
                  {Math.abs(diff) >= 1 && (
                    <Button size="sm" variant="secondary" onClick={applyAsBook}>
                      Record as {diff < 0 ? 'shortage' : 'overage'}
                    </Button>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {vessel && <TankCrossSection vessel={vessel} liquidHeight={liquidHeight} bookHeight={held ? heightForGallons(vessel, held) : null} />}
          {vessel && <StrappingTable vessel={vessel} />}
        </div>
      </div>
    </div>
  )
}

function TankCrossSection({ vessel, liquidHeight, bookHeight }: { vessel: NonNullable<ReturnType<typeof useOrgData>>['vessels'][number]; liquidHeight: number | null; bookHeight: number | null }) {
  const g = vessel.geometry
  const H = totalHeightIn(vessel)
  const W = 300
  const Hpx = 320
  const dia = g?.diameterIn ?? 60
  const scale = Math.min((W - 80) / dia, (Hpx - 40) / H)
  const tw = dia * scale
  const th = H * scale
  const x0 = (W - tw) / 2
  const y0 = (Hpx - th) / 2
  const bottomH = (g?.bottomHeightIn ?? 0) * scale
  const body = g?.bottom === 'cone' ? `M${x0},${y0} H${x0 + tw} V${y0 + th - bottomH} L${x0 + tw / 2},${y0 + th} L${x0},${y0 + th - bottomH} Z` : g?.bottom === 'dish' ? `M${x0},${y0} H${x0 + tw} V${y0 + th - bottomH} Q${x0 + tw / 2},${y0 + th + bottomH * 0.6} ${x0},${y0 + th - bottomH} Z` : g?.bottom === 'slope' ? `M${x0},${y0} H${x0 + tw} V${y0 + th} L${x0},${y0 + th - bottomH} Z` : `M${x0},${y0} H${x0 + tw} V${y0 + th} H${x0} Z`
  const yFor = (hIn: number) => y0 + th - hIn * scale
  return (
    <Card title="Cross-section" subtitle="Not to scale across tanks — proportions are this tank’s own">
      <div className="flex flex-col sm:flex-row gap-6 items-center">
        <svg width={W} height={Hpx} viewBox={`0 0 ${W} ${Hpx}`} className="shrink-0" role="img" aria-label="Tank cross-section">
          <defs>
            <clipPath id="tank-body">
              <path d={body} />
            </clipPath>
          </defs>
          <path d={body} fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth={2} />
          {liquidHeight !== null && <rect x={x0} y={yFor(liquidHeight)} width={tw} height={th} clipPath="url(#tank-body)" fill="var(--red-wine)" opacity={0.75} />}
          {bookHeight !== null && (
            <g>
              <line x1={x0 - 14} x2={x0 + tw + 14} y1={yFor(bookHeight)} y2={yFor(bookHeight)} stroke="var(--info)" strokeDasharray="4 3" strokeWidth={1.5} />
              <text x={x0 + tw + 16} y={yFor(bookHeight) + 4} fontSize={10} fill="var(--info)">
                book
              </text>
            </g>
          )}
          {liquidHeight !== null && (
            <g>
              <line x1={x0 + tw + 8} x2={x0 + tw + 8} y1={y0} y2={yFor(liquidHeight)} stroke="var(--ink-3)" strokeWidth={1} />
              <text x={x0 + tw + 12} y={(y0 + yFor(liquidHeight)) / 2} fontSize={10} fill="var(--ink-2)">
                dip {(H - liquidHeight).toFixed(1)}″
              </text>
              <line x1={x0 - 8} x2={x0 - 8} y1={yFor(liquidHeight)} y2={y0 + th} stroke="var(--ink-3)" strokeWidth={1} />
              <text x={x0 - 12} y={(yFor(liquidHeight) + y0 + th) / 2} fontSize={10} fill="var(--ink-2)" textAnchor="end">
                {liquidHeight.toFixed(1)}″
              </text>
            </g>
          )}
          <text x={W / 2} y={y0 - 8} fontSize={10} fill="var(--ink-3)" textAnchor="middle">
            Ø {dia}″
          </text>
          <text x={W / 2} y={Hpx - 4} fontSize={10} fill="var(--ink-3)" textAnchor="middle">
            {H.toFixed(0)}″ total height
          </text>
        </svg>
        <div className="grid grid-cols-2 gap-4 flex-1 w-full">
          <Stat label="Capacity" value={fmtNum(vessel.capacityGal)} sub="gal nominal" />
          <Stat label="Geometry total" value={fmtNum(gallonsAtHeight(vessel, H))} sub="gal computed" />
          {g && g.bottom !== 'flat' && <Stat label="Bottom section" value={fmtNum(bottomFullGal(g))} sub={`gal in the ${g.bottom}`} />}
          {g && <Stat label="Per inch" value={cylinderGalPerInch(g.diameterIn).toFixed(1)} sub="gal on the sidewall" />}
        </div>
      </div>
      <p className="text-[12px] text-ink-3 mt-3 flex items-start gap-1.5">
        <Ruler className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Dip from a consistent reference (top of the sidewall at the manway). For variable-capacity tanks measure from the lid seal and enter as height from the bottom.
      </p>
    </Card>
  )
}

function StrappingTable({ vessel }: { vessel: NonNullable<ReturnType<typeof useOrgData>>['vessels'][number] }) {
  const [step, setStep] = useState(6)
  const rows = buildStrappingTable(vessel, step)
  const exportCsv = () => download(`${vessel.code}-strapping.csv`, toCsv([['Height (in)', 'Gallons', 'Liters'], ...rows.map((r) => [r.heightIn, r.gallons, Math.round(r.gallons * LITERS_PER_GAL)])]), 'text/csv')
  const cols = 3
  const per = Math.ceil(rows.length / cols)
  return (
    <Card
      title="Strapping table"
      subtitle={`${vessel.code} · gallons at each height from the bottom`}
      actions={
        <>
          <Select value={step} onChange={(e) => setStep(Number(e.target.value))} className="h-7 text-[12px] w-auto py-0">
            {[1, 2, 3, 6, 12].map((s) => (
              <option key={s} value={s}>
                every {s}″
              </option>
            ))}
          </Select>
          <Button size="sm" variant="ghost" icon={<Printer className="h-4 w-4" />} onClick={exportCsv}>
            CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={() => window.print()}>
            Print
          </Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-3 gap-x-6 print-sheet">
        {Array.from({ length: cols }, (_, c) => (
          <Table key={c} className="mx-0 px-0">
            <thead>
              <tr>
                <Th>Height</Th>
                <Th right>Gallons</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(c * per, (c + 1) * per).map((r) => (
                <tr key={r.heightIn}>
                  <Td className="num">{r.heightIn}″</Td>
                  <Td right>{fmtNum(r.gallons)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ))}
      </div>
      {vessel.geometry?.estimated && <p className="text-[12px] text-warn mt-3">Estimated geometry — replace with the manufacturer’s chart on the tank map before relying on this for compliance inventories.</p>}
    </Card>
  )
}
