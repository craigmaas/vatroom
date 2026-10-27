import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrgData, useStore } from '@/store/useStore'
import { Button, Field, Input, Modal, Textarea } from '@/components/ui'

/** Paste or upload a Blended lot-history CSV (and optionally its composition CSV). */
export function ImportBlendedDialog({ onClose }: { onClose: () => void }) {
  const importBlended = useStore((s) => s.importBlended)
  const toast = useStore((s) => s.toast)
  const data = useOrgData()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [history, setHistory] = useState('')
  const [composition, setComposition] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const readFile = (f: File | undefined, set: (s: string) => void, guessCode = false) => {
    if (!f) return
    f.text().then((t) => {
      set(t)
      if (guessCode && !code) setCode(f.name.replace(/\s*composition/i, '').replace(/\.csv$/i, '').trim().toUpperCase())
    })
  }
  const submit = () => {
    if (!code.trim() || !history.trim()) return
    const res = importBlended(code.trim().toUpperCase(), history, composition || undefined)
    if (!res.ok) {
      setErr(res.message)
      return
    }
    toast({ title: 'Imported', body: res.message, tone: 'good' })
    const lot = data?.lots.find((l) => l.code === code.trim().toUpperCase())
    onClose()
    const created = useStore.getState().data[useStore.getState().session.orgId!].lots.find((l) => l.code === code.trim().toUpperCase())
    if (created ?? lot) navigate(`/lots/${(created ?? lot)!.id}`)
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Import a lot from Blended"
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!code || !history}>
            Import lot
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2 mb-4">
        Export the lot’s <em>History</em> (and optionally <em>Composition</em>) as CSV from Blended and drop them here. Transfers, additions, losses, splits and lab readings are replayed into a full timeline, and the wine lands in the right vessels.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Lot code" required>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="mono" placeholder="e.g. GRUBA25-01" />
        </Field>
        <div />
        <Field label="History CSV" required hint="Columns: Date, Actions, Additions, Vessels, Notes (+ Brix/pH/TA/Free SO2…)">
          <Input type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files?.[0], setHistory, true)} className="file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-sm pt-1" />
          <Textarea className="mt-2 mono text-[12px]" value={history} onChange={(e) => setHistory(e.target.value)} placeholder="…or paste the CSV text" />
        </Field>
        <Field label="Composition CSV" hint="Optional — gives the lot its origin, variety and vintage shares">
          <Input type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files?.[0], setComposition)} className="file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-sm pt-1" />
          <Textarea className="mt-2 mono text-[12px]" value={composition} onChange={(e) => setComposition(e.target.value)} placeholder="…or paste the CSV text" />
        </Field>
      </div>
      {err && <p className="text-sm text-danger mt-3">{err}</p>}
    </Modal>
  )
}
