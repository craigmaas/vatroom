/**
 * Vatroom domain model.
 *
 * Everything is scoped to an Organization (a winery). All ids are strings so the
 * model can move to a cloud database without renumbering. Dates are ISO strings.
 */
export type ID = string
export type ISODate = string

// ---------------------------------------------------------------- tenancy
export type Role = 'owner' | 'winemaker' | 'cellar' | 'compliance' | 'viewer'

export interface Organization {
  id: ID
  name: string
  /** Legal name shown on federal forms */
  legalName: string
  /** TTB bonded winery number, e.g. BWN-CA-6182 */
  bondNumber: string
  /** TTB registry / permit number, if different */
  permitNumber?: string
  /** State alcohol license (e.g. California ABC Type 02 Winegrower) */
  stateLicense?: string
  address: string
  city: string
  state: string
  zip: string
  timezone: string
  /** Operations report filing frequency per 27 CFR 24.300 */
  reportFrequency: 'monthly' | 'quarterly' | 'annual'
  createdAt: ISODate
}

export interface User {
  id: ID
  name: string
  email: string
  initials: string
  memberships: { orgId: ID; role: Role }[]
}

// ---------------------------------------------------------------- vineyards
export interface Vineyard {
  id: ID
  orgId: ID
  name: string
  grower?: string
  contact?: string
  estate: boolean
  address?: string
  state: string
  county: string
  district?: string
  ava?: string
  acres?: number
  notes?: string
}

export interface Block {
  id: ID
  vineyardId: ID
  name: string
  variety: string
  clone?: string
  rootstock?: string
  acres?: number
  vines?: number
  plantedYear?: number
  rowSpacingFt?: number
  vineSpacingFt?: number
  /** Season estimates (keyed by vintage year) */
  seasons?: Record<number, BlockSeason>
  /** Normalised polygon on a 0..100 canvas for the vineyard map */
  shape?: { x: number; y: number }[]
  color?: string
}

export interface BlockSeason {
  estYieldTons?: number
  harvestDate?: ISODate
  clustersPerVine?: number
  clusterWeightG?: number
  dropWeightTons?: number
  notes?: string
}

// ---------------------------------------------------------------- cellar
export type VesselType =
  | 'tank'
  | 'portable'
  | 'tote'
  | 'cube'
  | 'bin'
  | 'barrel'
  | 'barrel-group'
  | 'virtual'

export type BottomType = 'flat' | 'cone' | 'dish' | 'slope'

export interface VesselGeometry {
  /** inside diameter, inches */
  diameterIn: number
  /** straight sidewall height, inches */
  sidewallIn: number
  bottom: BottomType
  /** height of cone / depth of dish / rise of sloped floor, inches */
  bottomHeightIn: number
  /** depth of the top dish (if any), inches — used for ullage math */
  topDishIn?: number
  /** fixed height of the manway/dome above sidewall, inches */
  /** Set when geometry was estimated from capacity rather than measured */
  estimated?: boolean
}

export interface StrappingPoint {
  heightIn: number
  gallons: number
}

export interface Vessel {
  id: ID
  orgId: ID
  code: string
  name?: string
  type: VesselType
  capacityGal: number
  material?: 'stainless' | 'oak' | 'concrete' | 'poly' | 'other'
  jacketed?: boolean
  variableCapacity?: boolean
  geometry?: VesselGeometry
  /** Manufacturer strapping chart — overrides geometry when present */
  strapping?: StrappingPoint[]
  /** Position on the tank map (grid units) */
  map: { zone: string; x: number; y: number }
  status: 'active' | 'out-of-service' | 'cleaning' | 'retired'
  notes?: string
  barrelCount?: number
}

// ---------------------------------------------------------------- lots
export type LotStage =
  | 'Intake'
  | 'Processing'
  | 'Cold soak'
  | 'Fermentation'
  | 'Post-fermentation'
  | 'Malolactic fermentation'
  | 'Aging'
  | 'Blending'
  | 'Stabilization'
  | 'Bottling ready'
  | 'Bottled'
  | 'Shipped'
  | 'Closed'

export type TaxClass =
  | 'still ≤16%'
  | 'still 16–21%'
  | 'still 21–24%'
  | 'artificially carbonated'
  | 'sparkling'
  | 'hard cider'

export type WineColor = 'red' | 'white' | 'rosé' | 'other'

export interface LotComponent {
  id: ID
  sourceName: string
  volumeGal: number
  type: 'Grapes' | 'Bulk Wine' | 'Juice' | 'Concentrate' | 'Other'
  variety: string
  vintage: number | 'NV'
  clone?: string
  dateReceived?: ISODate
  pickBrix?: number
  vineyardId?: ID
  vineyardName?: string
  state?: string
  county?: string
  district?: string
  ava?: string
  estate: boolean
  notes?: string
}

export interface VesselHold {
  vesselId: ID
  gallons: number
}

export interface Lot {
  id: ID
  orgId: ID
  code: string
  name?: string
  /** Brand/client prefix parsed from the code (custom-crush programs) */
  client?: string
  marketingName?: string
  vintage: number | 'NV'
  variety: string
  color: WineColor
  stage: LotStage
  taxClass: TaxClass
  bondNumber: string
  fermentationPlan?: string
  tags: string[]
  components: LotComponent[]
  /** Current physical location(s) of the wine */
  holds: VesselHold[]
  status: 'active' | 'archived'
  createdAt: ISODate
  updatedAt: ISODate
  /** Notes that are part of the official record (auditable) */
  officialNotes?: string
  /** Winemaker's private working notes (not exported in compliance packets) */
  privateNotes?: string
  /** Target ABV % if known */
  abv?: number
}

export type EventKind =
  | 'created'
  | 'transfer'
  | 'addition'
  | 'measurement'
  | 'loss'
  | 'gain'
  | 'split'
  | 'combine'
  | 'press'
  | 'crush'
  | 'operation'
  | 'stage'
  | 'update'
  | 'note'
  | 'bottling'
  | 'transfer-in-bond'
  | 'taxpaid-removal'
  | 'receipt'

export interface Addition {
  material: string
  qty: number
  unit: string
  /** computed dose e.g. "23 ppm" */
  rate?: string
}

export type Analyte =
  | 'brix'
  | 'ph'
  | 'ta'
  | 'freeSO2'
  | 'totalSO2'
  | 'va'
  | 'alcohol'
  | 'temp'
  | 'rs'
  | 'malic'
  | 'dissolvedO2'
  | 'turbidity'

export interface Measurement {
  analyte: Analyte
  value: number
  unit: string
}

export interface LotEvent {
  id: ID
  orgId: ID
  lotId: ID
  at: ISODate
  kind: EventKind
  /** Human summary in the same grammar Blended uses, e.g. "Transferred 780 gal from D4 to GRUBA25-01-BG" */
  summary: string
  gallons?: number
  fromVesselId?: ID
  toVesselId?: ID
  relatedLotId?: ID
  additions?: Addition[]
  measurements?: Measurement[]
  vesselIds?: ID[]
  notes?: string
  /** Part of the official production record */
  official: boolean
  createdBy?: ID
  volumeAfterGal?: number
  reason?: string
}

// ---------------------------------------------------------------- harvest
export interface CrushRecord {
  id: ID
  orgId: ID
  date: ISODate
  vineyardId?: ID
  vineyardName: string
  blockId?: ID
  blockName?: string
  variety: string
  tons: number
  weighTag?: string
  brix?: number
  ph?: number
  ta?: number
  temperatureF?: number
  destinationLotId?: ID
  destinationVesselId?: ID
  process: 'destem-crush' | 'whole-cluster press' | 'whole-berry' | 'direct press' | 'carbonic'
  pricePerTon?: number
  state: string
  county: string
  district?: string
  ava?: string
  notes?: string
}

// ---------------------------------------------------------------- inventory
export type MaterialCategory =
  | 'Acid'
  | 'Enzyme'
  | 'Fining'
  | 'Nutrient'
  | 'Oak'
  | 'Preservative'
  | 'Stabilizer'
  | 'Tannin'
  | 'Yeast'
  | 'Malolactic'
  | 'Other'

export interface MaterialBatch {
  id: ID
  lotNumber?: string
  qty: number
  receivedAt: ISODate
  costTotal?: number
  supplier?: string
  expiresAt?: ISODate
}

export interface Material {
  id: ID
  orgId: ID
  name: string
  category: MaterialCategory
  unit: string
  onHand: number
  reorderPoint?: number
  batches: MaterialBatch[]
  /** 27 CFR 24.246 limitation text if any */
  limit?: string
  notes?: string
}

export interface PackagingItem {
  id: ID
  orgId: ID
  name: string
  kind: 'bottle' | 'closure' | 'capsule' | 'label' | 'case' | 'other'
  unit: string
  onHand: number
  reorderPoint?: number
  costPerUnit?: number
}

export interface CaseGoodsItem {
  id: ID
  orgId: ID
  sku: string
  description: string
  lotId?: ID
  bottledAt?: ISODate
  bottleSizeMl: number
  bottlesPerCase: number
  casesOnHand: number
  location: string
  taxpaid: boolean
}

// ---------------------------------------------------------------- work
export type TaskKind =
  | 'addition'
  | 'measurement'
  | 'transfer'
  | 'topping'
  | 'pump-over'
  | 'punch-down'
  | 'racking'
  | 'cleaning'
  | 'sampling'
  | 'bottling'
  | 'other'

export interface Task {
  id: ID
  orgId: ID
  title: string
  kind: TaskKind
  lotId?: ID
  vesselId?: ID
  dueAt: ISODate
  assigneeId?: ID
  status: 'open' | 'done' | 'skipped'
  instructions?: string
  completedAt?: ISODate
  recurrenceDays?: number
}

// ---------------------------------------------------------------- finance
export type CostCategory =
  | 'fruit'
  | 'bulk wine'
  | 'materials'
  | 'labor'
  | 'barrels'
  | 'packaging'
  | 'overhead'
  | 'storage'
  | 'lab'
  | 'other'

export interface CostEntry {
  id: ID
  orgId: ID
  lotId?: ID
  date: ISODate
  category: CostCategory
  amount: number
  description: string
  vendor?: string
  /** QuickBooks bill / invoice reference */
  qbRef?: string
  synced?: boolean
}

// ---------------------------------------------------------------- audit log
export interface AuditEntry {
  id: ID
  orgId: ID
  at: ISODate
  userId?: ID
  action: string
  entity: string
  entityId?: ID
  details?: string
}

// ---------------------------------------------------------------- root state
export interface OrgData {
  vineyards: Vineyard[]
  blocks: Block[]
  vessels: Vessel[]
  lots: Lot[]
  events: LotEvent[]
  crush: CrushRecord[]
  materials: Material[]
  packaging: PackagingItem[]
  caseGoods: CaseGoodsItem[]
  tasks: Task[]
  costs: CostEntry[]
  audit: AuditEntry[]
}

export interface WorkspaceSnapshot {
  version: number
  organizations: Organization[]
  users: User[]
  data: Record<ID, OrgData>
}
