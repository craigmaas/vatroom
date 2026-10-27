import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Tractor, Scale } from 'lucide-react'
import type { CrushRecord } from '@/domain/types'
import { useOrgData, useRole, useStore } from '@/store/useStore'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Stat, Table, Td, Th, Textarea } from '@/components/ui'
import { Bars } from '@/components/charts'
import { fmtMoney, fmtNum } from '@/domain/units'
import { fmtDate, fromInputDateTime, nowInput } from '@/lib/format'
import { newId } from '@/data/seed'
import { NewLotDialog } from '@/features/lots/OperationDialogs'

/** Typical juice yield per ton by process — used to pre-fill gallons */
const YIELD_GAL_PER_TON: Record<CrushRecord['process'], number> = { 'destem-crush': 170, 'whole-cluster press': 150, 'whole-berry': 165, 'direct press': 155, carbonic: 160 }

export function HarvestPage() {
  const data = useOrgData()
  const role = useRole()
  const upsert = useStore((s) => s.upsert)
  const remove = useStore((s) => s.remove)
  const recordTransfer = useStore((s) => s.recordTransfer)
  const recordOperation = useStore((s) => s.recordOperation)
  const updateLot = useStore((s) => s.updateLot)
  const recordMeasurement = useStore((s) => s.recordMeasurement)
  const toast = useStore((s) => s.toast)
  const [year, setYear] = useState(() => {
    const yrs = data?.crush.map((c) => new Date(c.date).getFullYear()) ?? []
    return yrs.length ? Math.max(...yrs) : new Date().getFullYear()
  })
  const [editing, setEditing] = useState<CrushRecord | null>(null)
  const [newLot, setNewLot] = useState(false)
  const canEdit = role !== 'viewer'

  const rows = useMemo(() => (data?.crush ?? []).filter((c) => new Date(c.date).getFullYear() === year).sort((a, b) => b.date.localeCompare(a.date)), [data, year])
  if (!data) return null
  const years = [...new Set([new Date().getFullYear(), ...data.crush.map((c) => new Date(c.date).getFullYear())])].sort((a, b) => b - a)
  const tons = rows.reduce((s, c) => s + c.tons, 0)
  const byVariety = new Map<string, number>()
  for (const c of rows) byVariety.set(c.variety, (byVariety.get(c.variety) ?? 0) + c.tons)
  const spend = rows.reduce((s, c) => s + (c.pricePerTon ?? 0) * c.tons, 0)
  const estTotal = data.blocks.reduce((s, b) => s + (b.seasons?.[year]?.estYieldTons ?? 0), 0)
  const avgBrix = rows.filter((c) => c.brix).reduce((s, c) => s + c.brix! * c.tons, 0) / (rows.filter((c) => c.brix).reduce((s, c) => s + c.tons, 0) || 1)

  const saveCrush = (c: CrushRecord, createLotEvents: boolean) => {
    const isNew = !data.crush.some((x) => x.id === c.id)
    upsert('crush', c)
    if (isNew && createLotEvents && c.destinationLotId) {
      const lot = data.lots.find((l) => l.id === c.destinationLotId)
      if (lot) {
        const gal = Math.round(c.tons * YIELD_GAL_PER_TON[c.process])
        recordOperation(c.destinationLotId, `Crush — ${fmtNum(c.tons, 2)} t ${c.variety} from ${c.vineyardName}${c.blockName ? ` ${c.blockName}` : ''}${c.weighTag ? ` (tag ${c.weighTag})` : ''}`, c.date)
        if (c.destinationVesselId && gal > 0) recordTransfer(c.destinationLotId, null, c.destinationVesselId, gal, c.date, 'Estimated from tons × typical yield; adjust after pressing')
        const ms = [c.brix && { analyte: 'brix' as const, value: c.brix, unit: '°Bx' }, c.ph && { analyte: 'ph' as const, value: c.ph, unit: '' }, c.ta && { analyte: 'ta' as const, value: c.ta, unit: 'g/L' }].filter(Boolean) as { analyte: 'brix' | 'ph' | 'ta'; value: number; unit: string }[]
        if (ms.length) recordMeasurement(c.destinationLotId, ms, c.date, 'Pick chemistry')
        // append a composition component for origin tracking
        updateLot(c.destinationLotId, {
          components: [
            ...lot.components,
            { id: newId('cmp'), sourceName: `${c.vineyardName}${c.blockName ? ` (${c.blockName})` : ''} - ${c.date.slice(0, 10)}`, volumeGal: gal, type: 'Grapes', variety: c.variety, vintage: new Date(c.date).getFullYear(), dateReceived: c.date, pickBrix: c.brix, vineyardId: c.vineyardId, vineyardName: c.vineyardName, state: c.state, county: c.county, district: c.district, ava: c.ava, estate: data.vineyards.find((v) => v.id === c.vineyardId)?.estate ?? false },
          ],
        })
        toast({ title: 'Crush recorded', body: `${fmtNum(c.tons, 2)} t → ${lot.code} (~${fmtNum(gal)} gal)`, tone: 'good' })
      }
    }
    setEditing(null)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Harvest"
        title={`Crush log ${year}`}
        subtitle={`${fmtNum(tons, 1)} tons received in ${rows.length} loads${estTotal ? ` · ${Math.round((tons / estTotal) * 100)}% of ${fmtNum(estTotal)} t estimated` : ''}`}
        actions={
          <>
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-auto">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
            {canEdit && (
              <>
                <Button onClick={() => setNewLot(true)}>New lot</Button>
                <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ id: newId('cr'), orgId: data.vessels[0]?.orgId ?? '', date: new Date().toISOString(), vineyardName: '', variety: '', tons: 0, process: 'destem-crush', state: 'CA', county: '' })}>
                  Record a load
                </Button>
              </>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card className="p-4">
          <Stat label="Tons received" value={fmtNum(tons, 1)} sub={`${rows.length} weigh tags`} />
        </Card>
        <Card className="p-4">
          <Stat label="Weighted avg Brix" value={avgBrix ? avgBrix.toFixed(1) : '—'} sub="°Bx at the scale" />
        </Card>
        <Card className="p-4">
          <Stat label="Fruit spend" value={fmtMoney(spend)} sub={tons ? `${fmtMoney(spend / tons)} / ton` : ''} />
        </Card>
        <Card className="p-4">
          <Stat label="Est. juice" value={fmtNum(rows.reduce((s, c) => s + c.tons * YIELD_GAL_PER_TON[c.process], 0))} sub="gallons at typical yields" />
        </Card>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <Card padded={false}>
          <div className="px-5">
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Vineyard / block</Th>
                  <Th>Variety</Th>
                  <Th right>Tons</Th>
                  <Th right>Brix</Th>
                  <Th right>pH</Th>
                  <Th right>TA</Th>
                  <Th>Process</Th>
                  <Th>Into</Th>
                  <Th right>$/t</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const lot = data.lots.find((l) => l.id === c.destinationLotId)
                  const vessel = data.vessels.find((v) => v.id === c.destinationVesselId)
                  return (
                    <tr key={c.id} className="hover:bg-surface-2/60 cursor-pointer" onClick={() => canEdit && setEditing(c)}>
                      <Td>
                        <div>{fmtDate(c.date)}</div>
                        {c.weighTag && <div className="text-[11px] text-ink-3 mono">{c.weighTag}</div>}
                      </Td>
                      <Td>
                        <div className="font-medium">{c.vineyardName}</div>
                        <div className="text-[12px] text-ink-3">
                          {c.blockName ?? ''}
                          {c.ava ? ` · ${c.ava}` : ''}
                        </div>
                      </Td>
                      <Td>{c.variety}</Td>
                      <Td right className="font-medium">
                        {fmtNum(c.tons, 2)}
                      </Td>
                      <Td right>{c.brix ?? '—'}</Td>
                      <Td right>{c.ph ?? '—'}</Td>
                      <Td right>{c.ta ?? '—'}</Td>
                      <Td>
                        <Badge>{c.process}</Badge>
                      </Td>
                      <Td mono>
                        {lot ? (
                          <Link to={`/lots/${lot.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                            {lot.code}
                          </Link>
                        ) : (
                          '—'
                        )}
                        {vessel && <span className="text-ink-3"> · {vessel.code}</span>}
                      </Td>
                      <Td right>{fmtMoney(c.pricePerTon)}</Td>
                    </tr>
                  )
                })}
                {!rows.length && (
                  <tr>
                    <Td colSpan={10}>
                      <EmptyState icon={<Tractor />} title={`No fruit received in ${year}`} body="Record each load as it crosses the scale — tons, Brix, pH, TA and where it went. The crush log feeds composition, costs and the California Grape Crush Report." />
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Tons by variety">
            <Bars rows={[...byVariety.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))} format={(v) => `${fmtNum(v, 1)} t`} />
          </Card>
          <Card title="Blocks still to pick" subtitle={`Estimates for ${year} without a delivery`}>
            <ul className="divide-y divide-border text-sm">
              {data.blocks
                .filter((b) => b.seasons?.[year]?.estYieldTons && !data.crush.some((c) => c.blockId === b.id && new Date(c.date).getFullYear() === year))
                .map((b) => {
                  const vy = data.vineyards.find((v) => v.id === b.vineyardId)
                  return (
                    <li key={b.id} className="py-2 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {vy?.name} · {b.name}
                        </div>
                        <div className="text-[12px] text-ink-3">
                          {b.variety}
                          {b.seasons?.[year]?.harvestDate ? ` · target ${fmtDate(b.seasons[year].harvestDate)}` : ''}
                        </div>
                      </div>
                      <span className="num">{b.seasons?.[year]?.estYieldTons} t</span>
                    </li>
                  )
                })}
            </ul>
          </Card>
          <div className="text-[11px] text-ink-3 flex items-start gap-1.5">
            <Scale className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Gallons are estimated from tons at typical yields per process; the lot volume is corrected at pressing.
          </div>
        </div>
      </div>

      {editing && (
        <CrushDialog
          record={editing}
          isNew={!data.crush.some((x) => x.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={saveCrush}
          onDelete={() => {
            remove('crush', editing.id)
            setEditing(null)
          }}
        />
      )}
      {newLot && <NewLotDialog onClose={() => setNewLot(false)} />}
    </div>
  )
}

function CrushDialog({ record, isNew, onClose, onSave, onDelete }: { record: CrushRecord; isNew: boolean; onClose: () => void; onSave: (c: CrushRecord, createLotEvents: boolean) => void; onDelete: () => void }) {
  const data = useOrgData()!
  const [c, setC] = useState(record)
  const [when, setWhen] = useState(nowInput())
  const [createEvents, setCreateEvents] = useState(true)
  const blocks = data.blocks.filter((b) => b.vineyardId === c.vineyardId)
  const n = (v: string) => (v === '' ? undefined : Number(v))
  const occupied = new Set(data.lots.flatMap((l) => l.holds.map((h) => h.vesselId)))
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Record a load' : `Edit load ${record.weighTag ?? ''}`}
      width="lg"
      footer={
        <>
          {!isNew && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!c.vineyardName || !c.variety || c.tons <= 0} onClick={() => onSave({ ...c, date: isNew ? fromInputDateTime(when) : c.date }, createEvents)}>
            Save load
          </Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Vineyard" required>
          <Select
            value={c.vineyardId ?? ''}
            onChange={(e) => {
              const vy = data.vineyards.find((v) => v.id === e.target.value)
              setC({ ...c, vineyardId: vy?.id, vineyardName: vy?.name ?? c.vineyardName, state: vy?.state ?? c.state, county: vy?.county ?? c.county, ava: vy?.ava, district: vy?.district, blockId: undefined, blockName: undefined })
            }}
          >
            <option value="">Other / one-off grower…</option>
            {data.vineyards.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
          {!c.vineyardId && <Input className="mt-2" value={c.vineyardName} onChange={(e) => setC({ ...c, vineyardName: e.target.value })} placeholder="Vineyard name" />}
        </Field>
        <Field label="Block">
          <Select
            value={c.blockId ?? ''}
            onChange={(e) => {
              const b = blocks.find((x) => x.id === e.target.value)
              setC({ ...c, blockId: b?.id, blockName: b?.name, variety: b?.variety ?? c.variety })
            }}
            disabled={!blocks.length}
          >
            <option value="">—</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.variety}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Variety" required>
          <Input value={c.variety} onChange={(e) => setC({ ...c, variety: e.target.value })} />
        </Field>
        <Field label="Tons (net)" required>
          <Input type="number" step="0.01" value={c.tons || ''} onChange={(e) => setC({ ...c, tons: Number(e.target.value) })} />
        </Field>
        <Field label="Weigh tag #">
          <Input value={c.weighTag ?? ''} onChange={(e) => setC({ ...c, weighTag: e.target.value || undefined })} className="mono" />
        </Field>
        <Field label="Price per ton">
          <Input type="number" step="1" value={c.pricePerTon ?? ''} onChange={(e) => setC({ ...c, pricePerTon: n(e.target.value) })} />
        </Field>
        <Field label="Brix">
          <Input type="number" step="0.1" value={c.brix ?? ''} onChange={(e) => setC({ ...c, brix: n(e.target.value) })} />
        </Field>
        <Field label="pH">
          <Input type="number" step="0.01" value={c.ph ?? ''} onChange={(e) => setC({ ...c, ph: n(e.target.value) })} />
        </Field>
        <Field label="TA (g/L)">
          <Input type="number" step="0.1" value={c.ta ?? ''} onChange={(e) => setC({ ...c, ta: n(e.target.value) })} />
        </Field>
        <Field label="Process">
          <Select value={c.process} onChange={(e) => setC({ ...c, process: e.target.value as CrushRecord['process'] })}>
            {Object.keys(YIELD_GAL_PER_TON).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Destination lot">
          <Select value={c.destinationLotId ?? ''} onChange={(e) => setC({ ...c, destinationLotId: e.target.value || undefined })}>
            <option value="">—</option>
            {data.lots
              .filter((l) => l.status === 'active')
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} · {l.variety} {l.vintage}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Into vessel">
          <Select value={c.destinationVesselId ?? ''} onChange={(e) => setC({ ...c, destinationVesselId: e.target.value || undefined })}>
            <option value="">—</option>
            {data.vessels
              .filter((v) => v.status === 'active' && (v.type === 'tank' || v.type === 'portable' || v.type === 'bin'))
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code} {occupied.has(v.id) ? '(in use)' : ''}
                </option>
              ))}
          </Select>
        </Field>
        {isNew && (
          <Field label="Received at">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        )}
        <Field label="Fruit temp (°F)">
          <Input type="number" value={c.temperatureF ?? ''} onChange={(e) => setC({ ...c, temperatureF: n(e.target.value) })} />
        </Field>
        <Field label="Notes" className="sm:col-span-3">
          <Textarea value={c.notes ?? ''} onChange={(e) => setC({ ...c, notes: e.target.value || undefined })} className="min-h-[60px]" />
        </Field>
      </div>
      {isNew && c.destinationLotId && (
        <label className="flex items-start gap-2 mt-4 text-sm">
          <input type="checkbox" checked={createEvents} onChange={(e) => setCreateEvents(e.target.checked)} className="mt-1" />
          <span>
            Also write to the lot: crush operation, pick chemistry, origin component and ~{fmtNum(c.tons * YIELD_GAL_PER_TON[c.process])} gal into {data.vessels.find((v) => v.id === c.destinationVesselId)?.code ?? 'the vessel'}.
          </span>
        </label>
      )}
    </Modal>
  )
}
