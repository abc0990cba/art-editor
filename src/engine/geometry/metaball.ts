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

/** Palette value when the buffer box is fully painted in one color (block-unit kernels), else 0. */
function uniformBlock(
  cells: Uint16Array,
  bw: number,
  maxV: number,
  box: { x0: number; y0: number; x1: number; y1: number },
): number {
  let v = 0
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const c = cells[y * bw + x]
      if (c === 0 || c > maxV) return 0
      if (v === 0) v = c
      else if (c !== v) return 0
    }
  }
  return v
}

/**
 * Block-unit sources: one swollen kernel per fully painted blockSize-aligned single-color block,
 * capsules bridging edge-adjacent same-color blocks, and plain cell kernels everywhere else — so a
 * 5×5 brush pixel fuses as one big blob while stray 1×1 pixels stay small and just merge in.
 */
function collectBlockSources(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
): { sources: MetaballSource[]; capsules: MetaballCapsule[] } {
  const sub = doc.sub
  const maxV = doc.palette.length
  const bw = bufferWidth(doc)
  const bh = bufferHeight(doc)
  const n = Math.max(2, Math.min(8, Math.round(doc.metaball.blockSize)))
  const blocksX = Math.ceil(bw / n)
  const blocksY = Math.ceil(bh / n)
  // kernel radius multiplier: at the default iso/strength the visible blob radius is ≈0.46×
  // the kernel radius, so r = n puts a block blob's edge right around its own cell border
  const r = n
  const full = new Map<number, number>()
  for (let j = 0; j < blocksY; j++) {
    for (let i = 0; i < blocksX; i++) {
      const v = uniformBlock(cells, bw, maxV, {
        x0: i * n,
        y0: j * n,
        x1: Math.min(i * n + n, bw),
        y1: Math.min(j * n + n, bh),
      })
      if (v !== 0) full.set(j * blocksX + i, v)
    }
  }
  const sources: MetaballSource[] = []
  const capsules: MetaballCapsule[] = []
  const center = (i: number, j: number) => ({
    x: (i * n + n / 2) / sub,
    y: (j * n + n / 2) / sub,
  })
  for (const [key, v] of full) {
    const i = key % blocksX
    const j = (key - i) / blocksX
    const c = center(i, j)
    sources.push({ ...c, v, r })
    if (i + 1 < blocksX && full.get(key + 1) === v) {
      const b = center(i + 1, j)
      capsules.push({ ax: c.x, ay: c.y, bx: b.x, by: b.y, v, r })
    }
    if (j + 1 < blocksY && full.get(key + blocksX) === v) {
      const b = center(i, j + 1)
      capsules.push({ ax: c.x, ay: c.y, bx: b.x, by: b.y, v, r })
    }
  }
  // incomplete/mixed blocks keep the classic per-cell kernels
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const v = cells[by * bw + bx]
      if (v === 0 || v > maxV) continue
      if (full.get(Math.floor(by / n) * blocksX + Math.floor(bx / n)) === v) continue
      sources.push({ x: (bx + 0.5) / sub, y: (by + 0.5) / sub, v })
    }
  }
  for (const l of links) {
    capsules.push({
      ax: l.ax + 0.5,
      ay: l.ay + 0.5,
      bx: l.bx + 0.5,
      by: l.by + 0.5,
      v: l.v,
    })
  }
  return { sources, capsules }
}

/**
 * Square-grid metaball inputs in doc units: one source per painted sub-cell, junction kernels for
 * corner connectivity, and every link as a capsule. With `unit: 'block'` complete aligned blocks
 * collapse into single swollen kernels instead (see `collectBlockSources`).
 */
function collectSquareSources(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
): { sources: MetaballSource[]; capsules: MetaballCapsule[] } {
  if (doc.metaball.unit === 'block' && doc.metaball.blockSize > 1) {
    return collectBlockSources(doc, cells, links)
  }
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

/**
 * Shared metaball/contour pipeline: trace the field per color group (or one merged field) into a
 * smooth path. Fill mode appends the baked texture fragments and fills; stroke (contour) mode emits
 * the loop as an unfilled stroke of `metaball.strokeWidth`.
 */
function metaballPaths(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
  preview: boolean,
  strokeOnly: boolean,
): StyledPath[] {
  // while a stroke is in flight the field renders at half resolution; the committed
  // document always rebuilds at full quality, so only the live preview softens
  const maxSide = preview ? 360 : 700
  const iso = metaballIso(doc)
  const data = collectSquareSources(doc, cells, links)
  const paths: StyledPath[] = []
  const emit = (field: MetaballField, v: number) => {
    const d = loopsToSmoothPath(
      traceMetaballLoops(field, iso, doc.metaball.squareEdges),
      field.scale,
    )
    if (!d) return
    if (strokeOnly) {
      paths.push({
        d,
        stroke: cellColor(doc, v) ?? '#888',
        strokeWidth: doc.metaball.strokeWidth,
      })
      return
    }
    if (doc.texture.effect === 'none') {
      paths.push({ d, fill: cellColor(doc, v) ?? '#888' })
    } else {
      paths.push({
        d: d + fieldTextureFragments(field, doc.texture, v, doc.sub),
        fill: cellColor(doc, v) ?? '#888',
      })
    }
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
      emit(
        squareField(doc, data, (x) => x === v, maxSide),
        v,
      )
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
    emit(
      squareField(doc, data, () => true, maxSide),
      best,
    )
  }
  return paths
}

export function metaballGeometry(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
  preview = false,
): Geometry {
  return { paths: metaballPaths(doc, cells, links, preview, false) }
}

/**
 * Contour mode: the metaball merge field drawn as pure line art — the same traced loops, emitted as
 * unfilled strokes of `metaball.strokeWidth` (a "bubble net" look; pairs naturally with the
 * block-unit super pixels).
 */
export function contourGeometry(
  doc: Doc,
  cells: Uint16Array,
  links: readonly Link[],
  preview = false,
): Geometry {
  return { paths: metaballPaths(doc, cells, links, preview, true) }
}
