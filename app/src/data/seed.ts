import type {
  Block,
  CaseGoodsItem,
  CostEntry,
  CrushRecord,
  Material,
  OrgData,
  Organization,
  PackagingItem,
  Task,
  User,
  Vessel,
  VesselType,
  Vineyard,
  WorkspaceSnapshot,
} from '@/domain/types'
import { estimateGeometry } from '@/domain/tank-geometry'
import { importBlendedLot } from '@/importers/blended'
import { LOT_COMPOSITION_CSV, LOT_HISTORY_CSV } from './blended-raw'
import { SNAPSHOT_VERSION } from '@/storage/adapter'

/**
 * Demo workspace for Victor Vineyards, built from the Blended exports and the
 * cellar whiteboard. Everything here is replaced by real data once the cloud
 * backend is live; the shapes are identical.
 */

let counter = 0
export const newId = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

const ORG_ID = 'org_victor'
const now = new Date()
const iso = (d: Date) => d.toISOString()
const daysAgo = (n: number) => iso(new Date(now.getTime() - n * 86400000))
const daysAhead = (n: number) => iso(new Date(now.getTime() + n * 86400000))

export const ORGANIZATION: Organization = {
  id: ORG_ID,
  name: 'Victor Vineyards',
  legalName: 'Victor Vineyards, Inc.',
  bondNumber: 'BWN-CA-6182',
  permitNumber: 'CA-W-21004',
  stateLicense: 'ABC Type 02 Winegrower',
  address: '8751 Bruella Road',
  city: 'Victor',
  state: 'CA',
  zip: '95253',
  timezone: 'America/Los_Angeles',
  reportFrequency: 'monthly',
  createdAt: '2024-12-15T00:00:00.000Z',
}

export const DEMO_ORG_2: Organization = {
  id: 'org_demo2',
  name: 'Clarksburg Cellars (demo)',
  legalName: 'Clarksburg Cellars LLC',
  bondNumber: 'BWN-CA-9999',
  address: '1 River Road',
  city: 'Clarksburg',
  state: 'CA',
  zip: '95612',
  timezone: 'America/Los_Angeles',
  reportFrequency: 'quarterly',
  createdAt: '2025-01-01T00:00:00.000Z',
}

export const USERS: User[] = [
  { id: 'u_craig', name: 'Craig Maas', email: 'camaas@gmail.com', initials: 'CM', memberships: [{ orgId: ORG_ID, role: 'owner' }, { orgId: 'org_demo2', role: 'owner' }] },
  { id: 'u_wm', name: 'Winemaker', email: 'winemaker@victorvineyards.example', initials: 'WM', memberships: [{ orgId: ORG_ID, role: 'winemaker' }] },
  { id: 'u_cellar', name: 'Cellar crew', email: 'cellar@victorvineyards.example', initials: 'CC', memberships: [{ orgId: ORG_ID, role: 'cellar' }] },
  { id: 'u_comp', name: 'Compliance', email: 'compliance@victorvineyards.example', initials: 'CO', memberships: [{ orgId: ORG_ID, role: 'compliance' }] },
]

// ------------------------------------------------------------------ vessels (from the whiteboard)
interface TankSpec {
  code: string
  gal: number
  type?: VesselType
  zone: string
  x: number
  y: number
  jacketed?: boolean
  status?: Vessel['status']
  note?: string
}

function row(prefix: string, codes: (string | number)[], gal: number | number[], zone: string, x0: number, y: number, opts: Partial<TankSpec> = {}): TankSpec[] {
  return codes.map((c, i) => ({ code: `${prefix}${c}`, gal: Array.isArray(gal) ? gal[i] : gal, zone, x: x0 + i, y, jacketed: true, ...opts }))
}

const TANK_SPECS: TankSpec[] = [
  // West wall: A column, 6,295 gal jacketed
  ...row('A', [8, 7, 6, 5, 4, 3, 2], 6295, 'West wall', 0, 0).map((t, i) => ({ ...t, x: 0, y: i })),
  // M tanks
  ...row('M', [2, 3, 4], [2037, 3250, 3250], 'M bank', 2, 0),
  ...row('M', [6, 5], 3250, 'M bank', 3, 1),
  { code: 'M1', gal: 2037, zone: 'M bank', x: 1, y: 0, jacketed: true },
  // Portable tanks
  { code: 'PT18', gal: 8400, type: 'portable', zone: 'Portables', x: 6, y: 0 },
  { code: 'PT8', gal: 7800, type: 'portable', zone: 'Portables', x: 7, y: 0 },
  { code: 'PT7', gal: 7800, type: 'portable', zone: 'Portables', x: 8, y: 0 },
  { code: 'PT9', gal: 6000, type: 'portable', zone: 'Portables', x: 9, y: 0 },
  { code: 'PT10', gal: 6000, type: 'portable', zone: 'Portables', x: 7, y: 1 },
  { code: 'PT12', gal: 6000, type: 'portable', zone: 'Portables', x: 8, y: 1 },
  { code: 'PT11', gal: 6000, type: 'portable', zone: 'Portables', x: 9, y: 1 },
  { code: 'PT20', gal: 6500, type: 'portable', zone: 'Portables', x: 5, y: 2 },
  { code: 'PT21', gal: 6500, type: 'portable', zone: 'Portables', x: 6, y: 2 },
  { code: 'PT22', gal: 6500, type: 'portable', zone: 'Portables', x: 7, y: 2 },
  { code: 'PT23', gal: 6500, type: 'portable', zone: 'Portables', x: 8, y: 2 },
  { code: 'PT14', gal: 6500, type: 'portable', zone: 'Portables', x: 9, y: 2 },
  { code: 'PT13', gal: 6500, type: 'portable', zone: 'Portables', x: 10, y: 2 },
  // E row 5,000 gal (E1 6,295)
  ...row('E', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [6295, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000], 'E row', 1, 4),
  // D row
  ...row('D', [1, 2, 3, 4, 5, 6, 7, 8], [6295, 6295, 6295, 9372, 9372, 12068, 12068, 6295], 'D row', 1, 5),
  { code: 'PT12b', gal: 6500, type: 'portable', zone: 'D row', x: 9, y: 5, status: 'active', note: 'Portable staged at end of D row' },
  // B row
  ...row('B', [1, 2, 3, 4, 5, 6, 7], [6295, 6295, 6295, 4575, 4575, 4575, 4575], 'B row', 1, 7),
  // L cubes, 595 gal
  ...row('L', [1, 2, 3, 4, 5, 6], 595, 'L cubes', 0, 9, { type: 'cube', jacketed: false }),
  ...row('L', [7, 8, 9, 10, 11], 595, 'L cubes', 0, 10, { type: 'cube', jacketed: false }),
  // East block: F, G, H, I 12,015 gal
  ...row('F', [8, 7, 6], 12015, 'East block', 12, 0).map((t, i) => ({ ...t, x: 12, y: i })),
  ...row('G', [8, 7, 6, 5], 12015, 'East block', 13, 0).map((t, i) => ({ ...t, x: 13, y: i })),
  ...row('H', [8, 7, 6, 5], 12015, 'East block', 14, 0).map((t, i) => ({ ...t, x: 14, y: i })),
  ...row('I', [8, 7, 6, 5], 12015, 'East block', 15, 0).map((t, i) => ({ ...t, x: 15, y: i })),
  { code: 'H1', gal: 12015, zone: 'Crush pad', x: 11, y: 4, jacketed: true, note: 'Open-top fermenter used at crush' },
  { code: 'H2', gal: 12015, zone: 'East block', x: 14, y: 5, jacketed: true },
  { code: 'H3', gal: 12015, zone: 'East block', x: 14, y: 6, jacketed: true },
  { code: 'H4', gal: 12015, zone: 'East block', x: 14, y: 7, jacketed: true },
  { code: 'I4', gal: 12015, zone: 'East block', x: 15, y: 4, jacketed: true, status: 'out-of-service', note: 'Cracked — do not fill' },
  { code: 'I3', gal: 12015, zone: 'East block', x: 15, y: 5, jacketed: true },
  { code: 'I2', gal: 12015, zone: 'East block', x: 15, y: 6, jacketed: true },
  { code: 'I1', gal: 12015, zone: 'East block', x: 15, y: 7, jacketed: true },
  { code: 'PT1', gal: 4000, type: 'portable', zone: 'East block', x: 13, y: 5 },
  { code: 'PT2', gal: 4000, type: 'portable', zone: 'East block', x: 13, y: 6 },
  { code: 'PT5', gal: 4000, type: 'portable', zone: 'East block', x: 13, y: 8 },
  // J & K large tanks
  ...row('J', [1, 2, 3], 14963, 'South tanks', 12, 10),
  ...row('K', [1, 2, 3], 11857, 'South tanks', 12, 11),
  // Totes
  ...row('TOTE', [1, 2, 3, 4, 5, 6, 7], 275, 'Totes', 10, 6, { type: 'tote', jacketed: false }).map((t, i) => ({ ...t, x: 10 + (i % 2), y: 6 + Math.floor(i / 2) })),
]

export function buildVessels(): Vessel[] {
  return TANK_SPECS.map((t) => ({
    id: `v_${t.code}`,
    orgId: ORG_ID,
    code: t.code,
    type: t.type ?? 'tank',
    capacityGal: t.gal,
    material: t.type === 'tote' || t.type === 'cube' ? 'poly' : 'stainless',
    jacketed: t.jacketed ?? false,
    geometry: estimateGeometry(t.gal, t.type ?? 'tank'),
    map: { zone: t.zone, x: t.x, y: t.y },
    status: t.status ?? 'active',
    notes: t.note,
  }))
}

// ------------------------------------------------------------------ vineyards
export const VINEYARDS: Vineyard[] = [
  { id: 'vy_bruella', orgId: ORG_ID, name: 'Lawson Bruella', estate: true, state: 'CA', county: 'San Joaquin', district: 'Lodi', ava: 'Lodi', acres: 42, address: 'Bruella Rd, Victor CA', notes: 'Estate ranch behind the winery.' },
  { id: 'vy_lewis', orgId: ORG_ID, name: 'Lewis Victor Road', grower: 'Lewis Family', estate: false, state: 'CA', county: 'San Joaquin', district: 'Lodi', ava: 'Lodi', acres: 18 },
  { id: 'vy_ogilvie', orgId: ORG_ID, name: 'Ogilvie Chenin Blanc', grower: 'Ogilvie Ranch', estate: false, state: 'CA', county: 'Yolo', ava: 'Clarksburg', acres: 12 },
  { id: 'vy_wilson', orgId: ORG_ID, name: 'Wilson Farms, Gorter Ranch', grower: 'Wilson Farms', estate: false, state: 'CA', county: 'Yolo', ava: 'Clarksburg', acres: 60 },
]

const poly = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

export const BLOCKS: Block[] = [
  { id: 'bk_bch_e', vineyardId: 'vy_bruella', name: 'Bottom Chard E', variety: 'Chardonnay', clone: '76', rootstock: '1103P', acres: 8.5, vines: 7200, plantedYear: 2009, rowSpacingFt: 10, vineSpacingFt: 5, shape: poly(8, 55, 40, 38), seasons: { 2025: { estYieldTons: 42, harvestDate: '2025-08-28' } } },
  { id: 'bk_bch_w', vineyardId: 'vy_bruella', name: 'Bottom Chard W', variety: 'Chardonnay', clone: '95', rootstock: '1103P', acres: 7.9, vines: 6700, plantedYear: 2009, rowSpacingFt: 10, vineSpacingFt: 5, shape: poly(52, 55, 40, 38), seasons: { 2025: { estYieldTons: 38, harvestDate: '2025-08-30' } } },
  { id: 'bk_tch', vineyardId: 'vy_bruella', name: 'Top Chard', variety: 'Chardonnay', clone: '4', rootstock: '101-14', acres: 9.2, vines: 7800, plantedYear: 2012, rowSpacingFt: 10, vineSpacingFt: 5, shape: poly(8, 8, 36, 40), seasons: { 2025: { estYieldTons: 45 } } },
  { id: 'bk_tml', vineyardId: 'vy_bruella', name: 'Top Merlot', variety: 'Merlot', clone: '181', rootstock: '101-14', acres: 8.1, vines: 6900, plantedYear: 2012, rowSpacingFt: 10, vineSpacingFt: 5, shape: poly(48, 8, 22, 40), seasons: { 2025: { estYieldTons: 36 } } },
  { id: 'bk_tzn', vineyardId: 'vy_bruella', name: 'Top Zin', variety: 'Zinfandel', clone: 'Primitivo 03', rootstock: 'St. George', acres: 8.3, vines: 5600, plantedYear: 2005, rowSpacingFt: 11, vineSpacingFt: 6, shape: poly(74, 8, 18, 40), seasons: { 2025: { estYieldTons: 30 } } },
  { id: 'bk_lewis_ba', vineyardId: 'vy_lewis', name: 'Barbera', variety: 'Barbera', acres: 18, vines: 14500, plantedYear: 2001, shape: poly(10, 10, 80, 80), seasons: { 2025: { estYieldTons: 95, harvestDate: '2025-08-13' } } },
  { id: 'bk_ogl_chb', vineyardId: 'vy_ogilvie', name: 'Chenin Blanc', variety: 'Chenin Blanc', acres: 12, vines: 9800, plantedYear: 1998, shape: poly(10, 10, 80, 80), seasons: { 2025: { estYieldTons: 70, harvestDate: '2025-08-29' } } },
  { id: 'bk_wil_71a', vineyardId: 'vy_wilson', name: '71A', variety: 'Sauvignon Blanc', clone: '1', rootstock: '5C', acres: 32, vines: 26000, plantedYear: 2015, shape: poly(10, 10, 50, 80), seasons: { 2025: { estYieldTons: 190, harvestDate: '2025-09-12' } } },
  { id: 'bk_wil_71b', vineyardId: 'vy_wilson', name: '71B', variety: 'Sauvignon Blanc', clone: 'Musqué', rootstock: '5C', acres: 28, vines: 22500, plantedYear: 2016, shape: poly(62, 10, 28, 80), seasons: { 2025: { estYieldTons: 160 } } },
]

// ------------------------------------------------------------------ materials (from the Materials screen + additions seen in histories)
type M = [string, Material['category'], string, number, number?, string?]
const MATERIALS: M[] = [
  ['Acide Lactique', 'Acid', 'L', 2.0, 40.79],
  ['Ascorbic Acid', 'Acid', 'kg', 20.8, 227.26],
  ['Malic Acid', 'Acid', 'kg', 9.4],
  ['Tartaric Acid', 'Acid', 'kg', 600, 4194.0],
  ['Scottzyme Cinn Free', 'Enzyme', 'kg', 1.0],
  ['EnartisZym Arom MP', 'Enzyme', 'kg', 20.5, 5251.0],
  ['Endozym Ice', 'Enzyme', 'L', 0.6, 73.0],
  ['Lysis UC', 'Enzyme', 'kg', 5.35],
  ['Scottzyme Pec5L', 'Enzyme', 'L', 0],
  ['Lysis Grenat', 'Enzyme', 'kg', 0],
  ['Lafazym CL', 'Enzyme', 'kg', 0],
  ['EnartisZym RS', 'Enzyme', 'kg', 10.0, 1659.5],
  ['KWK Krystal Klear Bentonite', 'Fining', 'kg', 0],
  ['BentoGran', 'Fining', 'lb', 72, 310.0],
  ['SO2 - KMBS', 'Preservative', 'lb', 48.5, 412.0, 'Potassium metabisulfite ~57% SO₂. 27 CFR 24.246: total SO₂ ≤ 350 ppm.'],
  ['Copper Sulfate', 'Fining', 'g', 610, 95.0, '27 CFR 24.246: ≤ 6 ppm Cu added; residual ≤ 0.5 ppm.'],
  ['Fermaid K', 'Nutrient', 'lb', 30, 420.0],
  ['Diammonium phosphate', 'Nutrient', 'lb', 44, 180.0, '≤ 8 lb per 1,000 gal (27 CFR 24.246).'],
  ['Red Star Premier Cuvee', 'Yeast', 'lb', 12, 260.0],
  ['Start YSP', 'Yeast', 'kg', 5, 410.0],
  ['Thiol Rouge', 'Yeast', 'kg', 2, 520.0],
  ['Vivactive Arome', 'Nutrient', 'kg', 8.8, 640.0],
  ['Charm Elevage', 'Nutrient', 'kg', 4.9, 385.0],
  ['Oenotannin Oenogal', 'Tannin', 'kg', 6, 720.0],
  ['Oenotannin Perfect', 'Tannin', 'g', 860, 240.0],
  ['Stabivin SP', 'Stabilizer', 'L', 7.2, 530.0],
  ['EBX no13', 'Oak', 'L', 4, 380.0],
  ['EBX no14', 'Oak', 'L', 2.7, 260.0],
  ['EBX no22', 'Oak', 'L', 1.1, 110.0],
  ['EB Goud-Ron', 'Oak', 'L', 2.9, 290.0],
  ['Vino Rosso', 'Oak', 'gal', 11.2, 1650.0, 'Liquid oak extract'],
  ['DANMIL 30', 'Oak', 'ea', 180, 2700.0, 'Oak stave segments'],
  ['DANMIL 50', 'Oak', 'ea', 133, 2400.0],
  ['DANMIL 70', 'Oak', 'ea', 147, 2600.0],
  ['DANMIL 130', 'Oak', 'ea', 66, 1800.0],
  ['Viniflora Oenos (ML)', 'Malolactic', 'ea', 6, 540.0],
]

export function buildMaterials(): Material[] {
  return MATERIALS.map(([name, category, unit, onHand, cost, limit]) => ({
    id: `m_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    orgId: ORG_ID,
    name,
    category,
    unit,
    onHand,
    reorderPoint: category === 'Preservative' ? 20 : undefined,
    batches: onHand > 0 ? [{ id: newId('mb'), qty: onHand, receivedAt: daysAgo(90), costTotal: cost, supplier: 'Scott Labs' }] : [],
    limit,
  }))
}

export const PACKAGING: PackagingItem[] = [
  { id: 'pk_1', orgId: ORG_ID, name: '750 mL Bordeaux, antique green, punted', kind: 'bottle', unit: 'ea', onHand: 14400, reorderPoint: 6000, costPerUnit: 0.92 },
  { id: 'pk_2', orgId: ORG_ID, name: '750 mL Burgundy, flint', kind: 'bottle', unit: 'ea', onHand: 6000, reorderPoint: 3000, costPerUnit: 0.88 },
  { id: 'pk_3', orgId: ORG_ID, name: 'Natural cork 49×24, grade 1', kind: 'closure', unit: 'ea', onHand: 20000, reorderPoint: 5000, costPerUnit: 0.41 },
  { id: 'pk_4', orgId: ORG_ID, name: 'Stelvin Lux screwcap, matte black', kind: 'closure', unit: 'ea', onHand: 9000, reorderPoint: 4000, costPerUnit: 0.19 },
  { id: 'pk_5', orgId: ORG_ID, name: 'Tin capsule, burgundy', kind: 'capsule', unit: 'ea', onHand: 11000, reorderPoint: 4000, costPerUnit: 0.14 },
  { id: 'pk_6', orgId: ORG_ID, name: '12-bottle shipper, kraft', kind: 'case', unit: 'ea', onHand: 1800, reorderPoint: 500, costPerUnit: 1.35 },
]

export const CASE_GOODS: CaseGoodsItem[] = [
  { id: 'cg_1', orgId: ORG_ID, sku: 'MN-PN-23', description: 'Mark Nicholas Pinot Noir 2023', lotId: undefined, bottledAt: '2026-05-20', bottleSizeMl: 750, bottlesPerCase: 12, casesOnHand: 210, location: 'Bonded warehouse A', taxpaid: false },
  { id: 'cg_2', orgId: ORG_ID, sku: 'WRV-CH-22', description: 'WRV Chardonnay 2022', bottledAt: '2025-11-04', bottleSizeMl: 750, bottlesPerCase: 12, casesOnHand: 64, location: 'Tasting room', taxpaid: true },
]

// ------------------------------------------------------------------ crush log (matches the compositions)
export const CRUSH: CrushRecord[] = [
  { id: 'cr_1', orgId: ORG_ID, date: '2025-08-13T07:40:00.000Z', vineyardId: 'vy_lewis', vineyardName: 'Lewis Victor Road', blockId: 'bk_lewis_ba', blockName: 'Barbera', variety: 'Barbera', tons: 43.4, weighTag: 'WT-25-0142', brix: 20.7, ph: 3.41, ta: 7.1, temperatureF: 62, destinationLotId: undefined, destinationVesselId: 'v_H1', process: 'destem-crush', pricePerTon: 650, state: 'CA', county: 'San Joaquin', district: 'Lodi', ava: 'Lodi', notes: 'Picked overnight; fruit clean.' },
  { id: 'cr_2', orgId: ORG_ID, date: '2025-08-29T06:55:00.000Z', vineyardId: 'vy_ogilvie', vineyardName: 'Ogilvie Chenin Blanc', blockId: 'bk_ogl_chb', blockName: 'Chenin Blanc', variety: 'Chenin Blanc', tons: 0.12, weighTag: 'WT-25-0171', brix: 22.6, ph: 3.22, ta: 7.9, process: 'whole-cluster press', pricePerTon: 900, state: 'CA', county: 'Yolo', ava: 'Clarksburg', notes: 'Small topping lot.' },
  { id: 'cr_3', orgId: ORG_ID, date: '2025-09-12T05:30:00.000Z', vineyardId: 'vy_wilson', vineyardName: 'Wilson Farms, Gorter Ranch', blockId: 'bk_wil_71a', blockName: '71A', variety: 'Sauvignon Blanc', tons: 9.0, weighTag: 'WT-25-0203', brix: 23.2, ph: 3.18, ta: 8.4, process: 'whole-cluster press', pricePerTon: 1050, state: 'CA', county: 'Yolo', ava: 'Clarksburg', notes: 'Load 1 of 2.' },
  { id: 'cr_4', orgId: ORG_ID, date: '2025-09-12T08:10:00.000Z', vineyardId: 'vy_wilson', vineyardName: 'Wilson Farms, Gorter Ranch', blockId: 'bk_wil_71a', blockName: '71A', variety: 'Sauvignon Blanc', tons: 9.1, weighTag: 'WT-25-0204', brix: 23.2, ph: 3.2, ta: 8.2, process: 'whole-cluster press', pricePerTon: 1050, state: 'CA', county: 'Yolo', ava: 'Clarksburg', notes: 'Load 2 of 2.' },
]

// ------------------------------------------------------------------ build the org data
export function buildVictorVineyards(): OrgData {
  const vessels = buildVessels()
  const vesselByCode = (code: string) => vessels.find((v) => v.code === code)
  const lots: OrgData['lots'] = []
  const events: OrgData['events'] = []
  const extraVessels: Vessel[] = []
  const warnings: string[] = []

  for (const code of Object.keys(LOT_HISTORY_CSV)) {
    const res = importBlendedLot({
      orgId: ORG_ID,
      code,
      historyCsv: LOT_HISTORY_CSV[code],
      compositionCsv: LOT_COMPOSITION_CSV[code],
      idGen: newId,
      vesselByCode,
    })
    warnings.push(...res.warnings)
    // create any barrel groups / virtual groups / unknown vessels the history references
    for (const vc of res.vesselCodes) {
      if (vesselByCode(vc) || extraVessels.some((v) => v.code === vc)) continue
      const isBG = /-BG$/.test(vc)
      const isVG = /-VG$|^VG-/.test(vc)
      const isTIB = /Transfer In Bond/i.test(vc)
      if (isTIB) continue // not a vessel — it is a removal
      extraVessels.push({
        id: `v_${vc}`,
        orgId: ORG_ID,
        code: vc,
        name: isBG ? `${vc.replace(/-BG$/, '')} barrels` : undefined,
        type: isBG ? 'barrel-group' : isVG ? 'virtual' : 'tank',
        capacityGal: isBG ? 60 * 20 : isVG ? 20000 : 6000,
        barrelCount: isBG ? 13 : undefined,
        material: isBG ? 'oak' : 'stainless',
        map: { zone: isBG ? 'Barrel room' : 'Unplaced', x: 0, y: 0 },
        status: 'active',
        notes: isBG ? 'Barrel group imported from Blended' : isVG ? 'Virtual group imported from Blended' : undefined,
      })
    }
    // resolve holds (vessel codes → ids); default the bond to the winery's own
    if (!res.lot.bondNumber) res.lot.bondNumber = ORGANIZATION.bondNumber
    res.lot.holds = res.lot.holds.map((h) => ({ vesselId: `v_${h.vesselId}`, gallons: h.gallons }))
    for (const e of res.events) {
      if (e.fromVesselId) e.fromVesselId = `v_${e.fromVesselId}`
      if (e.toVesselId) e.toVesselId = `v_${e.toVesselId}`
      if (e.vesselIds) e.vesselIds = e.vesselIds.map((v) => `v_${v}`)
    }
    lots.push(res.lot)
    events.push(...res.events)
  }

  // barrel groups: fix capacity/barrel count to match what they hold
  for (const v of extraVessels) {
    if (v.type !== 'barrel-group') continue
    const held = lots.flatMap((l) => l.holds).filter((h) => h.vesselId === v.id).reduce((s, h) => s + h.gallons, 0)
    v.barrelCount = Math.max(1, Math.ceil(held / 59.4))
    v.capacityGal = Math.round(v.barrelCount * 59.4)
  }
  // lay out barrel groups in the barrel room
  extraVessels.filter((v) => v.type === 'barrel-group').forEach((v, i) => (v.map = { zone: 'Barrel room', x: 17 + (i % 2), y: Math.floor(i / 2) }))
  extraVessels.filter((v) => v.type === 'virtual').forEach((v, i) => (v.map = { zone: 'Virtual / off-site', x: 17 + (i % 2), y: 6 + Math.floor(i / 2) }))

  // link crush records to the lots they created
  const lotByCode = new Map(lots.map((l) => [l.code, l]))
  CRUSH[0].destinationLotId = lotByCode.get('GRUBA25-01')?.id
  CRUSH[1].destinationLotId = lotByCode.get('OGLSB25-01')?.id
  CRUSH[2].destinationLotId = lotByCode.get('OGLSB25-01')?.id
  CRUSH[3].destinationLotId = lotByCode.get('OGLSB25-01')?.id
  CASE_GOODS[0].lotId = lotByCode.get('MNPN23-01')?.id
  CASE_GOODS[1].lotId = lotByCode.get('WRVCH22-02')?.id

  // private notes examples (winemaker's notes are not part of the official record)
  const gru = lotByCode.get('GRUBA25-01')
  if (gru) {
    gru.privateNotes = 'Barrels are 2nd/3rd fill French. Tannin feels soft — consider a Perfect add before bottling. Taste again mid-July.'
    gru.officialNotes = 'Lodi Barbera, Lewis Victor Road. Press fraction returned 9/9.'
  }
  const ogl = lotByCode.get('OGLSB25-01')
  if (ogl) {
    ogl.privateNotes = 'Copper trials showed reductive note resolves at 0.3 ppm. Hold ascorbic until bottling.'
  }

  // tasks for the coming days
  const tasks: Task[] = [
    { id: 't_1', orgId: ORG_ID, title: 'Free SO₂ check — all aging lots', kind: 'measurement', dueAt: daysAhead(1), assigneeId: 'u_cellar', status: 'open', instructions: 'Target 28–32 ppm molecular 0.5. Record in Vatroom, add KMBS if under 25 ppm.', recurrenceDays: 21 },
    { id: 't_2', orgId: ORG_ID, title: 'Top barrels GRUBA25-01', kind: 'topping', lotId: gru?.id, vesselId: 'v_GRUBA25-01-BG', dueAt: daysAhead(2), assigneeId: 'u_cellar', status: 'open', recurrenceDays: 14 },
    { id: 't_3', orgId: ORG_ID, title: 'Rack OGLSB25-01 off lees E10 → B6', kind: 'racking', lotId: ogl?.id, vesselId: 'v_E10', dueAt: daysAhead(4), assigneeId: 'u_cellar', status: 'open', instructions: 'Gas B6 first. Pull a sample before and after for turbidity.' },
    { id: 't_4', orgId: ORG_ID, title: 'CIP tanks K1–K3 before harvest', kind: 'cleaning', dueAt: daysAhead(6), assigneeId: 'u_cellar', status: 'open' },
    { id: 't_5', orgId: ORG_ID, title: 'Pull bottling samples MNPN23-01 for lab', kind: 'sampling', lotId: lotByCode.get('MNPN23-01')?.id, dueAt: daysAhead(-1), assigneeId: 'u_wm', status: 'open', instructions: 'Full panel: alc, RS, FSO2/TSO2, VA, malic, cold/heat stability.' },
    { id: 't_6', orgId: ORG_ID, title: 'Submit TTB 5120.17', kind: 'other', dueAt: iso(new Date(now.getFullYear(), now.getMonth(), 15)), assigneeId: 'u_comp', status: 'open', recurrenceDays: 30 },
    { id: 't_7', orgId: ORG_ID, title: 'Pump-over schedule review — fermenters', kind: 'pump-over', dueAt: daysAgo(3), assigneeId: 'u_wm', status: 'done', completedAt: daysAgo(3) },
  ]

  // costs
  const costs: CostEntry[] = []
  const addCost = (lotCode: string, date: string, category: CostEntry['category'], amount: number, description: string, vendor?: string, qbRef?: string) => {
    costs.push({ id: newId('c'), orgId: ORG_ID, lotId: lotByCode.get(lotCode)?.id, date, category, amount, description, vendor, qbRef, synced: !!qbRef })
  }
  addCost('GRUBA25-01', '2025-08-13', 'fruit', 43.4 * 650, 'Barbera, 43.4 t @ $650/t — Lewis Victor Road', 'Lewis Family Farms', 'Bill #10342')
  addCost('GRUBA25-01', '2025-08-19', 'materials', 1180, 'Yeast, nutrients, tannin for primary', 'Scott Laboratories', 'Bill #10351')
  addCost('GRUBA25-01', '2026-03-17', 'barrels', 2600, '13 barrels, 2nd fill, 12 mo program', 'Tonnellerie Quintessence')
  addCost('OGLSB25-01', '2025-09-12', 'fruit', 18.1 * 1050, 'Sauvignon Blanc 71A, 18.1 t @ $1,050/t', 'Wilson Farms', 'Bill #10388')
  addCost('OGLSB25-01', '2025-08-29', 'fruit', 0.12 * 900, 'Chenin Blanc topping lot', 'Ogilvie Ranch', 'Bill #10370')
  addCost('OGLSB25-01', '2025-09-18', 'materials', 640, 'Fermaid K, DAP, Premier Cuvée', 'Scott Laboratories', 'Bill #10395')
  addCost('OGLSB25-01', '2026-02-25', 'materials', 310, 'BentoGran 28 lb', 'Gusmer')
  addCost('LSAVCS23-01', '2023-09-15', 'bulk wine', 970 * 9.5 + 124 * 8.0, 'Alexander Valley Cab/Merlot bulk, 1,094 gal', 'Turrentine Brokerage', 'Bill #9821')
  addCost('MNPN23-01', '2025-09-18', 'bulk wine', 1645 * 11.25, 'Pinot Noir bulk 1,645 gal', 'Ciatti', 'Bill #10399')
  addCost('MNPN23-01', '2025-09-26', 'materials', 420, 'Vino Rosso 7.8 gal', 'Vinquiry')
  addCost('MNATP21-01W', '2025-08-20', 'storage', 5690 * 0.07 * 3, 'Bulk storage Q3 @ $0.07/gal/mo', undefined)
  addCost('WRVCH22-02', '2026-05-04', 'storage', 6500 * 0.07 * 3, 'Bulk storage Q2 @ $0.07/gal/mo')
  for (const code of ['GRUBA25-01', 'OGLSB25-01', 'MNPN23-01', 'MNARR17-02']) addCost(code, '2026-06-30', 'labor', 1850, 'Cellar labor allocation, June', undefined, 'JE #2206')
  costs.push({ id: newId('c'), orgId: ORG_ID, date: '2026-06-30', category: 'overhead', amount: 4200, description: 'Utilities & glycol, June (unallocated)', vendor: 'PG&E', qbRef: 'Bill #10611', synced: true })

  const data: OrgData = {
    vineyards: VINEYARDS,
    blocks: BLOCKS,
    vessels: [...vessels, ...extraVessels],
    lots,
    events,
    crush: CRUSH,
    materials: buildMaterials(),
    packaging: PACKAGING,
    caseGoods: CASE_GOODS,
    tasks,
    costs,
    audit: [{ id: newId('a'), orgId: ORG_ID, at: iso(now), action: 'import', entity: 'workspace', details: `Imported ${lots.length} lots and ${events.length} events from Blended exports${warnings.length ? ` (${warnings.length} reconciliations)` : ''}` }],
  }
  if (warnings.length) console.info('[vatroom] import reconciliations:', warnings)
  return data
}

export function buildEmptyOrg(orgId: string): OrgData {
  return {
    vineyards: [],
    blocks: [],
    vessels: Array.from({ length: 6 }, (_, i) => ({
      id: `${orgId}_v_T${i + 1}`,
      orgId,
      code: `T${i + 1}`,
      type: 'tank' as const,
      capacityGal: 2500,
      material: 'stainless' as const,
      jacketed: true,
      geometry: estimateGeometry(2500, 'tank'),
      map: { zone: 'Cellar', x: i % 3, y: Math.floor(i / 3) },
      status: 'active' as const,
    })),
    lots: [],
    events: [],
    crush: [],
    materials: [],
    packaging: [],
    caseGoods: [],
    tasks: [],
    costs: [],
    audit: [],
  }
}

export function buildSeedSnapshot(): WorkspaceSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    organizations: [ORGANIZATION, DEMO_ORG_2],
    users: USERS,
    data: { [ORG_ID]: buildVictorVineyards(), org_demo2: buildEmptyOrg('org_demo2') },
  }
}
