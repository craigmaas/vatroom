import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Addition, Analyte, Lot, LotStage, Measurement, TaxClass, WineColor } from '@/domain/types'
import { lotVolume, useOrgData, useStore } from '@/store/useStore'
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { fmtGal, ANALYTE_META, doseRate } from '@/domain/units'
import { fromInputDateTime, nowInput } from '@/lib/format'
import { nextLotCode, parseLotCode, VARIETY_CODES, colorForVariety } from '@/domain/lot-codes'
import { TAX_CLASSES } from '@/domain/compliance'

export type OpKind = 'transfer' | 'addition' | 'measurement' | 'loss' | 'gain' | 'operation' | 'stage' | 'split' | 'combine' | 'removal' | 'note' | null

export const STAGES: LotStage[] = ['Intake', 'Processing', 'Cold soak', 'Fermentation', 'Post-fermentation', 'Malolactic fermentation', 'Aging', 'Blending', 'Stabilization', 'Bottling ready', 'Bottled', 'Shipped', 'Closed']

const OPERATIONS = ['Pump over', 'Punch down', 'Rack', 'Rack and return', 'Délestage', 'Cold soak', 'Yeast inoculation', 'ML inoculation', 'Press', 'Crush', 'Stir lees (bâtonnage)', 'Filter', 'Cold stabilise', 'Heat stabilise', 'Top barrels', 'Sterile filter', 'Blend trial', 'Sample pulled']

function useVesselOptions(lot?: Lot) {
  const data = useOrgData()
  return useMemo(() => {
    if (!data) return { held: [], free: [], all: [] }
    const occupied = new Map<string, { lotCode: string; gallons: number }>()
    for (const l of data.lots) for (const h of l.holds) occupied.set(h.vesselId, { lotCode: l.code, gallons: (occupied.get(h.vesselId)?.gallons ?? 0) + h.gallons })
    const all = [...data.vessels].filter((v) => v.status !== 'retired').sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    const held = all.filter((v) => lot?.holds.some((h) => h.vesselId === v.id))
    const free = all.filter((v) => !occupied.has(v.id) || lot?.holds.some((h) => h.vesselId === v.id))
    return { held, free, all, occupied }
  }, [data, lot])
}

export function OperationDialog({ kind, lot, onClose }: { kind: OpKind; lot: Lot; onClose: () => void }) {
  if (!kind) return null
  switch (kind) {
    case 'transfer':
      return <TransferDialog lot={lot} onClose={onClose} />
    case 'addition':
      return <AdditionDialog lot={lot} onClose={onClose} />
    case 'measurement':
      return <MeasurementDialog lot={lot} onClose={onClose} />
    case 'loss':
    case 'gain':
      return <VolumeDialog lot={lot} kind={kind} onClose={onClose} />
    case 'operation':
      return <OperationNoteDialog lot={lot} onClose={onClose} />
    case 'stage':
      return <StageDialog lot={lot} onClose={onClose} />
    case 'split':
      return <SplitDialog lot={lot} onClose={onClose} />
    case 'combine':
      return <CombineDialog lot={lot} onClose={onClose} />
    case 'removal':
      return <RemovalDialog lot={lot} onClose={onClose} />
    case 'note':
      return <NoteDialog lot={lot} onClose={onClose} />
  }
}

function When({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="When">
      <Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

/* ------------------------------------------------------------------ transfer */
function TransferDialog({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const recordTransfer = useStore((s) => s.recordTransfer)
  const toast = useStore((s) => s.toast)
  const { held, all, occupied } = useVesselOptions(lot)
  const [from, setFrom] = useState(held[0]?.id ?? '')
  const [to, setTo] = useState('')
  const fromHold = lot.holds.find((h) => h.vesselId === from)
  const [gal, setGal] = useState(fromHold?.gallons ?? lotVolume(lot))
  const [at, setAt] = useState(nowInput())
  const [notes, setNotes] = useState('')
  const toVessel = all.find((v) => v.id === to)
  const toOcc = to ? occupied?.get(to) : undefined
  const overfill = toVessel ? (toOcc?.gallons ?? 0) + gal > toVessel.capacityGal : false
  const submit = () => {
    if (!to || gal <= 0) return
    recordTransfer(lot.id, from || null, to, gal, fromInputDateTime(at), notes || undefined)
    toast({ title: 'Transfer recorded', body: `${fmtGal(gal)} → ${toVessel?.code}`, tone: 'good' })
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Transfer · ${lot.code}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!to || gal <= 0}>
            Record transfer
          </Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="From">
          <Select
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              const h = lot.holds.find((x) => x.vesselId === e.target.value)
              if (h) setGal(h.gallons)
            }}
          >
            <option value="">— New wine (no source vessel)</option>
            {held.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code} · {fmtGal(lot.holds.find((h) => h.vesselId === v.id)?.gallons)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="To" required hint={toVessel ? `${fmtGal(toVessel.capacityGal)} capacity${toOcc && toOcc.lotCode !== lot.code ? ` · holds ${toOcc.lotCode} (${fmtGal(toOcc.gallons)})` : ''}` : undefined}>
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose a vessel…</option>
            {all
              .filter((v) => v.id !== from)
              .map((v) => {
                const occ = occupied?.get(v.id)
                return (
                  <option key={v.id} value={v.id}>
                    {v.code} — {fmtGal(v.capacityGal)} {occ ? `(${occ.lotCode})` : '(empty)'}
                  </option>
                )
              })}
          </Select>
        </Field>
        <Field label="Gallons" required hint={overfill ? 'Exceeds vessel capacity' : fromHold ? `Max ${fmtGal(fromHold.gallons)}` : undefined}>
          <Input type="number" min={0} step={1} value={gal} onChange={(e) => setGal(Number(e.target.value))} className={overfill ? 'border-danger' : ''} />
        </Field>
        <When value={at} onChange={setAt} />
        <Field label="Notes" className="sm:col-span-2">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Pump, hose, gas, who did it…" />
        </Field>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ addition */
function AdditionDialog({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const data = useOrgData()
  const recordAddition = useStore((s) => s.recordAddition)
  const toast = useStore((s) => s.toast)
  const { held } = useVesselOptions(lot)
  const [rows, setRows] = useState<Addition[]>([{ material: 'SO2 - KMBS', qty: 0, unit: 'lb' }])
  const [at, setAt] = useState(nowInput())
  const [notes, setNotes] = useState('')
  const [vessel, setVessel] = useState('')
  const vol = lotVolume(lot)
  const materials = data?.materials ?? []
  const update = (i: number, patch: Partial<Addition>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  // helper: target ppm → lb KMBS
  const [targetPpm, setTargetPpm] = useState('')
  const applyPpm = () => {
    const ppm = Number(targetPpm)
    if (!ppm || !vol) return
    const grams = (ppm * vol * 3.78541) / 1000 / 0.57
    const lb = Math.round((grams / 453.592) * 100) / 100
    setRows((r) => r.map((x, i) => (i === 0 ? { ...x, material: 'SO2 - KMBS', qty: lb, unit: 'lb' } : x)))
  }
  const submit = () => {
    const valid = rows.filter((r) => r.material && r.qty > 0)
    if (!valid.length) return
    recordAddition(lot.id, valid, fromInputDateTime(at), vessel ? [vessel] : undefined, notes || undefined)
    toast({ title: 'Addition recorded', body: valid.map((v) => `${v.qty} ${v.unit} ${v.material}`).join(', '), tone: 'good' })
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Addition · ${lot.code}`}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Record addition
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3 p-3 rounded-xl bg-surface-2 border border-border mb-4">
        <div className="text-sm text-ink-2 flex-1 min-w-[200px]">
          Lot volume <strong className="text-ink num">{fmtGal(vol)}</strong>. Doses are computed per addition.
        </div>
        <Field label="SO₂ target (ppm)">
          <Input type="number" value={targetPpm} onChange={(e) => setTargetPpm(e.target.value)} placeholder="e.g. 25" className="w-28" />
        </Field>
        <Button size="sm" onClick={applyPpm}>
          Compute KMBS
        </Button>
      </div>
      <datalist id="materials-list">
        {materials.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>
      <div className="space-y-2">
        {rows.map((r, i) => {
          const stock = materials.find((m) => m.name.toLowerCase() === r.material.toLowerCase())
          return (
            <div key={i} className="grid grid-cols-[1fr_90px_80px_auto_auto] gap-2 items-center">
              <Input list="materials-list" value={r.material} onChange={(e) => update(i, { material: e.target.value, unit: materials.find((m) => m.name === e.target.value)?.unit ?? r.unit })} placeholder="Material" />
              <Input type="number" min={0} step="any" value={r.qty || ''} onChange={(e) => update(i, { qty: Number(e.target.value) })} placeholder="Qty" />
              <Select value={r.unit} onChange={(e) => update(i, { unit: e.target.value })}>
                {['g', 'kg', 'lb', 'oz', 'mL', 'L', 'gal', 'ea'].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
              <div className="text-[12px] text-ink-3 w-28 num">
                {r.qty > 0 ? doseRate(r.qty, r.unit, vol, r.material) : ''}
                {stock && <div className={stock.onHand < r.qty ? 'text-danger' : ''}>stock {stock.onHand} {stock.unit}</div>}
              </div>
              <button onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="text-ink-3 hover:text-danger p-1" aria-label="Remove">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
      <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} className="mt-2" onClick={() => setRows((r) => [...r, { material: '', qty: 0, unit: 'g' }])}>
        Another material
      </Button>
      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <When value={at} onChange={setAt} />
        <Field label="Vessel (optional)">
          <Select value={vessel} onChange={(e) => setVessel(e.target.value)}>
            <option value="">Whole lot</option>
            {held.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Dissolved in 2 gal, added at pump-over…" />
        </Field>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ measurement */
function MeasurementDialog({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const recordMeasurement = useStore((s) => s.recordMeasurement)
  const toast = useStore((s) => s.toast)
  const [vals, setVals] = useState<Partial<Record<Analyte, string>>>({})
  const [at, setAt] = useState(nowInput())
  const [notes, setNotes] = useState('')
  const analytes: Analyte[] = ['brix', 'temp', 'ph', 'ta', 'freeSO2', 'totalSO2', 'va', 'alcohol', 'rs', 'malic', 'dissolvedO2', 'turbidity']
  const submit = () => {
    const ms: Measurement[] = analytes.filter((a) => vals[a] !== undefined && vals[a] !== '').map((a) => ({ analyte: a, value: Number(vals[a]), unit: ANALYTE_META[a].unit }))
    if (!ms.length) return
    recordMeasurement(lot.id, ms, fromInputDateTime(at), notes || undefined)
    toast({ title: 'Readings saved', body: ms.map((m) => `${ANALYTE_META[m.analyte].short} ${m.value}`).join(' · '), tone: 'good' })
    onClose()
  }
  // molecular SO2 helper
  const fso2 = Number(vals.freeSO2)
  const ph = Number(vals.ph)
  const molecular = fso2 && ph ? fso2 / (1 + Math.pow(10, ph - 1.81)) : null
  return (
    <Modal
      open
      onClose={onClose}
      title={`Lab readings · ${lot.code}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Save readings
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {analytes.map((a) => (
          <Field key={a} label={`${ANALYTE_META[a].label}${ANALYTE_META[a].unit ? ` (${ANALYTE_META[a].unit})` : ''}`}>
            <Input type="number" step="any" value={vals[a] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [a]: e.target.value }))} />
          </Field>
        ))}
      </div>
      {molecular !== null && (
        <div className={`mt-3 text-sm rounded-lg px-3 py-2 ${molecular >= 0.5 ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn'}`}>
          Molecular SO₂ ≈ <strong className="num">{molecular.toFixed(2)} ppm</strong> {molecular >= 0.5 ? '— protected (≥ 0.5 ppm)' : molecular >= 0.35 ? '— borderline; consider an SO₂ addition' : '— under-protected'}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <When value={at} onChange={setAt} />
        <Field label="Notes">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Method, sample location…" />
        </Field>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ loss / gain */
function VolumeDialog({ lot, kind, onClose }: { lot: Lot; kind: 'loss' | 'gain'; onClose: () => void }) {
  const record = useStore((s) => s.recordVolumeChange)
  const toast = useStore((s) => s.toast)
  const { held } = useVesselOptions(lot)
  const [gal, setGal] = useState(0)
  const [reason, setReason] = useState(kind === 'loss' ? 'Operations' : 'Operations')
  const [vessel, setVessel] = useState(held[0]?.id ?? '')
  const [at, setAt] = useState(nowInput())
  const reasons = kind === 'loss' ? ['Operations', 'Lees', 'Racking', 'Filtration', 'Evaporation (angel’s share)', 'Spill / breakage', 'Sampling', 'Inventory shortage', 'Destroyed'] : ['Operations', 'Inventory overage', 'Topping wine added', 'Measurement correction']
  const submit = () => {
    if (gal <= 0) return
    record(lot.id, kind, gal, reason, fromInputDateTime(at), vessel || undefined)
    toast({ title: kind === 'loss' ? 'Loss recorded' : 'Adjustment recorded', body: `${fmtGal(gal)} — ${reason}`, tone: 'good' })
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`${kind === 'loss' ? 'Record loss' : 'Record gain / adjustment'} · ${lot.code}`}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={gal <= 0}>
            Record
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Gallons" required>
          <Input type="number" min={0} step="any" value={gal || ''} onChange={(e) => setGal(Number(e.target.value))} />
        </Field>
        <Field label="Reason" hint="Losses are reported on TTB 5120.17; keep the reason accurate.">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {reasons.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label="Vessel">
          <Select value={vessel} onChange={(e) => setVessel(e.target.value)}>
            {held.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code}
              </option>
            ))}
          </Select>
        </Field>
        <When value={at} onChange={setAt} />
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ operation */
function OperationNoteDialog({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const record = useStore((s) => s.recordOperation)
  const toast = useStore((s) => s.toast)
  const [op, setOp] = useState(OPERATIONS[0])
  const [custom, setCustom] = useState('')
  const [at, setAt] = useState(nowInput())
  const [notes, setNotes] = useState('')
  const submit = () => {
    const name = op === '__custom' ? custom.trim() : op
    if (!name) return
    record(lot.id, name, fromInputDateTime(at), notes || undefined)
    toast({ title: 'Operation logged', body: name, tone: 'good' })
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Cellar operation · ${lot.code}`}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Log operation
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Operation">
          <Select value={op} onChange={(e) => setOp(e.target.value)}>
            {OPERATIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
            <option value="__custom">Other…</option>
          </Select>
        </Field>
        {op === '__custom' && (
          <Field label="Describe">
            <Input value={custom} onChange={(e) => setCustom(e.target.value)} />
          </Field>
        )}
        <When value={at} onChange={setAt} />
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ stage */
function StageDialog({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const setStage = useStore((s) => s.setStage)
  const [stage, setStageV] = useState<LotStage>(lot.stage)
  return (
    <Modal
      open
      onClose={onClose}
      title={`Change stage · ${lot.code}`}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setStage(lot.id, stage)
              onClose()
            }}
          >
            Set stage
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {STAGES.map((s) => (
          <button key={s} onClick={() => setStageV(s)} className={`text-left px-3 py-2 rounded-lg border text-sm ${stage === s ? 'border-accent bg-accent-soft text-accent-soft-ink' : 'border-border hover:bg-surface-2'}`}>
            {s}
          </button>
        ))}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ split */
function SplitDialog({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const data = useOrgData()
  const splitLot = useStore((s) => s.splitLot)
  const toast = useStore((s) => s.toast)
  const { all, occupied } = useVesselOptions(lot)
  const total = lotVolume(lot)
  const parsed = parseLotCode(lot.code)
  const suggested = data && parsed.client && parsed.varietyCode && parsed.vintage ? nextLotCode(data.lots.map((l) => l.code), parsed.client, parsed.varietyCode, parsed.vintage) : `${lot.code}-B`
  const [code, setCode] = useState(suggested)
  const [gal, setGal] = useState(Math.round(total / 2))
  const [to, setTo] = useState('')
  const [at, setAt] = useState(nowInput())
  const submit = () => {
    const child = splitLot(lot.id, gal, code, to, fromInputDateTime(at))
    if (child) toast({ title: 'Lot split', body: `${fmtGal(gal)} → ${code}`, tone: 'good' })
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Split · ${lot.code}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!to || gal <= 0 || gal >= total || !code}>
            Split lot
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2 mb-4">
        Composition, vintage and appellation carry over to the new lot in proportion. {fmtGal(total - gal)} stays in <span className="mono">{lot.code}</span>.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="New lot code" required>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="mono" />
        </Field>
        <Field label="Gallons to split off" required hint={`of ${fmtGal(total)}`}>
          <Input type="number" min={1} max={total - 1} value={gal} onChange={(e) => setGal(Number(e.target.value))} />
        </Field>
        <Field label="Into vessel" required>
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose…</option>
            {all
              .filter((v) => !occupied?.has(v.id))
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code} — {fmtGal(v.capacityGal)}
                </option>
              ))}
          </Select>
        </Field>
        <When value={at} onChange={setAt} />
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ combine */
function CombineDialog({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const data = useOrgData()
  const combine = useStore((s) => s.combineLots)
  const toast = useStore((s) => s.toast)
  const [source, setSource] = useState('')
  const [at, setAt] = useState(nowInput())
  const candidates = (data?.lots ?? []).filter((l) => l.id !== lot.id && l.status === 'active' && lotVolume(l) > 0)
  const src = candidates.find((l) => l.id === source)
  return (
    <Modal
      open
      onClose={onClose}
      title={`Combine into ${lot.code}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!source}
            onClick={() => {
              combine(lot.id, source, fromInputDateTime(at))
              toast({ title: 'Lots combined', body: `${src?.code} → ${lot.code}`, tone: 'good' })
              onClose()
            }}
          >
            Combine
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2 mb-4">The source lot is closed and its composition merges into this one. Physically move the wine with a transfer afterwards if needed.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Source lot" required>
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Choose…</option>
            {candidates.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.variety} {l.vintage} · {fmtGal(lotVolume(l))}
              </option>
            ))}
          </Select>
        </Field>
        <When value={at} onChange={setAt} />
      </div>
      {src && (
        <div className="mt-4 text-sm rounded-lg bg-surface-2 border border-border p-3">
          Result: <strong className="num">{fmtGal(lotVolume(lot) + lotVolume(src))}</strong> · {src.variety !== lot.variety ? `blend of ${lot.variety} and ${src.variety}` : lot.variety}
          {src.vintage !== lot.vintage && <span className="text-warn"> · mixed vintages — check label eligibility</span>}
        </div>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ removal (bottling / TIB / taxpaid) */
function RemovalDialog({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const record = useStore((s) => s.recordRemoval)
  const toast = useStore((s) => s.toast)
  const total = lotVolume(lot)
  const [kind, setKind] = useState<'bottling' | 'transfer-in-bond' | 'taxpaid-removal'>('bottling')
  const [gal, setGal] = useState(total)
  const [details, setDetails] = useState('')
  const [at, setAt] = useState(nowInput())
  const cases = (gal * 3.78541) / 9
  return (
    <Modal
      open
      onClose={onClose}
      title={`Remove from bulk · ${lot.code}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={gal <= 0 || gal > total}
            onClick={() => {
              record(lot.id, kind, gal, fromInputDateTime(at), details || (kind === 'bottling' ? `${cases.toFixed(0)} cases 750 mL` : ''))
              toast({ title: 'Removal recorded', body: `${fmtGal(gal)} ${kind.replace(/-/g, ' ')}`, tone: 'good' })
              onClose()
            }}
          >
            Record
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2 mb-4">
        {(
          [
            ['bottling', 'Bottled', 'Moves wine from bulk to bottled inventory (still in bond).'],
            ['transfer-in-bond', 'Transfer in bond', 'Shipped to another bonded premises under TTB 5100.16.'],
            ['taxpaid-removal', 'Taxpaid removal', 'Removed from bond; excise tax is due on TTB 5000.24.'],
          ] as const
        ).map(([k, label, hint]) => (
          <button key={k} onClick={() => setKind(k)} className={`text-left p-3 rounded-lg border ${kind === k ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2'}`}>
            <div className="text-sm font-medium">{label}</div>
            <div className="text-[11px] text-ink-3 mt-1 leading-snug">{hint}</div>
          </button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Gallons" required hint={kind === 'bottling' ? `≈ ${cases.toFixed(0)} cases of 12 × 750 mL` : `of ${fmtGal(total)}`}>
          <Input type="number" min={0} max={total} value={gal} onChange={(e) => setGal(Number(e.target.value))} />
        </Field>
        <When value={at} onChange={setAt} />
        <Field label={kind === 'bottling' ? 'Bottling details' : kind === 'transfer-in-bond' ? 'Receiving bonded premises (name, BWN)' : 'Customer / destination'} className="sm:col-span-2">
          <Input value={details} onChange={(e) => setDetails(e.target.value)} placeholder={kind === 'bottling' ? 'Line, closure, COLA ID…' : kind === 'transfer-in-bond' ? 'e.g. Example Cellars, BWN-CA-1234' : 'e.g. Distributor PO 4471'} />
        </Field>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ note */
function NoteDialog({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const addNote = useStore((s) => s.addNote)
  const [text, setText] = useState('')
  const [official, setOfficial] = useState(false)
  return (
    <Modal
      open
      onClose={onClose}
      title={`Note · ${lot.code}`}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!text.trim()}
            onClick={() => {
              addNote(lot.id, text.trim(), official)
              onClose()
            }}
          >
            Add note
          </Button>
        </>
      }
    >
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Tasting impressions, reminders, observations…" autoFocus />
      <label className="flex items-start gap-2 mt-3 text-sm">
        <input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)} className="mt-1" />
        <span>
          <span className="font-medium">Part of the official record</span>
          <span className="block text-[12px] text-ink-3">Official notes are included in compliance exports and audit packets. Leave unchecked for winemaker’s working notes.</span>
        </span>
      </label>
    </Modal>
  )
}

/* ------------------------------------------------------------------ new lot */
export function NewLotDialog({ onClose, onCreated }: { onClose: () => void; onCreated?: (lot: Lot) => void }) {
  const data = useOrgData()
  const createLot = useStore((s) => s.createLot)
  const org = useStore((s) => s.organizations.find((o) => o.id === s.session.orgId))
  const toast = useStore((s) => s.toast)
  const { all, occupied } = useVesselOptions()
  const [client, setClient] = useState('VV')
  const [varietyCode, setVarietyCode] = useState('CH')
  const [vintage, setVintage] = useState(new Date().getFullYear())
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<LotStage>('Intake')
  const [taxClass, setTaxClass] = useState<TaxClass>('still ≤16%')
  const [vessel, setVessel] = useState('')
  const [gal, setGal] = useState(0)
  const [plan, setPlan] = useState('')
  const suggested = data ? nextLotCode(data.lots.map((l) => l.code), client.toUpperCase(), varietyCode, vintage) : ''
  const finalCode = code || suggested
  const variety = VARIETY_CODES[varietyCode] ?? 'Red Blend'
  const color: WineColor = colorForVariety(variety, finalCode)
  const submit = () => {
    if (!finalCode) return
    if (data?.lots.some((l) => l.code === finalCode)) {
      toast({ title: 'Code already used', body: finalCode, tone: 'danger' })
      return
    }
    const lot = createLot({ code: finalCode, client: client.toUpperCase(), vintage, variety, color, stage, taxClass, bondNumber: org?.bondNumber ?? '', fermentationPlan: plan || undefined, tags: [], components: [], holds: [], initialVesselId: vessel || undefined, initialGallons: gal || undefined })
    toast({ title: 'Lot created', body: finalCode, tone: 'good' })
    onCreated?.(lot)
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="New lot"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Create {finalCode}
          </Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Client / brand" hint="Prefix for the lot code">
          <Input value={client} onChange={(e) => setClient(e.target.value.toUpperCase())} className="mono" maxLength={4} />
        </Field>
        <Field label="Variety">
          <Select value={varietyCode} onChange={(e) => setVarietyCode(e.target.value)}>
            {Object.entries(VARIETY_CODES).map(([k, v]) => (
              <option key={k} value={k}>
                {v} ({k})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vintage">
          <Input type="number" value={vintage} onChange={(e) => setVintage(Number(e.target.value))} />
        </Field>
        <Field label="Lot code" hint="Auto-numbered; override if needed" className="sm:col-span-2">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={suggested} className="mono" />
        </Field>
        <Field label="Stage">
          <Select value={stage} onChange={(e) => setStage(e.target.value as LotStage)}>
            {STAGES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tax class">
          <Select value={taxClass} onChange={(e) => setTaxClass(e.target.value as TaxClass)}>
            {TAX_CLASSES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Fermentation plan / protocol" className="sm:col-span-2">
          <Input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="e.g. BT Demo Red" />
        </Field>
        <Field label="Initial vessel" hint="Optional — or add the wine later with a transfer or crush">
          <Select value={vessel} onChange={(e) => setVessel(e.target.value)}>
            <option value="">None yet</option>
            {all
              .filter((v) => !occupied?.has(v.id))
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code} — {fmtGal(v.capacityGal)}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Initial gallons">
          <Input type="number" min={0} value={gal || ''} onChange={(e) => setGal(Number(e.target.value))} disabled={!vessel} />
        </Field>
      </div>
    </Modal>
  )
}
