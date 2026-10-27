import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Grape, Plus } from 'lucide-react'
import type { Vineyard } from '@/domain/types'
import { useOrgData, useRole, useStore } from '@/store/useStore'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select } from '@/components/ui'
import { fmtNum } from '@/domain/units'
import { newId } from '@/data/seed'
import { BlockMap } from './BlockMap'

export function VineyardsPage() {
  const data = useOrgData()
  const role = useRole()
  const upsert = useStore((s) => s.upsert)
  const [editing, setEditing] = useState<Vineyard | null>(null)
  if (!data) return null
  const year = new Date().getFullYear() - 1
  return (
    <div>
      <PageHeader
        eyebrow="Vineyards"
        title="Vineyards & blocks"
        subtitle={`${data.vineyards.length} vineyards · ${data.blocks.length} blocks · ${fmtNum(data.blocks.reduce((s, b) => s + (b.acres ?? 0), 0))} acres`}
        actions={role !== 'viewer' && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ id: newId('vy'), orgId: data.vessels[0]?.orgId ?? '', name: '', estate: false, state: 'CA', county: '' })}>New vineyard</Button>}
      />
      {!data.vineyards.length ? (
        <Card>
          <EmptyState icon={<Grape />} title="No vineyards yet" body="Add estate ranches and growers you buy from. Blocks carry variety, clone, rootstock and yield estimates that flow into harvest planning and label origin." />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.vineyards.map((v) => {
            const blocks = data.blocks.filter((b) => b.vineyardId === v.id)
            const acres = blocks.reduce((s, b) => s + (b.acres ?? 0), 0)
            const est = blocks.reduce((s, b) => s + (b.seasons?.[year]?.estYieldTons ?? 0), 0)
            const varieties = [...new Set(blocks.map((b) => b.variety))]
            const crushTons = data.crush.filter((c) => c.vineyardId === v.id).reduce((s, c) => s + c.tons, 0)
            return (
              <Link key={v.id} to={`/vineyards/${v.id}`} className="block bg-surface border border-border rounded-[14px] shadow-card overflow-hidden hover:border-border-strong transition-colors">
                <div className="h-40 bg-surface-2 border-b border-border">
                  <BlockMap blocks={blocks} compact />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-[16px]">{v.name}</div>
                      <div className="text-[13px] text-ink-3">
                        {v.ava ?? v.county}
                        {v.grower ? ` · ${v.grower}` : ''}
                      </div>
                    </div>
                    {v.estate ? <Badge tone="good">Estate</Badge> : <Badge>Grower</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {varieties.map((x) => (
                      <Badge key={x}>{x}</Badge>
                    ))}
                  </div>
                  <dl className="grid grid-cols-3 gap-2 mt-4 text-[13px]">
                    <div>
                      <dt className="text-ink-3 text-[11px] uppercase tracking-wide">Blocks</dt>
                      <dd className="num font-medium">{blocks.length}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-3 text-[11px] uppercase tracking-wide">Acres</dt>
                      <dd className="num font-medium">{fmtNum(acres, 1)}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-3 text-[11px] uppercase tracking-wide">{crushTons ? 'Crushed' : `Est. ${year}`}</dt>
                      <dd className="num font-medium">{fmtNum(crushTons || est, 1)} t</dd>
                    </div>
                  </dl>
                </div>
              </Link>
            )
          })}
        </div>
      )}
      {editing && (
        <VineyardDialog
          vineyard={editing}
          onClose={() => setEditing(null)}
          onSave={(v) => {
            upsert('vineyards', v)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

export function VineyardDialog({ vineyard, onClose, onSave, onDelete }: { vineyard: Vineyard; onClose: () => void; onSave: (v: Vineyard) => void; onDelete?: () => void }) {
  const [v, setV] = useState(vineyard)
  return (
    <Modal
      open
      onClose={onClose}
      title={vineyard.name ? `Edit ${vineyard.name}` : 'New vineyard'}
      footer={
        <>
          {onDelete && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(v)} disabled={!v.name}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Name" required className="sm:col-span-2">
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Grower / owner">
          <Input value={v.grower ?? ''} onChange={(e) => setV({ ...v, grower: e.target.value || undefined })} />
        </Field>
        <Field label="Contact">
          <Input value={v.contact ?? ''} onChange={(e) => setV({ ...v, contact: e.target.value || undefined })} />
        </Field>
        <Field label="State">
          <Input value={v.state} onChange={(e) => setV({ ...v, state: e.target.value.toUpperCase() })} maxLength={2} />
        </Field>
        <Field label="County">
          <Input value={v.county} onChange={(e) => setV({ ...v, county: e.target.value })} />
        </Field>
        <Field label="AVA">
          <Input value={v.ava ?? ''} onChange={(e) => setV({ ...v, ava: e.target.value || undefined })} />
        </Field>
        <Field label="Crush district" hint="California grape pricing district (1–17)">
          <Input value={v.district ?? ''} onChange={(e) => setV({ ...v, district: e.target.value || undefined })} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Input value={v.address ?? ''} onChange={(e) => setV({ ...v, address: e.target.value || undefined })} />
        </Field>
        <Field label="Ownership">
          <Select value={v.estate ? 'estate' : 'grower'} onChange={(e) => setV({ ...v, estate: e.target.value === 'estate' })}>
            <option value="estate">Estate (owned or controlled)</option>
            <option value="grower">Purchased fruit</option>
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Input value={v.notes ?? ''} onChange={(e) => setV({ ...v, notes: e.target.value || undefined })} />
        </Field>
      </div>
    </Modal>
  )
}
