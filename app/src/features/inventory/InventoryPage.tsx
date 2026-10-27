import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Package, Plus, AlertTriangle } from 'lucide-react'
import type { CaseGoodsItem, Material, MaterialCategory, PackagingItem } from '@/domain/types'
import { useOrgData, useRole, useStore } from '@/store/useStore'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Table, Tabs, Td, Th, Meter } from '@/components/ui'
import { fmtMoney, fmtNum } from '@/domain/units'
import { fmtDate, toInputDate } from '@/lib/format'
import { newId } from '@/data/seed'

type Tab = 'materials' | 'packaging' | 'casegoods'
const CATEGORIES: MaterialCategory[] = ['Acid', 'Enzyme', 'Fining', 'Nutrient', 'Oak', 'Preservative', 'Stabilizer', 'Tannin', 'Yeast', 'Malolactic', 'Other']

export function InventoryPage() {
  const data = useOrgData()
  const role = useRole()
  const upsert = useStore((s) => s.upsert)
  const remove = useStore((s) => s.remove)
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>('materials')
  const [q, setQ] = useState(params.get('q') ?? '')
  const [cat, setCat] = useState('all')
  const [editing, setEditing] = useState<Material | null>(null)
  const [receiving, setReceiving] = useState<Material | null>(null)
  const [editPkg, setEditPkg] = useState<PackagingItem | null>(null)
  const [editCg, setEditCg] = useState<CaseGoodsItem | null>(null)
  const canEdit = role !== 'viewer'

  const usage = useMemo(() => {
    const m = new Map<string, { qty: number; unit: string; last?: string }>()
    const cutoff = Date.now() - 365 * 86400000
    for (const e of data?.events ?? []) {
      if (e.kind !== 'addition' || new Date(e.at).getTime() < cutoff) continue
      for (const a of e.additions ?? []) {
        const k = a.material.toLowerCase()
        const u = m.get(k) ?? { qty: 0, unit: a.unit }
        u.qty += a.unit === u.unit ? a.qty : 0
        u.last = !u.last || e.at > u.last ? e.at : u.last
        m.set(k, u)
      }
    }
    return m
  }, [data])

  if (!data) return null
  const materials = data.materials
    .filter((m) => cat === 'all' || m.category === cat)
    .filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  const low = data.materials.filter((m) => m.reorderPoint !== undefined && m.onHand <= m.reorderPoint)
  const value = data.materials.reduce((s, m) => s + m.batches.reduce((t, b) => t + (b.costTotal ?? 0), 0), 0)
  const cases = data.caseGoods.reduce((s, c) => s + c.casesOnHand, 0)

  return (
    <div>
      <PageHeader
        eyebrow="Inventory"
        title="Materials & goods"
        subtitle={`${data.materials.length} additives · ${data.packaging.length} packaging items · ${fmtNum(cases)} cases on hand`}
        actions={
          canEdit && (
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                if (tab === 'materials') setEditing({ id: newId('m'), orgId: data.materials[0]?.orgId ?? '', name: '', category: 'Other', unit: 'kg', onHand: 0, batches: [] })
                else if (tab === 'packaging') setEditPkg({ id: newId('pk'), orgId: data.materials[0]?.orgId ?? '', name: '', kind: 'bottle', unit: 'ea', onHand: 0 })
                else setEditCg({ id: newId('cg'), orgId: data.materials[0]?.orgId ?? '', sku: '', description: '', bottleSizeMl: 750, bottlesPerCase: 12, casesOnHand: 0, location: '', taxpaid: false })
              }}
            >
              Add {tab === 'materials' ? 'material' : tab === 'packaging' ? 'packaging' : 'case goods'}
            </Button>
          )
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'materials', label: 'Additives & materials', count: data.materials.length },
          { value: 'packaging', label: 'Packaging / dry goods', count: data.packaging.length },
          { value: 'casegoods', label: 'Case goods', count: data.caseGoods.length },
        ]}
        className="mb-4"
      />

      {tab === 'materials' && (
        <>
          {low.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn mb-4">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <strong>{low.length} item{low.length > 1 ? 's' : ''} at or below reorder point:</strong> {low.map((m) => m.name).join(', ')}.
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2 mb-3">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search materials…" className="max-w-xs" />
            <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-auto">
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <div className="ml-auto text-sm text-ink-3 self-center">Stock value {fmtMoney(value)}</div>
          </div>
          <Card padded={false}>
            <div className="px-5">
              <Table>
                <thead>
                  <tr>
                    <Th>Material</Th>
                    <Th>Category</Th>
                    <Th right>On hand</Th>
                    <Th>Stock</Th>
                    <Th right>Used (12 mo)</Th>
                    <Th>Last used</Th>
                    <Th right>Batches</Th>
                    <Th>TTB limit</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m) => {
                    const u = usage.get(m.name.toLowerCase())
                    const lowStock = m.reorderPoint !== undefined && m.onHand <= m.reorderPoint
                    return (
                      <tr key={m.id} className="hover:bg-surface-2/60">
                        <Td>
                          <button onClick={() => canEdit && setEditing(m)} className="font-medium text-left hover:underline">
                            {m.name}
                          </button>
                        </Td>
                        <Td>
                          <Badge>{m.category}</Badge>
                        </Td>
                        <Td right className={lowStock ? 'text-warn font-semibold' : ''}>
                          {fmtNum(m.onHand, 2)} {m.unit}
                        </Td>
                        <Td>{m.reorderPoint !== undefined ? <Meter value={m.onHand} max={m.reorderPoint * 3} tone={lowStock ? 'warn' : 'good'} className="w-20" /> : <span className="text-ink-3 text-[12px]">no reorder point</span>}</Td>
                        <Td right className="text-ink-2">
                          {u ? `${fmtNum(u.qty, 2)} ${u.unit}` : '—'}
                        </Td>
                        <Td className="text-ink-3 text-[12px]">{u?.last ? fmtDate(u.last) : '—'}</Td>
                        <Td right>{m.batches.length}</Td>
                        <Td className="text-[12px] text-ink-3 max-w-[220px]">{m.limit}</Td>
                        <Td>
                          {canEdit && (
                            <Button size="sm" variant="ghost" onClick={() => setReceiving(m)}>
                              Receive
                            </Button>
                          )}
                        </Td>
                      </tr>
                    )
                  })}
                  {!materials.length && (
                    <tr>
                      <Td colSpan={9}>
                        <EmptyState icon={<Package />} title="No materials" body="Add additives, yeast, nutrients and fining agents to track stock and 27 CFR 24.315 records." />
                      </Td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          </Card>
        </>
      )}

      {tab === 'packaging' && (
        <Card padded={false}>
          <div className="px-5">
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>Kind</Th>
                  <Th right>On hand</Th>
                  <Th>Stock</Th>
                  <Th right>Unit cost</Th>
                  <Th right>Value</Th>
                </tr>
              </thead>
              <tbody>
                {data.packaging.map((p) => {
                  const lowStock = p.reorderPoint !== undefined && p.onHand <= p.reorderPoint
                  return (
                    <tr key={p.id} className="hover:bg-surface-2/60">
                      <Td>
                        <button onClick={() => canEdit && setEditPkg(p)} className="font-medium text-left hover:underline">
                          {p.name}
                        </button>
                      </Td>
                      <Td>
                        <Badge>{p.kind}</Badge>
                      </Td>
                      <Td right className={lowStock ? 'text-warn font-semibold' : ''}>
                        {fmtNum(p.onHand)} {p.unit}
                      </Td>
                      <Td>{p.reorderPoint !== undefined ? <Meter value={p.onHand} max={p.reorderPoint * 3} tone={lowStock ? 'warn' : 'good'} className="w-20" /> : null}</Td>
                      <Td right>{fmtMoney(p.costPerUnit)}</Td>
                      <Td right>{p.costPerUnit ? fmtMoney(p.costPerUnit * p.onHand) : '—'}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      {tab === 'casegoods' && (
        <Card padded={false}>
          <div className="px-5">
            <Table>
              <thead>
                <tr>
                  <Th>SKU</Th>
                  <Th>Wine</Th>
                  <Th>Lot</Th>
                  <Th>Bottled</Th>
                  <Th>Format</Th>
                  <Th right>Cases</Th>
                  <Th right>Gallons</Th>
                  <Th>Location</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.caseGoods.map((c) => {
                  const lot = data.lots.find((l) => l.id === c.lotId)
                  const gal = (c.casesOnHand * c.bottlesPerCase * c.bottleSizeMl) / 3785.41
                  return (
                    <tr key={c.id} className="hover:bg-surface-2/60">
                      <Td mono>
                        <button onClick={() => canEdit && setEditCg(c)} className="font-semibold hover:underline">
                          {c.sku}
                        </button>
                      </Td>
                      <Td>{c.description}</Td>
                      <Td mono className="text-ink-2">
                        {lot?.code ?? '—'}
                      </Td>
                      <Td>{fmtDate(c.bottledAt)}</Td>
                      <Td>
                        {c.bottlesPerCase} × {c.bottleSizeMl} mL
                      </Td>
                      <Td right className="font-medium">
                        {fmtNum(c.casesOnHand)}
                      </Td>
                      <Td right>{fmtNum(gal)}</Td>
                      <Td>{c.location}</Td>
                      <Td>
                        <Badge tone={c.taxpaid ? 'good' : 'accent'}>{c.taxpaid ? 'Taxpaid' : 'In bond'}</Badge>
                      </Td>
                    </tr>
                  )
                })}
                {!data.caseGoods.length && (
                  <tr>
                    <Td colSpan={9}>
                      <EmptyState icon={<Package />} title="No case goods" body="Bottling runs will create case goods here; bonded and taxpaid inventory are tracked separately for the 5120.17." />
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      {editing && (
        <MaterialDialog
          material={editing}
          onClose={() => setEditing(null)}
          onSave={(m) => {
            upsert('materials', m)
            setEditing(null)
          }}
          onDelete={() => {
            remove('materials', editing.id)
            setEditing(null)
          }}
        />
      )}
      {receiving && (
        <ReceiveDialog
          material={receiving}
          onClose={() => setReceiving(null)}
          onSave={(m) => {
            upsert('materials', m)
            setReceiving(null)
          }}
        />
      )}
      {editPkg && (
        <PackagingDialog
          item={editPkg}
          onClose={() => setEditPkg(null)}
          onSave={(p) => {
            upsert('packaging', p)
            setEditPkg(null)
          }}
          onDelete={() => {
            remove('packaging', editPkg.id)
            setEditPkg(null)
          }}
        />
      )}
      {editCg && (
        <CaseGoodsDialog
          item={editCg}
          lots={data.lots}
          onClose={() => setEditCg(null)}
          onSave={(c) => {
            upsert('caseGoods', c)
            setEditCg(null)
          }}
          onDelete={() => {
            remove('caseGoods', editCg.id)
            setEditCg(null)
          }}
        />
      )}
    </div>
  )
}

function MaterialDialog({ material, onClose, onSave, onDelete }: { material: Material; onClose: () => void; onSave: (m: Material) => void; onDelete: () => void }) {
  const [m, setM] = useState(material)
  return (
    <Modal
      open
      onClose={onClose}
      title={material.name ? `Edit ${material.name}` : 'New material'}
      footer={
        <>
          {material.name && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(m)} disabled={!m.name}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Name" required className="sm:col-span-2">
          <Input value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />
        </Field>
        <Field label="Category">
          <Select value={m.category} onChange={(e) => setM({ ...m, category: e.target.value as MaterialCategory })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Unit">
          <Select value={m.unit} onChange={(e) => setM({ ...m, unit: e.target.value })}>
            {['g', 'kg', 'lb', 'L', 'mL', 'gal', 'ea'].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="On hand">
          <Input type="number" step="any" value={m.onHand} onChange={(e) => setM({ ...m, onHand: Number(e.target.value) })} />
        </Field>
        <Field label="Reorder point">
          <Input type="number" step="any" value={m.reorderPoint ?? ''} onChange={(e) => setM({ ...m, reorderPoint: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </Field>
        <Field label="Regulatory limit / notes" className="sm:col-span-2" hint="e.g. 27 CFR 24.246 maximums">
          <Input value={m.limit ?? ''} onChange={(e) => setM({ ...m, limit: e.target.value || undefined })} />
        </Field>
      </div>
      {m.batches.length > 0 && (
        <div className="mt-4">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-3 mb-1">Batches</div>
          <Table>
            <thead>
              <tr>
                <Th>Received</Th>
                <Th>Lot #</Th>
                <Th>Supplier</Th>
                <Th right>Qty</Th>
                <Th right>Cost</Th>
              </tr>
            </thead>
            <tbody>
              {m.batches.map((b) => (
                <tr key={b.id}>
                  <Td>{fmtDate(b.receivedAt)}</Td>
                  <Td mono>{b.lotNumber ?? '—'}</Td>
                  <Td>{b.supplier}</Td>
                  <Td right>
                    {b.qty} {m.unit}
                  </Td>
                  <Td right>{fmtMoney(b.costTotal)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Modal>
  )
}

function ReceiveDialog({ material, onClose, onSave }: { material: Material; onClose: () => void; onSave: (m: Material) => void }) {
  const [qty, setQty] = useState(0)
  const [cost, setCost] = useState('')
  const [supplier, setSupplier] = useState(material.batches[0]?.supplier ?? '')
  const [lotNumber, setLotNumber] = useState('')
  const [date, setDate] = useState(toInputDate())
  return (
    <Modal
      open
      onClose={onClose}
      title={`Receive ${material.name}`}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={qty <= 0} onClick={() => onSave({ ...material, onHand: material.onHand + qty, batches: [{ id: newId('mb'), qty, receivedAt: new Date(date).toISOString(), costTotal: cost ? Number(cost) : undefined, supplier: supplier || undefined, lotNumber: lotNumber || undefined }, ...material.batches] })}>
            Receive
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label={`Quantity (${material.unit})`} required>
          <Input type="number" step="any" value={qty || ''} onChange={(e) => setQty(Number(e.target.value))} autoFocus />
        </Field>
        <Field label="Total cost">
          <Input type="number" step="any" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <Field label="Supplier">
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </Field>
        <Field label="Supplier lot #" hint="Keeps traceability for 24.315 records">
          <Input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} />
        </Field>
        <Field label="Received">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function PackagingDialog({ item, onClose, onSave, onDelete }: { item: PackagingItem; onClose: () => void; onSave: (p: PackagingItem) => void; onDelete: () => void }) {
  const [p, setP] = useState(item)
  return (
    <Modal
      open
      onClose={onClose}
      title={item.name ? `Edit ${item.name}` : 'New packaging item'}
      width="sm"
      footer={
        <>
          {item.name && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(p)} disabled={!p.name}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" className="col-span-2">
          <Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        </Field>
        <Field label="Kind">
          <Select value={p.kind} onChange={(e) => setP({ ...p, kind: e.target.value as PackagingItem['kind'] })}>
            {['bottle', 'closure', 'capsule', 'label', 'case', 'other'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
        <Field label="On hand">
          <Input type="number" value={p.onHand} onChange={(e) => setP({ ...p, onHand: Number(e.target.value) })} />
        </Field>
        <Field label="Reorder point">
          <Input type="number" value={p.reorderPoint ?? ''} onChange={(e) => setP({ ...p, reorderPoint: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </Field>
        <Field label="Unit cost">
          <Input type="number" step="0.01" value={p.costPerUnit ?? ''} onChange={(e) => setP({ ...p, costPerUnit: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </Field>
      </div>
    </Modal>
  )
}

function CaseGoodsDialog({ item, lots, onClose, onSave, onDelete }: { item: CaseGoodsItem; lots: { id: string; code: string }[]; onClose: () => void; onSave: (c: CaseGoodsItem) => void; onDelete: () => void }) {
  const [c, setC] = useState(item)
  return (
    <Modal
      open
      onClose={onClose}
      title={item.sku ? `Edit ${item.sku}` : 'New case goods'}
      footer={
        <>
          {item.sku && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(c)} disabled={!c.sku}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="SKU">
          <Input value={c.sku} onChange={(e) => setC({ ...c, sku: e.target.value.toUpperCase() })} className="mono" />
        </Field>
        <Field label="Description">
          <Input value={c.description} onChange={(e) => setC({ ...c, description: e.target.value })} />
        </Field>
        <Field label="Source lot">
          <Select value={c.lotId ?? ''} onChange={(e) => setC({ ...c, lotId: e.target.value || undefined })}>
            <option value="">—</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Bottled on">
          <Input type="date" value={c.bottledAt ?? ''} onChange={(e) => setC({ ...c, bottledAt: e.target.value || undefined })} />
        </Field>
        <Field label="Bottle size (mL)">
          <Input type="number" value={c.bottleSizeMl} onChange={(e) => setC({ ...c, bottleSizeMl: Number(e.target.value) })} />
        </Field>
        <Field label="Bottles per case">
          <Input type="number" value={c.bottlesPerCase} onChange={(e) => setC({ ...c, bottlesPerCase: Number(e.target.value) })} />
        </Field>
        <Field label="Cases on hand">
          <Input type="number" value={c.casesOnHand} onChange={(e) => setC({ ...c, casesOnHand: Number(e.target.value) })} />
        </Field>
        <Field label="Location">
          <Input value={c.location} onChange={(e) => setC({ ...c, location: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={c.taxpaid} onChange={(e) => setC({ ...c, taxpaid: e.target.checked })} /> Taxpaid (removed from bond)
        </label>
      </div>
    </Modal>
  )
}
