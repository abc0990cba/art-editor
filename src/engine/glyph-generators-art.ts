/**
 * Artistic glyph ramps beyond the classic azulejo shapes: a print-screen halftone, bokeh bubbles,
 * engraving cross-hatch, water ripples, a sunburst, a snow crystal, silk folds, an argyle lattice
 * and the ornament family (cross-stitch, hearts, mosaic tesserae). Form-based tone ramps live in
 * glyph-generators-forms.ts. These favour character over strictly linear coverage — every ramp
 * still starts empty, ends solid and never loses ink as the tone rises. Curated in
 * glyph-builtins.ts.
 */

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
