/**
 * Procedural glyph ramp generators — pure functions from (tile size, level count) to a
 * GlyphTileSet. The classic ramps (dots, lines, checker, azulejo shapes) live here alongside the
 * expressive shape families (morphing superellipses, stars, rings, scales, waves, bricks, grain,
 * pinwheel). The built-in registry that curates them is glyph-builtins.ts.
 */

import { tileCoverage, type GlyphTileCells, type GlyphTileSet } from './glyph-tiles.ts'

/** OR every level into the next so coverage never decreases (artistic ramps). */
function monotonize(levels: GlyphTileCells[]): GlyphTileCells[] {
  const out: GlyphTileCells[] = []
  for (let t = 0; t < levels.length; t++) {
    out.push(t === 0 ? levels[0] : levels[t].map((v, i) => v || out[t - 1][i]))
  }
  return out
}

function finish(name: string, n: number, levels: GlyphTileCells[], monotone = true): GlyphTileSet {
  return { name, w: n, h: n, levels: monotone ? monotonize(levels) : levels }
}

/** Superellipse distance: p=1 → diamond (Manhattan), p=2 → circle, p≥8 → square. */
function superellipse(dx: number, dy: number, p: number): number {
  return (Math.abs(dx) ** p + Math.abs(dy) ** p) ** (1 / p)
}

/** Growing dot: each level inks the cells whose center lies inside radius r(t). */
export function glyphSetDots(n: number, levels: number, name = 'Точки'): GlyphTileSet {
  const levelsOut: GlyphTileCells[] = []
  const cx = (n - 1) / 2
  const cy = (n - 1) / 2
  const maxR = Math.hypot(cx + 0.5, cy + 0.5)
  for (let t = 0; t < levels; t++) {
    const r = (t / (levels - 1)) * maxR
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        cells.push(Math.hypot(x - cx, y - cy) <= r + 0.15)
      }
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Straight lines: horizontal, vertical or 45° diagonal; thickness grows with tone. */
export function glyphSetLines(
  dir: 'h' | 'v' | 'diag',
  n: number,
  levels: number,
  name: string,
): GlyphTileSet {
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let on: boolean
        if (dir === 'h') on = y < Math.round((t / (levels - 1)) * n)
        else if (dir === 'v') on = x < Math.round((t / (levels - 1)) * n)
        else on = (x + y) % n < Math.round((t / (levels - 1)) * n)
        cells.push(on)
      }
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Checkerboard: ink share grows by switching the phase of filled cells. */
export function glyphSetChecker(n: number, levels: number, name = 'Шахматка'): GlyphTileSet {
  const levelsOut: GlyphTileCells[] = []
  const total = n * n
  for (let t = 0; t < levels; t++) {
    const share = t / (levels - 1)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const phase = (x + y) % 2
        cells.push(phase === 0 ? share > 0 : share > 0.5 ? (x + y * 3) % 3 !== 0 : false)
      }
    }
    // guarantee monotone coverage
    if (tileCoverage(cells) > share + 1 / total) {
      levelsOut.push(levelsOut[levelsOut.length - 1] ?? cells)
    } else {
      levelsOut.push(cells)
    }
  }
  return finish(name, n, levelsOut, false)
}

/** Growing diamond (Manhattan ball) — the classic azulejo diamond tile. */
export function glyphSetDiamonds(n: number, levels: number, name = 'Ромбы'): GlyphTileSet {
  const cx = (n - 1) / 2
  const cy = (n - 1) / 2
  const maxR = cx + cy + 1
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const r = (t / (levels - 1)) * maxR
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) cells.push(Math.abs(x - cx) + Math.abs(y - cy) < r)
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Concentric square rings growing outward from the center. */
export function glyphSetSquares(
  n: number,
  levels: number,
  name = 'Квадраты кольцами',
): GlyphTileSet {
  const cx = (n - 1) / 2
  const cy = (n - 1) / 2
  const maxR = Math.ceil(n / 2)
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const r = (t / (levels - 1)) * maxR
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) cells.push(Math.max(Math.abs(x - cx), Math.abs(y - cy)) < r)
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Diagonal slope filling from the top-left corner (triangle half-tile). */
export function glyphSetCorner(
  n: number,
  levels: number,
  name = 'Диагональный склон',
): GlyphTileSet {
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const cut = (t / (levels - 1)) * (2 * n - 1)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) cells.push(x + y < cut)
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Lattice of dots at every other cell, dot radius grows with tone. */
export function glyphSetGridDots(
  n: number,
  levels: number,
  name = 'Точечная решётка',
): GlyphTileSet {
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = t / (levels - 1)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        // quarter-dot grows from each 2×2 block corner: tiled = a dotted lattice
        const ax = x - Math.floor(x / 2) * 2
        const ay = y - Math.floor(y / 2) * 2
        cells.push(Math.hypot(ax, ay) < u * 1.5)
      }
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Growing plus/cross. */
export function glyphSetCross(n: number, levels: number, name = 'Крест'): GlyphTileSet {
  const c = n / 2
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const arm = (t / (levels - 1)) * (n / 2)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++)
        cells.push(Math.abs(x + 0.5 - c) < arm || Math.abs(y + 0.5 - c) < arm)
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Four-fold medallion: center diamond + four petals on the edge midpoints. */
export function glyphSetMedallion(n: number, levels: number, name = 'Медальон'): GlyphTileSet {
  const cx = (n - 1) / 2
  const cy = (n - 1) / 2
  const maxR = cx + 1
  const petal = n / 2
  // petal diamonds at the four edge midpoints, half a step behind the center
  const petals: ReadonlyArray<readonly [number, number]> = [
    [cx, -1 + petal],
    [cx, n - petal],
    [-1 + petal, cy],
    [n - petal, cy],
  ]
  const cellOn = (x: number, y: number, r: number): boolean => {
    if (Math.abs(x - cx) + Math.abs(y - cy) < r) return true
    return petals.some(([px, py]) => Math.abs(x - px) + Math.abs(y - py) < r * 0.8)
  }
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const r = (t / (levels - 1)) * maxR
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) cells.push(cellOn(x, y, r))
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Chevron stripes: a zigzag front sweeps the tile top-to-bottom with tone. */
export function glyphSetChevron(n: number, levels: number, name = 'Ёлочка'): GlyphTileSet {
  const period = Math.max(4, 2 * Math.floor(n / 2))
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = t / (levels - 1)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const phase = (x % period) / period
        const tri = 1 - Math.abs(phase * 2 - 1) // 0..1 triangle wave
        // front sweeps from above the tile to below it; the zigzag bends the front
        const front = u * (n + 1 + 0.4 * n * tri) - 0.5
        cells.push(y <= front)
      }
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/* ------------------------------ shape families ------------------------------ */

/**
 * Superellipse morph: low tones are tiny squares, mid tones grow as circles, high tones tighten
 * into diamonds that fill the tile — the square→round→diamond transition ramp.
 */
export function glyphSetShapeMorph(
  n: number,
  levels: number,
  name = 'Морф: квадрат → круг → ромб',
): GlyphTileSet {
  const cx = (n - 1) / 2
  const cy = (n - 1) / 2
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = t / (levels - 1)
    const p = 1 + (1 - u) * 7 // square-ish at u=0 → diamond at u=1
    const corner = superellipse(cx, cy, p)
    const r = u * corner * 1.02 - 0.01
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++)
        cells.push(superellipse(Math.abs(x - cx), Math.abs(y - cy), p) <= r)
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut)
}

/** Four-pointed star (sub-diamond superellipse): spikes reach the edges, corners fill last. */
export function glyphSetStars(n: number, levels: number, name = 'Звёзды'): GlyphTileSet {
  const cx = (n - 1) / 2
  const cy = (n - 1) / 2
  const p = 0.62
  const corner = superellipse(cx, cy, p)
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = t / (levels - 1)
    const r = u * corner * 1.02 - 0.01
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++)
        cells.push(superellipse(Math.abs(x - cx), Math.abs(y - cy), p) <= r)
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut)
}

/** Annulus that widens with tone: thin ring → thick ring → full disc. */
export function glyphSetRings(n: number, levels: number, name = 'Кольца'): GlyphTileSet {
  const cx = (n - 1) / 2
  const cy = (n - 1) / 2
  const maxR = Math.hypot(cx, cy) + 0.5
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = t / (levels - 1)
    const rOut = u * maxR - 0.01
    const rIn = (1 - u) * maxR * 0.85
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const d = Math.hypot(x - cx, y - cy)
        cells.push(d <= rOut && d >= rIn)
      }
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut)
}

/** Fish scales: offset rows of growing semicircle cups (uroko pattern). */
export function glyphSetScales(n: number, levels: number, name = 'Чешуя'): GlyphTileSet {
  const r = Math.max(2, n / 4)
  // nearest center over the 3×3 neighborhood of scale rows/columns (rows overlap)
  const inScale = (px: number, py: number, reach: number): boolean => {
    const row = Math.floor(py / r)
    const col = Math.floor(px / (2 * r))
    for (let dr = -1; dr <= 1; dr++) {
      const rr = row + dr
      const off = ((rr % 2) + 2) % 2 === 0 ? 0 : r
      const cy = rr * r + r
      for (let dc = -1; dc <= 1; dc++) {
        const cx = ((col + dc) * 2 + 1) * r + off
        if (Math.hypot(px - cx, py - cy) <= reach) return true
      }
    }
    return false
  }
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = t / (levels - 1)
    const reach = r * (0.3 + 0.83 * u)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) cells.push(inScale(x + 0.5, y + 0.5, reach))
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut)
}

/** Sine-wave front sweeping the tile top-to-bottom with tone. */
export function glyphSetWaves(n: number, levels: number, name = 'Волны'): GlyphTileSet {
  const cycles = 2
  const amp = n / 5
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = t / (levels - 1)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const front =
          u * (n + 2 * amp) - amp + amp * Math.sin(((x + 0.5) / n) * Math.PI * 2 * cycles)
        cells.push(y + 0.5 <= front)
      }
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut)
}

/** Brick wall: courses grow to fill the rows while the vertical mortar joints fade out. */
export function glyphSetBricks(n: number, levels: number, name = 'Кирпичи'): GlyphTileSet {
  const rowH = 3
  const brickW = 4
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = t / (levels - 1)
    const bandH = Math.round(u * rowH)
    const jointAlive = u < 0.85
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      const off = (Math.floor(y / rowH) % 2) * (brickW / 2)
      for (let x = 0; x < n; x++) {
        const joint = jointAlive && (x + off) % brickW === 0
        cells.push(y % rowH < bandH && !joint)
      }
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut)
}

/** Deterministic grain: per-cell hash threshold, static-noise ramp. */
export function glyphSetGrain(n: number, levels: number, name = 'Зерно'): GlyphTileSet {
  const hash01 = (x: number, y: number): number => {
    let h = (x * 374761393 + y * 668265263) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = t / (levels - 1)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) cells.push(hash01(x, y) < u)
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut, false)
}

/** Pinwheel: eight spiral blades sweep around the center as tone rises. */
export function glyphSetPinwheel(n: number, levels: number, name = 'Вертушка'): GlyphTileSet {
  const cx = (n - 1) / 2
  const cy = (n - 1) / 2
  const maxR = Math.hypot(cx, cy)
  const levelsOut: GlyphTileCells[] = []
  for (let t = 0; t < levels; t++) {
    const u = t / (levels - 1)
    const cells: GlyphTileCells = []
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const theta = Math.atan2(y - cy, x - cx)
        const d = Math.hypot(x - cx, y - cy)
        const wedge = ((theta + Math.PI) / (2 * Math.PI)) * 8 - (d / maxR) * 1.5
        const phase = ((wedge % 1) + 1) % 1
        cells.push(phase < u)
      }
    }
    levelsOut.push(cells)
  }
  return finish(name, n, levelsOut)
}
