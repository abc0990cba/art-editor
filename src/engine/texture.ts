import type { TextureSettings } from './doc'

/**
 * Baked vector texture: extra path fragments that punch tiny holes into a shape's fill. Compound
 * per-color paths are painted with fill-rule evenodd, so inner subpaths become transparent holes —
 * the texture stays pure vector geometry and renders identically on canvas, in PNG and in the
 * exported SVG.
 *
 * Specks are placed on a lattice anchored to the document origin (not per pixel), so the pattern
 * flows continuously across adjacent same-color pixels; only the shape's outer border can carry a
 * clean gap margin.
 */

/** Max flecks per region / metaball blob — bounds path data size. */
const MAX_REGION_FLECKS = 20_000

/** Marching-squares threshold used by metaball mode. */
const ISO = 0.5

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const fmt = (v: number) => String(Math.round(v * 1000) / 1000)

/** 32-bit mix of two integer keys and a seed → PRNG / noise input. */
function hash2(x: number, y: number, seed: number): number {
  let h =
    (Math.imul(x | 0, 0x9e_37_79_b1) ^
      Math.imul(y | 0, 0x85_eb_ca_6b) ^
      Math.imul(seed + 1, 0xc2_b2_ae_35)) |
    0
  h = Math.imul(h ^ (h >>> 16), 2_246_822_507)
  h = Math.imul(h ^ (h >>> 13), 3_266_489_909)
  return (h ^ (h >>> 16)) >>> 0
}

/** Hash2 folded into a single-key form (cell index → PRNG seed). */
function hash(key: number, seed: number): number {
  return hash2(key, key >>> 16, seed)
}

/** Mulberry32: tiny, fast, identical output on every platform. */
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d_2b_79_f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** Compact axis-aligned square fleck: `M x y h s v s h -s z`. */
function squareFleck(fx: number, fy: number, side: number): string {
  return `M${fmt(fx)} ${fmt(fy)}h${fmt(side)}v${fmt(side)}h${fmt(-side)}z`
}

/** Compact circle fleck from its center: two arcs. */
function circleFleck(cx: number, cy: number, r: number): string {
  return `M${fmt(cx - r)} ${fmt(cy)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0z`
}

/**
 * Fleck emission for the configured shape. `a` is the bounding-box side; chips are squares rotated
 * by `rot` radians with their AABB kept equal to `a`, so the non-overlap lattice invariant holds
 * for every rotation.
 */
function emitFleck(
  shape: TextureSettings['shape'],
  fx: number,
  fy: number,
  a: number,
  rot: number,
): string {
  if (shape === 'dot') return circleFleck(fx + a / 2, fy + a / 2, a / 2)
  if (shape === 'chip' && rot > 0) {
    const cx = fx + a / 2
    const cy = fy + a / 2
    const s = a / (Math.cos(rot) + Math.sin(rot))
    const h = s / 2
    const ca = Math.cos(rot)
    const sa = Math.sin(rot)
    const corners: [number, number][] = [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ].map(([x, y]) => [cx + x * ca - y * sa, cy + x * sa + y * ca])
    return `M${fmt(corners[0][0])} ${fmt(corners[0][1])}${corners
      .slice(1)
      .map(([x, y]) => `L${fmt(x)} ${fmt(y)}`)
      .join('')}z`
  }
  return squareFleck(fx, fy, a)
}

/* ------------------------------- distributions ------------------------------- */

/** Smooth bilinear value noise on an integer lattice, 0..1. */
function valueNoise(gx: number, gy: number, seed: number): number {
  const ix = Math.floor(gx)
  const iy = Math.floor(gy)
  const fx = gx - ix
  const fy = gy - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const v = (a: number, b: number) => hash2(a, b, seed) / 4_294_967_296
  return (
    (v(ix, iy) * (1 - sx) + v(ix + 1, iy) * sx) * (1 - sy) +
    (v(ix, iy + 1) * (1 - sx) + v(ix + 1, iy + 1) * sx) * sy
  )
}

/**
 * Probability multiplier for a candidate speck at doc-unit position (x, y): scatter = uniform;
 * clumps = single-octave stains; perlin = 3-octave fractal noise for natural multi-scale mottling;
 * voronoi = seeded stain colonies; streaks = directional wear bands along the configured angle.
 */
function distWeight(t: TextureSettings, x: number, y: number, pitch: number): number {
  if (t.dist === 'clumps') {
    return clamp(0.1 + 1.8 * valueNoise(x / (pitch * 3), y / (pitch * 3), t.seed), 0, 1)
  }
  if (t.dist === 'perlin') {
    const n =
      0.5 * valueNoise(x / (pitch * 3.2), y / (pitch * 3.2), t.seed) +
      0.3 * valueNoise(x / (pitch * 1.6), y / (pitch * 1.6), t.seed + 101) +
      0.2 * valueNoise(x / (pitch * 0.8), y / (pitch * 0.8), t.seed + 211)
    return clamp(0.12 + 1.76 * n, 0, 1)
  }
  if (t.dist === 'voronoi') {
    const step = pitch * 5
    const ix = Math.floor(x / step)
    const iy = Math.floor(y / step)
    let w = 0.08
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const lx = ix + ox
        const ly = iy + oy
        const r1 = hash2(lx, ly, t.seed) / 4_294_967_296
        const r2 = hash2(lx, ly, t.seed + 17) / 4_294_967_296
        const r3 = hash2(lx, ly, t.seed + 53) / 4_294_967_296
        const px = (lx + 0.15 + 0.7 * r1) * step
        const py = (ly + 0.15 + 0.7 * r2) * step
        const radius = step * (0.6 + 0.8 * r3)
        const dx = x - px
        const dy = y - py
        const d2 = (dx * dx + dy * dy) / (radius * radius)
        if (d2 < 1) w = Math.max(w, (0.6 + 0.5 * r2) * (1 - d2 * d2))
      }
    }
    return Math.min(1, w)
  }
  if (t.dist === 'streaks') {
    const theta = (clamp(t.angle, 0, 180) * Math.PI) / 180
    const phase = (t.seed % 7) * 0.9
    const s = (x * Math.cos(theta) + y * Math.sin(theta)) / pitch
    return clamp(0.85 + 0.55 * Math.sin((s * 2 * Math.PI) / 3 + phase), 0.15, 1)
  }
  return 1
}

/* ------------------------------ halftone distress ------------------------------ */

/** One candidate halftone dot: circle center + radius, in doc units. */
interface HtDot {
  cx: number
  cy: number
  r: number
}

/** Max radius deviation as a share of r at wobble 100. */
const HT_WOBBLE_AMP = 0.42

/** Packed signed grid key: 16 bits per axis around a 0x8000 bias. */
const htKey = (i: number, j: number) => (i + 0x80_00) * 0x1_00_00 + (j + 0x80_00)

/** Closed smooth polygon through `pts` (midpoint quadratic spline). */
function smoothClosedPath(pts: [number, number][]): string {
  const n = pts.length
  const mx = (a: [number, number], b: [number, number]) => fmt((a[0] + b[0]) / 2)
  const my = (a: [number, number], b: [number, number]) => fmt((a[1] + b[1]) / 2)
  let d = `M${mx(pts[n - 1], pts[0])} ${my(pts[n - 1], pts[0])}`
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % n]
    d += `Q${fmt(p[0])} ${fmt(p[1])} ${mx(p, q)} ${my(p, q)}`
  }
  return `${d}z`
}

/** Single wobbled circle: noise perturbation sampled on a circular route, so it closes. */
function wobblyCirclePath(cx: number, cy: number, r: number, amp: number, seed: number): string {
  const K = 12
  const pts: [number, number][] = []
  for (let k = 0; k < K; k++) {
    const a = (k / K) * Math.PI * 2
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const w = (valueNoise(ca * 1.7 + cx * 0.61, sa * 1.7 + cy * 0.61, seed) - 0.5) * 2 * amp
    const rr = Math.max(r * 0.2, r * (1 + w))
    pts.push([cx + ca * rr, cy + sa * rr])
  }
  return smoothClosedPath(pts)
}

/**
 * Star-shaped union of an overlapping dot cluster as one blob outline: for K rays from a pole
 * (area-weighted centroid, falling back to the largest dot's center so every ray hits something)
 * take the farthest circle intersection. Chords cut concave waists inward, so the blob never
 * under-covers the merged dots much and always stays a simple polygon (evenodd-safe as a single
 * subpath).
 */
function clusterBlobPath(cluster: HtDot[], amp: number, seed: number): string {
  let w = 0
  let gx = 0
  let gy = 0
  let big = cluster[0]
  for (const d of cluster) {
    const a = d.r * d.r
    w += a
    gx += d.cx * a
    gy += d.cy * a
    if (d.r > big.r) big = d
  }
  gx /= w
  gy /= w
  if (!cluster.some((d) => (d.cx - gx) ** 2 + (d.cy - gy) ** 2 <= d.r * d.r)) {
    gx = big.cx
    gy = big.cy
  }
  const K = Math.min(32, 10 + cluster.length * 6)
  const pts: [number, number][] = []
  for (let k = 0; k < K; k++) {
    const a = (k / K) * Math.PI * 2
    const ux = Math.cos(a)
    const uy = Math.sin(a)
    let best = 0
    for (const d of cluster) {
      const px = d.cx - gx
      const py = d.cy - gy
      const proj = ux * px + uy * py
      const disc = proj * proj - (px * px + py * py - d.r * d.r)
      if (disc < 0) continue
      const t = proj + Math.sqrt(disc)
      if (t > best) best = t
    }
    let rr = best
    if (amp > 0 && rr > 0) {
      const wn = (valueNoise(ux * 2.3 + gx * 0.57, uy * 2.3 + gy * 0.57, seed) - 0.5) * 2 * amp
      rr = Math.max(rr * 0.55, rr * (1 + wn))
    }
    pts.push([gx + ux * rr, gy + uy * rr])
  }
  return smoothClosedPath(pts)
}

/**
 * Emit collected halftone dots. Singletons stay plain circles (or wobbled ones); grid neighbors
 * whose circles touch or overlap — or come within the merge neck — fuse into one star-union blob
 * each, so merged dots are a single evenodd subpath and never XOR against their own halves.
 * `stride` is the placement grid step the caller scanned with; adjacency is checked right/down at
 * that step.
 */
function emitHalftoneDots(
  dots: HtDot[],
  keys: number[],
  dotAt: Map<number, number>,
  stride: number,
  t: TextureSettings,
  pitch: number,
): string {
  const n = dots.length
  if (n === 0) return ''
  const parent = new Int32Array(n)
  const size = new Int32Array(n).fill(1)
  for (let i = 0; i < n; i++) parent[i] = i
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const unite = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return
    parent[ra] = rb
    size[rb] += size[ra]
  }
  // touching/overlapping dots must fuse (a lone overlap would XOR against its
  // twin under evenodd); the extra "ink bleed" neck is optional and gated by the
  // merge slider, and only ever joins two single dots, so blobs stay dot-scale
  const mergeP = t.merge / 100
  const neck = mergeP * 0.55 * pitch
  for (let i = 0; i < n; i++) {
    const ki = keys[i]
    for (const nk of [ki + stride * 0x1_00_00, ki + stride]) {
      const j = dotAt.get(nk)
      if (j === undefined) continue
      const d = Math.hypot(dots[j].cx - dots[i].cx, dots[j].cy - dots[i].cy)
      if (d <= dots[i].r + dots[j].r) {
        unite(i, j)
        continue
      }
      const ri = find(i)
      const rj = find(j)
      if (
        neck > 0 &&
        d <= dots[i].r + dots[j].r + neck &&
        ri !== rj &&
        size[ri] === 1 &&
        size[rj] === 1 &&
        hash2(Math.min(ki, nk), Math.max(ki, nk), t.seed + 991) / 4_294_967_296 < mergeP
      ) {
        unite(ri, rj)
      }
    }
  }
  const clusters = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    const list = clusters.get(root)
    if (list) list.push(i)
    else clusters.set(root, [i])
  }
  const amp = (t.wobble / 100) * HT_WOBBLE_AMP
  let out = ''
  for (const [root, list] of clusters) {
    if (list.length === 1) {
      const d = dots[list[0]]
      out += amp > 0 ? wobblyCirclePath(d.cx, d.cy, d.r, amp, t.seed) : circleFleck(d.cx, d.cy, d.r)
    } else {
      out += clusterBlobPath(
        list.map((i) => dots[i]),
        amp,
        (t.seed + root) | 0,
      )
    }
  }
  return out
}

/** Spray specks that would land on (or inside) a dot are dropped, not XORed. */
function filterSpray(
  spray: (HtDot & { key: number })[],
  dots: HtDot[],
  dotAt: Map<number, number>,
  pitch: number,
): string {
  const clearance = dots.length > 0 ? pitch * 0.08 : 0
  let out = ''
  for (const s of spray) {
    let ok = true
    for (let di = -1; di <= 1 && ok; di++) {
      for (let dj = -1; dj <= 1 && ok; dj++) {
        const j = dotAt.get(s.key + di * 0x1_00_00 + dj)
        if (j === undefined) continue
        if (Math.hypot(dots[j].cx - s.cx, dots[j].cy - s.cy) < dots[j].r + s.r + clearance)
          ok = false
      }
    }
    if (ok) out += circleFleck(s.cx, s.cy, s.r)
  }
  return out
}

/* ------------------------------ region placement ------------------------------ */

/** One paintable cell of a same-color region, in doc units. */
export interface TextureCell {
  /** Fill rect (the rounded rect actually painted for this cell) */
  x: number
  y: number
  w: number
  h: number
  /** Fill corner radii tl,tr,br,bl */
  radii: number[]
  chamfer: boolean
  /** Grid-tile bounds this cell occupies (fill rect ⊆ tile bounds) */
  cx0: number
  cy0: number
  cx1: number
  cy1: number
  /** True when the neighboring tile holds the same value: texture runs across */
  connectedL: boolean
  connectedT: boolean
  connectedR: boolean
  connectedB: boolean
}

/**
 * Texture hole fragments for a whole same-color region. Specks are placed on a lattice anchored to
 * the document origin, so adjacent connected cells share one continuous pattern with no seams; only
 * sides facing empty space (or another color) carry the gap margin. Candidates are sampled against
 * the actual painted fills (including corner fillets), so holes never land outside the artwork.
 */
export function regionTextureFragments(
  cells: TextureCell[],
  t: TextureSettings,
  key: number,
): string {
  if (cells.length === 0 || t.effect === 'none' || t.amount <= 0) return ''
  const sub = Math.max(1, Math.round(1 / (cells[0].cx1 - cells[0].cx0)))
  const L = 0.14 * clamp(t.scale, 0.1, 8) // lattice pitch, in cells
  const Ld = L / sub // lattice pitch, doc units
  const gapU = clamp(t.gap, 0, 0.45) / sub
  const band = 0.25 * (clamp(t.scale, 0.1, 8) / sub) // grunge edge band, doc units
  const halftone = t.effect === 'halftone'
  const p = t.amount / 100
  const e = clamp(t.edge, 0, 100) / 100
  const minW = 1 - 0.85 * e

  // per-side placement bounds: connected sides run to the tile edge, open sides
  // are inset by the gap margin
  const bounds = cells.map((c) => ({
    left: c.connectedL ? c.cx0 : c.x + gapU,
    top: c.connectedT ? c.cy0 : c.y + gapU,
    right: c.connectedR ? c.cx1 : c.x + c.w - gapU,
    bottom: c.connectedB ? c.cy1 : c.y + c.h - gapU,
  }))

  // spatial lookup: buffer tile under a doc point
  const index = new Map<number, number>()
  cells.forEach((c, k) => {
    const bx = Math.floor(((c.cx0 + c.cx1) / 2) * sub)
    const by = Math.floor(((c.cy0 + c.cy1) / 2) * sub)
    index.set(bx * 65_536 + by, k)
  })
  const locate = (px: number, py: number): number | undefined =>
    index.get(Math.floor(px * sub) * 65_536 + Math.floor(py * sub))

  // a sample point must sit inside the painted fill rect (corner fillets
  // included) AND inside the tile's placement bounds. The fill-rect test is what
  // keeps specks out of the gutters between non-touching fills; when fills tile
  // fully (size 100%) specks cross shared edges freely, so regions stay seamless
  const sampleOk = (px: number, py: number): boolean => {
    const k = locate(px, py)
    if (k === undefined) return false
    const c = cells[k]
    const b = bounds[k]
    if (px < c.x || px > c.x + c.w || py < c.y || py > c.y + c.h) return false
    if (px < b.left || px > b.right || py < b.top || py > b.bottom) return false
    const [tl, tr, br, bl] = c.radii
    if (px < c.x + tl && py < c.y + tl)
      return cornerPointOk(px, py, c.x + tl, c.y + tl, tl, c.chamfer, 'tl', c)
    if (px > c.x + c.w - tr && py < c.y + tr)
      return cornerPointOk(px, py, c.x + c.w - tr, c.y + tr, tr, c.chamfer, 'tr', c)
    if (px > c.x + c.w - br && py > c.y + c.h - br) {
      return cornerPointOk(px, py, c.x + c.w - br, c.y + c.h - br, br, c.chamfer, 'br', c)
    }
    if (px < c.x + bl && py > c.y + c.h - bl)
      return cornerPointOk(px, py, c.x + bl, c.y + c.h - bl, bl, c.chamfer, 'bl', c)
    return true
  }
  const fits = (fx: number, fy: number, a: number): boolean => {
    const mx = fx + a / 2
    const my = fy + a / 2
    return (
      sampleOk(fx, fy) &&
      sampleOk(fx + a, fy) &&
      sampleOk(fx, fy + a) &&
      sampleOk(fx + a, fy + a) &&
      sampleOk(mx, fy) &&
      sampleOk(mx, fy + a) &&
      sampleOk(fx, my) &&
      sampleOk(fx + a, my) &&
      sampleOk(mx, my)
    )
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of cells) {
    minX = Math.min(minX, c.cx0)
    minY = Math.min(minY, c.cy0)
    maxX = Math.max(maxX, c.cx1)
    maxY = Math.max(maxY, c.cy1)
  }
  const theta = (clamp(t.angle, 0, 180) * Math.PI) / 180
  const ca = Math.cos(theta)
  const sa = Math.sin(theta)
  let I0: number
  let I1: number
  let J0: number
  let J1: number
  let prMin = 0
  let prMax = 0
  if (halftone) {
    // rotated screen grid: scan the grid-index range covering the region's
    // rotated bbox, and precompute the tone-ramp projection range
    const mx = (minX + maxX) / 2
    const my = (minY + maxY) / 2
    const hx = (maxX - minX) / 2
    const hy = (maxY - minY) / 2
    const gcx = mx * ca + my * sa
    const gcy = -mx * sa + my * ca
    const rx = Math.abs(ca) * hx + Math.abs(sa) * hy + Ld
    const ry = Math.abs(sa) * hx + Math.abs(ca) * hy + Ld
    I0 = Math.floor((gcx - rx) / Ld) - 1
    I1 = Math.ceil((gcx + rx) / Ld) + 1
    J0 = Math.floor((gcy - ry) / Ld) - 1
    J1 = Math.ceil((gcy + ry) / Ld) + 1
    prMin = Infinity
    prMax = -Infinity
    for (const [px, py] of [
      [minX, minY],
      [maxX, minY],
      [minX, maxY],
      [maxX, maxY],
    ]) {
      const pr = px * ca + py * sa
      prMin = Math.min(prMin, pr)
      prMax = Math.max(prMax, pr)
    }
  } else {
    I0 = Math.floor((minX * sub) / L)
    I1 = Math.ceil((maxX * sub) / L)
    J0 = Math.floor((minY * sub) / L)
    J1 = Math.ceil((maxY * sub) / L)
  }
  const estTotal = (I1 - I0 + 1) * (J1 - J0 + 1)
  let stride = 1
  if (halftone) {
    const factor = Math.ceil(Math.sqrt(estTotal / MAX_REGION_FLECKS))
    if (factor > 1) stride = factor
  }
  const keep = halftone ? 1 : Math.min(1, MAX_REGION_FLECKS / Math.max(1, estTotal * p))

  // halftone dots are collected first, then fused/emitted in one pass
  const dots: HtDot[] = []
  const dotKeys: number[] = []
  const dotAt = new Map<number, number>()
  const sprayCand: (HtDot & { key: number })[] = []
  let out = ''
  let count = 0
  for (let J = J0; J <= J1 && count < MAX_REGION_FLECKS; J += stride) {
    for (let I = I0; I <= I1 && count < MAX_REGION_FLECKS; I += stride) {
      const rand = mulberry32(hash2(I, J, t.seed + key * 1013))
      const r1 = rand()
      const r2 = rand()
      const r3 = rand()
      const r4 = rand()
      const r5 = rand()
      if (halftone) {
        const gx = I + 0.5
        const gy = J + 0.5
        let dx = (gx * ca - gy * sa) * Ld
        let dy = (gx * sa + gy * ca) * Ld
        if (t.jitter > 0) {
          const jx = (r1 - 0.5) * (t.jitter / 100) * Ld
          const jy = (r2 - 0.5) * (t.jitter / 100) * Ld
          dx += jx * ca - jy * sa
          dy += jx * sa + jy * ca
        }
        const kk = locate(dx, dy)
        if (kk === undefined) continue
        let mult = 1
        if (t.ramp > 0) {
          const tt = clamp((dx * ca + dy * sa - prMin) / Math.max(prMax - prMin, 1e-9), 0, 1)
          mult *= 1 + (t.ramp / 100) * (2 * tt - 1)
        }
        if (t.variation > 0) mult *= 1 + (t.variation / 100) * (r3 * 2 - 1)
        const a = Math.min(Ld * 0.9 * p * Math.max(mult, 0.05), Ld * 0.95)
        const dropped =
          t.dropout > 0 &&
          valueNoise(dx / (Ld * 4), dy / (Ld * 4), t.seed + 77) < (t.dropout / 100) * 0.92
        if (a > Ld * 0.015 && !dropped) {
          let fx = dx
          let fy = dy
          let ok = fits(fx, fy, a)
          if (!ok) {
            // fit, don't reject: pull the dot toward the fill center of the tile
            const c = cells[kk]
            const tcx = c.x + c.w / 2
            const tcy = c.y + c.h / 2
            const dl = Math.hypot(tcx - fx, tcy - fy)
            if (dl > 1e-9) {
              const ux = (tcx - fx) / dl
              const uy = (tcy - fy) / dl
              for (const m of [0.4, 0.9]) {
                const nx = fx + ux * a * m
                const ny = fy + uy * a * m
                if (fits(nx, ny, a)) {
                  fx = nx
                  fy = ny
                  ok = true
                  break
                }
              }
            }
          }
          if (ok) {
            const k = htKey(I, J)
            dotAt.set(k, dots.length)
            dotKeys.push(k)
            dots.push({ cx: fx + a / 2, cy: fy + a / 2, r: a / 2 })
            count++
          }
        }
        if (t.spray > 0 && dots.length + sprayCand.length < MAX_REGION_FLECKS) {
          const s1 = rand()
          const s2 = rand()
          const s3 = rand()
          if (s1 < (t.spray / 100) * 0.6) {
            // keep the speck within the middle half of the cell so sprays from
            // adjacent cells can never touch each other (they would XOR)
            const wi = I + 0.25 + s2 * 0.5
            const wj = J + 0.25 + s3 * 0.5
            const sx = (wi * ca - wj * sa) * Ld
            const sy = (wi * sa + wj * ca) * Ld
            const sr = Ld * (0.025 + 0.055 * ((s2 + s3) / 2))
            if (fits(sx - sr, sy - sr, sr * 2)) {
              sprayCand.push({ cx: sx, cy: sy, r: sr, key: htKey(I, J) })
            }
          }
        }
        continue
      }
      const cx = (I + 0.5) * Ld
      const cy = (J + 0.5) * Ld
      const k = locate(cx, cy)
      if (k === undefined) continue
      let weight = distWeight(t, cx, cy, Ld)
      if (t.effect === 'grunge') {
        const c = cells[k]
        const b = bounds[k]
        let d = Infinity
        if (!c.connectedL) d = Math.min(d, cx - b.left)
        if (!c.connectedR) d = Math.min(d, b.right - cx)
        if (!c.connectedT) d = Math.min(d, cy - b.top)
        if (!c.connectedB) d = Math.min(d, b.bottom - cy)
        weight *= clamp(1 + 0.5 * e - (0.5 + 0.5 * e) * Math.min(1, d / band), minW, 1)
      }
      if (r1 >= p * weight * keep) continue
      // speck bounding box: size range plus an edge-wear bonus for grunge
      let a: number = lerp(t.sizeMin, t.sizeMax, r3) * Ld
      if (t.effect === 'grunge') {
        const c = cells[k]
        const b = bounds[k]
        let d = Infinity
        if (!c.connectedL) d = Math.min(d, cx - b.left)
        if (!c.connectedR) d = Math.min(d, b.right - cx)
        if (!c.connectedT) d = Math.min(d, cy - b.top)
        if (!c.connectedB) d = Math.min(d, b.bottom - cy)
        a *= 1 + 0.35 * (1 - Math.min(1, d / band))
      }
      a = Math.min(a, 0.6 * Ld)
      const jx = (r2 - 0.5) * (Ld - a) * 0.95
      const jy = (r4 - 0.5) * (Ld - a) * 0.95
      let fx = cx + jx
      let fy = cy + jy
      if (!fits(fx, fy, a)) {
        // fit, don't reject: pull the speck toward the fill center of the tile
        // it sits in, so corner-adjacent candidates survive rounding
        const c = cells[k]
        const tcx = c.x + c.w / 2
        const tcy = c.y + c.h / 2
        const dl = Math.hypot(tcx - fx, tcy - fy)
        if (dl > 1e-9) {
          const ux = (tcx - fx) / dl
          const uy = (tcy - fy) / dl
          let placed = false
          for (const mult of [0.4, 0.9]) {
            const nx = fx + ux * a * mult
            const ny = fy + uy * a * mult
            if (fits(nx, ny, a)) {
              fx = nx
              fy = ny
              placed = true
              break
            }
          }
          if (!placed) continue
        } else {
          continue
        }
      }
      out += emitFleck(t.shape, fx, fy, a, t.shape === 'chip' ? r5 * (Math.PI / 2) : 0)
      count++
    }
  }
  if (halftone) {
    return (
      emitHalftoneDots(dots, dotKeys, dotAt, stride, t, Ld) +
      filterSpray(sprayCand, dots, dotAt, Ld)
    )
  }
  return out
}

/** Point inside a fillet corner? arc — distance; chamfer — diagonal offset. */
function cornerPointOk(
  px: number,
  py: number,
  ccx: number,
  ccy: number,
  r: number,
  chamfer: boolean,
  corner: 'tl' | 'tr' | 'br' | 'bl',
  c: TextureCell,
): boolean {
  if (chamfer) {
    const u = corner === 'tl' || corner === 'bl' ? px - c.x : c.x + c.w - px
    const v = corner === 'tl' || corner === 'tr' ? py - c.y : c.y + c.h - py
    return u + v >= r
  }
  const dx = px - ccx
  const dy = py - ccy
  return dx * dx + dy * dy <= r * r
}

/* ------------------------------ metaball field ------------------------------ */

/** Minimal view of a metaball field: values on a regular grid in doc units. */
export interface TextureField {
  f: ArrayLike<number>
  fw: number
  fh: number
  /** Doc units per field node */
  scale: number
}

/** Bilinear field sample at doc-unit coordinates. */
function fieldAt(field: TextureField, x: number, y: number): number {
  const { f, fw, fh, scale } = field
  const gx = clamp(x / scale, 0, fw - 1.001)
  const gy = clamp(y / scale, 0, fh - 1.001)
  const ix = Math.floor(gx)
  const iy = Math.floor(gy)
  const fx = gx - ix
  const fy = gy - iy
  const a = f[iy * fw + ix]
  const b = f[iy * fw + ix + 1]
  const c = f[(iy + 1) * fw + ix]
  const d = f[(iy + 1) * fw + ix + 1]
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
}

/** Rough doc-unit distance from a point to the ISO contour via the field gradient. */
function contourDepth(field: TextureField, x: number, y: number, v: number): number {
  const e = field.scale
  const gx = (fieldAt(field, x + e, y) - fieldAt(field, x - e, y)) / 2
  const gy = (fieldAt(field, x, y + e) - fieldAt(field, x, y - e)) / 2
  const g = Math.max(Math.hypot(gx, gy), 1e-6)
  return (v - ISO) / g
}

/** Normalized field gradient direction (toward higher field values). */
function fieldGradDir(field: TextureField, x: number, y: number): [number, number] {
  const e = field.scale
  const gx = (fieldAt(field, x + e, y) - fieldAt(field, x - e, y)) / 2
  const gy = (fieldAt(field, x, y + e) - fieldAt(field, x, y - e)) / 2
  const m = Math.hypot(gx, gy)
  return m < 1e-6 ? [0, 0] : [gx / m, gy / m]
}

/**
 * Texture hole fragments for a metaball blob, sampled from its field in doc units. `sub` converts
 * the texture pitch (cell units) into doc units. A candidate survives when its four corners sample
 * above the contour — and when they don't, the speck is nudged along the field gradient (fit, don't
 * reject), so grunge stays dense at blob edges. Halftone uses the same sampling with a regular
 * (optionally rotated) screen grid, distress knobs and seed-driven randomness, shared with the
 * pixels/outline region path.
 */
export function fieldTextureFragments(
  field: TextureField,
  t: TextureSettings,
  key: number,
  sub = 1,
): string {
  if (t.effect === 'none' || t.amount <= 0) return ''
  const { fw, fh, scale } = field
  // pitch in doc units: cells are 1/sub doc units wide, matching pixels-mode density
  const pitch = (0.14 * clamp(t.scale, 0.1, 8)) / sub
  let stride = Math.max(1, Math.round(pitch / scale))
  const halftone = t.effect === 'halftone'
  const p = t.amount / 100
  const e = clamp(t.edge, 0, 100) / 100
  const minW = 1 - 0.85 * e
  const band = 0.25 * (clamp(t.scale, 0.1, 8) / sub)
  const gapU = clamp(t.gap, 0, 0.45) / sub
  // keep the output bounded on big blobs: probabilistic effects thin out
  // uniformly via the RNG gate, halftone coarsens its grid so it stays regular
  const estTotal = Math.ceil((fw - 2) / stride) * Math.ceil((fh - 2) / stride)
  let keep = 1
  if (halftone) {
    const factor = Math.ceil(Math.sqrt(estTotal / MAX_REGION_FLECKS))
    if (factor > 1) stride *= factor
  } else {
    keep = Math.min(1, MAX_REGION_FLECKS / Math.max(1, estTotal * p))
  }
  const spacing = stride * scale
  const rand = mulberry32(hash(key, t.seed))
  const theta = (clamp(t.angle, 0, 180) * Math.PI) / 180
  const ca = Math.cos(theta)
  const sa = Math.sin(theta)
  let prMin = 0
  let prMax = 0
  if (halftone && t.ramp > 0) {
    prMin = Infinity
    prMax = -Infinity
    for (const [px, py] of [
      [0, 0],
      [(fw - 1) * scale, 0],
      [0, (fh - 1) * scale],
      [(fw - 1) * scale, (fh - 1) * scale],
    ]) {
      const pr = px * ca + py * sa
      prMin = Math.min(prMin, pr)
      prMax = Math.max(prMax, pr)
    }
  }
  // halftone dots are collected first, then fused/emitted in one pass
  const dots: HtDot[] = []
  const dotKeys: number[] = []
  const dotAt = new Map<number, number>()
  const sprayCand: (HtDot & { key: number })[] = []
  let out = ''
  let count = 0

  // a fleck is only safe when all four corners sit strictly inside the blob
  const solid = (x: number, y: number, s: number): boolean =>
    fieldAt(field, x, y) > ISO &&
    fieldAt(field, x + s, y) > ISO &&
    fieldAt(field, x, y + s) > ISO &&
    fieldAt(field, x + s, y + s) > ISO

  for (let j = 1; j < fh - 1 && count < MAX_REGION_FLECKS; j += stride) {
    for (let i = 1; i < fw - 1 && count < MAX_REGION_FLECKS; i += stride) {
      if (halftone) {
        // rotated screen grid, tone in dot size
        const r1 = rand()
        const r2 = rand()
        const r3 = rand()
        let dx = (i * ca - j * sa) * scale
        let dy = (i * sa + j * ca) * scale
        if (t.jitter > 0) {
          const jx = (r1 - 0.5) * (t.jitter / 100) * spacing
          const jy = (r2 - 0.5) * (t.jitter / 100) * spacing
          dx += jx * ca - jy * sa
          dy += jx * sa + jy * ca
        }
        const center = fieldAt(field, dx, dy)
        if (center <= ISO + 0.15) continue
        const depth = contourDepth(field, dx, dy, center)
        if (gapU > 0 && depth < gapU) continue
        let mult = 1
        if (t.ramp > 0) {
          const tt = clamp((dx * ca + dy * sa - prMin) / Math.max(prMax - prMin, 1e-9), 0, 1)
          mult *= 1 + (t.ramp / 100) * (2 * tt - 1)
        }
        if (t.variation > 0) mult *= 1 + (t.variation / 100) * (r3 * 2 - 1)
        const a = Math.min(spacing * 0.9 * p * Math.max(mult, 0.05), spacing * 0.95)
        const dropped =
          t.dropout > 0 &&
          valueNoise(dx / (spacing * 4), dy / (spacing * 4), t.seed + 77) < (t.dropout / 100) * 0.92
        if (a > spacing * 0.015 && !dropped) {
          let fx = dx
          let fy = dy
          if (!solid(fx, fy, a)) {
            // fit, don't reject: nudge along the field gradient (toward the blob
            // interior) with growing steps — the first step that fits wins
            const [gxx, gyy] = fieldGradDir(field, fx, fy)
            for (const m of [0.3, 0.6, 1.2]) {
              const nx = fx + gxx * a * m
              const ny = fy + gyy * a * m
              if (solid(nx, ny, a)) {
                fx = nx
                fy = ny
                break
              }
            }
          }
          if (solid(fx, fy, a)) {
            const k = htKey(i, j)
            dotAt.set(k, dots.length)
            dotKeys.push(k)
            dots.push({ cx: fx + a / 2, cy: fy + a / 2, r: a / 2 })
            count++
          }
        }
        if (t.spray > 0 && dots.length + sprayCand.length < MAX_REGION_FLECKS) {
          const s1 = rand()
          const s2 = rand()
          const s3 = rand()
          if (s1 < (t.spray / 100) * 0.6) {
            const wi = i + 0.25 + s2 * 0.5
            const wj = j + 0.25 + s3 * 0.5
            const sx = (wi * ca - wj * sa) * scale
            const sy = (wi * sa + wj * ca) * scale
            const sr = spacing * (0.025 + 0.055 * ((s2 + s3) / 2))
            if (solid(sx - sr, sy - sr, sr * 2)) {
              sprayCand.push({ cx: sx, cy: sy, r: sr, key: htKey(i, j) })
            }
          }
        }
        continue
      }
      const cx = i * scale
      const cy = j * scale
      const center = fieldAt(field, cx, cy)
      if (center <= ISO + 0.15) continue
      const depth = contourDepth(field, cx, cy, center)
      // texture gap: skip candidates closer to the contour than the gap
      if (gapU > 0 && depth < gapU) continue
      const r1 = rand()
      const r2 = rand()
      const r3 = rand()
      const r4 = rand()
      const r5 = rand()
      let weight = distWeight(t, cx, cy, spacing)
      if (t.effect === 'grunge') {
        // wear follows distance to the contour, not raw field magnitude
        weight *= clamp(1 + 0.5 * e - (0.5 + 0.5 * e) * Math.min(1, depth / band), minW, 1)
      }
      if (r1 >= p * weight * keep) continue
      const a = lerp(t.sizeMin, t.sizeMax, r3) * spacing
      const jx = (r2 - 0.5) * (spacing - a) * 0.9
      const jy = (r4 - 0.5) * (spacing - a) * 0.9
      let fx = cx + jx
      let fy = cy + jy
      if (!solid(fx, fy, a)) {
        // fit, don't reject: nudge along the field gradient (toward the blob
        // interior) with growing steps — the first step that fits wins
        const [gxx, gyy] = fieldGradDir(field, fx, fy)
        let placed = false
        for (const mult of [0.3, 0.6, 1.2]) {
          const nx = fx + gxx * a * mult
          const ny = fy + gyy * a * mult
          if (solid(nx, ny, a)) {
            fx = nx
            fy = ny
            placed = true
            break
          }
        }
        if (!placed) continue
      }
      out += emitFleck(t.shape, fx, fy, a, t.shape === 'chip' ? r5 * (Math.PI / 2) : 0)
      count++
    }
  }
  if (halftone) {
    return (
      emitHalftoneDots(dots, dotKeys, dotAt, stride, t, spacing) +
      filterSpray(sprayCand, dots, dotAt, spacing)
    )
  }
  return out
}
