import { bufferHeight, bufferWidth, cellColor, type Doc, type Link } from './doc.ts'
import { fmt } from './geometry-shape.ts'
import type { Geometry, StyledPath } from './geometry-types.ts'
import { marchingSquares, type Pt } from './marching-squares.ts'
import { fieldTextureFragments } from './texture.ts'

/* ---------------------------------- metaball mode ---------------------------------- */

const ISO = 0.5

/** Kernel radius in cell units: merges orthogonal neighbors from ~s=0 up; diagonals from ~s=80. */
function kernelRadius(doc: Doc): number {
  return (0.815 + (doc.metaball.strength / 100) * 0.44) / doc.sub
}

interface Field {
  f: Float32Array
  fw: number
  fh: number
  /** Field node -> doc units */
  scale: number
}

function buildField(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
  take: (v: number) => boolean,
  /** Cap on the field side in nodes: lowered during in-stroke previews */
  maxSide: number,
): Field {
  const bw = bufferWidth(doc)
  const bh = bufferHeight(doc)
  const q = Math.max(1, Math.min(doc.metaball.quality, Math.floor(maxSide / Math.max(bw, bh)) || 1))
  const fw = bw * q + 1
  const fh = bh * q + 1
  const f = new Float32Array(fw * fh)
  const R = kernelRadius(doc) * doc.sub * q
  const R2 = R * R
  const w = doc.palette.length

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
          f[iy * fw + ix] += t * t * t
        }
      }
    }
  }

  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const v = cells[by * bw + bx]
      if (v === 0 || v > w || !take(v)) continue
      splat((bx + 0.5) * q, (by + 0.5) * q)
    }
  }

  // corner connectivity: an extra kernel at each diagonal junction merges corner-touching
  // neighbors of the same value through the shared corner at any strength (both diagonals)
  if (doc.connectivity !== 'edge') {
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const v = cells[by * bw + bx]
        if (v === 0 || v > w || !take(v)) continue
        const sideR = bx + 1 < bw ? cells[by * bw + bx + 1] : 0
        // ↘ junction with (bx+1, by+1)
        if (
          bx + 1 < bw &&
          by + 1 < bh &&
          cells[(by + 1) * bw + bx + 1] === v &&
          sideR === 0 &&
          cells[(by + 1) * bw + bx] === 0
        ) {
          splat((bx + 1) * q, (by + 1) * q)
        }
        // ↗ junction with (bx+1, by-1)
        if (
          bx + 1 < bw &&
          by - 1 >= 0 &&
          cells[(by - 1) * bw + bx + 1] === v &&
          sideR === 0 &&
          cells[(by - 1) * bw + bx] === 0
        ) {
          splat((bx + 1) * q, by * q)
        }
      }
    }
  }

  for (const l of links) {
    if (l.v === 0 || !take(l.v)) continue
    // link endpoints are in pixel cells: doc center (ax+0.5)/sub → field scale sub*q
    const ax = (l.ax + 0.5) * doc.sub * q
    const ay = (l.ay + 0.5) * doc.sub * q
    const bx = (l.bx + 0.5) * doc.sub * q
    const by = (l.by + 0.5) * doc.sub * q
    const minX = Math.min(ax, bx)
    const maxX = Math.max(ax, bx)
    const minY = Math.min(ay, by)
    const maxY = Math.max(ay, by)
    const x0 = Math.max(0, Math.ceil(minX - R))
    const x1 = Math.min(fw - 1, Math.floor(maxX + R))
    const y0 = Math.max(0, Math.ceil(minY - R))
    const y1 = Math.min(fh - 1, Math.floor(maxY + R))
    const abx = bx - ax
    const aby = by - ay
    const len2 = abx * abx + aby * aby
    for (let iy = y0; iy <= y1; iy++) {
      for (let ix = x0; ix <= x1; ix++) {
        let t = len2 > 0 ? ((ix - ax) * abx + (iy - ay) * aby) / len2 : 0
        t = Math.max(0, Math.min(1, t))
        const dx = ix - (ax + t * abx)
        const dy = iy - (ay + t * aby)
        const d2 = dx * dx + dy * dy
        if (d2 < R2) {
          const k = 1 - d2 / R2
          f[iy * fw + ix] += k * k * k
        }
      }
    }
  }

  // Clamp blobs at the canvas border so contours always close inside. With squareEdges the
  // border nodes mirror the adjacent inner node instead: blobs meeting the canvas edge lock
  // onto it and marching squares draws the shared stretch as a straight border segment.
  const mirror = doc.metaball.squareEdges
  for (let x = 0; x < fw; x++) {
    f[x] = mirror ? f[fw + x] : 0
    f[(fh - 1) * fw + x] = mirror ? f[(fh - 2) * fw + x] : 0
  }
  for (let y = 0; y < fh; y++) {
    f[y * fw] = mirror ? f[y * fw + 1] : 0
    f[y * fw + fw - 1] = mirror ? f[y * fw + fw - 2] : 0
  }
  return { f, fw, fh, scale: 1 / (doc.sub * q) }
}

/** Convert loops into one smooth compound path (midpoint quadratic smoothing), in doc units. */
function loopsToPath(loops: Pt[][], scale: number): string {
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
    for (let i = 0; i < n; i++) {
      d += `Q${at(i)} ${mid(pts[i], pts[(i + 1) % n])}`
    }
    d += 'Z'
  }
  return d
}

export function metaballGeometry(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
  preview = false,
): Geometry {
  // while a stroke is in flight the field renders at half resolution; the committed
  // document always rebuilds at full quality, so only the live preview softens
  const maxSide = preview ? 360 : 700
  const paths: StyledPath[] = []
  const trace = (field: Field): Pt[][] => {
    if (!doc.metaball.squareEdges) return marchingSquares(field.f, field.fw, field.fh, ISO)
    // squareEdges: contours may run straight along the canvas border (through border
    // nodes). Pad the field with a zero ring first so those loops still close.
    const fw = field.fw + 2
    const fh = field.fh + 2
    const padded = new Float32Array(fw * fh)
    for (let y = 0; y < field.fh; y++) {
      padded.set(field.f.subarray(y * field.fw, (y + 1) * field.fw), (y + 1) * fw + 1)
    }
    return marchingSquares(padded, fw, fh, ISO).map((loop) =>
      loop.map((p) => ({ x: p.x - 1, y: p.y - 1 })),
    )
  }
  if (doc.metaball.perColor) {
    const order: number[] = []
    const seen = new Set<number>()
    for (let i = 0; i < cells.length; i++) {
      const v = cells[i]
      if (v !== 0 && !seen.has(v)) {
        seen.add(v)
        order.push(v)
      }
    }
    for (const l of links) {
      if (l.v !== 0 && !seen.has(l.v)) {
        seen.add(l.v)
        order.push(l.v)
      }
    }
    for (const v of order) {
      const field = buildField(doc, cells, links, (x) => x === v, maxSide)
      let d = loopsToPath(trace(field), field.scale)
      if (d && doc.texture.effect !== 'none') {
        d += fieldTextureFragments(field, doc.texture, v, doc.sub)
      }
      if (d) paths.push({ d, fill: cellColor(doc, v) ?? '#888' })
    }
  } else {
    // one merged field; fill with the dominant color among cells (fallback: first link)
    const counts = new Map<number, number>()
    for (let i = 0; i < cells.length; i++) {
      const v = cells[i]
      if (v !== 0) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    let best = links.length > 0 ? links[0].v : 0
    let bestN = -1
    for (const [v, c] of counts) {
      if (c > bestN) {
        best = v
        bestN = c
      }
    }
    const field = buildField(doc, cells, links, () => true, maxSide)
    let d = loopsToPath(trace(field), field.scale)
    if (d && doc.texture.effect !== 'none') {
      d += fieldTextureFragments(field, doc.texture, best, doc.sub)
    }
    if (d) paths.push({ d, fill: cellColor(doc, best) ?? '#888' })
  }
  return { paths }
}
