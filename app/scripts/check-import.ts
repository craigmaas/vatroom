// Sanity check for the Blended importer: replays every seeded lot and prints the result.
// Run with:  npx tsx scripts/check-import.ts
import { importBlendedLot } from '../src/importers/blended'
import { LOT_COMPOSITION_CSV, LOT_HISTORY_CSV } from '../src/data/blended-raw'

let n = 0
for (const code of Object.keys(LOT_HISTORY_CSV)) {
  const r = importBlendedLot({ orgId: 'org', code, historyCsv: LOT_HISTORY_CSV[code], compositionCsv: LOT_COMPOSITION_CSV[code], idGen: () => `id${n++}`, vesselByCode: () => undefined })
  const vol = r.lot.holds.reduce((s, h) => s + h.gallons, 0)
  console.log(`${code.padEnd(12)} ${r.lot.variety.padEnd(20)} ${String(r.lot.vintage).padEnd(5)} stage=${r.lot.stage.padEnd(24)} vol=${String(vol).padStart(6)} holds=${JSON.stringify(r.lot.holds)} events=${r.events.length} bond=${r.lot.bondNumber}`)
  for (const w of r.warnings) console.log('   ⚠', w)
}
