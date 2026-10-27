import type { StrappingPoint, Vessel, VesselGeometry } from './types'
import { CUBIC_INCHES_PER_GAL } from './units'

/**
 * Tank volume math.
 *
 * A wine tank is modelled as a straight cylinder on top of a bottom section:
 *  - flat:  no bottom volume
 *  - cone:  right circular cone of height h (volume = 1/3 π r² h)
 *  - dish:  spherical cap of depth h on a circle of radius r  (volume = π h² (3R − h)/3 where R = (r² + h²)/2h)
 *  - slope: a sloped floor — approximated as a half-filled wedge (½ π r² h)
 *
 * Partial fills inside the bottom section are integrated exactly for cones and
 * dishes; for a sloped floor we use a linear approximation. Above the bottom
 * section the fill is linear (gallons per inch = π r² / 231).
 *
 * If a manufacturer strapping chart is present we interpolate it instead —
 * that is always the more trustworthy source.
 */

const cuInToGal = (cuIn: number) => cuIn / CUBIC_INCHES_PER_GAL

export function cylinderGalPerInch(diameterIn: number): number {
  const r = diameterIn / 2
  return cuInToGal(Math.PI * r * r)
}

function bottomVolumeCuIn(g: VesselGeometry, fillIn: number): number {
  const r = g.diameterIn / 2
  const h = g.bottomHeightIn
  const f = Math.max(0, Math.min(fillIn, h))
  if (h <= 0 || g.bottom === 'flat') return 0
  switch (g.bottom) {
    case 'cone': {
      // cone apex at the bottom; radius grows linearly with height
      const rf = (r * f) / h
      return (Math.PI * rf * rf * f) / 3
    }
    case 'dish': {
      // spherical cap: sphere radius R from chord radius r and cap depth h
      const R = (r * r + h * h) / (2 * h)
      return (Math.PI * f * f * (3 * R - f)) / 3
    }
    case 'slope': {
      // wedge — half cylinder volume over the slope height, linear in fill
      const full = (Math.PI * r * r * h) / 2
      return full * (f / h)
    }
    default:
      return 0
  }
}

export function bottomFullGal(g: VesselGeometry): number {
  return cuInToGal(bottomVolumeCuIn(g, g.bottomHeightIn))
}

export function geometryTotalGal(g: VesselGeometry): number {
  return bottomFullGal(g) + cylinderGalPerInch(g.diameterIn) * g.sidewallIn
}

/** Gallons at a given liquid height measured from the lowest point of the tank. */
export function gallonsAtHeight(v: Vessel, heightIn: number): number {
  if (v.strapping && v.strapping.length >= 2) return interpolateStrapping(v.strapping, heightIn)
  const g = v.geometry
  if (!g) return (Math.max(0, Math.min(1, heightIn)) || 0) * v.capacityGal
  const h = Math.max(0, heightIn)
  const bottom = cuInToGal(bottomVolumeCuIn(g, h))
  const straight = Math.max(0, Math.min(h - g.bottomHeightIn, g.sidewallIn)) * cylinderGalPerInch(g.diameterIn)
  return bottom + straight
}

/** Inverse: height from the bottom for a target volume (bisection). */
export function heightForGallons(v: Vessel, gallons: number): number {
  const max = totalHeightIn(v)
  let lo = 0
  let hi = max
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (gallonsAtHeight(v, mid) < gallons) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export function totalHeightIn(v: Vessel): number {
  if (v.strapping && v.strapping.length) return v.strapping[v.strapping.length - 1].heightIn
  if (v.geometry) return v.geometry.bottomHeightIn + v.geometry.sidewallIn
  return 1
}

/** Gallons from a "dip" — distance from the reference (top of sidewall) down to the liquid. */
export function gallonsFromDip(v: Vessel, dipIn: number): number {
  return gallonsAtHeight(v, totalHeightIn(v) - dipIn)
}

export function interpolateStrapping(pts: StrappingPoint[], h: number): number {
  const sorted = [...pts].sort((a, b) => a.heightIn - b.heightIn)
  if (h <= sorted[0].heightIn) return (sorted[0].gallons * h) / Math.max(sorted[0].heightIn, 1e-6)
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]
    const b = sorted[i]
    if (h <= b.heightIn) {
      const t = (h - a.heightIn) / (b.heightIn - a.heightIn)
      return a.gallons + t * (b.gallons - a.gallons)
    }
  }
  return sorted[sorted.length - 1].gallons
}

/**
 * Estimate a plausible geometry from capacity alone — used to seed tanks until
 * the cellar enters measured specs. Assumes a 2:1 height:diameter cylinder
 * with a shallow cone; flagged `estimated` so the UI can prompt for real specs.
 */
export function estimateGeometry(capacityGal: number, type: Vessel['type']): VesselGeometry {
  const cuIn = capacityGal * CUBIC_INCHES_PER_GAL
  // height = k * diameter; solve π/4 d² (k d) = V  →  d = (4V/(πk))^(1/3)
  const k = type === 'tote' || type === 'cube' ? 1 : capacityGal > 9000 ? 2.4 : 2.0
  const d = Math.cbrt((4 * cuIn) / (Math.PI * k))
  const bottom: VesselGeometry['bottom'] = type === 'tote' || type === 'cube' ? 'flat' : 'cone'
  const bottomHeightIn = bottom === 'flat' ? 0 : Math.round(d * 0.08)
  // remove bottom volume from the sidewall so the total matches capacity
  const g: VesselGeometry = { diameterIn: Math.round(d), sidewallIn: 0, bottom, bottomHeightIn, estimated: true }
  const remaining = capacityGal - bottomFullGal(g)
  g.sidewallIn = Math.round((remaining / cylinderGalPerInch(g.diameterIn)) * 10) / 10
  return g
}

/** Build a strapping table for printing/export at a given step. */
export function buildStrappingTable(v: Vessel, stepIn = 1): StrappingPoint[] {
  const out: StrappingPoint[] = []
  const max = totalHeightIn(v)
  for (let h = 0; h <= max + 1e-9; h += stepIn) {
    out.push({ heightIn: Math.round(h * 100) / 100, gallons: Math.round(gallonsAtHeight(v, h) * 10) / 10 })
  }
  return out
}
