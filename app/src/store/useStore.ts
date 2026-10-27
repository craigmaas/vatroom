import { create } from 'zustand'
import type {
  Addition,
  AuditEntry,
  Block,
  CaseGoodsItem,
  CostEntry,
  CrushRecord,
  ID,
  Lot,
  LotEvent,
  LotStage,
  Material,
  Measurement,
  OrgData,
  Organization,
  PackagingItem,
  Task,
  User,
  Vessel,
  Vineyard,
  WorkspaceSnapshot,
} from '@/domain/types'
import { createAdapter, type StorageAdapter } from '@/storage'
import { buildEmptyOrg, buildSeedSnapshot, newId } from '@/data/seed'
import { doseRate } from '@/domain/units'
import { importBlendedLot } from '@/importers/blended'

/**
 * Application store.
 *
 * One zustand store holds the whole workspace plus session (who is signed in,
 * which org is active). Every mutation goes through an action here so the
 * persistence shim sees it, and so the audit log is written consistently.
 */

const adapter: StorageAdapter = createAdapter()

const SESSION_KEY = 'vatroom.session'
interface Session {
  userId: ID | null
  orgId: ID | null
  theme: 'light' | 'dark' | 'system'
}
function loadSession(): Session {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) return { theme: 'system', ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return { userId: null, orgId: null, theme: 'system' }
}
function saveSession(s: Session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export interface Toast {
  id: string
  title: string
  body?: string
  tone?: 'good' | 'warn' | 'danger' | 'info'
}

type Collection = keyof OrgData

interface State {
  ready: boolean
  storageKind: StorageAdapter['kind']
  lastSavedAt: string | null
  organizations: Organization[]
  users: User[]
  data: Record<ID, OrgData>
  session: Session
  toasts: Toast[]

  // session
  boot: () => Promise<void>
  signIn: (email: string) => boolean
  signOut: () => void
  switchOrg: (orgId: ID) => void
  setTheme: (t: Session['theme']) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void

  // generic
  upsert: <K extends Collection>(collection: K, item: OrgData[K][number]) => void
  remove: (collection: Collection, id: ID) => void
  audit: (action: string, entity: string, entityId?: ID, details?: string) => void

  // lots & operations
  createLot: (lot: Omit<Lot, 'id' | 'orgId' | 'createdAt' | 'updatedAt' | 'status'> & { initialVesselId?: ID; initialGallons?: number }) => Lot
  updateLot: (id: ID, patch: Partial<Lot>) => void
  recordTransfer: (lotId: ID, fromVesselId: ID | null, toVesselId: ID, gallons: number, at: string, notes?: string) => void
  recordAddition: (lotId: ID, additions: Addition[], at: string, vesselIds?: ID[], notes?: string) => void
  recordMeasurement: (lotId: ID, measurements: Measurement[], at: string, notes?: string) => void
  recordVolumeChange: (lotId: ID, kind: 'loss' | 'gain', gallons: number, reason: string, at: string, vesselId?: ID) => void
  recordOperation: (lotId: ID, operation: string, at: string, notes?: string) => void
  setStage: (lotId: ID, stage: LotStage, at?: string) => void
  splitLot: (lotId: ID, gallons: number, newCode: string, toVesselId: ID, at: string) => Lot | null
  combineLots: (targetId: ID, sourceId: ID, at: string) => void
  recordRemoval: (lotId: ID, kind: 'transfer-in-bond' | 'taxpaid-removal' | 'bottling', gallons: number, at: string, details: string) => void
  addNote: (lotId: ID, text: string, official: boolean, at?: string) => void

  // import / data
  importBlended: (code: string, historyCsv: string, compositionCsv?: string) => { ok: boolean; message: string }
  resetDemo: () => Promise<void>
  exportSnapshot: () => WorkspaceSnapshot
  importSnapshot: (s: WorkspaceSnapshot) => void
  createOrganization: (org: Omit<Organization, 'id' | 'createdAt'>) => Organization
}

let saveTimer: number | undefined
function schedulePersist(get: () => State, set: (p: Partial<State>) => void) {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(async () => {
    const s = get()
    try {
      await adapter.save({ version: 1, organizations: s.organizations, users: s.users, data: s.data })
      set({ lastSavedAt: new Date().toISOString() })
    } catch {
      s.toast({ title: 'Could not save', body: 'Your browser blocked local storage. Changes will be lost on reload.', tone: 'danger' })
    }
  }, 250)
}

export const useStore = create<State>((set, get) => {
  const persist = () => schedulePersist(get, set)
  const orgData = (): OrgData => {
    const s = get()
    const orgId = s.session.orgId!
    return s.data[orgId]
  }
  const setOrgData = (updater: (d: OrgData) => OrgData) => {
    const s = get()
    const orgId = s.session.orgId!
    set({ data: { ...s.data, [orgId]: updater(s.data[orgId]) } })
    persist()
  }
  const writeAudit = (action: string, entity: string, entityId?: ID, details?: string) => {
    const s = get()
    const entry: AuditEntry = { id: newId('a'), orgId: s.session.orgId!, at: new Date().toISOString(), userId: s.session.userId ?? undefined, action, entity, entityId, details }
    setOrgData((d) => ({ ...d, audit: [entry, ...d.audit].slice(0, 2000) }))
  }
  const findLot = (id: ID) => orgData().lots.find((l) => l.id === id)
  const touchLot = (id: ID, patch: Partial<Lot>) =>
    setOrgData((d) => ({ ...d, lots: d.lots.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: new Date().toISOString() } : l)) }))
  const pushEvent = (e: Omit<LotEvent, 'id' | 'orgId' | 'volumeAfterGal'> & { volumeAfterGal?: number }) => {
    const s = get()
    const lot = findLot(e.lotId)
    const ev: LotEvent = {
      id: newId('e'),
      orgId: s.session.orgId!,
      volumeAfterGal: lot ? lot.holds.reduce((t, h) => t + h.gallons, 0) : undefined,
      createdBy: s.session.userId ?? undefined,
      ...e,
    }
    setOrgData((d) => ({ ...d, events: [...d.events, ev] }))
    return ev
  }
  const moveGallons = (lot: Lot, from: ID | null, to: ID | null, gallons: number): Lot['holds'] => {
    const holds = lot.holds.map((h) => ({ ...h }))
    if (from) {
      const h = holds.find((x) => x.vesselId === from)
      if (h) h.gallons = Math.max(0, h.gallons - gallons)
    }
    if (to) {
      const h = holds.find((x) => x.vesselId === to)
      if (h) h.gallons += gallons
      else holds.push({ vesselId: to, gallons })
    }
    return holds.filter((h) => h.gallons > 0.5).map((h) => ({ ...h, gallons: Math.round(h.gallons * 10) / 10 }))
  }

  return {
    ready: false,
    storageKind: adapter.kind,
    lastSavedAt: null,
    organizations: [],
    users: [],
    data: {},
    session: loadSession(),
    toasts: [],

    async boot() {
      let snap = await adapter.load()
      if (!snap) {
        snap = buildSeedSnapshot()
        await adapter.save(snap)
      }
      const session = get().session
      const validUser = snap.users.find((u) => u.id === session.userId)
      const orgId = validUser && session.orgId && validUser.memberships.some((m) => m.orgId === session.orgId) ? session.orgId : null
      set({ organizations: snap.organizations, users: snap.users, data: snap.data, ready: true, session: { ...session, userId: validUser ? session.userId : null, orgId } })
      adapter.subscribe?.((s) => set({ organizations: s.organizations, users: s.users, data: s.data }))
    },

    signIn(email) {
      const user = get().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
      if (!user) return false
      const orgId = user.memberships[0]?.orgId ?? null
      const session = { ...get().session, userId: user.id, orgId }
      saveSession(session)
      set({ session })
      return true
    },
    signOut() {
      const session = { ...get().session, userId: null, orgId: null }
      saveSession(session)
      set({ session })
    },
    switchOrg(orgId) {
      const session = { ...get().session, orgId }
      saveSession(session)
      set({ session })
    },
    setTheme(theme) {
      const session = { ...get().session, theme }
      saveSession(session)
      set({ session })
    },
    toast(t) {
      const id = newId('toast')
      set({ toasts: [...get().toasts, { id, ...t }] })
      window.setTimeout(() => get().dismissToast(id), 4500)
    },
    dismissToast(id) {
      set({ toasts: get().toasts.filter((t) => t.id !== id) })
    },

    upsert(collection, item) {
      setOrgData((d) => {
        const list = d[collection] as { id: ID }[]
        const idx = list.findIndex((x) => x.id === (item as { id: ID }).id)
        const next = idx >= 0 ? list.map((x, i) => (i === idx ? item : x)) : [...list, item]
        return { ...d, [collection]: next }
      })
    },
    remove(collection, id) {
      setOrgData((d) => ({ ...d, [collection]: (d[collection] as { id: ID }[]).filter((x) => x.id !== id) }))
    },
    audit: writeAudit,

    createLot(input) {
      const s = get()
      const { initialVesselId, initialGallons, ...rest } = input
      const lot: Lot = {
        ...rest,
        id: newId('lot'),
        orgId: s.session.orgId!,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        holds: initialVesselId && initialGallons ? [{ vesselId: initialVesselId, gallons: initialGallons }] : [],
      }
      setOrgData((d) => ({ ...d, lots: [...d.lots, lot] }))
      pushEvent({ lotId: lot.id, at: lot.createdAt, kind: 'created', summary: 'Lot created', official: true, volumeAfterGal: 0 })
      if (initialVesselId && initialGallons) {
        const v = orgData().vessels.find((x) => x.id === initialVesselId)
        pushEvent({ lotId: lot.id, at: lot.createdAt, kind: 'transfer', summary: `Transferred ${initialGallons} gal to ${v?.code ?? initialVesselId}`, gallons: initialGallons, toVesselId: initialVesselId, official: true })
      }
      writeAudit('create', 'lot', lot.id, lot.code)
      return lot
    },
    updateLot(id, patch) {
      touchLot(id, patch)
      writeAudit('update', 'lot', id, Object.keys(patch).join(', '))
    },
    recordTransfer(lotId, from, to, gallons, at, notes) {
      const lot = findLot(lotId)
      if (!lot) return
      const vessels = orgData().vessels
      const code = (id: ID | null) => vessels.find((v) => v.id === id)?.code ?? id ?? ''
      touchLot(lotId, { holds: moveGallons(lot, from, to, gallons) })
      pushEvent({ lotId, at, kind: 'transfer', summary: from ? `Transferred ${gallons} gal from ${code(from)} to ${code(to)}` : `Transferred ${gallons} gal to ${code(to)}`, gallons, fromVesselId: from ?? undefined, toVesselId: to, vesselIds: [from, to].filter(Boolean) as ID[], notes, official: true })
      writeAudit('transfer', 'lot', lotId, `${gallons} gal → ${code(to)}`)
    },
    recordAddition(lotId, additions, at, vesselIds, notes) {
      const lot = findLot(lotId)
      if (!lot) return
      const vol = lot.holds.reduce((t, h) => t + h.gallons, 0)
      const adds = additions.map((a) => ({ ...a, rate: doseRate(a.qty, a.unit, vol, a.material) }))
      pushEvent({ lotId, at, kind: 'addition', summary: adds.map((a) => `${a.qty} ${a.unit === 'ea' ? '' : a.unit + ' '}${a.material}`).join(', '), additions: adds, vesselIds, notes, official: true })
      // decrement inventory
      setOrgData((d) => ({
        ...d,
        materials: d.materials.map((m) => {
          const a = adds.find((x) => x.material.toLowerCase() === m.name.toLowerCase())
          if (!a) return m
          const factor = a.unit === m.unit ? 1 : a.unit === 'g' && m.unit === 'kg' ? 0.001 : a.unit === 'kg' && m.unit === 'lb' ? 2.20462 : a.unit === 'lb' && m.unit === 'kg' ? 0.4536 : a.unit === 'mL' && m.unit === 'L' ? 0.001 : 1
          return { ...m, onHand: Math.max(0, Math.round((m.onHand - a.qty * factor) * 1000) / 1000) }
        }),
      }))
      touchLot(lotId, {})
      writeAudit('addition', 'lot', lotId, adds.map((a) => a.material).join(', '))
    },
    recordMeasurement(lotId, measurements, at, notes) {
      pushEvent({ lotId, at, kind: 'measurement', summary: measurements.map((m) => `${m.analyte} ${m.value} ${m.unit}`.trim()).join(', '), measurements, notes, official: true })
      touchLot(lotId, {})
    },
    recordVolumeChange(lotId, kind, gallons, reason, at, vesselId) {
      const lot = findLot(lotId)
      if (!lot) return
      const target = vesselId ?? lot.holds[0]?.vesselId ?? null
      const holds = kind === 'loss' ? moveGallons(lot, target, null, gallons) : moveGallons(lot, null, target, gallons)
      touchLot(lotId, { holds })
      pushEvent({ lotId, at, kind, summary: kind === 'loss' ? `Loss of ${gallons} gal - ${reason}` : `Adjustment of ${gallons} gal - ${reason}`, gallons, reason, official: true })
      writeAudit(kind, 'lot', lotId, `${gallons} gal — ${reason}`)
    },
    recordOperation(lotId, operation, at, notes) {
      pushEvent({ lotId, at, kind: /crush/i.test(operation) ? 'crush' : 'operation', summary: operation, reason: operation, notes, official: true })
      touchLot(lotId, {})
    },
    setStage(lotId, stage, at = new Date().toISOString()) {
      touchLot(lotId, { stage })
      pushEvent({ lotId, at, kind: 'stage', summary: `Stage → ${stage}`, reason: stage, official: true })
    },
    splitLot(lotId, gallons, newCode, toVesselId, at) {
      const lot = findLot(lotId)
      if (!lot) return null
      const total = lot.holds.reduce((t, h) => t + h.gallons, 0)
      if (gallons >= total) return null
      const ratio = gallons / total
      const child: Lot = {
        ...lot,
        id: newId('lot'),
        code: newCode,
        holds: [{ vesselId: toVesselId, gallons }],
        components: lot.components.map((c) => ({ ...c, id: newId('cmp'), volumeGal: Math.round(c.volumeGal * ratio * 100) / 100 })),
        createdAt: at,
        updatedAt: at,
        privateNotes: undefined,
      }
      // scale parent composition down
      const parentComponents = lot.components.map((c) => ({ ...c, volumeGal: Math.round(c.volumeGal * (1 - ratio) * 100) / 100 }))
      // remove gallons from parent (largest hold first)
      const from = [...lot.holds].sort((a, b) => b.gallons - a.gallons)[0]?.vesselId ?? null
      setOrgData((d) => ({ ...d, lots: [...d.lots, child] }))
      touchLot(lotId, { holds: moveGallons(lot, from, null, gallons), components: parentComponents })
      pushEvent({ lotId, at, kind: 'split', summary: `${lot.code} split: kept ${Math.round(total - gallons)} gal in current lot, into ${newCode}`, gallons, relatedLotId: child.id, official: true })
      pushEvent({ lotId: child.id, at, kind: 'created', summary: `Lot created — split from ${lot.code}`, relatedLotId: lot.id, official: true })
      writeAudit('split', 'lot', lotId, `${gallons} gal → ${newCode}`)
      return child
    },
    combineLots(targetId, sourceId, at) {
      const target = findLot(targetId)
      const source = findLot(sourceId)
      if (!target || !source) return
      const holds = [...target.holds.map((h) => ({ ...h }))]
      for (const h of source.holds) {
        const ex = holds.find((x) => x.vesselId === h.vesselId)
        if (ex) ex.gallons += h.gallons
        else holds.push({ ...h })
      }
      touchLot(targetId, { holds, components: [...target.components, ...source.components.map((c) => ({ ...c, id: newId('cmp') }))] })
      touchLot(sourceId, { holds: [], status: 'archived', stage: 'Closed' })
      pushEvent({ lotId: targetId, at, kind: 'combine', summary: `Combined ${source.code}, ${target.code} into ${target.code}`, gallons: source.holds.reduce((t, h) => t + h.gallons, 0), relatedLotId: sourceId, official: true })
      pushEvent({ lotId: sourceId, at, kind: 'combine', summary: `Combined into ${target.code}`, relatedLotId: targetId, official: true, volumeAfterGal: 0 })
      writeAudit('combine', 'lot', targetId, `${source.code} → ${target.code}`)
    },
    recordRemoval(lotId, kind, gallons, at, details) {
      const lot = findLot(lotId)
      if (!lot) return
      const from = [...lot.holds].sort((a, b) => b.gallons - a.gallons)[0]?.vesselId ?? null
      const holds = moveGallons(lot, from, null, gallons)
      const label = kind === 'transfer-in-bond' ? 'Transferred in bond' : kind === 'taxpaid-removal' ? 'Taxpaid removal' : 'Bottled'
      touchLot(lotId, { holds, ...(kind === 'bottling' && holds.length === 0 ? { stage: 'Bottled' as LotStage } : {}) })
      pushEvent({ lotId, at, kind, summary: `${label}: ${gallons} gal — ${details}`, gallons, reason: details, official: true })
      writeAudit(kind, 'lot', lotId, `${gallons} gal — ${details}`)
    },
    addNote(lotId, text, official, at = new Date().toISOString()) {
      pushEvent({ lotId, at, kind: 'note', summary: text, notes: text, official })
      touchLot(lotId, {})
    },

    importBlended(code, historyCsv, compositionCsv) {
      const d = orgData()
      if (d.lots.some((l) => l.code === code)) return { ok: false, message: `Lot ${code} already exists` }
      try {
        const res = importBlendedLot({ orgId: get().session.orgId!, code, historyCsv, compositionCsv, idGen: newId, vesselByCode: (c) => d.vessels.find((v) => v.code === c) })
        const newVessels: Vessel[] = []
        for (const vc of res.vesselCodes) {
          if (/Transfer In Bond/i.test(vc)) continue
          if (d.vessels.some((v) => v.code === vc) || newVessels.some((v) => v.code === vc)) continue
          const isBG = /-BG$/.test(vc)
          newVessels.push({ id: newId('v'), orgId: d.lots[0]?.orgId ?? get().session.orgId!, code: vc, type: isBG ? 'barrel-group' : 'tank', capacityGal: isBG ? 1200 : 6000, material: isBG ? 'oak' : 'stainless', map: { zone: isBG ? 'Barrel room' : 'Unplaced', x: 0, y: 0 }, status: 'active', notes: 'Created by Blended import' })
        }
        const all = [...d.vessels, ...newVessels]
        const idFor = (c: string) => all.find((v) => v.code === c)?.id ?? c
        res.lot.holds = res.lot.holds.map((h) => ({ vesselId: idFor(h.vesselId), gallons: h.gallons }))
        for (const e of res.events) {
          if (e.fromVesselId) e.fromVesselId = idFor(e.fromVesselId)
          if (e.toVesselId) e.toVesselId = idFor(e.toVesselId)
          if (e.vesselIds) e.vesselIds = e.vesselIds.map(idFor)
        }
        setOrgData((dd) => ({ ...dd, vessels: [...dd.vessels, ...newVessels], lots: [...dd.lots, res.lot], events: [...dd.events, ...res.events] }))
        writeAudit('import', 'lot', res.lot.id, `${code}: ${res.events.length} events${res.warnings.length ? `, ${res.warnings.length} reconciliations` : ''}`)
        return { ok: true, message: `Imported ${code} with ${res.events.length} events${newVessels.length ? ` and ${newVessels.length} new vessels` : ''}` }
      } catch (err) {
        return { ok: false, message: (err as Error).message }
      }
    },
    async resetDemo() {
      await adapter.clear()
      const snap = buildSeedSnapshot()
      await adapter.save(snap)
      set({ organizations: snap.organizations, users: snap.users, data: snap.data })
    },
    exportSnapshot() {
      const s = get()
      return { version: 1, organizations: s.organizations, users: s.users, data: s.data }
    },
    importSnapshot(snap) {
      set({ organizations: snap.organizations, users: snap.users, data: snap.data })
      persist()
    },
    createOrganization(input) {
      const s = get()
      const org: Organization = { ...input, id: newId('org'), createdAt: new Date().toISOString() }
      const users = s.users.map((u) => (u.id === s.session.userId ? { ...u, memberships: [...u.memberships, { orgId: org.id, role: 'owner' as const }] } : u))
      set({ organizations: [...s.organizations, org], users, data: { ...s.data, [org.id]: buildEmptyOrg(org.id) } })
      persist()
      return org
    },
  }
})

// ---------------------------------------------------------------- selectors
export const useOrgData = () => useStore((s) => (s.session.orgId ? s.data[s.session.orgId] : undefined))
export const useOrg = () => useStore((s) => s.organizations.find((o) => o.id === s.session.orgId))
export const useCurrentUser = () => useStore((s) => s.users.find((u) => u.id === s.session.userId))
export const useRole = () => {
  const user = useCurrentUser()
  const orgId = useStore((s) => s.session.orgId)
  return user?.memberships.find((m) => m.orgId === orgId)?.role ?? 'viewer'
}
export const lotVolume = (lot: Lot) => lot.holds.reduce((t, h) => t + h.gallons, 0)

export type { Block, CaseGoodsItem, CostEntry, CrushRecord, Material, PackagingItem, Task, Vineyard }
