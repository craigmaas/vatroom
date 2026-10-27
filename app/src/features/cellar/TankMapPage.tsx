import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Calculator, Grip, Plus, Save, Trash2, Wrench, X } from 'lucide-react'
import type { Vessel, VesselType, WineColor } from '@/domain/types'
import { useOrgData, useRole, useStore } from '@/store/useStore'
import { Badge, Button, Card, Drawer, Field, Input, PageHeader, Select, Segmented, Stat, Textarea, WineDot } from '@/components/ui'
import { fmtGal, fmtNum } from '@/domain/units'
import { estimateGeometry } from '@/domain/tank-geometry'
import { cx } from '@/lib/format'
import { TankGlyph } from './TankGlyph'
import { newId } from '@/data/seed'
import { OperationDialog, type OpKind } from '@/features/lots/OperationDialogs'

const CELL = 92
const GAP = 10

interface Occ {
  lotId: string
  code: string
  gallons: number
  color: WineColor
  stage: string
}

export function TankMapPage() {
  const data = useOrgData()
  const role = useRole()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const upsert = useStore((s) => s.upsert)
  const remove = useStore((s) => s.remove)
  const toast = useStore((s) => s.toast)
  const [mode, setMode] = useState<'view' | 'arrange'>('view')
  const [colorBy, setColorBy] = useState<'wine' | 'fill'>('wine')
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const [draft, setDraft] = useState<Record<string, { x: number; y: number }>>({})
  const [newOpen, setNewOpen] = useState(false)
  const [op, setOp] = useState<OpKind>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const selectedId = params.get('vessel')
  const canEdit = role !== 'viewer'

  const occupancy = useMemo(() => {
    const m = new Map<string, Occ[]>()
    for (const l of data?.lots ?? []) {
      if (l.status !== 'active') continue
      for (const h of l.holds) m.set(h.vesselId, [...(m.get(h.vesselId) ?? []), { lotId: l.id, code: l.code, gallons: h.gallons, color: l.color, stage: l.stage }])
    }
    return m
  }, [data])

  const vessels = useMemo(() => (data?.vessels ?? []).filter((v) => v.status !== 'retired'), [data])
  const zones = useMemo(() => {
    const z = new Map<string, Vessel[]>()
    for (const v of vessels) z.set(v.map.zone, [...(z.get(v.map.zone) ?? []), v])
    return [...z.entries()]
  }, [vessels])
  const bounds = useMemo(() => {
    let maxX = 0
    let maxY = 0
    for (const v of vessels) {
      const p = draft[v.id] ?? v.map
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    return { w: (maxX + 2) * (CELL + GAP), h: (maxY + 2) * (CELL + GAP) }
  }, [vessels, draft])

  const stats = useMemo(() => {
    const tanks = vessels.filter((v) => v.type === 'tank' || v.type === 'portable')
    const cap = tanks.reduce((s, v) => s + v.capacityGal, 0)
    const used = tanks.reduce((s, v) => s + (occupancy.get(v.id)?.reduce((t, o) => t + o.gallons, 0) ?? 0), 0)
    const empty = tanks.filter((v) => !occupancy.has(v.id) && v.status === 'active')
    return { cap, used, empty, tanks }
  }, [vessels, occupancy])

  // drag to arrange
  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const rect = boardRef.current!.getBoundingClientRect()
      const x = Math.max(0, Math.round((e.clientX - rect.left - drag.dx + boardRef.current!.scrollLeft) / (CELL + GAP)))
      const y = Math.max(0, Math.round((e.clientY - rect.top - drag.dy + boardRef.current!.scrollTop) / (CELL + GAP)))
      setDraft((d) => ({ ...d, [drag.id]: { x, y } }))
    }
    const onUp = () => setDrag(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag])

  const saveLayout = () => {
    for (const [id, p] of Object.entries(draft)) {
      const v = vessels.find((x) => x.id === id)
      if (v) upsert('vessels', { ...v, map: { ...v.map, ...p } })
    }
    setDraft({})
    setMode('view')
    toast({ title: 'Layout saved', tone: 'good' })
  }

  if (!data) return null
  const selected = vessels.find((v) => v.id === selectedId)
  const selectedOcc = selected ? (occupancy.get(selected.id) ?? []) : []
  const selectedLot = selectedOcc[0] ? data.lots.find((l) => l.id === selectedOcc[0].lotId) : undefined

  return (
    <div>
      <PageHeader
        eyebrow="Cellar"
        title="Tank map"
        subtitle={`${fmtGal(stats.used)} in ${stats.tanks.length - stats.empty.length} tanks · ${fmtGal(stats.cap - stats.used)} free · ${stats.empty.length} empty`}
        actions={
          <>
            <Segmented
              value={colorBy}
              onChange={setColorBy}
              options={[
                { value: 'wine', label: 'Wine colour' },
                { value: 'fill', label: 'Fill level' },
              ]}
            />
            <Button icon={<Calculator className="h-4 w-4" />} onClick={() => navigate('/cellar/calculator')}>
              Calculator
            </Button>
            {canEdit && mode === 'view' && (
              <>
                <Button icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>
                  Add vessel
                </Button>
                <Button icon={<Grip className="h-4 w-4" />} onClick={() => setMode('arrange')}>
                  Arrange
                </Button>
              </>
            )}
            {mode === 'arrange' && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraft({})
                    setMode('view')
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" icon={<Save className="h-4 w-4" />} onClick={saveLayout}>
                  Save layout
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="flex gap-4 text-[12px] text-ink-3 mb-3 flex-wrap">
        <span className="flex items-center gap-1.5">
          <WineDot color="red" /> Red
        </span>
        <span className="flex items-center gap-1.5">
          <WineDot color="white" /> White
        </span>
        <span className="flex items-center gap-1.5">
          <WineDot color="rosé" /> Rosé
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-border-strong bg-surface-2" /> Empty
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-danger border-dashed" /> Out of service
        </span>
        {mode === 'arrange' && <span className="text-accent font-medium">Drag tanks to rearrange the board, then save.</span>}
      </div>

      <Card padded={false} className="overflow-hidden">
        <div ref={boardRef} className="relative overflow-auto bg-surface-2/50" style={{ height: 'min(72vh, 900px)', backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: `${CELL + GAP}px ${CELL + GAP}px`, backgroundPosition: `${(CELL + GAP) / 2}px ${(CELL + GAP) / 2}px` }}>
          <div style={{ width: bounds.w, height: bounds.h, position: 'relative' }}>
            {/* zone labels */}
            {zones.map(([zone, vs]) => {
              const minX = Math.min(...vs.map((v) => (draft[v.id] ?? v.map).x))
              const minY = Math.min(...vs.map((v) => (draft[v.id] ?? v.map).y))
              return (
                <div key={zone} className="absolute text-[10px] font-semibold uppercase tracking-wider text-ink-3 pointer-events-none" style={{ left: minX * (CELL + GAP) + 6, top: minY * (CELL + GAP) - 2 }}>
                  {zone}
                </div>
              )
            })}
            {vessels.map((v) => {
              const p = draft[v.id] ?? v.map
              const occ = occupancy.get(v.id) ?? []
              const held = occ.reduce((s, o) => s + o.gallons, 0)
              const fill = v.capacityGal ? held / v.capacityGal : 0
              const main = occ[0]
              const isSel = v.id === selectedId
              const shape = v.type === 'tote' || v.type === 'bin' ? 'tote' : v.type === 'cube' ? 'cube' : v.type === 'barrel-group' || v.type === 'barrel' ? 'barrel' : v.type === 'virtual' ? 'virtual' : 'tank'
              const fillTone = fill > 0.98 ? 'var(--good)' : fill > 0.85 ? 'var(--series-4)' : fill > 0 ? 'var(--warn)' : undefined
              return (
                <button
                  key={v.id}
                  onPointerDown={(e) => {
                    if (mode !== 'arrange') return
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setDrag({ id: v.id, dx: e.clientX - rect.left, dy: e.clientY - rect.top })
                  }}
                  onClick={() => mode === 'view' && setParams(isSel ? {} : { vessel: v.id })}
                  className={cx('absolute flex flex-col items-center justify-start rounded-xl p-1.5 transition-shadow text-left', mode === 'arrange' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:bg-surface/80', isSel && 'bg-surface shadow-card ring-1 ring-accent', drag?.id === v.id && 'z-10 shadow-pop')}
                  style={{ left: p.x * (CELL + GAP) + GAP / 2, top: p.y * (CELL + GAP) + GAP / 2 + 10, width: CELL, height: CELL + 6 }}
                  title={`${v.code} · ${fmtGal(v.capacityGal)}${main ? ` · ${main.code} ${fmtGal(held)}` : ' · empty'}`}
                >
                  <div className="relative">
                    <TankGlyph fill={fill} color={colorBy === 'wine' ? main?.color : main ? 'red' : undefined} size={shape === 'tank' ? 36 : 40} shape={shape} status={v.status} />
                    {colorBy === 'fill' && fillTone && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-surface" style={{ background: fillTone }} />}
                  </div>
                  <div className="mono text-[12px] font-semibold text-ink leading-none mt-1">{v.code}</div>
                  {main ? (
                    <>
                      <div className="text-[10px] text-ink-2 leading-tight mt-0.5 max-w-full truncate mono">{main.code}</div>
                      <div className="text-[10px] text-ink-3 num">{fmtNum(held)} gal</div>
                    </>
                  ) : (
                    <div className="text-[10px] text-ink-3 mt-0.5">{v.status === 'out-of-service' ? 'OOS' : `${fmtNum(v.capacityGal)} gal`}</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </Card>

      {/* vessel drawer */}
      <Drawer open={!!selected} onClose={() => setParams({})} title={selected ? `${selected.code}${selected.name ? ` · ${selected.name}` : ''}` : ''} width={460}>
        {selected && (
          <VesselPanel
            vessel={selected}
            occ={selectedOcc}
            canEdit={canEdit}
            onSave={(v) => {
              upsert('vessels', v)
              toast({ title: 'Vessel saved', tone: 'good' })
            }}
            onDelete={() => {
              if (selectedOcc.length) {
                toast({ title: 'Vessel holds wine', body: 'Transfer the wine out before removing it.', tone: 'danger' })
                return
              }
              remove('vessels', selected.id)
              setParams({})
            }}
            onOp={(k) => setOp(k)}
            lotHref={selectedLot ? `/lots/${selectedLot.id}` : undefined}
          />
        )}
      </Drawer>
      {op && selectedLot && <OperationDialog kind={op} lot={selectedLot} onClose={() => setOp(null)} />}
      {newOpen && (
        <NewVesselDialog
          onClose={() => setNewOpen(false)}
          onCreate={(v) => {
            upsert('vessels', v)
            setNewOpen(false)
            setParams({ vessel: v.id })
          }}
          orgId={data.vessels[0]?.orgId ?? ''}
          nextPos={{ x: 0, y: Math.ceil(bounds.h / (CELL + GAP)) }}
          zones={zones.map(([z]) => z)}
        />
      )}
    </div>
  )
}

function VesselPanel({ vessel, occ, canEdit, onSave, onDelete, onOp, lotHref }: { vessel: Vessel; occ: Occ[]; canEdit: boolean; onSave: (v: Vessel) => void; onDelete: () => void; onOp: (k: OpKind) => void; lotHref?: string }) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(vessel)
  useEffect(() => {
    setForm(vessel)
    setEditing(false)
  }, [vessel])
  const held = occ.reduce((s, o) => s + o.gallons, 0)
  const g = vessel.geometry
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <TankGlyph fill={vessel.capacityGal ? held / vessel.capacityGal : 0} color={occ[0]?.color} size={56} shape={vessel.type === 'barrel-group' ? 'barrel' : vessel.type === 'tote' ? 'tote' : 'tank'} status={vessel.status} />
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 flex-1">
          <Stat label="Capacity" value={fmtNum(vessel.capacityGal)} sub="gal" />
          <Stat label="Holding" value={fmtNum(held)} sub={vessel.capacityGal ? `${Math.round((held / vessel.capacityGal) * 100)}% full · ${fmtNum(vessel.capacityGal - held)} headspace` : ''} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge>{vessel.type}</Badge>
        {vessel.material && <Badge>{vessel.material}</Badge>}
        {vessel.jacketed && <Badge tone="info">jacketed</Badge>}
        {vessel.variableCapacity && <Badge tone="info">variable capacity</Badge>}
        {vessel.barrelCount && <Badge>{vessel.barrelCount} barrels</Badge>}
        <Badge tone={vessel.status === 'active' ? 'good' : vessel.status === 'out-of-service' ? 'danger' : 'warn'}>{vessel.status}</Badge>
        <Badge>{vessel.map.zone}</Badge>
      </div>
      {vessel.notes && <p className="text-sm text-ink-2 bg-surface-2 rounded-lg p-3">{vessel.notes}</p>}

      <div>
        <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-3 mb-2">Contents</div>
        {occ.length ? (
          <ul className="space-y-2">
            {occ.map((o) => (
              <li key={o.lotId} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <WineDot color={o.color} />
                <Link to={`/lots/${o.lotId}`} className="mono font-semibold hover:underline">
                  {o.code}
                </Link>
                <Badge tone="accent">{o.stage}</Badge>
                <span className="ml-auto num">{fmtGal(o.gallons)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">Empty.</p>
        )}
        {canEdit && occ.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" variant="primary" onClick={() => onOp('transfer')}>
              Transfer
            </Button>
            <Button size="sm" onClick={() => onOp('addition')}>
              Addition
            </Button>
            <Button size="sm" onClick={() => onOp('measurement')}>
              Lab reading
            </Button>
            {lotHref && (
              <Button size="sm" variant="ghost" onClick={() => navigate(lotHref)}>
                Open lot
              </Button>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Specs</div>
          <Button size="sm" variant="ghost" icon={<Calculator className="h-4 w-4" />} onClick={() => navigate(`/cellar/calculator?vessel=${vessel.id}`)}>
            Dip calculator
          </Button>
        </div>
        {g ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-3">Diameter</dt>
            <dd className="num">{g.diameterIn}″</dd>
            <dt className="text-ink-3">Sidewall</dt>
            <dd className="num">{g.sidewallIn}″</dd>
            <dt className="text-ink-3">Bottom</dt>
            <dd>
              {g.bottom}
              {g.bottomHeightIn ? ` · ${g.bottomHeightIn}″` : ''}
            </dd>
            <dt className="text-ink-3">Source</dt>
            <dd>{vessel.strapping?.length ? 'strapping chart' : g.estimated ? <span className="text-warn">estimated — measure to confirm</span> : 'measured'}</dd>
          </dl>
        ) : (
          <p className="text-sm text-ink-3">No geometry — add specs to enable the dip calculator.</p>
        )}
      </div>

      {canEdit && (
        <div className="border-t border-border pt-4">
          {!editing ? (
            <div className="flex gap-2">
              <Button size="sm" icon={<Wrench className="h-4 w-4" />} onClick={() => setEditing(true)}>
                Edit vessel
              </Button>
              <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={onDelete} className="text-danger">
                Remove
              </Button>
            </div>
          ) : (
            <VesselForm
              value={form}
              onChange={setForm}
              footer={
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      onSave(form)
                      setEditing(false)
                    }}
                  >
                    Save
                  </Button>
                </div>
              }
            />
          )}
        </div>
      )}
    </div>
  )
}

export function VesselForm({ value, onChange, footer, zones }: { value: Vessel; onChange: (v: Vessel) => void; footer?: React.ReactNode; zones?: string[] }) {
  const g = value.geometry ?? estimateGeometry(value.capacityGal, value.type)
  const setG = (patch: Partial<NonNullable<Vessel['geometry']>>) => onChange({ ...value, geometry: { ...g, ...patch, estimated: false } })
  const [strap, setStrap] = useState((value.strapping ?? []).map((p) => `${p.heightIn}, ${p.gallons}`).join('\n'))
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code">
          <Input value={value.code} onChange={(e) => onChange({ ...value, code: e.target.value.toUpperCase() })} className="mono" />
        </Field>
        <Field label="Name">
          <Input value={value.name ?? ''} onChange={(e) => onChange({ ...value, name: e.target.value || undefined })} />
        </Field>
        <Field label="Type">
          <Select value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value as VesselType })}>
            {(['tank', 'portable', 'tote', 'cube', 'bin', 'barrel', 'barrel-group', 'virtual'] as VesselType[]).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Capacity (gal)">
          <Input type="number" value={value.capacityGal} onChange={(e) => onChange({ ...value, capacityGal: Number(e.target.value) })} />
        </Field>
        <Field label="Material">
          <Select value={value.material ?? 'stainless'} onChange={(e) => onChange({ ...value, material: e.target.value as Vessel['material'] })}>
            {['stainless', 'oak', 'concrete', 'poly', 'other'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value as Vessel['status'] })}>
            {['active', 'cleaning', 'out-of-service', 'retired'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Zone">
          <Input list="zones" value={value.map.zone} onChange={(e) => onChange({ ...value, map: { ...value.map, zone: e.target.value } })} />
          {zones && (
            <datalist id="zones">
              {zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          )}
        </Field>
        <div className="flex items-end gap-4 pb-2">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={!!value.jacketed} onChange={(e) => onChange({ ...value, jacketed: e.target.checked })} /> Jacketed
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={!!value.variableCapacity} onChange={(e) => onChange({ ...value, variableCapacity: e.target.checked })} /> VC lid
          </label>
        </div>
      </div>
      <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-3 pt-1">Geometry (inches)</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Inside diameter">
          <Input type="number" value={g.diameterIn} onChange={(e) => setG({ diameterIn: Number(e.target.value) })} />
        </Field>
        <Field label="Sidewall height">
          <Input type="number" value={g.sidewallIn} onChange={(e) => setG({ sidewallIn: Number(e.target.value) })} />
        </Field>
        <Field label="Bottom">
          <Select value={g.bottom} onChange={(e) => setG({ bottom: e.target.value as NonNullable<Vessel['geometry']>['bottom'] })}>
            {['flat', 'cone', 'dish', 'slope'].map((b) => (
              <option key={b}>{b}</option>
            ))}
          </Select>
        </Field>
        <Field label="Bottom height / depth">
          <Input type="number" value={g.bottomHeightIn} onChange={(e) => setG({ bottomHeightIn: Number(e.target.value) })} disabled={g.bottom === 'flat'} />
        </Field>
      </div>
      <Field label="Strapping chart (optional)" hint="One “height, gallons” pair per line. Overrides geometry when present.">
        <Textarea
          value={strap}
          onChange={(e) => {
            setStrap(e.target.value)
            const pts = e.target.value
              .split('\n')
              .map((l) => l.split(/[,\t ]+/).map(Number))
              .filter((a) => a.length >= 2 && !a.some(Number.isNaN))
              .map(([heightIn, gallons]) => ({ heightIn, gallons }))
            onChange({ ...value, strapping: pts.length >= 2 ? pts : undefined })
          }}
          className="mono text-[12px] min-h-[64px]"
          placeholder={'12, 410\n24, 900'}
        />
      </Field>
      <Field label="Notes">
        <Input value={value.notes ?? ''} onChange={(e) => onChange({ ...value, notes: e.target.value || undefined })} />
      </Field>
      {footer}
    </div>
  )
}

function NewVesselDialog({ onClose, onCreate, orgId, nextPos, zones }: { onClose: () => void; onCreate: (v: Vessel) => void; orgId: string; nextPos: { x: number; y: number }; zones: string[] }) {
  const [v, setV] = useState<Vessel>({ id: newId('v'), orgId, code: '', type: 'tank', capacityGal: 2500, material: 'stainless', jacketed: true, geometry: estimateGeometry(2500, 'tank'), map: { zone: zones[0] ?? 'Cellar', ...nextPos }, status: 'active' })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface border border-border rounded-2xl shadow-pop max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface">
          <h2 className="text-[18px] font-semibold">Add vessel</h2>
          <button onClick={onClose} className="text-ink-3" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5">
          <VesselForm
            value={v}
            onChange={setV}
            zones={zones}
            footer={
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button variant="primary" disabled={!v.code} onClick={() => onCreate(v)}>
                  Add {v.code}
                </Button>
              </div>
            }
          />
        </div>
      </div>
    </div>
  )
}
