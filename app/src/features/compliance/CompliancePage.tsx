import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FileCheck2, Printer, ShieldCheck } from 'lucide-react'
import { useOrg, useOrgData } from '@/store/useStore'
import { Badge, Button, Card, PageHeader, Select, Table, Tabs, Td, Th } from '@/components/ui'
import { bulkWineReport, exciseSummary, grapeCrushReport, materialsReceived, periodFor, type Period } from '@/domain/compliance'
import { fmtGal, fmtMoney, fmtNum } from '@/domain/units'
import { fmtDate, download } from '@/lib/format'
import { toCsv } from '@/importers/csv'

type Tab = 'ops' | 'excise' | 'state' | 'records' | 'audit'

export function CompliancePage() {
  const data = useOrgData()
  const org = useOrg()
  const [tab, setTab] = useState<Tab>('ops')
  const [freq, setFreq] = useState<'monthly' | 'quarterly' | 'annual'>(org?.reportFrequency ?? 'monthly')
  const [year, setYear] = useState(new Date().getFullYear())
  const [index, setIndex] = useState(() => (freq === 'monthly' ? new Date().getMonth() - 1 : freq === 'quarterly' ? Math.floor(new Date().getMonth() / 3) - 1 : 0))
  const period: Period = useMemo(() => periodFor(freq, year, Math.max(0, index)), [freq, year, index])
  const bulk = useMemo(() => (data ? bulkWineReport(data, period) : []), [data, period])
  const mats = useMemo(() => (data ? materialsReceived(data.crush, period) : []), [data, period])
  const excise = useMemo(() => (data ? exciseSummary(data, period) : []), [data, period])
  if (!data || !org) return null
  const years = [...new Set([new Date().getFullYear(), ...data.events.map((e) => new Date(e.at).getFullYear())])].sort((a, b) => b - a)
  const periodOptions = freq === 'monthly' ? Array.from({ length: 12 }, (_, i) => ({ i, label: new Date(year, i, 1).toLocaleString('en-US', { month: 'long' }) })) : freq === 'quarterly' ? Array.from({ length: 4 }, (_, i) => ({ i, label: `Q${i + 1}` })) : [{ i: 0, label: 'Calendar year' }]
  const totals = bulk.reduce((t, l) => ({ start: t.start + l.onHandStart, prod: t.prod + l.producedByFermentation, recv: t.recv + l.receivedInBond, gain: t.gain + l.gainsAdjustments, tib: t.tib + l.transferredInBond, bottled: t.bottled + l.bottled, taxpaid: t.taxpaid + l.taxpaidRemovals, loss: t.loss + l.losses, end: t.end + l.onHandEnd, book: t.book + l.bookEnd }), { start: 0, prod: 0, recv: 0, gain: 0, tib: 0, bottled: 0, taxpaid: 0, loss: 0, end: 0, book: 0 })
  const periodEvents = data.events.filter((e) => new Date(e.at) >= period.start && new Date(e.at) < period.end && e.official)

  const exportOps = () => {
    const rows = [
      ['TTB F 5120.17 — Report of Wine Premises Operations (worksheet)'],
      ['Proprietor', org.legalName, 'Registry/Bond', org.bondNumber, 'Period', period.label],
      [],
      ['Part I, Section A — Bulk wines (wine gallons)', ...bulk.map((l) => l.taxClass), 'Total'],
      ['1. On hand first of period', ...bulk.map((l) => r(l.onHandStart)), r(totals.start)],
      ['2. Produced by fermentation', ...bulk.map((l) => r(l.producedByFermentation)), r(totals.prod)],
      ['5. Received in bond', ...bulk.map((l) => r(l.receivedInBond)), r(totals.recv)],
      ['9. Inventory gains / adjustments', ...bulk.map((l) => r(l.gainsAdjustments)), r(totals.gain)],
      ['12. Transferred in bond', ...bulk.map((l) => r(l.transferredInBond)), r(totals.tib)],
      ['14. Bottled', ...bulk.map((l) => r(l.bottled)), r(totals.bottled)],
      ['15. Removed taxpaid', ...bulk.map((l) => r(l.taxpaidRemovals)), r(totals.taxpaid)],
      ['20. Losses', ...bulk.map((l) => r(l.losses)), r(totals.loss)],
      ['22. On hand end of period (physical)', ...bulk.map((l) => r(l.onHandEnd)), r(totals.end)],
      ['    Book balance', ...bulk.map((l) => r(l.bookEnd)), r(totals.book)],
      ['    Shortage (−) / overage (+)', ...bulk.map((l) => r(l.onHandEnd - l.bookEnd)), r(totals.end - totals.book)],
      [],
      ['Part IV — Materials received and used', 'Variety', 'Tons', 'Loads'],
      ...mats.map((m) => ['', m.variety, m.tons.toFixed(2), m.lots]),
      [],
      ['Supporting entries'],
      ['Date', 'Lot', 'Kind', 'Gallons', 'Summary'],
      ...periodEvents.filter((e) => ['loss', 'gain', 'transfer-in-bond', 'taxpaid-removal', 'bottling', 'created', 'receipt'].includes(e.kind)).map((e) => [fmtDate(e.at, true), data.lots.find((l) => l.id === e.lotId)?.code ?? '', e.kind, e.gallons ?? '', e.summary]),
    ]
    download(`5120.17-${period.label.replace(/\s/g, '-')}.csv`, toCsv(rows), 'text/csv')
  }
  const exportBulkRecords = () => {
    const rows = [['27 CFR 24.301 — Bulk still wine record', org.legalName, org.bondNumber, period.label], ['Date', 'Lot', 'Tax class', 'Operation', 'Gallons', 'From', 'To', 'Volume after', 'Notes'], ...periodEvents.map((e) => {
      const lot = data.lots.find((l) => l.id === e.lotId)
      const v = (id?: string) => data.vessels.find((x) => x.id === id)?.code ?? ''
      return [fmtDate(e.at, true), lot?.code ?? '', lot?.taxClass ?? '', e.summary, e.gallons ?? '', v(e.fromVesselId), v(e.toVesselId), e.volumeAfterGal ?? '', e.notes ?? '']
    })]
    download(`bulk-wine-record-${period.label.replace(/\s/g, '-')}.csv`, toCsv(rows), 'text/csv')
  }
  const exportMaterials = () => {
    const rows = [['27 CFR 24.315 — Materials received and used', org.legalName, period.label], ['Date', 'Lot', 'Material', 'Quantity', 'Unit', 'Dose', 'Lot volume'], ...periodEvents.filter((e) => e.kind === 'addition').flatMap((e) => e.additions!.map((a) => [fmtDate(e.at), data.lots.find((l) => l.id === e.lotId)?.code ?? '', a.material, a.qty, a.unit, a.rate ?? '', e.volumeAfterGal ?? '']))]
    download(`materials-record-${period.label.replace(/\s/g, '-')}.csv`, toCsv(rows), 'text/csv')
  }
  const exportAuditPacket = () => {
    exportOps()
    exportBulkRecords()
    exportMaterials()
  }

  return (
    <div>
      <PageHeader
        eyebrow="Compliance"
        title="Reports & records"
        subtitle="Every figure below is computed from the production record, so an auditor can trace it back to the operation that produced it."
        actions={
          <>
            <Select
              value={freq}
              onChange={(e) => {
                setFreq(e.target.value as typeof freq)
                setIndex(0)
              }}
              className="w-auto"
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </Select>
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-auto">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
            <Select value={index} onChange={(e) => setIndex(Number(e.target.value))} className="w-auto">
              {periodOptions.map((p) => (
                <option key={p.i} value={p.i}>
                  {p.label}
                </option>
              ))}
            </Select>
            <Button variant="primary" icon={<ShieldCheck className="h-4 w-4" />} onClick={exportAuditPacket}>
              Audit packet
            </Button>
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'ops', label: 'TTB 5120.17 Operations' },
          { value: 'excise', label: 'TTB 5000.24 Excise' },
          { value: 'state', label: 'California' },
          { value: 'records', label: 'Required records' },
          { value: 'audit', label: 'Audit trail' },
        ]}
        className="mb-4"
      />

      {tab === 'ops' && (
        <div className="space-y-4">
          <Card
            title={`Report of Wine Premises Operations — ${period.label}`}
            subtitle={`${org.legalName} · ${org.bondNumber} · Part I Section A, bulk wines in wine gallons`}
            actions={
              <>
                <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={exportOps}>
                  CSV worksheet
                </Button>
                <Button size="sm" variant="ghost" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
                  Print
                </Button>
              </>
            }
          >
            <Table className="print-sheet">
              <thead>
                <tr>
                  <Th>Line</Th>
                  {bulk.map((l) => (
                    <Th key={l.taxClass} right>
                      {l.taxClass}
                    </Th>
                  ))}
                  <Th right>Total</Th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['1', 'On hand first of period', (l: (typeof bulk)[number]) => l.onHandStart, totals.start],
                    ['2', 'Produced by fermentation', (l) => l.producedByFermentation, totals.prod],
                    ['5', 'Received in bond', (l) => l.receivedInBond, totals.recv],
                    ['9', 'Inventory gains / adjustments', (l) => l.gainsAdjustments, totals.gain],
                    ['12', 'Transferred in bond', (l) => l.transferredInBond, totals.tib],
                    ['14', 'Bottled', (l) => l.bottled, totals.bottled],
                    ['15', 'Removed taxpaid', (l) => l.taxpaidRemovals, totals.taxpaid],
                    ['20', 'Losses', (l) => l.losses, totals.loss],
                    ['22', 'On hand end of period', (l) => l.onHandEnd, totals.end],
                  ] as [string, string, (l: (typeof bulk)[number]) => number, number][]
                ).map(([n, label, fn, total]) => (
                  <tr key={n} className={n === '22' ? 'font-semibold' : ''}>
                    <Td>
                      <span className="text-ink-3 mr-2 num">{n}</span>
                      {label}
                    </Td>
                    {bulk.map((l) => (
                      <Td key={l.taxClass} right>
                        {fmtNum(fn(l))}
                      </Td>
                    ))}
                    <Td right>{fmtNum(total)}</Td>
                  </tr>
                ))}
                <tr className="text-[12px] text-ink-3">
                  <Td>Book balance (1+2+5+9−12−14−15−20)</Td>
                  {bulk.map((l) => (
                    <Td key={l.taxClass} right>
                      {fmtNum(l.bookEnd)}
                    </Td>
                  ))}
                  <Td right>{fmtNum(totals.book)}</Td>
                </tr>
                <tr>
                  <Td>Shortage (−) / overage (+) to report</Td>
                  {bulk.map((l) => {
                    const d = l.onHandEnd - l.bookEnd
                    return (
                      <Td key={l.taxClass} right className={Math.abs(d) > 1 ? 'text-warn font-medium' : 'text-ink-3'}>
                        {d > 0 ? '+' : ''}
                        {fmtNum(d)}
                      </Td>
                    )
                  })}
                  <Td right className={Math.abs(totals.end - totals.book) > 1 ? 'text-warn font-medium' : 'text-ink-3'}>
                    {fmtNum(totals.end - totals.book)}
                  </Td>
                </tr>
              </tbody>
            </Table>
            {!bulk.length && <p className="text-sm text-ink-3 py-6 text-center">No bulk wine activity in this period.</p>}
            <p className="text-[12px] text-ink-3 mt-3">
              Line numbers follow the pre-2024 layout of TTB F 5120.17. TTB’s combined-form pilot no longer separates bulk and bottled; export the worksheet and transcribe into Pay.gov. Due the 15th after the period ends (27 CFR 24.300). Filing frequency: <strong className="capitalize">{org.reportFrequency}</strong>.
            </p>
          </Card>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Part IV — Materials received and used" subtitle="Grapes crushed in the period, by variety">
              <Table>
                <thead>
                  <tr>
                    <Th>Variety</Th>
                    <Th right>Tons</Th>
                    <Th right>Loads</Th>
                  </tr>
                </thead>
                <tbody>
                  {mats.map((m) => (
                    <tr key={m.variety}>
                      <Td>{m.variety}</Td>
                      <Td right>{m.tons.toFixed(2)}</Td>
                      <Td right>{m.lots}</Td>
                    </tr>
                  ))}
                  {!mats.length && (
                    <tr>
                      <Td colSpan={3} className="text-ink-3 text-center py-4">
                        No grapes received in this period.
                      </Td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card>
            <Card title="Supporting entries" subtitle="The operations behind the numbers above">
              <ul className="divide-y divide-border text-sm max-h-[320px] overflow-y-auto">
                {periodEvents
                  .filter((e) => ['loss', 'gain', 'transfer-in-bond', 'taxpaid-removal', 'bottling', 'created', 'receipt'].includes(e.kind))
                  .map((e) => (
                    <li key={e.id} className="py-2 flex items-center gap-3">
                      <span className="text-ink-3 text-[12px] w-24 shrink-0">{fmtDate(e.at)}</span>
                      <Link to={`/lots/${e.lotId}`} className="mono w-28 shrink-0 truncate hover:underline">
                        {data.lots.find((l) => l.id === e.lotId)?.code}
                      </Link>
                      <span className="flex-1 truncate text-ink-2">{e.summary}</span>
                      <Badge tone={e.kind === 'loss' || e.kind === 'taxpaid-removal' ? 'danger' : e.kind === 'gain' ? 'good' : 'neutral'}>{e.kind}</Badge>
                    </li>
                  ))}
                {!periodEvents.length && <li className="py-4 text-center text-ink-3">No entries in this period.</li>}
              </ul>
            </Card>
          </div>
        </div>
      )}

      {tab === 'excise' && (
        <div className="space-y-4">
          <Card title={`Excise tax return worksheet — ${period.label}`} subtitle="TTB F 5000.24 · taxpaid removals with Craft Beverage Modernization Act credits applied">
            <Table>
              <thead>
                <tr>
                  <Th>Tax class</Th>
                  <Th right>Gallons removed</Th>
                  <Th right>Rate</Th>
                  <Th right>Gross tax</Th>
                  <Th right>CBMA credit</Th>
                  <Th right>Net due</Th>
                </tr>
              </thead>
              <tbody>
                {excise.map((l) => (
                  <tr key={l.taxClass}>
                    <Td>{l.taxClass}</Td>
                    <Td right>{fmtNum(l.gallons, 1)}</Td>
                    <Td right>{fmtMoney(l.rate)}</Td>
                    <Td right>{fmtMoney(l.gross)}</Td>
                    <Td right className="text-good">
                      −{fmtMoney(l.credit)}
                    </Td>
                    <Td right className="font-semibold">
                      {fmtMoney(l.net)}
                    </Td>
                  </tr>
                ))}
                {!excise.length && (
                  <tr>
                    <Td colSpan={6} className="text-center text-ink-3 py-6">
                      No taxpaid removals in this period. Record them from a lot with “Bottle / remove → Taxpaid removal”.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
            <p className="text-[12px] text-ink-3 mt-3">Rates per 26 USC 5041: $1.07 (≤16%), $1.57 (16–21%), $3.15 (21–24%), $3.30 artificially carbonated, $3.40 sparkling. CBMA credit $1.00/gal on the first 30,000 gallons removed in the calendar year, then $0.90 and $0.535. Confirm current tiers with TTB before filing; small producers may qualify for quarterly or annual filing (TTB G 2023-14).</p>
          </Card>
          <Card title="Case goods in bond vs. taxpaid">
            <Table>
              <thead>
                <tr>
                  <Th>SKU</Th>
                  <Th>Wine</Th>
                  <Th right>Cases</Th>
                  <Th right>Gallons</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.caseGoods.map((c) => (
                  <tr key={c.id}>
                    <Td mono>{c.sku}</Td>
                    <Td>{c.description}</Td>
                    <Td right>{fmtNum(c.casesOnHand)}</Td>
                    <Td right>{fmtNum((c.casesOnHand * c.bottlesPerCase * c.bottleSizeMl) / 3785.41)}</Td>
                    <Td>
                      <Badge tone={c.taxpaid ? 'good' : 'accent'}>{c.taxpaid ? 'Taxpaid' : 'In bond'}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      )}

      {tab === 'state' && <CaliforniaTab year={year} />}

      {tab === 'records' && (
        <div className="grid lg:grid-cols-2 gap-4">
          {[
            { title: 'Bulk still wine record', cite: '27 CFR 24.301', body: 'Every receipt, transfer, loss, gain, blend and removal of bulk wine with volumes and tax class — the backbone of the 5120.17.', count: periodEvents.filter((e) => e.gallons).length, action: exportBulkRecords },
            { title: 'Materials received and used', cite: '27 CFR 24.315 / 24.246', body: 'Additions to wine with quantities and dose rates, so limits on SO₂, copper, DAP and other treating materials can be shown.', count: periodEvents.filter((e) => e.kind === 'addition').length, action: exportMaterials },
            { title: 'Wine production / fermentation record', cite: '27 CFR 24.302', body: 'Grapes received, must produced and wine produced by fermentation, linked to each lot’s crush entries and composition.', count: data.crush.filter((c) => new Date(c.date) >= period.start && new Date(c.date) < period.end).length, action: () => download(`crush-${period.label}.csv`, toCsv([['Date', 'Vineyard', 'Block', 'Variety', 'Tons', 'Brix', 'Lot', 'AVA', 'County'], ...data.crush.map((c) => [fmtDate(c.date), c.vineyardName, c.blockName ?? '', c.variety, c.tons, c.brix ?? '', data.lots.find((l) => l.id === c.destinationLotId)?.code ?? '', c.ava ?? '', c.county])]), 'text/csv') },
            { title: 'Label substantiation (composition)', cite: '27 CFR Part 4', body: 'Per-lot variety, vintage, appellation and estate shares supporting every label claim.', count: data.lots.filter((l) => l.components.length).length, action: () => download('composition.csv', toCsv([['Lot', 'Source', 'Type', 'Variety', 'Vintage', 'Gallons', 'AVA', 'County', 'State', 'Estate'], ...data.lots.flatMap((l) => l.components.map((c) => [l.code, c.sourceName, c.type, c.variety, c.vintage, c.volumeGal, c.ava ?? '', c.county ?? '', c.state ?? '', c.estate ? 'yes' : 'no']))]), 'text/csv') },
          ].map((r) => (
            <Card key={r.title} title={r.title} subtitle={r.cite} actions={<Button size="sm" icon={<Download className="h-4 w-4" />} onClick={r.action}>Export</Button>}>
              <p className="text-sm text-ink-2">{r.body}</p>
              <div className="text-[12px] text-ink-3 mt-2 num">
                {r.count} entries {r.title.includes('Label') ? 'on file' : `in ${period.label}`}
              </div>
            </Card>
          ))}
          <Card className="lg:col-span-2 bg-surface-2 border-dashed">
            <div className="flex items-start gap-3 text-sm">
              <FileCheck2 className="h-5 w-5 text-accent shrink-0" />
              <div>
                <div className="font-semibold">Retention</div>
                <p className="text-ink-2 mt-0.5">TTB requires records be kept for three years after the period they cover (27 CFR 24.300(d)); the audit packet exports everything for a period in one click. Winemaker’s private notes are never included.</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === 'audit' && (
        <Card title="Audit trail" subtitle="Who changed what, when — independent of the production record">
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>User</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {data.audit.slice(0, 200).map((a) => (
                <tr key={a.id}>
                  <Td className="text-ink-3 whitespace-nowrap">{fmtDate(a.at, true)}</Td>
                  <Td>{a.userId ?? 'system'}</Td>
                  <Td>
                    <Badge>{a.action}</Badge>
                  </Td>
                  <Td>{a.entity}</Td>
                  <Td className="text-ink-2">{a.details}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  )
}

function r(n: number) {
  return Math.round(n * 10) / 10
}

function CaliforniaTab({ year }: { year: number }) {
  const data = useOrgData()!
  const org = useOrg()!
  const rows = grapeCrushReport(data.crush, year)
  const totalTons = rows.reduce((s, x) => s + x.tons, 0)
  const removals = data.events.filter((e) => e.kind === 'taxpaid-removal' && new Date(e.at).getFullYear() === year).reduce((s, e) => s + (e.gallons ?? 0), 0)
  return (
    <div className="space-y-4">
      <Card
        title={`CDFA Grape Crush Report — ${year}`}
        subtitle="Tons crushed by variety and pricing district with weighted average price (due January 10)"
        actions={
          <Button size="sm" icon={<Download className="h-4 w-4" />} onClick={() => download(`grape-crush-${year}.csv`, toCsv([['Variety', 'District', 'Tons', 'Avg $/ton'], ...rows.map((x) => [x.variety, x.district, x.tons.toFixed(2), x.avgPrice?.toFixed(2) ?? ''])]), 'text/csv')}>
            Export
          </Button>
        }
      >
        <Table>
          <thead>
            <tr>
              <Th>Variety</Th>
              <Th>District / county</Th>
              <Th right>Tons</Th>
              <Th right>Weighted avg $/t</Th>
              <Th right>Value</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.variety + x.district}>
                <Td>{x.variety}</Td>
                <Td>{x.district}</Td>
                <Td right>{x.tons.toFixed(2)}</Td>
                <Td right>{fmtMoney(x.avgPrice)}</Td>
                <Td right>{fmtMoney(x.dollars)}</Td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="font-semibold">
                <Td colSpan={2}>Total</Td>
                <Td right>{totalTons.toFixed(2)}</Td>
                <Td right>{fmtMoney(rows.reduce((s, x) => s + x.dollars, 0) / (rows.reduce((s, x) => s + x.priced, 0) || 1))}</Td>
                <Td right>{fmtMoney(rows.reduce((s, x) => s + x.dollars, 0))}</Td>
              </tr>
            )}
            {!rows.length && (
              <tr>
                <Td colSpan={5} className="text-center text-ink-3 py-6">
                  No grapes crushed in {year}.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="CDTFA Winegrower Tax Return (CDTFA-501-WG)" subtitle="California wine excise: $0.20/gal still wine, $0.30/gal sparkling">
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-ink-2">Taxpaid removals {year}</dt>
              <dd className="num font-medium">{fmtGal(removals)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-2">Estimated state excise</dt>
              <dd className="num font-medium">{fmtMoney(removals * 0.2)}</dd>
            </div>
          </dl>
          <p className="text-[12px] text-ink-3 mt-3">Filed with the California Department of Tax and Fee Administration; most small winegrowers file annually. Verify current rates before filing.</p>
        </Card>
        <Card title="ABC Winegrower license" subtitle={org.stateLicense ?? 'Type 02'}>
          <p className="text-sm text-ink-2">The Department of Alcoholic Beverage Control licence is renewed annually. Keep the bond number, premises address and any Type 02 duplicate (tasting room) licences in Settings so they print on every export.</p>
          <dl className="text-sm mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-ink-3">Licensee</dt>
            <dd>{org.legalName}</dd>
            <dt className="text-ink-3">Premises</dt>
            <dd>
              {org.address}, {org.city} {org.state} {org.zip}
            </dd>
            <dt className="text-ink-3">Federal bond</dt>
            <dd className="mono">{org.bondNumber}</dd>
          </dl>
        </Card>
      </div>
    </div>
  )
}
