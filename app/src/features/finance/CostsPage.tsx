import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleDollarSign, Download, Plus, RefreshCw } from 'lucide-react'
import type { CostCategory, CostEntry } from '@/domain/types'
import { lotVolume, useOrgData, useRole, useStore } from '@/store/useStore'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Stat, Table, Td, Th } from '@/components/ui'
import { Bars, Donut } from '@/components/charts'
import { fmtGal, fmtMoney, fmtNum } from '@/domain/units'
import { fmtDate, toInputDate, download } from '@/lib/format'
import { newId } from '@/data/seed'
import { toCsv } from '@/importers/csv'

const CATEGORIES: CostCategory[] = ['fruit', 'bulk wine', 'materials', 'labor', 'barrels', 'packaging', 'overhead', 'storage', 'lab', 'other']

/** QuickBooks account mapping — editable in a future Settings panel */
const QB_ACCOUNTS: Record<CostCategory, string> = {
  fruit: '5010 · COGS – Grapes',
  'bulk wine': '5020 · COGS – Bulk wine purchases',
  materials: '5030 · COGS – Winemaking materials',
  labor: '5040 · COGS – Cellar labor',
  barrels: '5050 · COGS – Barrels & cooperage',
  packaging: '5060 · COGS – Packaging',
  overhead: '5070 · COGS – Production overhead',
  storage: '5080 · COGS – Bulk storage',
  lab: '5090 · COGS – Lab & analysis',
  other: '5099 · COGS – Other',
}

export function CostsPage() {
  const data = useOrgData()
  const role = useRole()
  const upsert = useStore((s) => s.upsert)
  const remove = useStore((s) => s.remove)
  const toast = useStore((s) => s.toast)
  const [editing, setEditing] = useState<CostEntry | null>(null)
  const [lotFilter, setLotFilter] = useState('all')
  const canEdit = role !== 'viewer'

  const m = useMemo(() => {
    if (!data) return null
    const byLot = new Map<string, number>()
    const byCat = new Map<string, number>()
    let unallocated = 0
    for (const c of data.costs) {
      byCat.set(c.category, (byCat.get(c.category) ?? 0) + c.amount)
      if (c.lotId) byLot.set(c.lotId, (byLot.get(c.lotId) ?? 0) + c.amount)
      else unallocated += c.amount
    }
    const total = data.costs.reduce((s, c) => s + c.amount, 0)
    const activeGal = data.lots.filter((l) => l.status === 'active').reduce((s, l) => s + lotVolume(l), 0)
    const unsynced = data.costs.filter((c) => !c.synced)
    const lotRows = data.lots
      .map((l) => ({ lot: l, cost: byLot.get(l.id) ?? 0, gal: lotVolume(l) }))
      .filter((r) => r.cost > 0 || r.gal > 0)
      .map((r) => ({ ...r, perGal: r.gal ? r.cost / r.gal + unallocated / (activeGal || 1) : 0 }))
      .sort((a, b) => b.cost - a.cost)
    return { byLot, byCat, unallocated, total, activeGal, unsynced, lotRows }
  }, [data])
  if (!data || !m) return null

  const rows = [...data.costs].filter((c) => lotFilter === 'all' || (lotFilter === 'none' ? !c.lotId : c.lotId === lotFilter)).sort((a, b) => b.date.localeCompare(a.date))
  const exportQb = () => {
    // QuickBooks Online journal-entry CSV import format
    const lines = [['JournalNo', 'JournalDate', 'Memo', 'AccountName', 'Debits', 'Credits', 'Description', 'Name', 'Class']]
    m.unsynced.forEach((c, i) => {
      const lot = data.lots.find((l) => l.id === c.lotId)
      const no = `CH-${toInputDate(c.date).replace(/-/g, '')}-${i + 1}`
      lines.push([no, fmtDate(c.date), c.description, QB_ACCOUNTS[c.category], c.amount.toFixed(2), '', c.description, c.vendor ?? '', lot?.code ?? 'Unallocated'])
      lines.push([no, fmtDate(c.date), c.description, '2000 · Accounts Payable', '', c.amount.toFixed(2), c.description, c.vendor ?? '', lot?.code ?? 'Unallocated'])
    })
    download('vatroom-quickbooks-journal.csv', toCsv(lines), 'text/csv')
    m.unsynced.forEach((c) => upsert('costs', { ...c, synced: true, qbRef: c.qbRef ?? 'exported' }))
    toast({ title: 'QuickBooks export ready', body: `${m.unsynced.length} entries written as journal lines, classed by lot.`, tone: 'good' })
  }

  return (
    <div>
      <PageHeader
        eyebrow="Finance"
        title="Costs & QuickBooks"
        subtitle="Vatroom owns the cost build-up per lot; QuickBooks stays the general ledger. Push entries over as classed journal lines."
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={exportQb} disabled={!m.unsynced.length}>
              Export {m.unsynced.length || ''} to QuickBooks
            </Button>
            {canEdit && (
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ id: newId('c'), orgId: data.vessels[0]?.orgId ?? '', date: new Date().toISOString(), category: 'materials', amount: 0, description: '' })}>
                Add cost
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card className="p-4">
          <Stat label="Work in process" value={fmtMoney(m.total)} sub="all costs on the books" />
        </Card>
        <Card className="p-4">
          <Stat label="Blended cost / gal" value={m.activeGal ? fmtMoney(m.total / m.activeGal) : '—'} sub={`across ${fmtGal(m.activeGal)} active`} />
        </Card>
        <Card className="p-4">
          <Stat label="Unallocated overhead" value={fmtMoney(m.unallocated)} sub="spread by gallons in per-lot figures" />
        </Card>
        <Card className="p-4">
          <Stat label="Awaiting QuickBooks" value={m.unsynced.length} sub={fmtMoney(m.unsynced.reduce((s, c) => s + c.amount, 0))} tone={m.unsynced.length ? 'warn' : undefined} />
        </Card>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-4">
        <div className="space-y-4">
          <Card title="Cost per lot" subtitle="Direct costs plus a gallon-weighted share of unallocated overhead">
            <Table>
              <thead>
                <tr>
                  <Th>Lot</Th>
                  <Th right>Gallons</Th>
                  <Th right>Direct cost</Th>
                  <Th right>$/gal</Th>
                  <Th right>$/bottle</Th>
                  <Th right>$/case</Th>
                </tr>
              </thead>
              <tbody>
                {m.lotRows.map((r) => (
                  <tr key={r.lot.id} className="hover:bg-surface-2/60">
                    <Td mono>
                      <Link to={`/lots/${r.lot.id}`} className="font-semibold hover:underline">
                        {r.lot.code}
                      </Link>
                      <div className="text-[11px] text-ink-3 font-sans">
                        {r.lot.variety} {r.lot.vintage}
                      </div>
                    </Td>
                    <Td right>{fmtNum(r.gal)}</Td>
                    <Td right>{fmtMoney(r.cost)}</Td>
                    <Td right className="font-medium">
                      {r.gal ? fmtMoney(r.perGal) : '—'}
                    </Td>
                    <Td right>{r.gal ? fmtMoney(r.perGal * 0.198129) : '—'}</Td>
                    <Td right>{r.gal ? fmtMoney(r.perGal * 2.37755) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card
            title="Ledger"
            subtitle={`${rows.length} entries`}
            actions={
              <Select value={lotFilter} onChange={(e) => setLotFilter(e.target.value)} className="h-7 text-[12px] w-auto py-0">
                <option value="all">All lots</option>
                <option value="none">Unallocated</option>
                {data.lots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code}
                  </option>
                ))}
              </Select>
            }
          >
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Lot</Th>
                  <Th>Category</Th>
                  <Th>Description</Th>
                  <Th>Vendor</Th>
                  <Th>QB</Th>
                  <Th right>Amount</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2/60 cursor-pointer" onClick={() => canEdit && setEditing(c)}>
                    <Td>{fmtDate(c.date)}</Td>
                    <Td mono className="text-ink-2">
                      {data.lots.find((l) => l.id === c.lotId)?.code ?? <span className="text-ink-3 font-sans">—</span>}
                    </Td>
                    <Td>
                      <Badge>{c.category}</Badge>
                    </Td>
                    <Td>{c.description}</Td>
                    <Td className="text-ink-2">{c.vendor}</Td>
                    <Td className="text-[12px]">{c.synced ? <span className="text-good">{c.qbRef}</span> : <span className="text-warn">pending</span>}</Td>
                    <Td right className="font-medium">
                      {fmtMoney(c.amount)}
                    </Td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <Td colSpan={7}>
                      <EmptyState icon={<CircleDollarSign />} title="No costs yet" />
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Spend by category">
            <Donut slices={[...m.byCat.entries()].map(([label, value]) => ({ label, value }))} size={140} centre={<div className="text-center"><div className="font-semibold num text-[14px]">{fmtMoney(m.total)}</div></div>} />
          </Card>
          <Card title="Top lots by spend">
            <Bars rows={m.lotRows.slice(0, 6).map((r) => ({ label: r.lot.code, value: r.cost }))} format={(v) => fmtMoney(v)} />
          </Card>
          <Card title="How QuickBooks fits" className="bg-surface-2">
            <div className="text-[13px] text-ink-2 space-y-2">
              <p>
                <strong className="text-ink">Our read of the current setup:</strong> QuickBooks is used for bills (grapes, materials, barrels), payroll, invoicing custom-crush clients and bulk sales, and year-end COGS — while production costs per lot live in spreadsheets.
              </p>
              <p>Vatroom replaces the spreadsheet half: every cost is tagged to a lot, overhead is spread by gallons, and the result exports as journal entries classed by lot so the accountant never re-keys anything.</p>
              <div className="flex items-center gap-1.5 text-ink-3 text-[12px] pt-1">
                <RefreshCw className="h-3.5 w-3.5" /> Two-way sync via the QuickBooks Online API is planned for the cloud release.
              </div>
            </div>
          </Card>
        </div>
      </div>

      {editing && (
        <CostDialog
          cost={editing}
          isNew={!data.costs.some((c) => c.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            upsert('costs', c)
            setEditing(null)
          }}
          onDelete={() => {
            remove('costs', editing.id)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function CostDialog({ cost, isNew, onClose, onSave, onDelete }: { cost: CostEntry; isNew: boolean; onClose: () => void; onSave: (c: CostEntry) => void; onDelete: () => void }) {
  const data = useOrgData()!
  const [c, setC] = useState(cost)
  const [date, setDate] = useState(toInputDate(cost.date))
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add cost' : 'Edit cost'}
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
          <Button variant="primary" disabled={!c.description || c.amount <= 0} onClick={() => onSave({ ...c, date: new Date(date).toISOString() })}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Description" required className="sm:col-span-2">
          <Input value={c.description} onChange={(e) => setC({ ...c, description: e.target.value })} autoFocus />
        </Field>
        <Field label="Amount" required>
          <Input type="number" step="0.01" value={c.amount || ''} onChange={(e) => setC({ ...c, amount: Number(e.target.value) })} />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Category" hint={QB_ACCOUNTS[c.category]}>
          <Select value={c.category} onChange={(e) => setC({ ...c, category: e.target.value as CostCategory })}>
            {CATEGORIES.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
        <Field label="Lot" hint="Leave blank for overhead spread across all lots">
          <Select value={c.lotId ?? ''} onChange={(e) => setC({ ...c, lotId: e.target.value || undefined })}>
            <option value="">Unallocated</option>
            {data.lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vendor">
          <Input value={c.vendor ?? ''} onChange={(e) => setC({ ...c, vendor: e.target.value || undefined })} />
        </Field>
        <Field label="QuickBooks reference">
          <Input value={c.qbRef ?? ''} onChange={(e) => setC({ ...c, qbRef: e.target.value || undefined, synced: !!e.target.value })} placeholder="Bill #…" />
        </Field>
      </div>
    </Modal>
  )
}
