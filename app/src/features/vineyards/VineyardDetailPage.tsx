import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Pencil, Plus } from 'lucide-react'
import type { Block } from '@/domain/types'
import { useOrgData, useRole, useStore } from '@/store/useStore'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Stat, Table, Td, Th } from '@/components/ui'
import { fmtNum, fmtMoney } from '@/domain/units'
import { fmtDate } from '@/lib/format'
import { newId } from '@/data/seed'
import { BlockMap } from './BlockMap'
import { VineyardDialog } from './VineyardsPage'
import { VARIETY_CODES } from '@/domain/lot-codes'

export function VineyardDetailPage() {
  const { id } = useParams()
  const data = useOrgData()
  const role = useRole()
  const navigate = useNavigate()
  const upsert = useStore((s) => s.upsert)
  const remove = useStore((s) => s.remove)
  const [selected, setSelected] = useState<string | undefined>()
  const [editMap, setEditMap] = useState(false)
  const [editBlock, setEditBlock] = useState<Block | null>(null)
  const [editVy, setEditVy] = useState(false)
  // default to the most recent season that has estimates for this vineyard
  const [season, setSeason] = useState(() => {
    const yrs = (data?.blocks ?? []).filter((b) => b.vineyardId === id).flatMap((b) => Object.keys(b.seasons ?? {}).map(Number))
    return yrs.length ? Math.max(...yrs) : new Date().getFullYear()
  })
  const vineyard = data?.vineyards.find((v) => v.id === id)
  if (!data || !vineyard) return <div className="text-ink-3 py-20 text-center">Vineyard not found.</div>
  const blocks = data.blocks.filter((b) => b.vineyardId === vineyard.id)
  const canEdit = role !== 'viewer'
  const crush = data.crush.filter((c) => c.vineyardId === vineyard.id).sort((a, b) => b.date.localeCompare(a.date))
  const acres = blocks.reduce((s, b) => s + (b.acres ?? 0), 0)
  const est = blocks.reduce((s, b) => s + (b.seasons?.[season]?.estYieldTons ?? 0), 0)
  const sel = blocks.find((b) => b.id === selected)
  const years = [...new Set([season, ...blocks.flatMap((b) => Object.keys(b.seasons ?? {}).map(Number)), ...crush.map((c) => new Date(c.date).getFullYear())])].sort((a, b) => b - a)

  return (
    <div>
      <button onClick={() => navigate('/vineyards')} className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink mb-3">
        <ChevronLeft className="h-4 w-4" /> Vineyards
      </button>
      <PageHeader
        eyebrow={vineyard.estate ? 'Estate vineyard' : `Grower · ${vineyard.grower ?? ''}`}
        title={vineyard.name}
        subtitle={[vineyard.ava, vineyard.county && `${vineyard.county} County`, vineyard.state, vineyard.district && `District ${vineyard.district}`].filter(Boolean).join(' · ')}
        actions={
          canEdit && (
            <>
              <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditVy(true)}>
                Edit vineyard
              </Button>
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditBlock({ id: newId('bk'), vineyardId: vineyard.id, name: '', variety: 'Chardonnay', shape: [{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 60 }, { x: 40, y: 60 }] })}>
                Add block
              </Button>
            </>
          )
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card className="p-4">
          <Stat label="Blocks" value={blocks.length} />
        </Card>
        <Card className="p-4">
          <Stat label="Planted acres" value={fmtNum(acres, 1)} />
        </Card>
        <Card className="p-4">
          <Stat label={`Est. yield ${season}`} value={`${fmtNum(est, 1)} t`} sub={acres ? `${(est / acres).toFixed(1)} t/ac` : undefined} />
        </Card>
        <Card className="p-4">
          <Stat label="Delivered (all time)" value={`${fmtNum(crush.reduce((s, c) => s + c.tons, 0), 1)} t`} sub={`${crush.length} loads`} />
        </Card>
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
        <Card
          title="Block map"
          subtitle={editMap ? 'Drag a block to move it; drag its corners to reshape. Changes save as you go.' : 'Click a block to see details'}
          padded={false}
          actions={
            canEdit && (
              <Button size="sm" variant={editMap ? 'primary' : 'secondary'} onClick={() => setEditMap((e) => !e)}>
                {editMap ? 'Done' : 'Edit map'}
              </Button>
            )
          }
        >
          <div className="aspect-[4/3] border-t border-border">
            <BlockMap blocks={blocks} selectedId={selected} onSelect={setSelected} editable={editMap} onChange={(b) => upsert('blocks', b)} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card
            title={sel ? sel.name : 'Blocks'}
            subtitle={sel ? `${sel.variety}${sel.clone ? ` · clone ${sel.clone}` : ''}${sel.rootstock ? ` on ${sel.rootstock}` : ''}` : 'Select a block on the map'}
            actions={
              <>
                <Select value={season} onChange={(e) => setSeason(Number(e.target.value))} className="h-7 text-[12px] w-auto py-0">
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
                {sel && canEdit && (
                  <Button size="sm" variant="ghost" onClick={() => setEditBlock(sel)}>
                    Edit
                  </Button>
                )}
              </>
            }
          >
            {sel ? (
              <BlockDetails block={sel} season={season} />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Block</Th>
                    <Th>Variety</Th>
                    <Th right>Acres</Th>
                    <Th right>Vines</Th>
                    <Th right>Est. t</Th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.map((b) => (
                    <tr key={b.id} className="hover:bg-surface-2/60 cursor-pointer" onClick={() => setSelected(b.id)}>
                      <Td className="font-medium">{b.name}</Td>
                      <Td>
                        {b.variety}
                        {b.clone && <span className="text-ink-3 text-[12px]"> · {b.clone}</span>}
                      </Td>
                      <Td right>{fmtNum(b.acres, 1)}</Td>
                      <Td right>{fmtNum(b.vines)}</Td>
                      <Td right>{fmtNum(b.seasons?.[season]?.estYieldTons, 1)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card title="Deliveries" subtitle="Weigh tags received at the crush pad">
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Block</Th>
                  <Th right>Tons</Th>
                  <Th right>Brix</Th>
                  <Th right>$/t</Th>
                  <Th>Lot</Th>
                </tr>
              </thead>
              <tbody>
                {crush.map((c) => {
                  const lot = data.lots.find((l) => l.id === c.destinationLotId)
                  return (
                    <tr key={c.id}>
                      <Td>{fmtDate(c.date)}</Td>
                      <Td>{c.blockName ?? '—'}</Td>
                      <Td right>{fmtNum(c.tons, 2)}</Td>
                      <Td right>{c.brix ?? '—'}</Td>
                      <Td right>{fmtMoney(c.pricePerTon)}</Td>
                      <Td mono>
                        {lot ? (
                          <Link to={`/lots/${lot.id}`} className="hover:underline">
                            {lot.code}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </Td>
                    </tr>
                  )
                })}
                {!crush.length && (
                  <tr>
                    <Td colSpan={6} className="text-center text-ink-3 py-4">
                      No deliveries yet.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
        </div>
      </div>

      {editBlock && (
        <BlockDialog
          block={editBlock}
          season={season}
          onClose={() => setEditBlock(null)}
          onSave={(b) => {
            upsert('blocks', b)
            setEditBlock(null)
            setSelected(b.id)
          }}
          onDelete={
            blocks.some((b) => b.id === editBlock.id)
              ? () => {
                  remove('blocks', editBlock.id)
                  setEditBlock(null)
                  setSelected(undefined)
                }
              : undefined
          }
        />
      )}
      {editVy && (
        <VineyardDialog
          vineyard={vineyard}
          onClose={() => setEditVy(false)}
          onSave={(v) => {
            upsert('vineyards', v)
            setEditVy(false)
          }}
          onDelete={() => {
            remove('vineyards', vineyard.id)
            blocks.forEach((b) => remove('blocks', b.id))
            navigate('/vineyards')
          }}
        />
      )}
    </div>
  )
}

function BlockDetails({ block, season }: { block: Block; season: number }) {
  const s = block.seasons?.[season]
  const vinesPerAcre = block.rowSpacingFt && block.vineSpacingFt ? Math.round(43560 / (block.rowSpacingFt * block.vineSpacingFt)) : undefined
  // yield estimate from cluster counts if present
  const estFromCounts = s?.clustersPerVine && s?.clusterWeightG && block.vines ? (s.clustersPerVine * s.clusterWeightG * block.vines) / 907185 : undefined
  const rows: [string, string | number | undefined][] = [
    ['Acres', block.acres],
    ['Vines', block.vines ? fmtNum(block.vines) : undefined],
    ['Planted', block.plantedYear],
    ['Spacing', block.rowSpacingFt && block.vineSpacingFt ? `${block.rowSpacingFt}′ × ${block.vineSpacingFt}′${vinesPerAcre ? ` (${fmtNum(vinesPerAcre)} vines/ac)` : ''}` : undefined],
    ['Rootstock', block.rootstock],
    ['Clone', block.clone],
    [`Est. yield ${season}`, s?.estYieldTons ? `${s.estYieldTons} t${block.acres ? ` · ${(s.estYieldTons / block.acres).toFixed(1)} t/ac` : ''}` : undefined],
    ['From cluster counts', estFromCounts ? `${estFromCounts.toFixed(1)} t` : undefined],
    ['Clusters / vine', s?.clustersPerVine],
    ['Cluster weight', s?.clusterWeightG ? `${s.clusterWeightG} g` : undefined],
    ['Target harvest', s?.harvestDate ? fmtDate(s.harvestDate) : undefined],
    ['Drop weight', s?.dropWeightTons ? `${s.dropWeightTons} t` : undefined],
  ]
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className={v === undefined ? 'text-ink-3' : 'font-medium num'}>{v ?? '—'}</dd>
        </div>
      ))}
      {s?.notes && (
        <div className="contents">
          <dt className="text-ink-3">Notes</dt>
          <dd>{s.notes}</dd>
        </div>
      )}
    </dl>
  )
}

function BlockDialog({ block, season, onClose, onSave, onDelete }: { block: Block; season: number; onClose: () => void; onSave: (b: Block) => void; onDelete?: () => void }) {
  const [b, setB] = useState(block)
  const s = b.seasons?.[season] ?? {}
  const setS = (patch: Partial<typeof s>) => setB({ ...b, seasons: { ...(b.seasons ?? {}), [season]: { ...s, ...patch } } })
  const n = (v: string) => (v === '' ? undefined : Number(v))
  return (
    <Modal
      open
      onClose={onClose}
      title={block.name ? `Edit block ${block.name}` : 'New block'}
      width="lg"
      footer={
        <>
          {onDelete && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={onDelete}>
              Delete block
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(b)} disabled={!b.name}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Block name" required>
          <Input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} />
        </Field>
        <Field label="Variety">
          <Input list="varieties" value={b.variety} onChange={(e) => setB({ ...b, variety: e.target.value })} />
          <datalist id="varieties">
            {[...new Set(Object.values(VARIETY_CODES))].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </Field>
        <Field label="Clone">
          <Input value={b.clone ?? ''} onChange={(e) => setB({ ...b, clone: e.target.value || undefined })} />
        </Field>
        <Field label="Rootstock">
          <Input value={b.rootstock ?? ''} onChange={(e) => setB({ ...b, rootstock: e.target.value || undefined })} />
        </Field>
        <Field label="Acres">
          <Input type="number" step="0.1" value={b.acres ?? ''} onChange={(e) => setB({ ...b, acres: n(e.target.value) })} />
        </Field>
        <Field label="Vines">
          <Input type="number" value={b.vines ?? ''} onChange={(e) => setB({ ...b, vines: n(e.target.value) })} />
        </Field>
        <Field label="Planted year">
          <Input type="number" value={b.plantedYear ?? ''} onChange={(e) => setB({ ...b, plantedYear: n(e.target.value) })} />
        </Field>
        <Field label="Row spacing (ft)">
          <Input type="number" step="0.5" value={b.rowSpacingFt ?? ''} onChange={(e) => setB({ ...b, rowSpacingFt: n(e.target.value) })} />
        </Field>
        <Field label="Vine spacing (ft)">
          <Input type="number" step="0.5" value={b.vineSpacingFt ?? ''} onChange={(e) => setB({ ...b, vineSpacingFt: n(e.target.value) })} />
        </Field>
      </div>
      <div className="mt-5 flex items-center gap-2">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">{season} season</div>
        <Badge>estimates</Badge>
      </div>
      <div className="grid sm:grid-cols-3 gap-4 mt-2">
        <Field label="Est. yield (tons)">
          <Input type="number" step="0.1" value={s.estYieldTons ?? ''} onChange={(e) => setS({ estYieldTons: n(e.target.value) })} />
        </Field>
        <Field label="Target harvest date">
          <Input type="date" value={s.harvestDate ?? ''} onChange={(e) => setS({ harvestDate: e.target.value || undefined })} />
        </Field>
        <Field label="Drop weight (tons)">
          <Input type="number" step="0.1" value={s.dropWeightTons ?? ''} onChange={(e) => setS({ dropWeightTons: n(e.target.value) })} />
        </Field>
        <Field label="Clusters per vine">
          <Input type="number" value={s.clustersPerVine ?? ''} onChange={(e) => setS({ clustersPerVine: n(e.target.value) })} />
        </Field>
        <Field label="Cluster weight (g)">
          <Input type="number" value={s.clusterWeightG ?? ''} onChange={(e) => setS({ clusterWeightG: n(e.target.value) })} />
        </Field>
        <Field label="Notes">
          <Input value={s.notes ?? ''} onChange={(e) => setS({ notes: e.target.value || undefined })} />
        </Field>
      </div>
    </Modal>
  )
}
