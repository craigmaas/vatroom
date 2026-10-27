import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Building2, Cloud, Database, Download, HardDrive, Plus, RotateCcw, Upload, Users } from 'lucide-react'
import type { Organization } from '@/domain/types'
import { useCurrentUser, useOrg, useRole, useStore } from '@/store/useStore'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Tabs } from '@/components/ui'
import { download, fmtDate } from '@/lib/format'

type Tab = 'winery' | 'organizations' | 'users' | 'data'

export function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'winery'
  const org = useOrg()
  const role = useRole()
  const user = useCurrentUser()
  const users = useStore((s) => s.users)
  const orgs = useStore((s) => s.organizations)
  const storageKind = useStore((s) => s.storageKind)
  const lastSavedAt = useStore((s) => s.lastSavedAt)
  const resetDemo = useStore((s) => s.resetDemo)
  const exportSnapshot = useStore((s) => s.exportSnapshot)
  const importSnapshot = useStore((s) => s.importSnapshot)
  const createOrganization = useStore((s) => s.createOrganization)
  const switchOrg = useStore((s) => s.switchOrg)
  const toast = useStore((s) => s.toast)
  const setOrgs = (next: Organization) => useStore.setState((s) => ({ organizations: s.organizations.map((o) => (o.id === next.id ? next : o)) }))
  const [form, setForm] = useState<Organization | null>(org ?? null)
  const [newOrg, setNewOrg] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  if (!org || !user) return null
  const f = form && form.id === org.id ? form : org
  const canAdmin = role === 'owner'

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Workspace" subtitle="Winery identity, people, organizations and your data." />
      <Tabs
        value={tab}
        onChange={(t) => setParams({ tab: t })}
        tabs={[
          { value: 'winery', label: 'Winery profile' },
          { value: 'organizations', label: 'Organizations', count: orgs.length },
          { value: 'users', label: 'People & roles' },
          { value: 'data', label: 'Data & storage' },
        ]}
        className="mb-4"
      />

      {tab === 'winery' && (
        <Card title="Winery profile" subtitle="Printed on every compliance export">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Display name">
              <Input value={f.name} onChange={(e) => setForm({ ...f, name: e.target.value })} disabled={!canAdmin} />
            </Field>
            <Field label="Legal name">
              <Input value={f.legalName} onChange={(e) => setForm({ ...f, legalName: e.target.value })} disabled={!canAdmin} />
            </Field>
            <Field label="TTB bonded winery number">
              <Input value={f.bondNumber} onChange={(e) => setForm({ ...f, bondNumber: e.target.value })} className="mono" disabled={!canAdmin} />
            </Field>
            <Field label="Permit / registry number">
              <Input value={f.permitNumber ?? ''} onChange={(e) => setForm({ ...f, permitNumber: e.target.value || undefined })} className="mono" disabled={!canAdmin} />
            </Field>
            <Field label="State licence">
              <Input value={f.stateLicense ?? ''} onChange={(e) => setForm({ ...f, stateLicense: e.target.value || undefined })} disabled={!canAdmin} />
            </Field>
            <Field label="5120.17 filing frequency">
              <Select value={f.reportFrequency} onChange={(e) => setForm({ ...f, reportFrequency: e.target.value as Organization['reportFrequency'] })} disabled={!canAdmin}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly (≤ 60,000 gal/quarter)</option>
                <option value="annual">Annual (≤ 20,000 gal any month)</option>
              </Select>
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input value={f.address} onChange={(e) => setForm({ ...f, address: e.target.value })} disabled={!canAdmin} />
            </Field>
            <Field label="City">
              <Input value={f.city} onChange={(e) => setForm({ ...f, city: e.target.value })} disabled={!canAdmin} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="State">
                <Input value={f.state} onChange={(e) => setForm({ ...f, state: e.target.value.toUpperCase() })} maxLength={2} disabled={!canAdmin} />
              </Field>
              <Field label="ZIP">
                <Input value={f.zip} onChange={(e) => setForm({ ...f, zip: e.target.value })} disabled={!canAdmin} />
              </Field>
            </div>
          </div>
          {canAdmin && (
            <div className="mt-4 flex justify-end">
              <Button
                variant="primary"
                onClick={() => {
                  setOrgs(f)
                  useStore.getState().audit('update', 'organization', f.id)
                  toast({ title: 'Profile saved', tone: 'good' })
                }}
              >
                Save profile
              </Button>
            </div>
          )}
        </Card>
      )}

      {tab === 'organizations' && (
        <div className="space-y-4">
          <Card title="Your organizations" subtitle="Cellarhand is multi-winery: each organization has its own cellar, lots and records. Switch from the sidebar." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setNewOrg(true)}>New organization</Button>}>
            <ul className="divide-y divide-border">
              {orgs
                .filter((o) => user.memberships.some((m) => m.orgId === o.id))
                .map((o) => (
                  <li key={o.id} className="py-3 flex items-center gap-3">
                    <span className="h-9 w-9 rounded-lg bg-surface-2 grid place-items-center text-ink-2">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{o.name}</div>
                      <div className="text-[12px] text-ink-3">
                        <span className="mono">{o.bondNumber}</span> · {o.city}, {o.state} · {user.memberships.find((m) => m.orgId === o.id)?.role}
                      </div>
                    </div>
                    {o.id === org.id ? (
                      <Badge tone="accent">Current</Badge>
                    ) : (
                      <Button size="sm" onClick={() => switchOrg(o.id)}>
                        Switch
                      </Button>
                    )}
                  </li>
                ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'users' && (
        <Card title="People & roles" subtitle="Roles gate what someone can change. Invitations and SSO arrive with the cloud release.">
          <ul className="divide-y divide-border">
            {users
              .filter((u) => u.memberships.some((m) => m.orgId === org.id))
              .map((u) => {
                const r = u.memberships.find((m) => m.orgId === org.id)!.role
                return (
                  <li key={u.id} className="py-3 flex items-center gap-3">
                    <span className="h-9 w-9 rounded-full bg-surface-3 grid place-items-center text-[12px] font-semibold text-ink-2">{u.initials}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">
                        {u.name} {u.id === user.id && <span className="text-ink-3 font-normal">(you)</span>}
                      </div>
                      <div className="text-[12px] text-ink-3">{u.email}</div>
                    </div>
                    <Select
                      value={r}
                      disabled={!canAdmin || u.id === user.id}
                      className="w-auto h-8 text-[13px]"
                      onChange={(e) => {
                        const role = e.target.value as typeof r
                        useStore.setState((s) => ({ users: s.users.map((x) => (x.id === u.id ? { ...x, memberships: x.memberships.map((m) => (m.orgId === org.id ? { ...m, role } : m)) } : x)) }))
                        useStore.getState().audit('role-change', 'user', u.id, role)
                      }}
                    >
                      {['owner', 'winemaker', 'cellar', 'compliance', 'viewer'].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </Select>
                  </li>
                )
              })}
          </ul>
          <div className="mt-4 grid sm:grid-cols-5 gap-2 text-[12px]">
            {[
              ['owner', 'Everything, including billing and org settings'],
              ['winemaker', 'All production operations, lots, vineyards, costs'],
              ['cellar', 'Record work: transfers, additions, readings, tasks'],
              ['compliance', 'Reports, records, audit trail; read-only production'],
              ['viewer', 'Read-only'],
            ].map(([r, d]) => (
              <div key={r} className="rounded-lg bg-surface-2 p-2.5">
                <div className="font-semibold capitalize flex items-center gap-1">
                  <Users className="h-3 w-3" /> {r}
                </div>
                <div className="text-ink-3 mt-0.5">{d}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'data' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Storage" subtitle="Where your data lives right now">
            <div className="flex items-start gap-3">
              <span className="h-10 w-10 rounded-lg bg-surface-2 grid place-items-center text-ink-2">{storageKind === 'local' ? <HardDrive className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}</span>
              <div className="text-sm">
                <div className="font-medium">{storageKind === 'local' ? 'This browser (local storage)' : 'Cloud'}</div>
                <p className="text-ink-2 mt-0.5">{storageKind === 'local' ? 'Changes persist on this device and sync between tabs. They do not reach other devices or people yet — export a backup before clearing browser data.' : 'Changes sync to the cloud and to everyone in the organization.'}</p>
                {lastSavedAt && <div className="text-[12px] text-ink-3 mt-1">Last saved {fmtDate(lastSavedAt, true)}</div>}
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-dashed border-border p-3 text-[12px] text-ink-3">
              <strong className="text-ink-2">Migration path:</strong> the app talks to a single <span className="mono">StorageAdapter</span>. Setting <span className="mono">VITE_STORAGE=cloud</span> swaps in the API-backed adapter with no UI changes.
            </div>
          </Card>
          <Card title="Backup & restore" subtitle="Whole-workspace JSON">
            <div className="flex flex-wrap gap-2">
              <Button icon={<Download className="h-4 w-4" />} onClick={() => download(`cellarhand-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportSnapshot(), null, 2), 'application/json')}>
                Download backup
              </Button>
              <Button icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
                Restore from file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  f.text().then((t) => {
                    try {
                      importSnapshot(JSON.parse(t))
                      toast({ title: 'Workspace restored', tone: 'good' })
                    } catch {
                      toast({ title: 'Could not read that file', tone: 'danger' })
                    }
                  })
                }}
              />
            </div>
            <div className="mt-6 border-t border-border pt-4">
              <div className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4 text-ink-3" /> Demo data
              </div>
              <p className="text-[13px] text-ink-2 mt-1">Rebuild the workspace from the Victor Vineyards Blended exports and whiteboard tank map. Anything you added is lost.</p>
              <Button variant="danger" size="sm" className="mt-2" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirmReset(true)}>
                Reset to demo data
              </Button>
            </div>
          </Card>
        </div>
      )}

      {newOrg && (
        <NewOrgDialog
          onClose={() => setNewOrg(false)}
          onCreate={(o) => {
            const created = createOrganization(o)
            switchOrg(created.id)
            setNewOrg(false)
            toast({ title: `${created.name} created`, body: 'You are now working in the new organization.', tone: 'good' })
          }}
        />
      )}
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset to demo data?"
        width="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Keep my data
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await resetDemo()
                setConfirmReset(false)
                toast({ title: 'Demo data restored', tone: 'good' })
              }}
            >
              Reset
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">This replaces everything in this browser with the original import. Download a backup first if you want to keep your changes.</p>
      </Modal>
    </div>
  )
}

function NewOrgDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (o: Omit<Organization, 'id' | 'createdAt'>) => void }) {
  const [o, setO] = useState<Omit<Organization, 'id' | 'createdAt'>>({ name: '', legalName: '', bondNumber: '', address: '', city: '', state: 'CA', zip: '', timezone: 'America/Los_Angeles', reportFrequency: 'monthly' })
  return (
    <Modal
      open
      onClose={onClose}
      title="New organization"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!o.name} onClick={() => onCreate({ ...o, legalName: o.legalName || o.name })}>
            Create
          </Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Winery name" required className="sm:col-span-2">
          <Input value={o.name} onChange={(e) => setO({ ...o, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Legal name">
          <Input value={o.legalName} onChange={(e) => setO({ ...o, legalName: e.target.value })} />
        </Field>
        <Field label="Bond number">
          <Input value={o.bondNumber} onChange={(e) => setO({ ...o, bondNumber: e.target.value.toUpperCase() })} className="mono" placeholder="BWN-CA-0000" />
        </Field>
        <Field label="City">
          <Input value={o.city} onChange={(e) => setO({ ...o, city: e.target.value })} />
        </Field>
        <Field label="State">
          <Input value={o.state} onChange={(e) => setO({ ...o, state: e.target.value.toUpperCase() })} maxLength={2} />
        </Field>
      </div>
    </Modal>
  )
}
