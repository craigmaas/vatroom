import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { LotsPage } from '@/features/lots/LotsPage'
import { LotDetailPage } from '@/features/lots/LotDetailPage'
import { TankMapPage } from '@/features/cellar/TankMapPage'
import { TankCalculatorPage } from '@/features/cellar/TankCalculatorPage'
import { InventoryPage } from '@/features/inventory/InventoryPage'
import { VineyardsPage } from '@/features/vineyards/VineyardsPage'
import { VineyardDetailPage } from '@/features/vineyards/VineyardDetailPage'
import { HarvestPage } from '@/features/harvest/HarvestPage'
import { WorkPage } from '@/features/work/WorkPage'
import { CompliancePage } from '@/features/compliance/CompliancePage'
import { CostsPage } from '@/features/finance/CostsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

function ThemeSync() {
  const theme = useStore((s) => s.session.theme)
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])
  return null
}

function Boot({ children }: { children: React.ReactNode }) {
  const ready = useStore((s) => s.ready)
  const boot = useStore((s) => s.boot)
  useEffect(() => {
    if (!ready) void boot()
  }, [ready, boot])
  if (!ready)
    return (
      <div className="h-full grid place-items-center bg-bg">
        <div className="text-center">
          <div className="display text-3xl text-ink">Cellarhand</div>
          <div className="text-ink-3 text-sm mt-2">Opening the cellar…</div>
        </div>
      </div>
    )
  return <>{children}</>
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const userId = useStore((s) => s.session.userId)
  const orgId = useStore((s) => s.session.orgId)
  if (!userId || !orgId) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ThemeSync />
      <Boot>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <AppShell>
                  <Routes>
                    <Route index element={<DashboardPage />} />
                    <Route path="lots" element={<LotsPage />} />
                    <Route path="lots/:id" element={<LotDetailPage />} />
                    <Route path="cellar" element={<TankMapPage />} />
                    <Route path="cellar/calculator" element={<TankCalculatorPage />} />
                    <Route path="inventory" element={<InventoryPage />} />
                    <Route path="vineyards" element={<VineyardsPage />} />
                    <Route path="vineyards/:id" element={<VineyardDetailPage />} />
                    <Route path="harvest" element={<HarvestPage />} />
                    <Route path="work" element={<WorkPage />} />
                    <Route path="compliance" element={<CompliancePage />} />
                    <Route path="costs" element={<CostsPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AppShell>
              </RequireAuth>
            }
          />
        </Routes>
      </Boot>
    </BrowserRouter>
  )
}
