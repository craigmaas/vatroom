import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Upload, Wine, LayoutGrid, List } from 'lucide-react'
import { lotVolume, useOrgData } from '@/store/useStore'
import { Badge, Button, Card, EmptyState, Input, PageHeader, Segmented, Select, Table, Td, Th, WineDot, Meter } from '@/components/ui'
import { fmtGal } from '@/domain/units'
import { fmtRelative, cx } from '@/lib/format'
import { NewLotDialog, STAGES } from './OperationDialogs'
import { ImportBlendedDialog } from './ImportBlendedDialog'
import { Sparkline } from '@/components/charts'

export function LotsPage() {
  const data = useOrgData()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [stage, setStage] = useState<string>('all')
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [showArchived, setShowArchived] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const filter = params.get('filter')
  const newOpen = params.get('new') === '1'

  const rows = useMemo(() => {
    if (!data) return []
    const vesselById = new Map(data.vessels.map((v) => [v.id, v]))
    const now = Date.now()
    return data.lots
      .filter((l) => showArchived || l.status === 'active')
      .filter((l) => stage === 'all' || l.stage === stage)
      .filter((l) => {
        if (filter === 'no-bond') return !l.bondNumber
        if (filter === 'no-composition') return l.components.length === 0
        if (filter === 'so2-stale') {
          const last = data.events.filter((e) => e.lotId === l.id && e.measurements?.some((m) => m.analyte === 'freeSO2')).sort((a, b) => b.at.localeCompare(a.at))[0]
          return l.stage === 'Aging' && (!last || new Date(last.at).getTime() < now - 60 * 86400000)
        }
        return true
      })
      .filter((l) => {
        const s = q.trim().toLowerCase()
        if (!s) return true
        return [l.code, l.variety, String(l.vintage), l.marketingName, l.client, l.fermentationPlan, ...l.holds.map((h) => vesselById.get(h.vesselId)?.code)].some((x) => x?.toLowerCase().includes(s))
      })
      .map((l) => {
        const evs = data.events.filter((e) => e.lotId === l.id)
        const lastSO2 = evs.filter((e) => e.measurements?.some((m) => m.analyte === 'freeSO2')).sort((a, b) => b.at.localeCompare(a.at))[0]
        const lastAdd = evs.filter((e) => e.kind === 'addition' && e.additions?.some((a) => /so2|kmbs/i.test(a.material))).sort((a, b) => b.at.localeCompare(a.at))[0]
        const volumeTrail = evs
          .filter((e) => e.volumeAfterGal !== undefined)
          .slice(-14)
          .map((e) => e.volumeAfterGal!)
        return { lot: l, volume: lotVolume(l), vessels: l.holds.map((h) => ({ code: vesselById.get(h.vesselId)?.code ?? '?', gallons: h.gallons, cap: vesselById.get(h.vesselId)?.capacityGal ?? 0 })), lastSO2, lastAdd, volumeTrail, updated: evs.length ? evs[evs.length - 1].at : l.updatedAt }
      })
      .sort((a, b) => a.lot.code.localeCompare(b.lot.code))
  }, [data, q, stage, showArchived, filter])

  if (!data) return null
  const stageCounts = new Map<string, number>()
  for (const l of data.lots.filter((l) => l.status === 'active')) stageCounts.set(l.stage, (stageCounts.get(l.stage) ?? 0) + 1)
  const total = rows.reduce((s, r) => s + r.volume, 0)

  return (
    <div>
      <PageHeader
        eyebrow="Production"
        title="Lots"
        subtitle={`${rows.length} lot${rows.length === 1 ? '' : 's'} · ${fmtGal(total)}${filter ? ` · filtered: ${filter.replace(/-/g, ' ')}` : ''}`}
        actions={
          <>
            <Button icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
              Import from Blended
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setParams({ new: '1' })}>
              New lot
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, variety, tank, brand…" className="max-w-xs" />
          <Select value={stage} onChange={(e) => setStage(e.target.value)} className="w-auto">
            <option value="all">All stages</option>
            {STAGES.filter((s) => stageCounts.get(s)).map((s) => (
              <option key={s} value={s}>
                {s} ({stageCounts.get(s)})
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-sm text-ink-2 ml-1">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show closed
          </label>
          {filter && (
            <Button size="sm" variant="ghost" onClick={() => setParams({})}>
              Clear filter
            </Button>
          )}
          <div className="ml-auto">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'table', label: <List className="h-4 w-4" /> },
                { value: 'cards', label: <LayoutGrid className="h-4 w-4" /> },
              ]}
            />
          </div>
        </div>
      </PageHeader>

      {!rows.length ? (
        <Card>
          <EmptyState icon={<Wine />} title="No lots match" body="Try a different search, or create a lot to start the production record." action={<Button variant="primary" onClick={() => setParams({ new: '1' })}>New lot</Button>} />
        </Card>
      ) : view === 'table' ? (
        <Card padded={false}>
          <div className="px-5">
            <Table>
              <thead>
                <tr>
                  <Th>Lot</Th>
                  <Th>Wine</Th>
                  <Th>Stage</Th>
                  <Th right>Volume</Th>
                  <Th>Vessels</Th>
                  <Th>Trend</Th>
                  <Th>Last SO₂</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ lot, volume, vessels, lastSO2, lastAdd, volumeTrail, updated }) => (
                  <tr key={lot.id} className="hover:bg-surface-2/60 cursor-pointer" onClick={() => navigate(`/lots/${lot.id}`)}>
                    <Td mono>
                      <Link to={`/lots/${lot.id}`} className="font-semibold text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                        {lot.code}
                      </Link>
                      {lot.marketingName && <div className="text-[11px] text-ink-3 font-sans">{lot.marketingName}</div>}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <WineDot color={lot.color} />
                        <span>
                          {lot.variety} <span className="text-ink-3">{lot.vintage}</span>
                        </span>
                      </div>
                      {lot.client && <div className="text-[11px] text-ink-3 mt-0.5">Brand {lot.client}</div>}
                    </Td>
                    <Td>
                      <Badge tone={lot.status === 'archived' ? 'neutral' : lot.stage === 'Fermentation' ? 'warn' : lot.stage === 'Aging' ? 'accent' : 'info'}>{lot.status === 'archived' ? 'Closed' : lot.stage}</Badge>
                    </Td>
                    <Td right className="font-medium">
                      {fmtGal(volume)}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        {vessels.map((v) => (
                          <span key={v.code} className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 border border-border px-1.5 py-0.5 text-[12px] mono" title={`${fmtGal(v.gallons)} of ${fmtGal(v.cap)}`}>
                            {v.code}
                            {v.cap > 0 && <Meter value={v.gallons} max={v.cap} className="w-8 h-1" tone={lot.color === 'white' ? 'white' : lot.color === 'rosé' ? 'rose' : 'red'} />}
                          </span>
                        ))}
                        {!vessels.length && <span className="text-ink-3 text-[12px]">—</span>}
                      </div>
                    </Td>
                    <Td>
                      <Sparkline points={volumeTrail} />
                    </Td>
                    <Td>
                      {lastSO2 ? (
                        <span className={cx('num', Date.now() - new Date(lastSO2.at).getTime() > 60 * 86400000 && 'text-warn')}>
                          {lastSO2.measurements?.find((m) => m.analyte === 'freeSO2')?.value} ppm <span className="text-ink-3 text-[11px]">{fmtRelative(lastSO2.at)}</span>
                        </span>
                      ) : lastAdd ? (
                        <span className="text-[12px] text-ink-3">added {fmtRelative(lastAdd.at)}</span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </Td>
                    <Td className="text-ink-3 text-[12px]">{fmtRelative(updated)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map(({ lot, volume, vessels, updated }) => (
            <Link key={lot.id} to={`/lots/${lot.id}`} className="block bg-surface border border-border rounded-[14px] shadow-card p-4 hover:border-border-strong transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="mono font-semibold text-[15px]">{lot.code}</div>
                  <div className="text-sm text-ink-2 flex items-center gap-1.5 mt-0.5">
                    <WineDot color={lot.color} /> {lot.variety} {lot.vintage}
                  </div>
                </div>
                <Badge tone={lot.stage === 'Fermentation' ? 'warn' : 'accent'}>{lot.stage}</Badge>
              </div>
              <div className="display text-[26px] num mt-3">{fmtGal(volume)}</div>
              <div className="flex flex-wrap gap-1 mt-2">
                {vessels.map((v) => (
                  <span key={v.code} className="text-[11px] mono bg-surface-2 border border-border rounded px-1.5">
                    {v.code}
                  </span>
                ))}
              </div>
              <div className="text-[11px] text-ink-3 mt-3">Updated {fmtRelative(updated)}</div>
            </Link>
          ))}
        </div>
      )}

      {newOpen && <NewLotDialog onClose={() => setParams({})} onCreated={(l) => navigate(`/lots/${l.id}`)} />}
      {importOpen && <ImportBlendedDialog onClose={() => setImportOpen(false)} />}
    </div>
  )
}
