# Vatroom

Winery production, cellar, vineyard and compliance management — built for many wineries, piloted with Victor Vineyards.

**Live demo:** https://craigmaas.github.io/vatroom/ (sign in with any demo account; data is stored in your browser)

## What it does

| Area | Highlights |
|---|---|
| **Lots** | Full production record per lot (transfers, additions with computed dose rates, lab readings, losses/gains, splits, combines, bottling, transfers in bond, taxpaid removals). Timeline, chemistry trends, additions ledger, lineage graph, official vs. winemaker‑private notes, cost build‑up. |
| **Composition & labelling** | Origin shares by variety / AVA / vineyard / vintage, and a live **label‑eligibility check** (27 CFR Part 4 thresholds: 75% varietal, 85/95% vintage, 85% AVA, 100% CA, estate). |
| **Tank map** | Drag‑to‑arrange cellar board seeded from the whiteboard (A–M rows, PTs, L cubes, totes, barrel groups). Click a tank for contents, specs, and quick actions. Add/edit vessels with geometry or a manufacturer strapping chart. |
| **Tank calculator** | Dip‑from‑top / height‑from‑bottom → gallons, or target gallons → fill height. Exact cone/dish/slope bottom math or strapping‑chart interpolation, cross‑section drawing, printable strapping table, one‑click "record as shortage/overage". |
| **Harvest & crush** | Weigh‑tag log (tons, Brix, pH, TA, process, price) that writes crush events, pick chemistry, estimated juice volume and an origin component onto the destination lot. |
| **Vineyards** | Vineyards and blocks (variety, clone, rootstock, spacing, yield estimates per season) with an editable SVG block map. |
| **Inventory** | Additives/materials with batches, reorder points, 12‑month usage, TTB limits; packaging; case goods (in bond vs. taxpaid). Additions decrement stock automatically. |
| **Work orders** | Assignable, recurring tasks tied to lots/vessels; printable daily worksheet; dashboard checklist. |
| **Compliance** | TTB F 5120.17 worksheet computed from the event log by tax class (with book vs. physical shortage/overage), TTB F 5000.24 excise with CBMA credits, California Grape Crush Report and CDTFA winegrower return, 27 CFR 24.301/24.315/24.302 record exports, one‑click **audit packet**, and an independent audit trail. |
| **Costs & QuickBooks** | Costs tagged to lots, overhead spread by gallons, $/gal, $/bottle, $/case; export unsynced entries as classed QuickBooks journal lines. |
| **Multi‑winery** | Organizations with role‑based membership (owner, winemaker, cellar, compliance, viewer); organization switcher; per‑org data. |
| **Import** | A real **Blended** importer parses lot‑history and composition CSV exports (the same files in `/docs`) and replays them into typed events and vessel holds. |

## Stack

- Vite 8 · React 19 · TypeScript · Tailwind CSS v4 · React Router 7 · Zustand · lucide‑react · date‑fns
- No chart library — small, dependency‑free SVG charts built to a validated, colour‑blind‑safe palette (light and dark).
- Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

## Running locally

```bash
cd app
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build to app/dist
npm run check:import # replay the Blended exports through the importer and print the result
```

## Architecture

```
app/src
├── domain/        pure logic, no React: types, tank geometry, labelling rules, lot codes, compliance math, units
├── importers/     CSV + Blended action-grammar parser (also used by the in-app "Import from Blended")
├── data/          raw Blended exports (generated from /docs) and the seed builder (tanks, vineyards, materials…)
├── storage/       the persistence shim — StorageAdapter interface, LocalStorageAdapter, CloudAdapter scaffold
├── store/         one Zustand store: session, org data, every mutation (writes events + audit log, persists)
├── components/    design system (ui.tsx), charts, app shell, command palette
└── features/      one folder per screen
```

### Data model (short version)

`Organization` → `OrgData` { vineyards, blocks, vessels, lots, events, crush, materials, packaging, caseGoods, tasks, costs, audit }.

A **Lot** holds its current state (`holds: [{vesselId, gallons}]`, stage, tax class, composition). Every change is also appended as a **LotEvent** (`kind`, `summary`, gallons, from/to vessel, additions, measurements, `official`, `volumeAfterGal`). Compliance reports are computed purely from events, so any period can be regenerated and every number traced.

### Storage shim → cloud

The UI never touches storage directly. The store talks to a single `StorageAdapter`:

```ts
interface StorageAdapter {
  load(): Promise<WorkspaceSnapshot | null>
  save(snapshot: WorkspaceSnapshot): Promise<void>
  patch?(orgId, collection, upsert, removeIds): Promise<void>   // deltas, for the cloud
  clear(): Promise<void>
  subscribe?(onChange): () => void                              // live updates
}
```

Today `createAdapter()` returns `LocalStorageAdapter` (browser `localStorage`, cross‑tab sync). For launch, build `VITE_STORAGE=cloud VITE_API_URL=https://api…` and `CloudAdapter` (REST + bearer token, scaffolded in `storage/cloud-adapter.ts`) takes over with no UI changes. Authentication is a local stand‑in; swap `signIn` in the store for your identity provider.

### Mobile & offline

Native iOS and Android apps are a launch requirement: a cellar hand must be able to record a transfer, addition or dip reading with no signal and have it sync automatically when the phone is back on wifi. The data model was shaped for that:

- **Events are the unit of sync.** Every mutation is an appended `LotEvent` / audit entry, never an in‑place edit, so an offline device accumulates an ordered *outbox* of events rather than a conflicting copy of the whole state. `StorageAdapter.patch()` is the upload primitive; `subscribe()` is the download side.
- **Current state is derived.** `Lot.holds`, stages and inventory balances can always be rebuilt by replaying events, so the server re‑derives them after merging outboxes from several devices and the apps simply accept the result. Two people topping the same tank offline produce two events, not a lost write.
- **One domain, three shells.** `domain/`, `importers/` and `store/` are plain TypeScript with no browser or DOM dependency, so the mobile apps (Capacitor or Expo) share them unchanged with a device‑storage adapter (SQLite/IndexedDB) that keeps the outbox and the last known snapshot.
- **Cellar mode UI.** Big‑target, one‑hand screens for the work that actually happens on the floor: tank drawer → quick transfer / addition / reading, dip calculator, today's work orders, barcode/QR on vessels and lots. A sync indicator shows pending outbox count and last successful sync.

### Blended import

`importers/blended.ts` understands Blended's action grammar (`Transferred 6470 gal from H1 to D4`, `GRUBA25-01 split: kept 763 gal in current lot, into …`, `Combined A, B into A`, `Lot updated: bond: …, stage: …`) plus the Additions / Brix / pH / TA / Free SO2 / VA columns. It replays each lot to reconstruct where the wine is; when a measured transfer exceeds the tracked volume (e.g. after a combine whose other half was never exported) it trusts the transfer and logs a reconciliation. The seeded lots match Blended's own Production screen (GRUBA25‑01 780 gal, LSAVCS23‑01 1,099 gal, MNARR17‑02 7,124 gal, MNATP21‑01W 5,690 gal).

## Notes & assumptions

- **Tank specs are estimated** from capacity until measured — the calculator and tank drawer flag this. Enter diameter/sidewall/bottom or paste the manufacturer strapping chart to make dip readings exact.
- **QuickBooks** — our read is that it is used for bills, payroll, client invoicing and year‑end COGS while per‑lot costing lives in spreadsheets. Vatroom takes over the per‑lot costing and exports classed journal entries; a two‑way QBO API sync is planned.
- **Compliance figures are decision aids.** Line numbers follow the pre‑2024 5120.17 layout; TTB's combined‑form pilot and current excise/CBMA tiers should be confirmed before filing.
- Lot codes follow the cellar convention `<CLIENT><VARIETY><YY>-<SEQ>`; the variety code table lives in `domain/lot-codes.ts`.

## Roadmap to production

1. Cloud API + `CloudAdapter`, real auth/SSO, invitations.
2. **iOS and Android apps** with offline‑first cellar mode and automatic sync (see *Mobile & offline* above).
3. Barrel‑level tracking inside barrel groups; bottling runs that create case goods automatically.
4. Photo → data entry for handwritten work sheets.
5. QuickBooks Online two‑way sync; CDFA/TTB e‑filing exports in their native formats.
