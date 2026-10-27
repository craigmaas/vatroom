import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftRight, Beaker, ChevronLeft, Droplets, FlaskConical, GitBranch, GitMerge, Layers, MinusCircle, MoreHorizontal, Pencil, PlusCircle, Scissors, StickyNote, Truck, Wine, Printer, Lock, Eye } from 'lucide-react'
import type { Analyte, LotEvent } from '@/domain/types'
import { lotVolume, useOrgData, useRole, useStore } from '@/store/useStore'
import { Badge, Button, Card, Field, Input, Modal, Select, Stat, Table, Tabs, Td, Th, Textarea, WineDot, Meter } from '@/components/ui'
import { Donut, LineChart, type SeriesDef } from '@/components/charts'
import { fmtGal, fmtMoney, fmtNum, ANALYTE_META } from '@/domain/units'
import { labelEligibility, sharesBy } from '@/domain/labeling'
import { fmtDate, cx, download } from '@/lib/format'
import { OperationDialog, type OpKind, STAGES } from './OperationDialogs'
import { TAX_CLASSES } from '@/domain/compliance'
import { toCsv } from '@/importers/csv'

type Tab = 'timeline' | 'composition' | 'chemistry' | 'additions' | 'lineage' | 'notes' | 'costs'

const KIND_ICON: Record<string, typeof Droplets> = {
  transfer: ArrowLeftRight,
  addition: FlaskConical,
  measurement: Beaker,
  loss: MinusCircle,
  gain: PlusCircle,
  split: Scissors,
  combine: GitMerge,
  press: Layers,
  crush: Layers,
  note: StickyNote,
  'transfer-in-bond': Truck,
  'taxpaid-removal': Truck,
  bottling: Wine,
}

export function LotDetailPage() {
  const { id } = useParams()
  const data = useOrgData()
  const role = useRole()
  const navigate = useNavigate()
  const updateLot = useStore((s) => s.updateLot)
  const [tab, setTab] = useState<Tab>('timeline')
  const [op, setOp] = useState<OpKind>(null)
  const [edit, setEdit] = useState(false)
  const [showPrivate, setShowPrivate] = useState(true)

  const lot = data?.lots.find((l) => l.id === id)
  const events = useMemo(() => (data && lot ? data.events.filter((e) => e.lotId === lot.id).sort((a, b) => a.at.localeCompare(b.at)) : []), [data, lot])
  const vesselById = useMemo(() => new Map(data?.vessels.map((v) => [v.id, v]) ?? []), [data])
  const canEdit = role !== 'viewer'

  if (!data || !lot) {
    return (
      <div className="text-center py-20 text-ink-3">
        Lot not found. <Link to="/lots" className="text-accent">Back to lots</Link>
      </div>
    )
  }
  const volume = lotVolume(lot)
  const lastByAnalyte = new Map<Analyte, { value: number; unit: string; at: string }>()
  for (const e of events) for (const m of e.measurements ?? []) lastByAnalyte.set(m.analyte, { value: m.value, unit: m.unit, at: e.at })
  const costs = data.costs.filter((c) => c.lotId === lot.id)
  const costTotal = costs.reduce((s, c) => s + c.amount, 0)

  const actions: { kind: OpKind; label: string; icon: typeof Droplets; primary?: boolean }[] = [
    { kind: 'transfer', label: 'Transfer', icon: ArrowLeftRight, primary: true },
    { kind: 'addition', label: 'Addition', icon: FlaskConical, primary: true },
    { kind: 'measurement', label: 'Lab reading', icon: Beaker, primary: true },
    { kind: 'operation', label: 'Operation', icon: Layers },
    { kind: 'loss', label: 'Loss', icon: MinusCircle },
    { kind: 'gain', label: 'Gain', icon: PlusCircle },
    { kind: 'split', label: 'Split', icon: Scissors },
    { kind: 'combine', label: 'Combine', icon: GitMerge },
    { kind: 'removal', label: 'Bottle / remove', icon: Truck },
    { kind: 'note', label: 'Note', icon: StickyNote },
  ]

  return (
    <div>
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink mb-3 no-print">
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="display text-[36px] leading-none mono tracking-tight">{lot.code}</h1>
            <Badge tone={lot.status === 'archived' ? 'neutral' : lot.stage === 'Fermentation' ? 'warn' : 'accent'} className="mt-1">
              {lot.status === 'archived' ? 'Closed' : lot.stage}
            </Badge>
            {canEdit && (
              <button onClick={() => setEdit(true)} className="text-ink-3 hover:text-ink mt-1 no-print" aria-label="Edit lot">
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink-2 mt-2">
            <span className="flex items-center gap-1.5">
              <WineDot color={lot.color} /> {lot.variety} {lot.vintage}
            </span>
            {lot.marketingName && <span>“{lot.marketingName}”</span>}
            {lot.client && <span className="text-ink-3">Brand {lot.client}</span>}
            <span className="text-ink-3">·</span>
            <span className="mono text-[13px]">{lot.bondNumber || 'no bond'}</span>
            <span className="text-ink-3">·</span>
            <span>{lot.taxClass}</span>
            {lot.fermentationPlan && (
              <>
                <span className="text-ink-3">·</span>
                <span>{lot.fermentationPlan}</span>
              </>
            )}
          </div>
        </div>
        {canEdit && lot.status === 'active' && (
          <div className="flex flex-wrap gap-2 no-print">
            {actions
              .filter((a) => a.primary)
              .map((a) => (
                <Button key={a.kind} variant="primary" icon={<a.icon className="h-4 w-4" />} onClick={() => setOp(a.kind)}>
                  {a.label}
                </Button>
              ))}
            <MoreMenu items={actions.filter((a) => !a.primary).map((a) => ({ label: a.label, icon: a.icon, onClick: () => setOp(a.kind) }))} extra={[{ label: 'Change stage', icon: Layers, onClick: () => setOp('stage') }]} />
          </div>
        )}
      </div>

      {/* summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Card className="p-4">
          <Stat label="Volume" value={fmtNum(volume)} sub="gallons on the books" />
        </Card>
        <Card className="p-4 lg:col-span-2">
          <div className="text-[12px] font-medium uppercase tracking-wide text-ink-3 mb-2">Where it is</div>
          <ul className="space-y-1.5">
            {lot.holds.map((h) => {
              const v = vesselById.get(h.vesselId)
              return (
                <li key={h.vesselId} className="flex items-center gap-3 text-sm">
                  <Link to={`/cellar?vessel=${h.vesselId}`} className="mono font-semibold w-28 truncate hover:underline">
                    {v?.code ?? '?'}
                  </Link>
                  <Meter value={h.gallons} max={v?.capacityGal ?? h.gallons} tone={lot.color === 'white' ? 'white' : lot.color === 'rosé' ? 'rose' : 'red'} className="flex-1" />
                  <span className="num w-28 text-right">
                    {fmtGal(h.gallons)} <span className="text-ink-3 text-[11px]">/ {fmtNum(v?.capacityGal)}</span>
                  </span>
                </li>
              )
            })}
            {!lot.holds.length && <li className="text-sm text-ink-3">No wine on hand — bottled, removed or combined.</li>}
          </ul>
        </Card>
        <Card className="p-4">
          <div className="text-[12px] font-medium uppercase tracking-wide text-ink-3 mb-2">Latest chemistry</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {(['freeSO2', 'ph', 'ta', 'va', 'brix', 'alcohol'] as Analyte[]).map((a) => {
              const m = lastByAnalyte.get(a)
              return (
                <div key={a} className="text-[13px]">
                  <span className="text-ink-3">{ANALYTE_META[a].short}</span> <span className="num font-medium">{m ? `${m.value}${m.unit && a !== 'ph' ? ' ' + ANALYTE_META[a].unit : ''}` : '—'}</span>
                </div>
              )
            })}
          </div>
        </Card>
        <Card className="p-4">
          <Stat label="Cost to date" value={fmtMoney(costTotal)} sub={volume ? `${fmtMoney(costTotal / volume)} / gal · ${fmtMoney((costTotal / volume) * 2.3775)} / case` : '—'} />
        </Card>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'timeline', label: 'Timeline', count: events.length },
          { value: 'composition', label: 'Composition & label', count: lot.components.length },
          { value: 'chemistry', label: 'Chemistry' },
          { value: 'additions', label: 'Additions', count: events.filter((e) => e.kind === 'addition').length },
          { value: 'lineage', label: 'Lineage' },
          { value: 'notes', label: 'Notes' },
          { value: 'costs', label: 'Costs', count: costs.length },
        ]}
        className="mb-4"
      />

      {tab === 'timeline' && <Timeline events={events} vesselCode={(vid) => vesselById.get(vid)?.code ?? vid} lotCode={lot.code} showPrivate={showPrivate} onTogglePrivate={() => setShowPrivate((p) => !p)} />}
      {tab === 'composition' && <Composition lot={lot} />}
      {tab === 'chemistry' && <Chemistry events={events} />}
      {tab === 'additions' && <Additions events={events} />}
      {tab === 'lineage' && <Lineage events={events} lotCode={lot.code} />}
      {tab === 'notes' && <Notes lot={lot} events={events} canEdit={canEdit} onEdit={(patch) => updateLot(lot.id, patch)} />}
      {tab === 'costs' && <Costs costs={costs} volume={volume} />}

      {op && <OperationDialog kind={op} lot={lot} onClose={() => setOp(null)} />}
      {edit && <EditLotDialog lot={lot} onClose={() => setEdit(false)} />}
    </div>
  )
}

function MoreMenu({ items, extra }: { items: { label: string; icon: typeof Droplets; onClick: () => void }[]; extra: { label: string; icon: typeof Droplets; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <Button icon={<MoreHorizontal className="h-4 w-4" />} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        More
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul role="menu" className="absolute right-0 z-20 mt-1 w-52 bg-surface border border-border rounded-xl shadow-pop p-1">
            {[...items, ...extra].map((it) => (
              <li key={it.label}>
                <button
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    it.onClick()
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm hover:bg-surface-2 text-left"
                >
                  <it.icon className="h-4 w-4 text-ink-3" /> {it.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ timeline */
function Timeline({ events, vesselCode, lotCode, showPrivate, onTogglePrivate }: { events: LotEvent[]; vesselCode: (id: string) => string; lotCode: string; showPrivate: boolean; onTogglePrivate: () => void }) {
  const [filter, setFilter] = useState<'all' | 'movements' | 'additions' | 'lab' | 'notes'>('all')
  const list = [...events]
    .reverse()
    .filter((e) => showPrivate || e.official)
    .filter((e) => {
      if (filter === 'all') return true
      if (filter === 'movements') return ['transfer', 'loss', 'gain', 'split', 'combine', 'press', 'crush', 'transfer-in-bond', 'taxpaid-removal', 'bottling', 'created'].includes(e.kind)
      if (filter === 'additions') return e.kind === 'addition'
      if (filter === 'lab') return e.kind === 'measurement'
      return e.kind === 'note'
    })
  // group by day
  const groups: { day: string; items: LotEvent[] }[] = []
  for (const e of list) {
    const day = e.at.slice(0, 10)
    const g = groups[groups.length - 1]
    if (g && g.day === day) g.items.push(e)
    else groups.push({ day, items: [e] })
  }
  const exportCsv = () => {
    const rows = [['Date', 'Kind', 'Summary', 'Gallons', 'Volume after', 'Official', 'Notes'], ...events.map((e) => [fmtDate(e.at, true), e.kind, e.summary, e.gallons ?? '', e.volumeAfterGal ?? '', e.official ? 'yes' : 'no', e.notes ?? ''])]
    download(`${lotCode}-history.csv`, toCsv(rows), 'text/csv')
  }
  return (
    <Card
      title="Production record"
      subtitle="Every operation, in order. Volumes shown are the lot’s book volume after each entry."
      actions={
        <>
          <button onClick={onTogglePrivate} className={cx('inline-flex items-center gap-1 text-[12px] px-2 h-7 rounded-md border whitespace-nowrap', showPrivate ? 'border-border text-ink-2' : 'border-accent text-accent bg-accent-soft')} title="Toggle winemaker's private notes">
            {showPrivate ? <Eye className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />} {showPrivate ? 'All entries' : 'Official only'}
          </button>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="h-7 text-[12px] w-auto py-0">
            <option value="all">Everything</option>
            <option value="movements">Movements</option>
            <option value="additions">Additions</option>
            <option value="lab">Lab</option>
            <option value="notes">Notes</option>
          </Select>
          <Button size="sm" variant="ghost" icon={<Printer className="h-4 w-4" />} onClick={exportCsv}>
            CSV
          </Button>
        </>
      }
    >
      <ol className="relative">
        {groups.map((g) => (
          <li key={g.day} className="relative">
            <div className="sticky top-0 z-[1] bg-surface/95 backdrop-blur text-[12px] font-semibold text-ink-3 uppercase tracking-wide py-2">{fmtDate(g.day + 'T12:00:00')}</div>
            <ul className="border-l-2 border-border ml-2 pl-5 space-y-3 pb-3">
              {g.items.map((e) => {
                const Icon = KIND_ICON[e.kind] ?? Layers
                const tone = e.kind === 'loss' || e.kind === 'taxpaid-removal' ? 'text-danger' : e.kind === 'gain' || e.kind === 'combine' ? 'text-good' : e.kind === 'measurement' ? 'text-info' : e.kind === 'addition' ? 'text-warn' : 'text-ink-2'
                return (
                  <li key={e.id} className="relative">
                    <span className={cx('absolute -left-[31px] top-0.5 h-5 w-5 rounded-full bg-surface border-2 border-border grid place-items-center', tone)}>
                      <Icon className="h-3 w-3" />
                    </span>
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="text-[12px] text-ink-3 num w-16">{new Date(e.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                      <div className="flex-1 min-w-0">
                        <div className={cx('text-sm', !e.official && 'italic text-ink-2')}>
                          {e.kind === 'transfer' && e.fromVesselId && e.toVesselId ? (
                            <>
                              Transferred <strong className="num">{fmtGal(e.gallons)}</strong> from <span className="mono">{vesselCode(e.fromVesselId)}</span> to <span className="mono">{vesselCode(e.toVesselId)}</span>
                            </>
                          ) : e.kind === 'transfer' && e.toVesselId ? (
                            <>
                              Transferred <strong className="num">{fmtGal(e.gallons)}</strong> to <span className="mono">{vesselCode(e.toVesselId)}</span>
                            </>
                          ) : e.kind === 'addition' ? (
                            <span className="flex flex-wrap gap-1.5">
                              {e.additions?.map((a, i) => (
                                <span key={i} className="inline-flex items-center gap-1 rounded-md bg-warn-soft px-1.5 py-0.5 text-[13px]">
                                  <strong className="num">
                                    {a.qty} {a.unit !== 'ea' && a.unit}
                                  </strong>{' '}
                                  {a.material}
                                  {a.rate && <span className="text-ink-3 text-[11px]">· {a.rate}</span>}
                                </span>
                              ))}
                            </span>
                          ) : e.kind === 'measurement' ? (
                            <span className="flex flex-wrap gap-1.5">
                              {e.measurements?.map((m, i) => (
                                <span key={i} className="inline-flex items-center gap-1 rounded-md bg-info-soft px-1.5 py-0.5 text-[13px]">
                                  <span className="text-ink-3">{ANALYTE_META[m.analyte].short}</span> <strong className="num">{m.value}</strong> <span className="text-ink-3 text-[11px]">{m.unit}</span>
                                </span>
                              ))}
                            </span>
                          ) : (
                            e.summary
                          )}
                        </div>
                        {e.notes && e.kind !== 'note' && <div className="text-[12px] text-ink-3 mt-0.5">{e.notes}</div>}
                        {!e.official && <span className="text-[10px] uppercase tracking-wider text-ink-3">Private note</span>}
                      </div>
                      {e.volumeAfterGal !== undefined && e.kind !== 'measurement' && e.kind !== 'note' && <span className="text-[12px] text-ink-3 num whitespace-nowrap">{fmtNum(e.volumeAfterGal)} gal</span>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
        {!groups.length && <li className="text-sm text-ink-3 py-6 text-center">Nothing recorded yet.</li>}
      </ol>
    </Card>
  )
}

/* ------------------------------------------------------------------ composition */
function Composition({ lot }: { lot: ReturnType<typeof useOrgData> extends infer T ? (T extends { lots: (infer L)[] } ? L : never) : never }) {
  const [by, setBy] = useState<'variety' | 'ava' | 'vineyard' | 'vintage'>('variety')
  const comps = lot.components
  const total = comps.reduce((s, c) => s + c.volumeGal, 0)
  const shares = sharesBy(comps, (c) => (by === 'variety' ? c.variety : by === 'ava' ? c.ava : by === 'vineyard' ? c.vineyardName ?? c.sourceName : String(c.vintage)))
  const elig = labelEligibility(comps)
  return (
    <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
      <Card
        title="Origins"
        subtitle={`${fmtGal(total)} of source material`}
        actions={
          <Select value={by} onChange={(e) => setBy(e.target.value as typeof by)} className="h-7 text-[12px] w-auto py-0">
            <option value="variety">By variety</option>
            <option value="ava">By AVA</option>
            <option value="vineyard">By vineyard</option>
            <option value="vintage">By vintage</option>
          </Select>
        }
      >
        {comps.length ? (
          <>
            <Donut slices={shares.map((s) => ({ label: s.label, value: s.gallons }))} size={160} />
            <Table className="mt-4">
              <thead>
                <tr>
                  <Th>Source</Th>
                  <Th>Type</Th>
                  <Th>Origin</Th>
                  <Th right>Gal</Th>
                  <Th right>Share</Th>
                </tr>
              </thead>
              <tbody>
                {comps.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <div className="font-medium">{c.sourceName}</div>
                      <div className="text-[11px] text-ink-3">
                        {c.variety} {c.vintage}
                        {c.pickBrix ? ` · ${c.pickBrix} °Bx` : ''}
                      </div>
                    </Td>
                    <Td>
                      <Badge>{c.type}</Badge>
                    </Td>
                    <Td className="text-[12px] text-ink-2">
                      {[c.ava, c.county, c.state].filter(Boolean).join(', ')}
                      {c.estate && <Badge tone="good" className="ml-1">Estate</Badge>}
                    </Td>
                    <Td right>{fmtNum(c.volumeGal, 2)}</Td>
                    <Td right>{total ? ((c.volumeGal / total) * 100).toFixed(1) : 0}%</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        ) : (
          <p className="text-sm text-ink-3 py-6 text-center">No composition recorded. Add components through a crush or a bulk-wine receipt so label claims can be substantiated.</p>
        )}
      </Card>
      <Card title="Label eligibility" subtitle="Computed from composition under 27 CFR Part 4 — a decision aid, not legal advice">
        {elig.length ? (
          <ul className="divide-y divide-border">
            {elig.map((l) => (
              <li key={l.rule} className="py-3 flex items-start gap-3">
                <span className={cx('mt-0.5 h-5 w-5 rounded-full grid place-items-center text-[11px] font-bold shrink-0', l.ok ? 'bg-good-soft text-good' : 'bg-danger-soft text-danger')}>{l.ok ? '✓' : '✕'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{l.rule}</span>
                    <span className="text-[12px] text-ink-3 num">
                      {l.pct.toFixed(1)}% · needs {l.threshold}%
                    </span>
                  </div>
                  <div className="text-[13px] text-ink-2">
                    {l.ok ? 'May state' : 'May not state'} <strong>“{l.claim}”</strong>
                  </div>
                  <Meter value={l.pct} max={100} tone={l.ok ? 'good' : 'danger'} className="mt-1.5 h-1.5" />
                  {l.note && <div className="text-[11px] text-ink-3 mt-1">{l.note}</div>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3 py-6 text-center">Needs composition.</p>
        )}
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ chemistry */
function Chemistry({ events }: { events: LotEvent[] }) {
  const byAnalyte = new Map<Analyte, { t: number; v: number }[]>()
  for (const e of events) for (const m of e.measurements ?? []) byAnalyte.set(m.analyte, [...(byAnalyte.get(m.analyte) ?? []), { t: new Date(e.at).getTime(), v: m.value }])
  const so2Adds = events.filter((e) => e.kind === 'addition' && e.additions?.some((a) => /so2|kmbs/i.test(a.material)))
  const targets: Partial<Record<Analyte, { min: number; max: number }>> = { freeSO2: { min: 25, max: 40 }, ph: { min: 3.3, max: 3.7 }, va: { min: 0, max: 0.7 } }
  const panels = ([...byAnalyte.keys()] as Analyte[]).sort()
  return (
    <div className="space-y-4">
      {!panels.length && (
        <Card>
          <p className="text-sm text-ink-3 py-6 text-center">No lab readings yet. Record Brix, pH, TA, free SO₂ and VA from the lot header.</p>
        </Card>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        {panels.map((a) => {
          const pts = byAnalyte.get(a)!
          const s: SeriesDef = { key: a, label: ANALYTE_META[a].label, unit: ANALYTE_META[a].unit, points: pts }
          const last = pts[pts.length - 1]
          return (
            <Card key={a} title={ANALYTE_META[a].label} subtitle={`${pts.length} reading${pts.length === 1 ? '' : 's'} · latest ${last.v} ${ANALYTE_META[a].unit}`}>
              <LineChart series={[s]} target={targets[a]} height={160} />
              {targets[a] && (
                <div className="text-[11px] text-ink-3 mt-1">
                  Shaded band: typical target {targets[a]!.min}–{targets[a]!.max} {ANALYTE_META[a].unit}
                </div>
              )}
            </Card>
          )
        })}
      </div>
      {so2Adds.length > 0 && (
        <Card title="SO₂ additions" subtitle="Cumulative sulfite added to this lot">
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Addition</Th>
                <Th>Dose</Th>
                <Th right>Lot volume</Th>
              </tr>
            </thead>
            <tbody>
              {so2Adds.map((e) =>
                e.additions!
                  .filter((a) => /so2|kmbs/i.test(a.material))
                  .map((a, i) => (
                    <tr key={e.id + i}>
                      <Td>{fmtDate(e.at)}</Td>
                      <Td>
                        {a.qty} {a.unit} {a.material}
                      </Td>
                      <Td>{a.rate}</Td>
                      <Td right>{fmtGal(e.volumeAfterGal)}</Td>
                    </tr>
                  )),
              )}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ additions */
function Additions({ events }: { events: LotEvent[] }) {
  const rows = events.filter((e) => e.kind === 'addition').flatMap((e) => e.additions!.map((a) => ({ e, a })))
  const groups = new Map<string, typeof rows>()
  for (const r of rows) groups.set(r.a.material, [...(groups.get(r.a.material) ?? []), r])
  return (
    <Card title="Additions" subtitle="Grouped by material — 27 CFR 24.246 limits apply to several of these">
      <Table>
        <thead>
          <tr>
            <Th>Material</Th>
            <Th>Date</Th>
            <Th right>Quantity</Th>
            <Th>Rate</Th>
            <Th right>Lot volume</Th>
            <Th>Vessel</Th>
            <Th>Notes</Th>
          </tr>
        </thead>
        <tbody>
          {[...groups.entries()].map(([material, items]) => (
            <GroupRows key={material} material={material} items={items} />
          ))}
          {!rows.length && (
            <tr>
              <Td className="text-center text-ink-3 py-6" colSpan={7}>
                No additions recorded.
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </Card>
  )
}
function GroupRows({ material, items }: { material: string; items: { e: LotEvent; a: { qty: number; unit: string; rate?: string } }[] }) {
  const sameUnit = items.every((i) => i.a.unit === items[0].a.unit)
  const total = sameUnit ? items.reduce((s, i) => s + i.a.qty, 0) : null
  return (
    <>
      <tr className="bg-surface-2/60">
        <Td className="font-semibold" colSpan={2}>
          {material}
        </Td>
        <Td right className="font-semibold">
          {total !== null ? `${fmtNum(total, 2)} ${items[0].a.unit}` : `${items.length} additions`}
        </Td>
        <Td colSpan={4} />
      </tr>
      {items.map(({ e, a }, i) => (
        <tr key={e.id + i}>
          <Td />
          <Td>{fmtDate(e.at)}</Td>
          <Td right>
            {a.qty} {a.unit !== 'ea' && a.unit}
          </Td>
          <Td className="text-ink-2">{a.rate}</Td>
          <Td right>{fmtGal(e.volumeAfterGal)}</Td>
          <Td mono className="text-ink-2">
            {e.vesselIds?.join(', ')}
          </Td>
          <Td className="text-ink-3 text-[12px]">{e.notes}</Td>
        </tr>
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ lineage */
function Lineage({ events, lotCode }: { events: LotEvent[]; lotCode: string }) {
  const data = useOrgData()
  const nodes = events.filter((e) => ['created', 'split', 'combine', 'press', 'transfer-in-bond', 'bottling', 'taxpaid-removal'].includes(e.kind))
  const linkFor = (ref?: string) => {
    if (!ref) return null
    const lot = data?.lots.find((l) => l.id === ref || l.code === ref)
    return lot ? (
      <Link to={`/lots/${lot.id}`} className="mono text-accent hover:underline">
        {lot.code}
      </Link>
    ) : (
      <span className="mono">{ref}</span>
    )
  }
  return (
    <Card title="Lineage" subtitle="Where this lot came from and where its wine went">
      <div className="relative">
        <div className="absolute left-[7.5rem] top-0 bottom-0 w-0.5 bg-border" />
        <ul className="space-y-4">
          {nodes.map((e) => {
            const incoming = e.kind === 'combine' || (e.kind === 'press' && / pressed into /.test(e.summary)) || e.kind === 'created'
            return (
              <li key={e.id} className="grid grid-cols-[6.5rem_2rem_1fr] items-start gap-2">
                <div className="text-right">
                  {e.relatedLotId && incoming && e.kind !== 'created' ? (
                    <div className="inline-block rounded-lg border border-border bg-surface px-2 py-1 text-[12px]">
                      {linkFor(e.relatedLotId)}
                      <div className="text-[10px] text-ink-3">{e.gallons ? `${fmtGal(e.gallons)} in` : 'merged in'}</div>
                    </div>
                  ) : (
                    <div className="text-[12px] text-ink-3 pt-1">{fmtDate(e.at)}</div>
                  )}
                </div>
                <div className="flex justify-center pt-1">
                  <span className={cx('h-4 w-4 rounded-full border-2 bg-surface', incoming ? 'border-good' : e.kind === 'created' ? 'border-accent' : 'border-danger')} />
                </div>
                <div className="rounded-lg border border-border bg-surface px-3 py-2">
                  <div className="text-sm font-medium">
                    {e.kind === 'created' && `Lot ${lotCode} created`}
                    {e.kind === 'split' && (
                      <>
                        Split → {linkFor(e.relatedLotId)} {e.gallons ? <span className="text-ink-3">({fmtGal(e.gallons)})</span> : null}
                      </>
                    )}
                    {e.kind === 'combine' && <>Combined {linkFor(e.relatedLotId)} into this lot</>}
                    {e.kind === 'press' && e.summary}
                    {e.kind === 'transfer-in-bond' && <>Transferred in bond — {fmtGal(e.gallons)}</>}
                    {e.kind === 'bottling' && <>Bottled — {fmtGal(e.gallons)}</>}
                    {e.kind === 'taxpaid-removal' && <>Taxpaid removal — {fmtGal(e.gallons)}</>}
                  </div>
                  <div className="text-[12px] text-ink-3 mt-0.5">
                    {fmtDate(e.at)} · volume after {fmtGal(e.volumeAfterGal)}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
      <div className="mt-4 text-[12px] text-ink-3 flex items-center gap-2">
        <GitBranch className="h-3.5 w-3.5" /> Related lots are links when they exist in this workspace.
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ notes */
function Notes({ lot, events, canEdit, onEdit }: { lot: { officialNotes?: string; privateNotes?: string }; events: LotEvent[]; canEdit: boolean; onEdit: (p: { officialNotes?: string; privateNotes?: string }) => void }) {
  const [official, setOfficial] = useState(lot.officialNotes ?? '')
  const [priv, setPriv] = useState(lot.privateNotes ?? '')
  const noteEvents = [...events].reverse().filter((e) => e.kind === 'note')
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Official notes" subtitle="Part of the production record — included in audit packets">
        <Textarea value={official} onChange={(e) => setOfficial(e.target.value)} disabled={!canEdit} className="min-h-[140px]" />
        {canEdit && (
          <Button size="sm" className="mt-2" onClick={() => onEdit({ officialNotes: official })} disabled={official === (lot.officialNotes ?? '')}>
            Save official notes
          </Button>
        )}
      </Card>
      <Card title="Winemaker’s notes" subtitle="Private working notes — never exported">
        <Textarea value={priv} onChange={(e) => setPriv(e.target.value)} disabled={!canEdit} className="min-h-[140px] bg-warn-soft/40" />
        {canEdit && (
          <Button size="sm" className="mt-2" onClick={() => onEdit({ privateNotes: priv })} disabled={priv === (lot.privateNotes ?? '')}>
            Save private notes
          </Button>
        )}
      </Card>
      <Card title="Dated notes" subtitle="From the timeline" className="lg:col-span-2">
        <ul className="divide-y divide-border">
          {noteEvents.map((e) => (
            <li key={e.id} className="py-2.5 flex gap-3 text-sm">
              <span className="text-ink-3 text-[12px] w-28 shrink-0">{fmtDate(e.at)}</span>
              <span className={cx('flex-1', !e.official && 'italic')}>{e.notes ?? e.summary}</span>
              <Badge tone={e.official ? 'accent' : 'neutral'}>{e.official ? 'Official' : 'Private'}</Badge>
            </li>
          ))}
          {!noteEvents.length && <li className="py-6 text-center text-sm text-ink-3">No dated notes yet — use “Note” in the lot header.</li>}
        </ul>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ costs */
function Costs({ costs, volume }: { costs: { id: string; date: string; category: string; amount: number; description: string; vendor?: string; qbRef?: string; synced?: boolean }[]; volume: number }) {
  const byCat = new Map<string, number>()
  for (const c of costs) byCat.set(c.category, (byCat.get(c.category) ?? 0) + c.amount)
  const total = costs.reduce((s, c) => s + c.amount, 0)
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <Card title="Cost ledger" subtitle="Direct costs attributed to this lot">
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Category</Th>
              <Th>Description</Th>
              <Th>Vendor</Th>
              <Th>QuickBooks</Th>
              <Th right>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {[...costs]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((c) => (
                <tr key={c.id}>
                  <Td>{fmtDate(c.date)}</Td>
                  <Td>
                    <Badge>{c.category}</Badge>
                  </Td>
                  <Td>{c.description}</Td>
                  <Td className="text-ink-2">{c.vendor}</Td>
                  <Td className="text-[12px]">{c.qbRef ? <span className="text-good">{c.qbRef}</span> : <span className="text-ink-3">not synced</span>}</Td>
                  <Td right>{fmtMoney(c.amount)}</Td>
                </tr>
              ))}
            {!costs.length && (
              <tr>
                <Td colSpan={6} className="text-center text-ink-3 py-6">
                  No costs yet — add them on the Costs page or sync bills from QuickBooks.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
      <Card title="Per-gallon build-up">
        <Donut slices={[...byCat.entries()].map(([label, value]) => ({ label, value }))} size={130} centre={<div className="text-center"><div className="font-semibold num text-[15px]">{volume ? fmtMoney(total / volume) : '—'}</div><div className="text-[10px] text-ink-3 uppercase">/ gal</div></div>} />
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-2">Total</dt>
            <dd className="num font-medium">{fmtMoney(total)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-2">Per 750 mL bottle</dt>
            <dd className="num font-medium">{volume ? fmtMoney((total / volume) * 0.198129) : '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-2">Per 12-bottle case</dt>
            <dd className="num font-medium">{volume ? fmtMoney((total / volume) * 2.37755) : '—'}</dd>
          </div>
        </dl>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ edit lot */
function EditLotDialog({ lot, onClose }: { lot: NonNullable<ReturnType<typeof useOrgData>>['lots'][number]; onClose: () => void }) {
  const updateLot = useStore((s) => s.updateLot)
  const [form, setForm] = useState({ code: lot.code, marketingName: lot.marketingName ?? '', client: lot.client ?? '', variety: lot.variety, vintage: String(lot.vintage), color: lot.color, stage: lot.stage, taxClass: lot.taxClass, bondNumber: lot.bondNumber, fermentationPlan: lot.fermentationPlan ?? '', abv: lot.abv ? String(lot.abv) : '', tags: lot.tags.join(', ') })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${lot.code}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              updateLot(lot.id, { code: form.code, marketingName: form.marketingName || undefined, client: form.client || undefined, variety: form.variety, vintage: /^\d{4}$/.test(form.vintage) ? Number(form.vintage) : 'NV', color: form.color, stage: form.stage, taxClass: form.taxClass, bondNumber: form.bondNumber, fermentationPlan: form.fermentationPlan || undefined, abv: form.abv ? Number(form.abv) : undefined, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean) })
              onClose()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Lot code">
          <Input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} className="mono" />
        </Field>
        <Field label="Marketing name">
          <Input value={form.marketingName} onChange={(e) => set('marketingName', e.target.value)} />
        </Field>
        <Field label="Variety">
          <Input value={form.variety} onChange={(e) => set('variety', e.target.value)} />
        </Field>
        <Field label="Vintage">
          <Input value={form.vintage} onChange={(e) => set('vintage', e.target.value)} placeholder="YYYY or NV" />
        </Field>
        <Field label="Colour">
          <Select value={form.color} onChange={(e) => set('color', e.target.value)}>
            {['red', 'white', 'rosé', 'other'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Stage">
          <Select value={form.stage} onChange={(e) => set('stage', e.target.value)}>
            {STAGES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tax class">
          <Select value={form.taxClass} onChange={(e) => set('taxClass', e.target.value)}>
            {TAX_CLASSES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Bond">
          <Input value={form.bondNumber} onChange={(e) => set('bondNumber', e.target.value)} className="mono" />
        </Field>
        <Field label="Client / brand">
          <Input value={form.client} onChange={(e) => set('client', e.target.value.toUpperCase())} />
        </Field>
        <Field label="Fermentation plan">
          <Input value={form.fermentationPlan} onChange={(e) => set('fermentationPlan', e.target.value)} />
        </Field>
        <Field label="ABV %">
          <Input type="number" step="0.1" value={form.abv} onChange={(e) => set('abv', e.target.value)} />
        </Field>
        <Field label="Tags" hint="Comma separated">
          <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
