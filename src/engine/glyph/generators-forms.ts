/**
 * Glyph ramps whose minimum element is a cell form, not a square pixel: every tile of these sets is
 * a registered silhouette (heart, cross, star…) drawn by the same geometry the canvas renders
 * (cellShapeHit). Three families of ramps live here: a single form growing with the tone, two
 * figures interleaved on a lattice, and a morph where one figure transforms into another. Curated
 * into the `forms` family in glyph-builtins.ts.
 */

import { cellShapeHit, DEFAULT_SHAPE_PARAMS, type CellShapeId } from '../cell-shapes/index.ts'
import { finish } from './generators.ts'
import type { GlyphTileCells, GlyphTileSet } from './tiles.ts'

const ramp = (levels: number, t: number): number => t / (levels - 1)

const FORM_PARAMS = { ...DEFAULT_SHAPE_PARAMS, rotation: 0 }

/** Probe points every ramp must swallow at its darkest level (a form of scale 1 covers the box). */
const tileProbes = (n: number): (readonly [number, number])[] => {
  const probes: (readonly [number, number])[] = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) probes.push([(x + 0.5) / n, (y + 0.5) / n])
  }
  return probes
}

/**
 * Smallest scale (share of the target box) at which the form swallows every probe point. Capped: an
 * annulus (ring) grows its hole along with its wall, so no scale ever covers the tile — the ramp
 * clamps its dark end to solid ink instead (the same takeover the hearts ramp uses).
 */
function formCoverScale(
  id: CellShapeId,
  probes: readonly (readonly [number, number])[],
  toForm: (qx: number, qy: number, s: number) => [number, number],
): number {
  const covered = (s: number): boolean =>
    probes.every(([qx, qy]) => cellShapeHit(id, ...toForm(qx, qy, s), FORM_PARAMS))
  let s = 0.3
  while (s < FORM_SCALE_CAP && !covered(s)) s += 0.05
  return s
}

/** Tone share of the ramp where solid ink takes over (ring-scale takeover, hearts-style). */
const FORM_SOLID = 0.92
const FORM_SCALE_CAP = 6

/**
 * Tone-scale ramp of one registered cell form: the figure grows from a speck at the light end of
 * the ramp until it swallows the whole tile at the dark end — "light gray = small cross, black =
 * cross at 100%" for every silhouette in the registry. Geometry comes from cellShapeHit, so the
 * glyph always matches the canvas rendering of that form.
 */
export function glyphSetForm(
  id: CellShapeId,
  n: number,
  levels: number,
  name = 'Форма',
): GlyphTileSet {
  const probes = tileProbes(n)
  const toForm = (qx: number, qy: number, s: number): [number, number] => [
    0.5 + (qx - 0.5) / s,
    0.5 + (qy - 0.5) / s,
  ]
  const levelsOut: GlyphTileCells[] = []
  if (id === 'ring') {
    // a pure annulus is not monotone in scale — the wall sweeps past cells and takes their ink
    // away — so the ring ramp grows its outer edge while closing the hole instead (thickness
    // decides how long the hole survives); it still reads as a ring through the whole ramp
    const maxRq = Math.max(...probes.map(([qx, qy]) => Math.hypot(qx - 0.5, qy - 0.5)))
    for (let t = 0; t < levels; t++) {
      const cells: GlyphTileCells = []
      const u = ramp(levels, t)
      if (t === 0 || u >= FORM_SOLID) {
        const solid = u >= FORM_SOLID
        for (let i = 0; i < n * n; i++) cells.push(solid)
        levelsOut.push(cells)
        continue
      }
      const w = u / FORM_SOLID
      const outer = w * maxRq + 0.01
      const inner = (1 - w) * maxRq * (1 - FORM_PARAMS.thickness)
      for (const [qx, qy] of probes) {
        const rq = Math.hypot(qx - 0.5, qy - 0.5)
        cells.push(rq <= outer && rq >= inner)
      }
      levelsOut.push(cells)
    }
    return finish(name, n, levelsOut, false)
  }
  const sMax = formCoverScale(id, probes, toForm)
  for (let t = 0; t < levels; t++) {
    const cells: GlyphTileCells = []
    if (t === 0 || ramp(levels, t) >= FORM_SOLID) {
      const solid = ramp(levels, t) >= FORM_SOLID
      for (let i = 0; i < n * n; i++) cells.push(solid)
      levelsOut.push(cells)
      continue
    }
    const s = ramp(levels, t) * sMax
    for (const [qx, qy] of probes) {
      const [fu, fv] = toForm(qx, qy, s)
      cells.push(cellShapeHit(id, fu, fv, FORM_PARAMS))
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Cell-center offsets of one pitch×pitch block, relative to the block center (±1 box). */
const blockProbes = (pitch: number): (readonly [number, number])[] => {
  const probes: (readonly [number, number])[] = []
  for (let j = 0; j < pitch; j++) {
    for (let i = 0; i < pitch; i++) {
      probes.push([(2 * (i + 0.5)) / pitch - 1, (2 * (j + 0.5)) / pitch - 1])
    }
  }
  return probes
}

/**
 * Two different figures at once: a staggered pitch×pitch block lattice like the halftone screen,
 * the checker parities carrying form A and form B. Each figure grows with the tone inside its own
 * block, so mid tones read as both silhouettes side by side and the darkest level stays solid.
 * `pitch` is the lattice density: 2 = chunky pairs, 3 = finer mesh.
 */
export function glyphSetFormDuo(
  a: CellShapeId,
  b: CellShapeId,
  n: number,
  levels: number,
  opts?: { name?: string; pitch?: 2 | 3 | 4 },
): GlyphTileSet {
  const name = opts?.name ?? 'Дуэт форм'
  const pitch = opts?.pitch ?? 2
  const probes = blockProbes(pitch)
  const toBlockForm = (dx: number, dy: number, s: number): [number, number] => [
    0.5 + dx / (2 * s),
    0.5 + dy / (2 * s),
  ]
  const sA = formCoverScale(a, probes, toBlockForm)
  const sB = formCoverScale(b, probes, toBlockForm)
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const cells: GlyphTileCells = []
    if (t === 0 || ramp(levels, t) >= FORM_SOLID) {
      const solid = ramp(levels, t) >= FORM_SOLID
      for (let i = 0; i < n * n; i++) cells.push(solid)
      levelsOut.push(cells)
      continue
    }
    const s = ramp(levels, t)
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const px = x + 0.5
        const py = y + 0.5
        const row = Math.floor(py / pitch)
        const off = (row % 2) * (pitch / 2)
        const col = Math.floor((px - off) / pitch)
        const useA = (row + col) % 2 === 0
        const id = useA ? a : b
        const sMax = useA ? sA : sB
        const dx = px - (col * pitch + off + pitch / 2)
        const dy = py - (row * pitch + pitch / 2)
        const [fu, fv] = toBlockForm(dx, dy, s * sMax)
        cells.push(cellShapeHit(id, fu, fv, FORM_PARAMS))
      }
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/* ------------------------------- morph ------------------------------- */

/** Radial directions of a silhouette profile. */
const MORPH_ANGLES = 96
/** Outer silhouette search radius (the unit box corners sit at ~0.71). */
const MORPH_MAX_R = 0.75
const MORPH_STEP = 0.01

/** Profile bucket of the direction (dx, dy) → 0..MORPH_ANGLES-1. */
function angleIndex(dy: number, dx: number): number {
  const k = Math.round((Math.atan2(dy, dx) / (2 * Math.PI)) * MORPH_ANGLES) % MORPH_ANGLES
  return k < 0 ? k + MORPH_ANGLES : k
}

/**
 * Outer radial profile r(θ) of a form in unit-box space, marched from outside in. Ring returns its
 * outer circle (the hole is a detail the morph silhouette drops).
 */
function formRadialProfile(id: CellShapeId): Float64Array {
  const profile = new Float64Array(MORPH_ANGLES)
  for (let k = 0; k < MORPH_ANGLES; k++) {
    const theta = (2 * Math.PI * k) / MORPH_ANGLES
    const dirX = Math.cos(theta)
    const dirY = Math.sin(theta)
    let r = MORPH_MAX_R
    for (; r > 0; r -= MORPH_STEP) {
      // march from the search radius inward; the first hit is the outer silhouette
      if (cellShapeHit(id, 0.5 + dirX * r, 0.5 + dirY * r, FORM_PARAMS)) break
    }
    profile[k] = Math.max(0, r)
  }
  return profile
}

/**
 * One figure transforms into another across the tone ramp: the silhouette interpolates between the
 * two radial profiles while growing from a speck to the full tile. Light tones are pure form A,
 * dark tones pure form B, mid tones are genuine in-between shapes — and the ramp still starts
 * empty, ends solid and never loses ink.
 */
export function glyphSetFormMorph(
  a: CellShapeId,
  b: CellShapeId,
  n: number,
  levels: number,
  name = 'Морф форм',
): GlyphTileSet {
  const profA = formRadialProfile(a)
  const profB = formRadialProfile(b)
  const probes = tileProbes(n)
  // smallest scale at which the pure-B silhouette swallows the whole tile
  let sMax = 0.3
  while (sMax < FORM_SCALE_CAP) {
    let all = true
    for (const [qx, qy] of probes) {
      const dx = qx - 0.5
      const dy = qy - 0.5
      if (Math.hypot(dx, dy) > sMax * profB[angleIndex(dy, dx)]) {
        all = false
        break
      }
    }
    if (all) break
    sMax += 0.05
  }
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const cells: GlyphTileCells = []
    if (t === 0 || ramp(levels, t) >= FORM_SOLID) {
      const solid = ramp(levels, t) >= FORM_SOLID
      for (let i = 0; i < n * n; i++) cells.push(solid)
      levelsOut.push(cells)
      continue
    }
    const u = ramp(levels, t)
    const s = u * sMax
    for (const [qx, qy] of probes) {
      const dx = qx - 0.5
      const dy = qy - 0.5
      const r = Math.hypot(dx, dy)
      const k = angleIndex(dy, dx)
      const prof = profA[k] * (1 - u) + profB[k] * u
      cells.push(r <= s * prof)
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}
