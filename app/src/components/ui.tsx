import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '@/lib/format'

/* ------------------------------------------------------------------ Button */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
type Size = 'sm' | 'md' | 'lg'
export function Button({ variant = 'secondary', size = 'md', className, icon, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  const base = 'inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap'
  const sizes = { sm: 'h-8 px-2.5 text-[13px]', md: 'h-9 px-3.5 text-sm', lg: 'h-11 px-5 text-[15px]' }[size]
  const variants: Record<Variant, string> = {
    primary: 'bg-accent text-accent-ink hover:bg-accent-hover shadow-sm',
    secondary: 'bg-surface border border-border-strong text-ink hover:bg-surface-2',
    ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
    danger: 'bg-danger text-white hover:opacity-90',
    soft: 'bg-accent-soft text-accent-soft-ink hover:opacity-90',
  }
  return (
    <button className={cx(base, sizes, variants[variant], className)} {...rest}>
      {icon}
      {children}
    </button>
  )
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={cx('inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors', className)} {...rest}>
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ Card */
export function Card({ className, children, title, subtitle, actions, padded = true, tone = 'surface' }: { className?: string; children: ReactNode; title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; padded?: boolean; tone?: 'surface' | 'accent' | 'soft' | 'muted' }) {
  const tones = {
    surface: 'bg-surface border-border',
    accent: 'bg-accent text-accent-ink border-transparent',
    soft: 'bg-accent-soft text-accent-soft-ink border-transparent',
    muted: 'bg-surface-2 border-border',
  }[tone]
  return (
    <section className={cx('border rounded-[14px] shadow-card', tones, className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div>
            {title && <h3 className="text-[17px] font-semibold text-ink leading-tight">{title}</h3>}
            {subtitle && <p className="text-[13px] text-ink-3 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cx(padded && 'px-5 pb-5', !!title && padded && 'pt-2')}>{children}</div>
    </section>
  )
}

/* ------------------------------------------------------------------ Badge */
export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'danger' | 'info' | 'red' | 'white' | 'rose'
export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-surface-2 text-ink-2 border-border',
    accent: 'bg-accent-soft text-accent-soft-ink border-transparent',
    good: 'bg-good-soft text-good border-transparent',
    warn: 'bg-warn-soft text-warn border-transparent',
    danger: 'bg-danger-soft text-danger border-transparent',
    info: 'bg-info-soft text-info border-transparent',
    red: 'bg-accent-soft text-red-wine border-transparent',
    white: 'bg-warn-soft text-white-wine border-transparent',
    rose: 'bg-accent-soft text-rose-wine border-transparent',
  }
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] font-medium leading-4 whitespace-nowrap', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function WineDot({ color, className }: { color: 'red' | 'white' | 'rosé' | 'other'; className?: string }) {
  const c = color === 'red' ? 'bg-red-wine' : color === 'white' ? 'bg-white-wine' : color === 'rosé' ? 'bg-rose-wine' : 'bg-ink-3'
  return <span aria-hidden className={cx('inline-block h-2.5 w-2.5 rounded-full ring-2 ring-surface', c, className)} />
}

/* ------------------------------------------------------------------ Form */
export function Field({ label, hint, children, className, required }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cx('block', className)}>
      <span className="block text-[12px] font-semibold uppercase tracking-wide text-ink-3 mb-1">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[12px] text-ink-3 mt-1">{hint}</span>}
    </label>
  )
}
const inputBase = 'h-9 rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'
// full width unless the caller sets its own width (e.g. w-auto, w-28)
const inputCls = (className?: string) => cx(inputBase, !/\bw-/.test(className ?? '') && 'w-full')
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputCls(className), className)} {...rest} />
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputCls(className), 'pr-8', className)} {...rest}>
      {children}
    </select>
  )
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputCls(className), 'h-auto min-h-[84px] py-2 leading-relaxed', className)} {...rest} />
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cx('inline-flex rounded-lg bg-surface-2 p-0.5 border border-border', className)}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)} className={cx('px-3 h-7 rounded-md text-[13px] font-medium transition-colors whitespace-nowrap', value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ Tabs */
export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={cx('flex gap-1 border-b border-border overflow-x-auto', className)}>
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)} className={cx('relative px-3 h-10 text-sm font-medium whitespace-nowrap transition-colors', value === t.value ? 'text-ink' : 'text-ink-3 hover:text-ink-2')}>
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-[11px] text-ink-3 num">{t.count}</span>}
          {value === t.value && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-accent" />}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ Stat */
export function Stat({ label, value, sub, tone, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'warn' | 'danger'; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="text-[12px] font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className={cx('display text-[28px] leading-none mt-1 num', tone === 'good' && 'text-good', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-danger')}>{value}</div>
      {sub && <div className="text-[13px] text-ink-3 mt-1.5">{sub}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ Empty */
export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {icon && <div className="text-ink-3 mb-3 [&>svg]:h-8 [&>svg]:w-8">{icon}</div>}
      <h4 className="font-semibold text-ink text-[16px]">{title}</h4>
      {body && <p className="text-sm text-ink-3 mt-1 max-w-md">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ Modal */
export function Modal({ open, onClose, title, children, footer, width = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[width]
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal aria-labelledby={id}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} className={cx('relative w-full bg-surface border border-border rounded-t-2xl sm:rounded-2xl shadow-pop max-h-[92vh] flex flex-col fade-up', w)}>
        <header className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 id={id} className="text-[18px] font-semibold">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </header>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-surface-2/60 rounded-b-2xl">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ Drawer */
export function Drawer({ open, onClose, title, children, width = 440 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-40" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/25" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full bg-surface border-l border-border shadow-pop flex flex-col fade-up w-full" style={{ maxWidth: width }}>
        <header className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ Table */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto -mx-5 px-5', className)}>
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  )
}
export function Th({ children, className, right }: { children?: ReactNode; className?: string; right?: boolean }) {
  return <th className={cx('text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3 py-2 pr-4 border-b border-border whitespace-nowrap', right && 'text-right', className)}>{children}</th>
}
export function Td({ children, className, right, mono, colSpan }: { children?: ReactNode; className?: string; right?: boolean; mono?: boolean; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cx('py-2.5 pr-4 border-b border-border/70 align-top', right && 'text-right num', mono && 'mono text-[13px]', className)}>
      {children}
    </td>
  )
}

/* ------------------------------------------------------------------ Page header */
export function PageHeader({ eyebrow, title, subtitle, actions, children }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <div className="text-[12px] font-semibold uppercase tracking-wider text-accent mb-1">{eyebrow}</div>}
          <h1 className="display text-[30px] sm:text-[34px] leading-none text-ink">{title}</h1>
          {subtitle && <p className="text-ink-2 mt-2 text-[14px] max-w-2xl">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ Progress / meter */
export function Meter({ value, max, tone = 'accent', className, label }: { value: number; max: number; tone?: 'accent' | 'good' | 'warn' | 'danger' | 'red' | 'white' | 'rose'; className?: string; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const color = { accent: 'bg-accent', good: 'bg-good', warn: 'bg-warn', danger: 'bg-danger', red: 'bg-red-wine', white: 'bg-white-wine', rose: 'bg-rose-wine' }[tone]
  return (
    <div className={cx('h-2 w-full rounded-full bg-surface-3 overflow-hidden', className)} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong bg-surface-2 px-1 text-[11px] font-medium text-ink-2 mono">{children}</kbd>
}
