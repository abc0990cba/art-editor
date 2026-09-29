/**
 * Artistic glyph ramps beyond the classic azulejo shapes: a print-screen halftone, bokeh bubbles,
 * engraving cross-hatch, water ripples, a sunburst, a snow crystal, silk folds, an argyle lattice
 * and the ornament family (cross-stitch, hearts, mosaic tesserae). These favour character over
 * strictly linear coverage — every ramp still starts empty, ends solid and never loses ink as the
 * tone rises. Curated in glyph-builtins.ts.
 */

import { cellShapeHit, DEFAULT_SHAPE_PARAMS, type CellShapeId } from './cell-shapes.ts'
import { finish } from './glyph-generators.ts'
import type { GlyphTileCells, GlyphTileSet } from './glyph-tiles.ts'

/** Deterministic 0..1 hash of two integers (same static-noise primitive the grain ramp uses). */
function hash01(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const ramp = (levels: number, t: number): number => t / (levels - 1)

/** Classic print screen: dots on a staggered lattice swell with the tone (tiled ≈ 45° raster). */
export function glyphSetHalftone(
  n: number,
  levels: number,
  name = 'Растровые точки',
): GlyphTileSet {
  const pitch = 2
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const r = ramp(levels, t) * pitch
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const px = x + 0.5
        const py = y + 0.5
        const row = Math.floor(py / pitch)
        const off = (row % 2) * (pitch / 2)
        const col = Math.floor((px - off) / pitch)
        const dx = px - (col * pitch + off + pitch / 2)
        const dy = py - (row * pitch + pitch / 2)
        cells.push(Math.hypot(dx, dy) <= r + 0.01)
      }
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Triangle screen: apex-up triangles on a staggered lattice stretch down with the tone. */
export function glyphSetTriangles(n: number, levels: number, name = 'Треугольники'): GlyphTileSet {
  const pitch = 2
  // r sweeps 0 → pitch+1: cell centers sit ≥1 diagonal step from every apex, and the farthest
  // corner of a tile sits exactly pitch+1 away, so the ramp starts empty and ends solid
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const r = ramp(levels, t) * (pitch + 1)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const px = x + 0.5
        const py = y + 0.5
        const row = Math.floor(py / pitch)
        const off = (row % 2) * (pitch / 2)
        const col = Math.floor((px - off) / pitch)
        const dx = Math.abs(px - (col * pitch + off + pitch / 2))
        const dy = py - row * pitch // apex sits on the tile's top edge
        cells.push(dy + dx <= r + 0.01)
      }
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Bokeh: discs of different size and depth fade in staggered; the deepest disc ends solid. */
export function glyphSetBubbles(n: number, levels: number, name = 'Пузыри'): GlyphTileSet {
  const maxR = n / 2 + 0.5
  // x, y, radius (share of the tile), tone onset — the last bubble is the backdrop that ends full
  const FIELD: readonly (readonly [number, number, number, number])[] = [
    [0.2, 0.3, 0.26, 0.06],
    [0.66, 0.24, 0.22, 0.2],
    [0.44, 0.58, 0.24, 0.14],
    [0.82, 0.68, 0.2, 0.34],
    [0.16, 0.72, 0.18, 0.46],
    [0.54, 0.12, 0.16, 0.56],
    [0.34, 0.4, 0.15, 0.62],
    [0.5, 0.5, 2.4, 0.7],
  ]
  const levelsOut: GlyphTileCells[] = []
  const bubbleOn = (px: number, py: number, u: number): boolean => {
    for (const [fx, fy, fr, fo] of FIELD) {
      if (u >= fo && Math.hypot(px - fx * n, py - fy * n) <= ((u - fo) / (1 - fo)) * fr * maxR) {
        return true
      }
    }
    return false
  }
  for (let t = 0; t < levels; t++) {
    const u = ramp(levels, t)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) cells.push(bubbleOn(x + 0.5, y + 0.5, u))
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Engraving cross-hatch: dashes thicken into horizontal, then vertical, then diagonal strokes. */
export function glyphSetHatch(n: number, levels: number, name = 'Гравюра'): GlyphTileSet {
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = ramp(levels, t)
    // three stroke families take a third of the ramp each; dashes grow into solid lines
    const b1 = Math.max(0, Math.min(1, u * 3))
    const b2 = Math.max(0, Math.min(1, u * 3 - 1))
    const b3 = Math.max(0, Math.min(1, u * 3 - 2))
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let on: boolean
        if (y % 2 === 0) on = x % 4 < Math.round(b1 * 4)
        else if (x % 2 === 0) on = y % 4 < Math.round(b2 * 4)
        else on = (x + y) % 2 === 0 && (x + 2 * y) % 6 < Math.round(b3 * 6)
        cells.push(on)
      }
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Water ripples: two crossed sine fronts interfere under the rising waterline. */
export function glyphSetRipples(n: number, levels: number, name = 'Рябь'): GlyphTileSet {
  const a1 = n / 5
  const a2 = n / 7
  const top = n - 1 + 2 * (a1 + a2)
  const field = (x: number, y: number): number =>
    y +
    a1 +
    a2 +
    a1 * Math.sin((x / n) * Math.PI * 4) +
    a2 * Math.sin(((x + y) / (2 * n)) * Math.PI * 4)
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const front = ramp(levels, t) * (top + 1)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) cells.push(field(x, y) + 0.5 < front)
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Sunburst: twelve wedges sweep clockwise from the top spoke as the tone rises. */
export function glyphSetSunburst(n: number, levels: number, name = 'Лучи'): GlyphTileSet {
  const WEDGES = 12
  const c = (n - 1) / 2
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = ramp(levels, t)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const a01 = (Math.atan2(y - c, x - c) + Math.PI) / (2 * Math.PI)
        const phase = (a01 + 0.75) % 1
        const wedge = Math.floor(phase * WEDGES)
        cells.push(u >= (wedge + 0.5) / WEDGES)
      }
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Snow crystal: six spokes shoot out first, hexagonal facets fill between them. */
export function glyphSetCrystal(n: number, levels: number, name = 'Кристалл'): GlyphTileSet {
  const c = (n - 1) / 2
  const S3 = Math.sqrt(3) / 2
  const hexDist = (x: number, y: number): number => {
    const dx = x - c
    const dy = y - c
    return Math.max(Math.abs(dx), Math.abs(dx * 0.5 + dy * S3), Math.abs(-dx * 0.5 + dy * S3))
  }
  let maxD = 0
  for (const [x, y] of [
    [0, 0],
    [n - 1, 0],
    [0, n - 1],
    [n - 1, n - 1],
  ]) {
    maxD = Math.max(maxD, hexDist(x, y))
  }
  const maxR = Math.hypot(c, c) + 0.5
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = ramp(levels, t)
    // facets are born at 45% tone; before that the core stays out of the picture
    const core = u <= 0.45 ? -0.5 : ((u - 0.45) / 0.55) * maxD + 0.01
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = x - c
        const dy = y - c
        const theta = Math.atan2(dy, dx)
        const diff = Math.abs(theta - Math.round(theta / (Math.PI / 3)) * (Math.PI / 3))
        const spoke = diff < 0.13 && Math.hypot(dx, dy) <= u * maxR
        cells.push(spoke || hexDist(x, y) <= core)
      }
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Silk: a smooth folded-satin field (seamless in both directions) posterized by the tone. */
export function glyphSetSilk(n: number, levels: number, name = 'Шёлк'): GlyphTileSet {
  const field = (x: number, y: number): number =>
    0.5 + 0.49 * Math.sin(((x + y) / n) * Math.PI * 2 + 1.1 * Math.sin((y / n) * Math.PI * 2))
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = ramp(levels, t)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) cells.push(field(x, y) < u)
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Argyle: two counter-offset diamond lattices take turns filling the tile. */
export function glyphSetArgyle(n: number, levels: number, name = 'Аргайл'): GlyphTileSet {
  const P = 4 // lattice period in diagonal (x+y, x−y) coordinates
  const wrap = (v: number): number => ((v % P) + P) % P
  // L1 distance to the nearest lattice center in diagonal space, halved back to cell units
  const diamondDist = (x: number, y: number, shift: number): number => {
    const du = Math.min(wrap(x + y + shift), P - wrap(x + y + shift))
    const dv = Math.min(wrap(x - y + shift), P - wrap(x - y + shift))
    return (du + dv) / 2
  }
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = ramp(levels, t)
    const rA = Math.min(1, u * 2) * (P / 2) // first lattice fills the first half of the ramp
    const rB = Math.max(0, u * 2 - 1) * (P / 2)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        cells.push(diamondDist(x, y, 0) < rA - 0.01 || diamondDist(x, y, 2) < rB - 0.01)
      }
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Distance to the nearer arm of a saltire (the two tile diagonals). */
function stitchDist(x: number, y: number, n: number): number {
  return Math.min(Math.abs(x - y), Math.abs(x + y - (n - 1))) / Math.SQRT2
}

/** Cross-stitch: a chunky saltire thickens in stitch steps until it swallows the tile. */
export function glyphSetCrossStitch(n: number, levels: number, name = 'Крестик'): GlyphTileSet {
  const STEPS = 4
  let maxD = 0
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) maxD = Math.max(maxD, stitchDist(x, y, n))
  }
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = ramp(levels, t)
    const th = (Math.ceil(u * STEPS) / STEPS) * (maxD + 0.01)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) cells.push(stitchDist(x, y, n) <= th - 0.01)
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Hearts: a fat pixel heart swells from the center; the top of the ramp is solid ink. */
export function glyphSetHearts(n: number, levels: number, name = 'Сердца'): GlyphTileSet {
  const c = (n - 1) / 2
  const k = n / 2 - 0.5
  // classic implicit heart, lobes up; solid ink takes over for the last stretch of the ramp
  const SOLID = 0.92
  const inHeart = (px: number, py: number, s: number): boolean => {
    const x = (px - c) / (k * s)
    const y = (c + 0.15 - py) / (k * s)
    const q = x * x + y * y - 1.2
    return q * q * q - x * x * y * y * y <= 0
  }
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = ramp(levels, t)
    const s = Math.min(u / (SOLID - 0.04), 1)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) cells.push(u >= SOLID || inHeart(x + 0.5, y + 0.5, s))
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut)
}

/** Mosaic: wrapped-voronoi tesserae pop in one by one in a fixed shuffled order. */
export function glyphSetTesserae(n: number, levels: number, name = 'Мозаика'): GlyphTileSet {
  const K = 12
  const seeds = Array.from({ length: K }, (_v, k) => ({
    x: hash01(k + 1, 11) * n,
    y: hash01(k + 1, 23) * n,
    th: 0.03 + 0.94 * hash01(k + 1, 37),
  }))
  const levelsOut: GlyphTileCells[] = []
  // torus distance: the nearest seed across the tile seam keeps the mosaic seamless when tiled
  const chipThreshold = (px: number, py: number): number => {
    let best = Infinity
    let th = 1
    for (const s of seeds) {
      const dx = px - s.x - n * Math.round((px - s.x) / n)
      const dy = py - s.y - n * Math.round((py - s.y) / n)
      const d = Math.hypot(dx, dy)
      if (d < best) {
        best = d
        th = s.th
      }
    }
    return th
  }
  for (let t = 0; t < levels; t++) {
    const u = ramp(levels, t)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) cells.push(u >= chipThreshold(x + 0.5, y + 0.5))
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/* --------------------- tone-scale ramps of the cell forms --------------------- */

const FORM_PARAMS = { ...DEFAULT_SHAPE_PARAMS, rotation: 0 }

/** Smallest scale (share of the target box) at which the form swallows every probe point. */
function formCoverScale(
  id: CellShapeId,
  probes: readonly (readonly [number, number])[],
  toForm: (qx: number, qy: number, s: number) => [number, number],
): number {
  const covered = (s: number): boolean =>
    probes.every(([qx, qy]) => cellShapeHit(id, ...toForm(qx, qy, s), FORM_PARAMS))
  let s = 0.3
  while (!covered(s)) s += 0.05
  return s
}

/**
 * Tone-scale ramp of one registered cell form: the figure grows from a speck at the light end of
 * the ramp until it swallows the whole tile at the dark end — "light gray = small heart, black =
 * full heart" for every silhouette in the registry. Geometry comes from cellShapeHit, so the glyph
 * always matches the canvas rendering of that form.
 */
export function glyphSetForm(
  id: CellShapeId,
  n: number,
  levels: number,
  name = 'Форма',
): GlyphTileSet {
  const probes: (readonly [number, number])[] = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) probes.push([(x + 0.5) / n, (y + 0.5) / n])
  }
  const toForm = (qx: number, qy: number, s: number): [number, number] => [
    0.5 + (qx - 0.5) / s,
    0.5 + (qy - 0.5) / s,
  ]
  const sMax = formCoverScale(id, probes, toForm)
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const cells: GlyphTileCells = []
    if (t === 0 || t === levels - 1) {
      const solid = t === levels - 1
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

/**
 * Two different figures at once: a staggered 2×2 block lattice like the halftone screen, the
 * checker parities carrying form A and form B. Each figure grows with the tone inside its own
 * block, so mid tones read as both silhouettes side by side and the darkest level stays solid.
 */
export function glyphSetFormDuo(
  a: CellShapeId,
  b: CellShapeId,
  n: number,
  levels: number,
  name = 'Дуэт форм',
): GlyphTileSet {
  const pitch = 2
  // the four cell centers of one 2×2 block, as offsets from the block center (±0.5)
  const blockProbes: (readonly [number, number])[] = [
    [0.5, 0.5],
    [-0.5, 0.5],
    [0.5, -0.5],
    [-0.5, -0.5],
  ]
  const toBlockForm = (dx: number, dy: number, s: number): [number, number] => [
    0.5 + dx / (2 * s),
    0.5 + dy / (2 * s),
  ]
  const sA = formCoverScale(a, blockProbes, toBlockForm)
  const sB = formCoverScale(b, blockProbes, toBlockForm)
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const cells: GlyphTileCells = []
    if (t === 0 || t === levels - 1) {
      const solid = t === levels - 1
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
