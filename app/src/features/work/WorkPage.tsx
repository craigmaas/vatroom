import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ClipboardList, Plus, Printer, RotateCcw } from 'lucide-react'
import type { Task, TaskKind } from '@/domain/types'
import { useOrgData, useRole, useStore } from '@/store/useStore'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Textarea } from '@/components/ui'
import { fmtDate, fmtShort, toInputDate, cx } from '@/lib/format'
import { newId } from '@/data/seed'

const KINDS: TaskKind[] = ['addition', 'measurement', 'transfer', 'topping', 'pump-over', 'punch-down', 'racking', 'cleaning', 'sampling', 'bottling', 'other']

export function WorkPage() {
  const data = useOrgData()
  const role = useRole()
  const users = useStore((s) => s.users)
  const upsert = useStore((s) => s.upsert)
  const remove = useStore((s) => s.remove)
  const toast = useStore((s) => s.toast)
  const [view, setView] = useState<'open' | 'done'>('open')
  const [assignee, setAssignee] = useState('all')
  const [editing, setEditing] = useState<Task | null>(null)
  const canEdit = role !== 'viewer'

  const tasks = useMemo(() => (data?.tasks ?? []).filter((t) => (view === 'open' ? t.status === 'open' : t.status !== 'open')).filter((t) => assignee === 'all' || t.assigneeId === assignee).sort((a, b) => (view === 'open' ? a.dueAt.localeCompare(b.dueAt) : (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))), [data, view, assignee])
  if (!data) return null
  const now = Date.now()
  const groups: { label: string; items: Task[] }[] = []
  if (view === 'open') {
    const overdue = tasks.filter((t) => new Date(t.dueAt).getTime() < now - 86400000)
    const today = tasks.filter((t) => !overdue.includes(t) && new Date(t.dueAt).toDateString() === new Date().toDateString())
    const week = tasks.filter((t) => !overdue.includes(t) && !today.includes(t) && new Date(t.dueAt).getTime() < now + 7 * 86400000)
    const later = tasks.filter((t) => !overdue.includes(t) && !today.includes(t) && !week.includes(t))
    if (overdue.length) groups.push({ label: 'Overdue', items: overdue })
    if (today.length) groups.push({ label: 'Today', items: today })
    if (week.length) groups.push({ label: 'This week', items: week })
    if (later.length) groups.push({ label: 'Later', items: later })
  } else groups.push({ label: 'Completed', items: tasks })

  const complete = (t: Task) => {
    upsert('tasks', { ...t, status: 'done', completedAt: new Date().toISOString() })
    if (t.recurrenceDays) {
      const next = new Date(new Date(t.dueAt).getTime() + t.recurrenceDays * 86400000)
      upsert('tasks', { ...t, id: newId('t'), status: 'open', completedAt: undefined, dueAt: next.toISOString() })
      toast({ title: 'Done — next one scheduled', body: `${t.title} · ${fmtDate(next.toISOString())}`, tone: 'good' })
    }
  }
  const members = users.filter((u) => u.memberships.some((m) => m.orgId === data.tasks[0]?.orgId || m.orgId === data.vessels[0]?.orgId))

  return (
    <div>
      <PageHeader
        eyebrow="Cellar work"
        title="Work orders"
        subtitle="What the crew does today, who owns it, and what it was for."
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'open', label: `Open (${data.tasks.filter((t) => t.status === 'open').length})` },
                { value: 'done', label: 'Completed' },
              ]}
            />
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-auto">
              <option value="all">Everyone</option>
              {members.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
            <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Print worksheet
            </Button>
            {canEdit && (
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ id: newId('t'), orgId: data.vessels[0]?.orgId ?? '', title: '', kind: 'other', dueAt: new Date().toISOString(), status: 'open' })}>
                New work order
              </Button>
            )}
          </>
        }
      />
      {!tasks.length ? (
        <Card>
          <EmptyState icon={<ClipboardList />} title={view === 'open' ? 'Nothing on the board' : 'Nothing completed yet'} body="Work orders turn the winemaker’s plan into a checklist the cellar can run from a phone." />
        </Card>
      ) : (
        <div className="space-y-5 print-sheet">
          {groups.map((g) => (
            <section key={g.label}>
              <h3 className={cx('text-[12px] font-semibold uppercase tracking-wider mb-2', g.label === 'Overdue' ? 'text-danger' : 'text-ink-3')}>
                {g.label} <span className="num">({g.items.length})</span>
              </h3>
              <ul className="space-y-2">
                {g.items.map((t) => {
                  const lot = data.lots.find((l) => l.id === t.lotId)
                  const vessel = data.vessels.find((v) => v.id === t.vesselId)
                  const who = users.find((u) => u.id === t.assigneeId)
                  return (
                    <li key={t.id} className="bg-surface border border-border rounded-xl px-4 py-3 flex items-start gap-3">
                      {t.status === 'open' ? (
                        <button onClick={() => canEdit && complete(t)} className="mt-0.5 h-5 w-5 rounded-full border-2 border-border-strong hover:border-good hover:bg-good-soft shrink-0 no-print" aria-label="Complete" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 text-good mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <button onClick={() => canEdit && setEditing(t)} className="text-left font-medium hover:underline">
                          {t.title}
                        </button>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3 mt-0.5">
                          <span>{t.status === 'open' ? `Due ${fmtShort(t.dueAt)}` : `Done ${fmtDate(t.completedAt)}`}</span>
                          {lot && (
                            <Link to={`/lots/${lot.id}`} className="mono text-ink-2 hover:underline">
                              {lot.code}
                            </Link>
                          )}
                          {vessel && <span className="mono text-ink-2">{vessel.code}</span>}
                          {who && <span>{who.name}</span>}
                          {t.recurrenceDays && <span>↻ every {t.recurrenceDays} d</span>}
                        </div>
                        {t.instructions && <p className="text-[13px] text-ink-2 mt-1.5 whitespace-pre-wrap">{t.instructions}</p>}
                      </div>
                      <Badge>{t.kind}</Badge>
                      {t.status !== 'open' && canEdit && (
                        <button onClick={() => upsert('tasks', { ...t, status: 'open', completedAt: undefined })} className="text-ink-3 hover:text-ink no-print" aria-label="Reopen">
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {editing && (
        <TaskDialog
          task={editing}
          isNew={!data.tasks.some((t) => t.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(t) => {
            upsert('tasks', t)
            setEditing(null)
          }}
          onDelete={() => {
            remove('tasks', editing.id)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function TaskDialog({ task, isNew, onClose, onSave, onDelete }: { task: Task; isNew: boolean; onClose: () => void; onSave: (t: Task) => void; onDelete: () => void }) {
  const data = useOrgData()!
  const users = useStore((s) => s.users)
  const [t, setT] = useState(task)
  const [due, setDue] = useState(toInputDate(task.dueAt))
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'New work order' : 'Edit work order'}
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
          <Button variant="primary" disabled={!t.title} onClick={() => onSave({ ...t, dueAt: new Date(due + 'T09:00').toISOString() })}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Title" required className="sm:col-span-2">
          <Input value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} autoFocus />
        </Field>
        <Field label="Kind">
          <Select value={t.kind} onChange={(e) => setT({ ...t, kind: e.target.value as TaskKind })}>
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
        <Field label="Due">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Lot">
          <Select value={t.lotId ?? ''} onChange={(e) => setT({ ...t, lotId: e.target.value || undefined })}>
            <option value="">—</option>
            {data.lots
              .filter((l) => l.status === 'active')
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Vessel">
          <Select value={t.vesselId ?? ''} onChange={(e) => setT({ ...t, vesselId: e.target.value || undefined })}>
            <option value="">—</option>
            {data.vessels.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assignee">
          <Select value={t.assigneeId ?? ''} onChange={(e) => setT({ ...t, assigneeId: e.target.value || undefined })}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Repeat every (days)" hint="Leave blank for one-off">
          <Input type="number" value={t.recurrenceDays ?? ''} onChange={(e) => setT({ ...t, recurrenceDays: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
        <Field label="Instructions" className="sm:col-span-2">
          <Textarea value={t.instructions ?? ''} onChange={(e) => setT({ ...t, instructions: e.target.value || undefined })} />
        </Field>
      </div>
    </Modal>
  )
}
