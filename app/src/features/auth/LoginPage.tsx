import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Wine, ArrowRight } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Button, Input, Field } from '@/components/ui'

export function LoginPage() {
  const users = useStore((s) => s.users)
  const signIn = useStore((s) => s.signIn)
  const userId = useStore((s) => s.session.userId)
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [err, setErr] = useState<string | null>(null)
  if (userId) return <Navigate to="/" replace />

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (signIn(email)) navigate('/')
    else setErr('No account with that email. Pick one of the demo accounts below.')
  }

  return (
    <div className="min-h-full grid lg:grid-cols-[1.1fr_1fr] bg-bg">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-accent text-accent-ink relative overflow-hidden">
        <div className="absolute -right-24 -bottom-24 h-[520px] w-[520px] rounded-full border-[60px] border-white/10" />
        <div className="absolute right-40 -bottom-10 h-[260px] w-[260px] rounded-full border-[40px] border-white/10" />
        <div className="flex items-center gap-3 relative">
          <span className="h-10 w-10 rounded-xl bg-white/15 grid place-items-center">
            <Wine className="h-5 w-5" />
          </span>
          <span className="display text-2xl">Cellarhand</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="display text-[44px] leading-[1.05]">Every gallon, from the vine to the bond report.</h1>
          <p className="mt-4 text-white/80 text-[15px] leading-relaxed">Lots, tanks, vineyards, crush, inventory and TTB compliance — in one place your cellar crew will actually use.</p>
        </div>
        <div className="relative text-white/60 text-[12px]">Multi-winery · role-based · audit-ready</div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <span className="h-9 w-9 rounded-xl bg-accent text-accent-ink grid place-items-center">
              <Wine className="h-4 w-4" />
            </span>
            <span className="display text-xl">Cellarhand</span>
          </div>
          <h2 className="display text-[30px]">Sign in</h2>
          <p className="text-ink-2 text-sm mt-1">Use your winery account. Accounts are scoped to the organizations you belong to.</p>
          <div className="mt-6 space-y-4">
            <Field label="Email">
              <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@winery.com" />
            </Field>
            <Field label="Password" hint="Local demo — any password works. Real authentication arrives with cloud sync.">
              <Input type="password" autoComplete="current-password" placeholder="••••••••" />
            </Field>
            {err && <p className="text-sm text-danger">{err}</p>}
            <Button type="submit" variant="primary" size="lg" className="w-full" icon={<ArrowRight className="h-4 w-4" />}>
              Continue
            </Button>
          </div>
          <div className="mt-8">
            <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mb-2">Demo accounts</div>
            <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden">
              {users.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      signIn(u.email)
                      navigate('/')
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 bg-surface"
                  >
                    <span className="h-8 w-8 rounded-full bg-surface-3 grid place-items-center text-[12px] font-semibold text-ink-2">{u.initials}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{u.name}</span>
                      <span className="block text-[12px] text-ink-3 truncate">{u.email}</span>
                    </span>
                    <span className="text-[11px] text-ink-3 capitalize">{u.memberships[0]?.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </form>
      </div>
    </div>
  )
}
