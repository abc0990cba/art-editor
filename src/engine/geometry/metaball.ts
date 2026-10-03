import { bufferHeight, bufferWidth, cellColor, type Doc, type Link } from '../core/doc.ts'
import { fieldTextureFragments } from '../texture/index.ts'
import {
  buildMetaballField,
  loopsToSmoothPath,
  metaballIso,
  traceMetaballLoops,
  type MetaballCapsule,
  type MetaballField,
  type MetaballSource,
} from './metaball-field.ts'
import type { Geometry, StyledPath } from './types.ts'

/* ---------------------------------- metaball mode ---------------------------------- */

/**
 * Square-grid metaball inputs in doc units: one source per painted sub-cell, junction kernels for
 * corner connectivity, and every link as a capsule.
 */
function collectSquareSources(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
): { sources: MetaballSource[]; capsules: MetaballCapsule[] } {
  const sub = doc.sub
  const w = doc.palette.length
  const bw = bufferWidth(doc)
  const bh = bufferHeight(doc)
  const sources: MetaballSource[] = []
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const v = cells[by * bw + bx]
      if (v === 0 || v > w) continue
      sources.push({ x: (bx + 0.5) / sub, y: (by + 0.5) / sub, v })
    }
  }
  // corner connectivity: an extra kernel at each diagonal junction merges corner-touching
  // neighbors of the same value through the shared corner at any strength (both diagonals)
  if (doc.connectivity !== 'edge') {
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const v = cells[by * bw + bx]
        if (v === 0 || v > w) continue
        const sideR = bx + 1 < bw ? cells[by * bw + bx + 1] : 0
        // ↘ junction with (bx+1, by+1)
        if (
          bx + 1 < bw &&
          by + 1 < bh &&
          cells[(by + 1) * bw + bx + 1] === v &&
          sideR === 0 &&
          cells[(by + 1) * bw + bx] === 0
        ) {
          sources.push({ x: (bx + 1) / sub, y: (by + 1) / sub, v })
        }
        // ↗ junction with (bx+1, by-1)
        if (
          bx + 1 < bw &&
          by - 1 >= 0 &&
          cells[(by - 1) * bw + bx + 1] === v &&
          sideR === 0 &&
          cells[(by - 1) * bw + bx] === 0
        ) {
          sources.push({ x: (bx + 1) / sub, y: by / sub, v })
        }
      }
    }
  }
  const capsules: MetaballCapsule[] = links.map((l) => ({
    ax: l.ax + 0.5,
    ay: l.ay + 0.5,
    bx: l.bx + 0.5,
    by: l.by + 0.5,
    v: l.v,
  }))
  return { sources, capsules }
}

function squareField(
  doc: Doc,
  data: { sources: MetaballSource[]; capsules: MetaballCapsule[] },
  take: (v: number) => boolean,
  maxSide: number,
): MetaballField {
  const bw = bufferWidth(doc)
  const bh = bufferHeight(doc)
  // nodes per buffer cell: capped by quality, lowered when maxSide bounds the long side
  const q = Math.max(1, Math.min(doc.metaball.quality, Math.floor(maxSide / Math.max(bw, bh)) || 1))
  return buildMetaballField({
    w: bw / doc.sub,
    h: bh / doc.sub,
    step: 1 / (doc.sub * q),
    sources: data.sources,
    capsules: data.capsules,
    take,
    strength: doc.metaball.strength,
    sub: doc.sub,
    falloff: doc.metaball.falloff,
    squareEdges: doc.metaball.squareEdges,
  })
}

/**
 * Merged metaball field of the whole square doc at overlay resolution — the diffusion-guides
 * contour preview samples this; not used for the committed artwork geometry.
 */
export function metaballPreviewField(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
  maxSide = 480,
): { field: MetaballField; iso: number } {
  const data = collectSquareSources(doc, cells, links)
  return { field: squareField(doc, data, () => true, maxSide), iso: metaballIso(doc) }
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
  const iso = metaballIso(doc)
  const data = collectSquareSources(doc, cells, links)
  const paths: StyledPath[] = []
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
      const field = squareField(doc, data, (x) => x === v, maxSide)
      let d = loopsToSmoothPath(
        traceMetaballLoops(field, iso, doc.metaball.squareEdges),
        field.scale,
      )
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
    const field = squareField(doc, data, () => true, maxSide)
    let d = loopsToSmoothPath(traceMetaballLoops(field, iso, doc.metaball.squareEdges), field.scale)
    if (d && doc.texture.effect !== 'none') {
      d += fieldTextureFragments(field, doc.texture, best, doc.sub)
    }
    if (d) paths.push({ d, fill: cellColor(doc, best) ?? '#888' })
  }
  return { paths }
}
