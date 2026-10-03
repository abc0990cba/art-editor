import type { Doc, MetaballFalloff } from '../core/doc.ts'
import { marchingSquares, type Pt } from './marching-squares.ts'
import { fmt } from './shape.ts'

/* ---------------------------------- metaball field ---------------------------------- */
/* One scalar-field builder serves the square and non-square metaball paths: splat sources and
   link capsules arrive in doc units, quality/preview resolution is folded into `step`. */

const FALLOFF_POWER: Record<MetaballFalloff, number> = { tight: 3, smooth: 2, gooey: 1 }

/** Kernel radius in doc units (cell pitch = 1): merges orthogonal neighbors from ~s=0 up. */
export function kernelRadius(strength: number, sub: number): number {
  return (0.815 + (strength / 100) * 0.44) / sub
}

/** Field value that counts as inside, clamped to the documented 0.2–0.8 range. */
export function metaballIso(doc: Doc): number {
  return Math.min(0.8, Math.max(0.2, doc.metaball.iso))
}

/** One kernel splat (cell center or junction point) in doc units, belonging to color `v`. */
export interface MetaballSource {
  x: number
  y: number
  v: number
}

/** A connector rendered as a capsule of kernels between two endpoints in doc units. */
export interface MetaballCapsule {
  ax: number
  ay: number
  bx: number
  by: number
  v: number
}

export interface MetaballField {
  f: Float32Array
  fw: number
  fh: number
  /** Field node → doc units */
  scale: number
}

/**
 * Sum of kernel splats (power-law falloff) from `sources` and `capsules` filtered by `take`. `step`
 * is the node pitch in doc units; `squareEdges` mirrors the border nodes so contours can run
 * straight along the canvas edge instead of clamping to zero.
 */
export function buildMetaballField(opts: {
  w: number
  h: number
  step: number
  sources: readonly MetaballSource[]
  capsules: readonly MetaballCapsule[]
  take: (v: number) => boolean
  strength: number
  sub: number
  falloff: MetaballFalloff
  squareEdges: boolean
}): MetaballField {
  const fw = Math.ceil(opts.w / opts.step) + 1
  const fh = Math.ceil(opts.h / opts.step) + 1
  const f = new Float32Array(fw * fh)
  const power = FALLOFF_POWER[opts.falloff] ?? 3
  const R = kernelRadius(opts.strength, opts.sub) / opts.step
  const R2 = R * R

  const splat = (cxf: number, cyf: number) => {
    const x0 = Math.max(0, Math.ceil(cxf - R))
    const x1 = Math.min(fw - 1, Math.floor(cxf + R))
    const y0 = Math.max(0, Math.ceil(cyf - R))
    const y1 = Math.min(fh - 1, Math.floor(cyf + R))
    for (let iy = y0; iy <= y1; iy++) {
      const dy = iy - cyf
      for (let ix = x0; ix <= x1; ix++) {
        const dx = ix - cxf
        const d2 = dx * dx + dy * dy
        if (d2 < R2) {
          const t = 1 - d2 / R2
          f[iy * fw + ix] += t ** power
        }
      }
    }
  }

  for (const s of opts.sources) {
    if (s.v === 0 || !opts.take(s.v)) continue
    splat(s.x / opts.step, s.y / opts.step)
  }
  for (const c of opts.capsules) {
    if (c.v === 0 || !opts.take(c.v)) continue
    // capsule of kernels along the link segment (same falloff as point splats)
    const ax = c.ax / opts.step
    const ay = c.ay / opts.step
    const bx = c.bx / opts.step
    const by = c.by / opts.step
    const abx = bx - ax
    const aby = by - ay
    const len2 = abx * abx + aby * aby
    for (
      let iy = Math.max(0, Math.ceil(Math.min(ay, by) - R));
      iy <= Math.min(fh - 1, Math.floor(Math.max(ay, by) + R));
      iy++
    ) {
      for (
        let ix = Math.max(0, Math.ceil(Math.min(ax, bx) - R));
        ix <= Math.min(fw - 1, Math.floor(Math.max(ax, bx) + R));
        ix++
      ) {
        let t = len2 > 0 ? ((ix - ax) * abx + (iy - ay) * aby) / len2 : 0
        t = Math.max(0, Math.min(1, t))
        const dx = ix - (ax + t * abx)
        const dy = iy - (ay + t * aby)
        const d2 = dx * dx + dy * dy
        if (d2 < R2) {
          const k = 1 - d2 / R2
          f[iy * fw + ix] += k ** power
        }
      }
    }
  }

  // Clamp blobs at the canvas border so contours always close inside. With squareEdges the
  // border nodes mirror the adjacent inner node instead: blobs meeting the canvas edge lock
  // onto it and marching squares draws the shared stretch as a straight border segment.
  for (let x = 0; x < fw; x++) {
    f[x] = opts.squareEdges ? f[fw + x] : 0
    f[(fh - 1) * fw + x] = opts.squareEdges ? f[(fh - 2) * fw + x] : 0
  }
  for (let y = 0; y < fh; y++) {
    f[y * fw] = opts.squareEdges ? f[y * fw + 1] : 0
    f[y * fw + fw - 1] = opts.squareEdges ? f[y * fw + fw - 2] : 0
  }
  return { f, fw, fh, scale: opts.step }
}

/** Marching squares over `field` at `iso`, padded when contours may run along the border. */
export function traceMetaballLoops(
  field: MetaballField,
  iso: number,
  squareEdges: boolean,
): Pt[][] {
  if (!squareEdges) return marchingSquares(field.f, field.fw, field.fh, iso)
  const fw = field.fw + 2
  const fh = field.fh + 2
  const padded = new Float32Array(fw * fh)
  for (let y = 0; y < field.fh; y++) {
    padded.set(field.f.subarray(y * field.fw, (y + 1) * field.fw), (y + 1) * fw + 1)
  }
  return marchingSquares(padded, fw, fh, iso).map((loop) =>
    loop.map((p) => ({ x: p.x - 1, y: p.y - 1 })),
  )
}

/** Convert marching-squares loops into one smooth compound path (midpoint quadratics), doc units. */
export function loopsToSmoothPath(loops: Pt[][], scale: number): string {
  let d = ''
  for (const raw of loops) {
    const pts: Pt[] = []
    for (const p of raw) {
      const last = pts.at(-1)
      if (!last || Math.abs(last.x - p.x) > 1e-9 || Math.abs(last.y - p.y) > 1e-9) pts.push(p)
    }
    if (pts.length > 2) {
      const first = pts[0]
      const lastP = pts[pts.length - 1]
      if (Math.abs(first.x - lastP.x) < 1e-9 && Math.abs(first.y - lastP.y) < 1e-9) pts.pop()
    }
    const n = pts.length
    if (n < 3) continue
    const mid = (a: Pt, b: Pt) =>
      `${fmt(((a.x + b.x) / 2) * scale)} ${fmt(((a.y + b.y) / 2) * scale)}`
    const at = (i: number) => `${fmt(pts[i].x * scale)} ${fmt(pts[i].y * scale)}`
    d += `M${mid(pts[n - 1], pts[0])}`
    for (let i = 0; i < n; i++) d += `Q${at(i)} ${mid(pts[i], pts[(i + 1) % n])}`
    d += 'Z'
  }
  return d
}
