import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Calculator,
  ChevronsUpDown,
  CircleDollarSign,
  ClipboardList,
  Container,
  FileCheck2,
  Grape,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Search,
  Settings,
  Sun,
  Tractor,
  Wine,
  X,
  Cloud,
  HardDrive,
  Check,
} from 'lucide-react'
import { useCurrentUser, useOrg, useRole, useStore } from '@/store/useStore'
import { cx, fmtRelative } from '@/lib/format'
import { CommandPalette } from './CommandPalette'
import { Kbd } from '@/components/ui'

const NAV = [
  { to: '/', label: 'Today', icon: LayoutDashboard, end: true },
  { to: '/lots', label: 'Lots', icon: Wine },
  { to: '/cellar', label: 'Tank map', icon: Container },
  { to: '/cellar/calculator', label: 'Tank calculator', icon: Calculator },
  { to: '/work', label: 'Work orders', icon: ClipboardList },
  { to: '/harvest', label: 'Harvest & crush', icon: Tractor },
  { to: '/vineyards', label: 'Vineyards', icon: Grape },
  { to: '/inventory', label: 'Inventory', icon: Package },
  { to: '/compliance', label: 'Compliance', icon: FileCheck2 },
  { to: '/costs', label: 'Costs & QuickBooks', icon: CircleDollarSign },
]

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [palette, setPalette] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="h-full flex bg-bg paper">
      {/* sidebar */}
      <aside className={cx('fixed lg:static inset-y-0 left-0 z-40 w-[248px] shrink-0 bg-surface border-r border-border flex flex-col transition-transform lg:translate-x-0 no-print', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center justify-between px-4 h-16 border-b border-border">
          <OrgSwitcher />
          <button className="lg:hidden p-2 text-ink-2" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <button onClick={() => setPalette(true)} className="w-full flex items-center gap-2 h-9 px-3 mb-2 rounded-lg border border-border bg-surface-2 text-ink-3 text-sm hover:border-border-strong">
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search lots, tanks…</span>
            <Kbd>⌘K</Kbd>
          </button>
          <ul className="space-y-0.5">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} end={n.end} className={({ isActive }) => cx('flex items-center gap-2.5 h-9 px-3 rounded-lg text-[14px] font-medium transition-colors', isActive ? 'bg-accent-soft text-accent-soft-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
                  <n.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <SidebarFooter />
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}

      {/* main */}
      <div className="flex-1 min-w-0 flex flex-col relative z-10">
        <header className="lg:hidden flex items-center gap-3 h-14 px-4 border-b border-border bg-surface/80 backdrop-blur no-print">
          <button onClick={() => setOpen(true)} className="p-2 -ml-2 text-ink-2" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="display text-lg">Vatroom</span>
          <button onClick={() => setPalette(true)} className="ml-auto p-2 text-ink-2" aria-label="Search">
            <Search className="h-5 w-5" />
          </button>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 fade-up" key={location.pathname}>
            {children}
          </div>
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <Toasts />
    </div>
  )
}

function OrgSwitcher() {
  const org = useOrg()
  const user = useCurrentUser()
  const orgs = useStore((s) => s.organizations)
  const switchOrg = useStore((s) => s.switchOrg)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const mine = orgs.filter((o) => user?.memberships.some((m) => m.orgId === o.id))
  return (
    <div className="relative min-w-0 flex-1">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 w-full text-left rounded-lg px-1.5 py-1 hover:bg-surface-2 min-w-0" aria-haspopup="listbox" aria-expanded={open}>
        <span className="h-8 w-8 rounded-lg bg-accent text-accent-ink grid place-items-center shrink-0">
          <Wine className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] uppercase tracking-wider text-ink-3 leading-none">Vatroom</span>
          <span className="block text-[14px] font-semibold text-ink truncate leading-tight mt-0.5">{org?.name}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 text-ink-3 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul role="listbox" className="absolute z-20 left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-pop p-1">
            {mine.map((o) => (
              <li key={o.id}>
                <button
                  role="option"
                  aria-selected={o.id === org?.id}
                  onClick={() => {
                    switchOrg(o.id)
                    setOpen(false)
                    navigate('/')
                  }}
                  className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-sm hover:bg-surface-2"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{o.name}</span>
                    <span className="block text-[11px] text-ink-3 mono">{o.bondNumber}</span>
                  </span>
                  {o.id === org?.id && <Check className="h-4 w-4 text-accent" />}
                </button>
              </li>
            ))}
            <li className="border-t border-border mt-1 pt-1">
              <button
                onClick={() => {
                  setOpen(false)
                  navigate('/settings?tab=organizations')
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-ink-2 hover:bg-surface-2"
              >
                Manage organizations…
              </button>
            </li>
          </ul>
        </>
      )}
    </div>
  )
}

function SidebarFooter() {
  const user = useCurrentUser()
  const role = useRole()
  const signOut = useStore((s) => s.signOut)
  const theme = useStore((s) => s.session.theme)
  const setTheme = useStore((s) => s.setTheme)
  const storageKind = useStore((s) => s.storageKind)
  const lastSavedAt = useStore((s) => s.lastSavedAt)
  const navigate = useNavigate()
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-2 px-1">
        <span className="h-8 w-8 rounded-full bg-surface-3 text-ink-2 grid place-items-center text-[12px] font-semibold">{user?.initials}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium truncate">{user?.name}</span>
          <span className="block text-[11px] text-ink-3 capitalize">{role}</span>
        </span>
        <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className="p-1.5 rounded-md text-ink-3 hover:bg-surface-2" aria-label="Toggle theme">
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button onClick={() => navigate('/settings')} className="p-1.5 rounded-md text-ink-3 hover:bg-surface-2" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            signOut()
            navigate('/login')
          }}
          className="p-1.5 rounded-md text-ink-3 hover:bg-surface-2"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 px-1 flex items-center gap-1.5 text-[11px] text-ink-3" title={storageKind === 'local' ? 'Data is stored in this browser. Cloud sync arrives with the production launch.' : 'Synced to the cloud'}>
        {storageKind === 'local' ? <HardDrive className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
        {storageKind === 'local' ? 'Saved in this browser' : 'Cloud sync'}
        {lastSavedAt && <span>· {fmtRelative(lastSavedAt)}</span>}
      </div>
    </div>
  )
}

function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-4 right-4 z-[60] space-y-2 w-[320px] max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => (
        <div key={t.id} className={cx('fade-up bg-surface border rounded-xl shadow-pop px-4 py-3 text-sm flex gap-3', t.tone === 'danger' ? 'border-danger/40' : t.tone === 'good' ? 'border-good/40' : 'border-border')}>
          <div className="flex-1">
            <div className="font-medium">{t.title}</div>
            {t.body && <div className="text-ink-2 text-[13px] mt-0.5">{t.body}</div>}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-ink-3 self-start" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
