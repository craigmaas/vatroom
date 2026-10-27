import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Droplets, Info, Container, Wine } from 'lucide-react'
import { lotVolume, useCurrentUser, useOrg, useOrgData, useStore } from '@/store/useStore'
import { Badge, Button, Card, Stat, WineDot } from '@/components/ui'
import { Bars, Donut } from '@/components/charts'
import { fmtGal, fmtNum } from '@/domain/units'
import { complianceAlerts } from '@/domain/compliance'
import { fmtDate, fmtShort, cx } from '@/lib/format'
import { TankGlyph } from '@/features/cellar/TankGlyph'

export function DashboardPage() {
  const data = useOrgData()
  const org = useOrg()
  const user = useCurrentUser()
  const navigate = useNavigate()
  const completeTask = useStore((s) => s.upsert)

  const m = useMemo(() => {
    if (!data) return null
    const active = data.lots.filter((l) => l.status === 'active')
    const totalGal = active.reduce((s, l) => s + lotVolume(l), 0)
    const byColor = { red: 0, white: 0, rosé: 0, other: 0 }
    for (const l of active) byColor[l.color] += lotVolume(l)
    const byStage = new Map<string, number>()
    for (const l of active) byStage.set(l.stage, (byStage.get(l.stage) ?? 0) + 1)
    const byVariety = new Map<string, number>()
    for (const l of active) byVariety.set(l.variety, (byVariety.get(l.variety) ?? 0) + lotVolume(l))
    const tanks = data.vessels.filter((v) => v.type === 'tank' || v.type === 'portable')
    const occupied = new Set(active.flatMap((l) => l.holds.map((h) => h.vesselId)))
    const tankCap = tanks.reduce((s, v) => s + v.capacityGal, 0)
    const inTanks = active.flatMap((l) => l.holds).filter((h) => tanks.some((t) => t.id === h.vesselId)).reduce((s, h) => s + h.gallons, 0)
    // headspace risk: tank filled < 85% (not variable capacity) on aging lots
    const ullage = active.flatMap((l) =>
      l.holds
        .map((h) => ({ lot: l, vessel: data.vessels.find((v) => v.id === h.vesselId)!, gallons: h.gallons }))
        .filter((x) => x.vessel && (x.vessel.type === 'tank' || x.vessel.type === 'portable') && x.gallons / x.vessel.capacityGal < 0.85 && l.stage === 'Aging'),
    )
    const now = Date.now()
    const tasks = data.tasks.filter((t) => t.status === 'open').sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    const overdue = tasks.filter((t) => new Date(t.dueAt).getTime() < now - 86400000)
    const recent = [...data.events].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)
    const lowStock = data.materials.filter((mm) => mm.reorderPoint !== undefined && mm.onHand <= mm.reorderPoint)
    const alerts = complianceAlerts(data)
    return { active, totalGal, byColor, byStage, byVariety, tanks, occupied, tankCap, inTanks, ullage, tasks, overdue, recent, lowStock, alerts }
  }, [data])
  if (!data || !m || !org) return null

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const lotById = new Map(data.lots.map((l) => [l.id, l]))
  const vesselById = new Map(data.vessels.map((v) => [v.id, v]))

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-accent mb-1">{fmtDate(new Date().toISOString())}</div>
          <h1 className="display text-[34px] leading-none">
            {greeting}, {user?.name.split(' ')[0]}.
          </h1>
          <p className="text-ink-2 mt-2">
            {org.name} has <strong className="text-ink num">{fmtGal(m.totalGal)}</strong> in bond across <strong className="text-ink num">{m.active.length}</strong> active lots.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/cellar/calculator')}>
            Tank calculator
          </Button>
          <Button variant="primary" onClick={() => navigate('/lots?new=1')}>
            New lot
          </Button>
        </div>
      </div>

      {/* headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card className="p-5">
          <Stat label="Bulk wine in bond" value={fmtNum(m.totalGal)} sub={`gallons · ${org.bondNumber}`} />
          <div className="flex h-1.5 rounded-full overflow-hidden mt-3 gap-px">
            <div className="bg-red-wine" style={{ width: `${(m.byColor.red / m.totalGal) * 100}%` }} title={`Red ${fmtGal(m.byColor.red)}`} />
            <div className="bg-white-wine" style={{ width: `${(m.byColor.white / m.totalGal) * 100}%` }} title={`White ${fmtGal(m.byColor.white)}`} />
            <div className="bg-rose-wine" style={{ width: `${(m.byColor.rosé / m.totalGal) * 100}%` }} title={`Rosé ${fmtGal(m.byColor.rosé)}`} />
          </div>
          <div className="flex gap-3 text-[11px] text-ink-3 mt-1.5">
            <span className="flex items-center gap-1">
              <WineDot color="red" /> {fmtNum(m.byColor.red)}
            </span>
            <span className="flex items-center gap-1">
              <WineDot color="white" /> {fmtNum(m.byColor.white)}
            </span>
          </div>
        </Card>
        <Card className="p-5">
          <Stat label="Tank utilisation" value={`${Math.round((m.inTanks / m.tankCap) * 100)}%`} sub={`${m.occupied.size} of ${m.tanks.length} tanks occupied`} />
          <div className="h-1.5 rounded-full bg-surface-3 mt-3 overflow-hidden">
            <div className="h-full bg-accent rounded-full" style={{ width: `${(m.inTanks / m.tankCap) * 100}%` }} />
          </div>
          <div className="text-[11px] text-ink-3 mt-1.5">{fmtGal(m.tankCap - m.inTanks)} free</div>
        </Card>
        <Card className="p-5">
          <Stat label="Open work orders" value={m.tasks.length} sub={m.overdue.length ? `${m.overdue.length} overdue` : 'nothing overdue'} tone={m.overdue.length ? 'warn' : undefined} />
          <Link to="/work" className="inline-flex items-center gap-1 text-[12px] text-accent font-medium mt-3">
            Open the worksheet <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
        <Card className="p-5">
          <Stat label="Needs attention" value={m.ullage.length + m.lowStock.length + m.alerts.filter((a) => a.level !== 'info').length} sub={`${m.ullage.length} headspace · ${m.lowStock.length} low stock`} tone={m.ullage.length ? 'warn' : undefined} />
          <div className="text-[11px] text-ink-3 mt-3">Updated live from the cellar</div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="space-y-4">
          {/* Attention */}
          <Card title="Attention" subtitle="Things that move wine quality or compliance risk">
            <ul className="divide-y divide-border">
              {m.ullage.map((u) => (
                <li key={u.lot.id + u.vessel.id} className="flex items-center gap-3 py-2.5">
                  <Droplets className="h-4 w-4 text-warn shrink-0" />
                  <div className="flex-1 min-w-0 text-sm">
                    <Link to={`/lots/${u.lot.id}`} className="font-medium mono hover:underline">
                      {u.lot.code}
                    </Link>{' '}
                    <span className="text-ink-2">
                      is {Math.round((u.gallons / u.vessel.capacityGal) * 100)}% full in {u.vessel.code} — {fmtGal(u.vessel.capacityGal - u.gallons)} headspace while aging
                    </span>
                  </div>
                  <Badge tone="warn">Headspace</Badge>
                </li>
              ))}
              {m.lowStock.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <AlertTriangle className="h-4 w-4 text-warn shrink-0" />
                  <div className="flex-1 text-sm">
                    <Link to="/inventory" className="font-medium hover:underline">
                      {s.name}
                    </Link>{' '}
                    <span className="text-ink-2">
                      down to {s.onHand} {s.unit} (reorder at {s.reorderPoint})
                    </span>
                  </div>
                  <Badge tone="warn">Low stock</Badge>
                </li>
              ))}
              {m.alerts.map((a, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  {a.level === 'info' ? <Info className="h-4 w-4 text-info shrink-0" /> : <AlertTriangle className="h-4 w-4 text-warn shrink-0" />}
                  <div className="flex-1 text-sm text-ink-2">
                    {a.href ? (
                      <Link to={a.href} className="hover:underline">
                        {a.text}
                      </Link>
                    ) : (
                      a.text
                    )}
                  </div>
                  <Badge tone={a.level === 'info' ? 'info' : 'warn'}>Compliance</Badge>
                </li>
              ))}
              {!m.ullage.length && !m.lowStock.length && !m.alerts.length && (
                <li className="py-6 text-center text-sm text-ink-3 flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-good" /> All quiet in the cellar.
                </li>
              )}
            </ul>
          </Card>

          {/* Today's work */}
          <Card
            title="Today's worksheet"
            subtitle="Open work orders, soonest first"
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate('/work')}>
                All work
              </Button>
            }
          >
            <ul className="divide-y divide-border">
              {m.tasks.slice(0, 6).map((t) => {
                const late = new Date(t.dueAt).getTime() < Date.now() - 86400000
                const lot = t.lotId ? lotById.get(t.lotId) : undefined
                return (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <button
                      onClick={() => completeTask('tasks', { ...t, status: 'done', completedAt: new Date().toISOString() })}
                      className="h-5 w-5 rounded-full border-2 border-border-strong hover:border-good hover:bg-good-soft shrink-0"
                      aria-label={`Mark "${t.title}" done`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.title}</div>
                      <div className="text-[12px] text-ink-3 flex items-center gap-2">
                        <Clock className="h-3 w-3" /> {fmtShort(t.dueAt)}
                        {lot && (
                          <Link to={`/lots/${lot.id}`} className="mono hover:underline">
                            {lot.code}
                          </Link>
                        )}
                        {t.vesselId && <span className="mono">{vesselById.get(t.vesselId)?.code}</span>}
                      </div>
                    </div>
                    {late ? <Badge tone="danger">Overdue</Badge> : <Badge>{t.kind}</Badge>}
                  </li>
                )
              })}
              {!m.tasks.length && <li className="py-6 text-center text-sm text-ink-3">No open work orders.</li>}
            </ul>
          </Card>

          {/* Recent */}
          <Card title="Recent activity" subtitle="Latest entries in the production record">
            <ul className="divide-y divide-border">
              {m.recent.map((e) => {
                const lot = lotById.get(e.lotId)
                return (
                  <li key={e.id} className="flex items-start gap-3 py-2.5 text-sm">
                    <span className="text-[12px] text-ink-3 w-20 shrink-0 pt-0.5">{fmtShort(e.at)}</span>
                    <Link to={`/lots/${e.lotId}`} className="mono font-medium w-28 shrink-0 truncate hover:underline">
                      {lot?.code}
                    </Link>
                    <span className="text-ink-2 min-w-0 truncate">{e.summary}</span>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Cellar at a glance" subtitle="Tap a tank for details" actions={<Link to="/cellar" className="text-[12px] text-accent font-medium">Full map</Link>}>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
              {m.tanks
                .filter((t) => t.status === 'active')
                .slice(0, 48)
                .map((t) => {
                  const hold = m.active.flatMap((l) => l.holds.map((h) => ({ l, h }))).find((x) => x.h.vesselId === t.id)
                  return (
                    <button key={t.id} onClick={() => navigate(`/cellar?vessel=${t.id}`)} className="group" title={`${t.code} · ${hold ? `${hold.l.code} ${fmtGal(hold.h.gallons)}` : 'empty'}`}>
                      <TankGlyph fill={hold ? hold.h.gallons / t.capacityGal : 0} color={hold?.l.color} size={34} />
                      <div className="text-[10px] mono text-ink-3 text-center mt-0.5 group-hover:text-ink">{t.code}</div>
                    </button>
                  )
                })}
            </div>
          </Card>

          <Card title="What's in bond" subtitle="By variety, gallons">
            <Donut slices={[...m.byVariety.entries()].map(([label, value]) => ({ label, value }))} centre={<div className="text-center"><div className="display text-xl num">{m.active.length}</div><div className="text-[10px] text-ink-3 uppercase tracking-wider">lots</div></div>} />
          </Card>

          <Card title="Lots by stage">
            <Bars rows={[...m.byStage.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))} format={(v) => `${v} lot${v === 1 ? '' : 's'}`} />
          </Card>

          <Card className="p-4" tone="soft">
            <div className="flex items-start gap-3">
              <span className="h-9 w-9 rounded-lg bg-surface grid place-items-center text-accent shrink-0">
                <Wine className="h-4 w-4" />
              </span>
              <div className="text-[13px] text-accent-soft-ink">
                <div className="font-semibold">Harvest 2026 prep</div>
                <p className="mt-0.5 opacity-90">Estimated {fmtNum(data.blocks.reduce((s, b) => s + (b.seasons?.[2025]?.estYieldTons ?? 0), 0))} tons across {data.blocks.length} blocks last season. Review block estimates and CIP the K tanks before fruit arrives.</p>
                <Link to="/vineyards" className={cx('inline-flex items-center gap-1 font-medium mt-2')}>
                  Review vineyards <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </Card>
          <div className="text-[11px] text-ink-3 flex items-center gap-1.5 px-1">
            <Container className="h-3 w-3" /> Volumes are book figures from the production record. Dip tanks to confirm.
          </div>
        </div>
      </div>
    </div>
  )
}
