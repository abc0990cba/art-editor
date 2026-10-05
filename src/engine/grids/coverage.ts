import type { Doc } from '../core/doc.ts'
import type { Pt } from '../geometry/marching-squares.ts'
import { makeGrid } from './lattice.ts'

/**
 * Drawable coverage of a document's canvas plate: the region where lattice cells can exist. Most
 * lattices tile their plate exactly, but the radial grid is a disc inscribed in its square plate
 * and a rotated grid spans the turned rect — both leave plate corners (or a margin ring) where
 * `cellAt` finds no cell. Background fills, exports and metaball field clamps share this module so
 * nothing renders outside the paintable area.
 */

type CoverageDoc = Pick<Doc, 'gridType' | 'cols' | 'rows' | 'gridRotation'>

/** Disc outline sampling for the polygon form: chord sag stays invisible at any zoom. */
const DISC_SAMPLES = 256

interface Coverage {
  pts: Pt[]
  /** Null when the plate is fully covered — no clamp needed anywhere */
  clip: ((x: number, y: number) => boolean) | null
}

function coverageOf(doc: CoverageDoc): Coverage {
  const rot = (((doc.gridRotation ?? 0) % 360) + 360) % 360
  if (doc.gridType === 'radial') {
    // turning a polar lattice only shifts the sector phase — the disc is rotation-invariant
    const g = makeGrid('radial', doc.cols, doc.rows)
    const cx = g.w / 2
    const cy = g.h / 2
    const r = doc.rows
    return {
      pts: Array.from({ length: DISC_SAMPLES }, (_, i) => {
        const a = (2 * Math.PI * i) / DISC_SAMPLES
        return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
      }),
      clip: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 1e-9,
    }
  }
  if (rot === 0) {
    const g = makeGrid(doc.gridType, doc.cols, doc.rows)
    return {
      pts: [
        { x: 0, y: 0 },
        { x: g.w, y: 0 },
        { x: g.w, y: g.h },
        { x: 0, y: g.h },
      ],
      clip: null,
    }
  }
  // turned lattice: the covered region is the base rect rotated about its center and
  // re-centered in the grown plate — the exact transform of rotatedGrid
  const base = makeGrid(doc.gridType, doc.cols, doc.rows)
  const turned = makeGrid(doc.gridType, doc.cols, doc.rows, false, rot)
  const a = (rot * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dx = (turned.w - base.w) / 2
  const dy = (turned.h - base.h) / 2
  const cx = base.w / 2
  const cy = base.h / 2
  const rotPt = (p: Pt): Pt => ({
    x: dx + cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: dy + cy + (p.x - cx) * sin + (p.y - cy) * cos,
  })
  return {
    pts: [
      rotPt({ x: 0, y: 0 }),
      rotPt({ x: base.w, y: 0 }),
      rotPt({ x: base.w, y: base.h }),
      rotPt({ x: 0, y: base.h }),
    ],
    clip: (x, y) => {
      const px = cx + (x - dx - cx) * cos + (y - dy - cy) * sin
      const py = cy - (x - dx - cx) * sin + (y - dy - cy) * cos
      return px >= 0 && px <= base.w && py >= 0 && py <= base.h
    },
  }
}

/** Polygon outline of the drawable coverage (plate corners, sampled disc or turned rect). */
export function gridCoveragePoly(doc: CoverageDoc): Pt[] {
  return coverageOf(doc).pts
}

/**
 * Exact inside test of the drawable coverage, or null when the plate is fully covered and no clamp
 * is needed (the metaball field scan is hot — it never pays for an always-true predicate).
 */
export function gridCoverageClip(doc: CoverageDoc): ((x: number, y: number) => boolean) | null {
  return coverageOf(doc).clip
}
