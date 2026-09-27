/**
 * Mosaic composition: cutout regions whose shared boundaries are fitted ONCE and referenced by both
 * neighbors — no duplicated geometry, no anti-aliasing seams (the vtracer V2 idea, built on the V1
 * stage outputs). Shared pixel-edge segments between two regions are chained into maximal runs
 * ("groups") per region pair, simplified and fitted as one curve sequence; each region's path then
 * stitches its private runs (fit independently) with the shared groups (reused, reversed where the
 * traversal opposes the canonical direction).
 *
 * Segment identity is a stride-based vertex key pair (vertex = y*(w+1)+x), exact in doubles for
 * canvases up to 4096². Input: raw traced contours per layer (paint order, speckle-filtered, holes
 * handled upstream). Output: one fill path per layer.
 */

import type { Contour } from './binary-layer.ts'
import { formatNum, loopToPath, type SvgPath } from './compose.ts'
import { fitChain, type Tangent } from './fit-curves.ts'
import type { TraceParams } from './params.ts'
import { normalizeLoop, simplifyLoop, simplifyOpen } from './simplify.ts'

export interface MosaicRegion {
  color: string
  contours: Contour[]
}

export interface MosaicResult {
  paths: SvgPath[]
  vertices: number
}

interface Group {
  /** Region whose traversal direction defines the canonical orientation (pair min) */
  canonical: number
  /** Flat x,y pairs in canonical direction (closed groups do not repeat the first vertex) */
  pts: number[]
  closed: boolean
  cubics: number[] | null
}

interface Piece {
  shared: boolean
  group: number
  /** False when the contour traverses against the group's canonical direction */
  forward: boolean
  pts: number[]
  start: number
  end: number
}

interface Occurrence {
  region: number
  contour: number
  from: number
  to: number
}

const KEY_BIG = 0x2000000 // > max vertex key for 4096² canvases

function vkey(x: number, y: number, stride: number): number {
  return y * stride + x
}

function segKey(a: number, b: number): number {
  return a < b ? a * KEY_BIG + b : b * KEY_BIG + a
}

function contourSegKey(contour: Contour, i: number, j: number, stride: number): number {
  const a = vkey(contour.pts[i * 2], contour.pts[i * 2 + 1], stride)
  const b = vkey(contour.pts[j * 2], contour.pts[j * 2 + 1], stride)
  return segKey(a, b)
}

/** Decompose, group and fit the regions into one fill path per region. */
export function mosaicPaths(
  width: number,
  regions: MosaicRegion[],
  params: TraceParams,
): MosaicResult {
  const stride = width + 1
  const segMap = collectSegments(regions, stride)
  const { groups, segGroup } = chainGroups(segMap, regions, stride)
  const decomposeCtx: DecomposeCtx = { segMap, segGroup, groups, stride }
  const paths: SvgPath[] = []
  let vertices = 0
  const stat = (n: number) => {
    vertices += n
  }
  regions.forEach((region, li) => {
    region.contours.forEach((contour) => {
      const pieces = decompose(contour, li, decomposeCtx)
      paths.push({ d: contourD(contour, pieces, groups, params, stat), fill: region.color })
    })
  })
  return { paths, vertices }
}

/** Every boundary segment of every contour, keyed so the two sides of a shared edge meet. */
function collectSegments(regions: MosaicRegion[], stride: number): Map<number, Occurrence[]> {
  const map = new Map<number, Occurrence[]>()
  regions.forEach((region, li) => {
    region.contours.forEach((contour, ci) => {
      const n = contour.pts.length / 2
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const key = contourSegKey(contour, i, j, stride)
        let list = map.get(key)
        if (!list) map.set(key, (list = []))
        list.push({ region: li, contour: ci, from: i, to: j })
      }
    })
  })
  return map
}

/**
 * Chain shared segments into maximal per-pair groups. Canonical direction follows the lower
 * region's traversal, seeded from its own occurrence on the first segment.
 */
function chainGroups(
  segMap: Map<number, Occurrence[]>,
  regions: MosaicRegion[],
  stride: number,
): { groups: Group[]; segGroup: Map<number, number> } {
  const shared = new Map<number, Occurrence[]>()
  for (const [key, occs] of segMap) {
    if (occs.length === 2 && occs[0].region !== occs[1].region) shared.set(key, occs)
  }
  const adjacency = new Map<number, number[]>()
  for (const key of shared.keys()) {
    for (const v of endpoints(key)) {
      let list = adjacency.get(v)
      if (!list) adjacency.set(v, (list = []))
      list.push(key)
    }
  }
  const groups: Group[] = []
  const segGroup = new Map<number, number>()
  const ctx: GroupCtx = { shared, adjacency, used: new Set(), stride }
  for (const [key, occs] of shared) {
    if (ctx.used.has(key)) continue
    const canonical = Math.min(occs[0].region, occs[1].region)
    const occ = occs.find((o) => o.region === canonical) ?? occs[0]
    const seed = regions[occ.region].contours[occ.contour]
    const group = walkGroup(seed, occ, ctx)
    const gi = groups.length
    groups.push(group)
    markGroup(group, gi, segGroup, stride)
  }
  return { groups, segGroup }
}

function endpoints(key: number): [number, number] {
  const a = Math.floor(key / KEY_BIG)
  return [a, key - a * KEY_BIG]
}

function samePair(k1: number, k2: number, shared: Map<number, Occurrence[]>): boolean {
  const a = shared.get(k1)
  const b = shared.get(k2)
  if (!a || !b) return false
  const pa = [Math.min(a[0].region, a[1].region), Math.max(a[0].region, a[1].region)]
  const pb = [Math.min(b[0].region, b[1].region), Math.max(b[0].region, b[1].region)]
  return pa[0] === pb[0] && pa[1] === pb[1]
}

interface GroupCtx {
  shared: Map<number, Occurrence[]>
  adjacency: Map<number, number[]>
  used: Set<number>
  stride: number
}

/** The unused shared segment of the same pair leaving vertex v, or -1. */
function nextGroupSegment(ctx: GroupCtx, v: number, curKey: number): number {
  for (const k of ctx.adjacency.get(v) ?? []) {
    if (!ctx.used.has(k) && samePair(k, curKey, ctx.shared)) return k
  }
  return -1
}

function walkGroup(seedContour: Contour, seedOcc: Occurrence, ctx: GroupCtx): Group {
  const canonical = seedOcc.region
  const startKey = contourSegKey(seedContour, seedOcc.from, seedOcc.to, ctx.stride)
  const [e1, e2] = endpoints(startKey)
  const pts: number[] = [
    e1 % ctx.stride,
    Math.floor(e1 / ctx.stride),
    e2 % ctx.stride,
    Math.floor(e2 / ctx.stride),
  ]
  ctx.used.add(startKey)
  let cur = e2
  let curKey = startKey
  let closed = false
  for (;;) {
    const next = nextGroupSegment(ctx, cur, curKey)
    if (next < 0) break
    if (next === startKey) {
      closed = true
      pts.pop()
      pts.pop()
      break
    }
    ctx.used.add(next)
    const [f, t] = endpoints(next)
    const nx = f === cur ? t : f
    pts.push(nx % ctx.stride, Math.floor(nx / ctx.stride))
    cur = nx
    curKey = next
  }
  return { canonical, pts, closed, cubics: null }
}

function markGroup(group: Group, gi: number, segGroup: Map<number, number>, stride: number): void {
  const n = group.pts.length / 2
  const count = group.closed ? n : n - 1
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % n
    segGroup.set(
      segKey(
        vkey(group.pts[i * 2], group.pts[i * 2 + 1], stride),
        vkey(group.pts[j * 2], group.pts[j * 2 + 1], stride),
      ),
      gi,
    )
  }
}

/**
 * Split a contour's segments into runs: private runs, or shared runs of one group. The walk starts
 * at a classification boundary so pieces tile the whole loop in order.
 */
interface DecomposeCtx {
  segMap: Map<number, Occurrence[]>
  segGroup: Map<number, number>
  groups: Group[]
  stride: number
}

function decompose(contour: Contour, region: number, ctx: DecomposeCtx): Piece[] {
  const n = contour.pts.length / 2
  const classify = (i: number): [boolean, number] => {
    const key = contourSegKey(contour, i, (i + 1) % n, ctx.stride)
    const occs = ctx.segMap.get(key)
    if (!occs || occs.length !== 2 || occs[0].region === occs[1].region) return [false, -1]
    const g = ctx.segGroup.get(key)
    return g === undefined ? [false, -1] : [true, g]
  }
  let boundary = 0
  for (let i = 0; i < n; i++) {
    const [cs, cg] = classify(i)
    const [ps, pg] = classify((i - 1 + n) % n)
    if (cs !== ps || (cs && cg !== pg)) {
      boundary = i
      break
    }
  }
  const pieces: Piece[] = []
  for (let off = 0; off < n; off++) {
    const i = (boundary + off) % n
    const [shared, group] = classify(i)
    const j = (i + 1) % n
    const last = pieces[pieces.length - 1]
    if (last && last.shared === shared && (!shared || last.group === group)) {
      last.end = i
      last.pts.push(contour.pts[j * 2], contour.pts[j * 2 + 1])
    } else {
      pieces.push({
        shared,
        group,
        forward: shared ? ctx.groups[group].canonical === region : true,
        pts: [
          contour.pts[i * 2],
          contour.pts[i * 2 + 1],
          contour.pts[j * 2],
          contour.pts[j * 2 + 1],
        ],
        start: i,
        end: i,
      })
    }
  }
  return pieces
}

/** Assemble the contour's path data from its pieces (fit private runs, reuse group cubics). */
function contourD(
  contour: Contour,
  pieces: Piece[],
  groups: Group[],
  params: TraceParams,
  vertexStat: (n: number) => void,
): string {
  if (params.mode !== 'spline' || (pieces.length === 1 && !pieces[0].shared)) {
    const simplified = simplifyLoop(normalizeLoop(contour.pts), params.lengthThreshold / 2)
    vertexStat(simplified.length / 2)
    return loopToPath(
      simplified,
      params.mode === 'spline' ? params : { ...params, mode: 'polygon' },
    )
  }
  const p = params.pathPrecision
  const epsilon = params.lengthThreshold / 2
  const n = contour.pts.length / 2
  let d = `M${formatNum(pieces[0].pts[0], p)},${formatNum(pieces[0].pts[1], p)}`
  for (const piece of pieces) {
    if (piece.shared) {
      const group = groups[piece.group]
      if (!group.cubics) group.cubics = fitGroup(group, params)
      const seq = piece.forward ? group.cubics : reverseCubics(group.cubics)
      vertexStat(seq.length / 8)
      d += cubicsD(seq, p)
      continue
    }
    const simplified = simplifyOpen(piece.pts, epsilon)
    if (simplified.length < 4) continue
    vertexStat(simplified.length / 2)
    const endVertex = (piece.end + 1) % n
    const cubics = fitChain(
      simplified,
      epsilon,
      params.maxIterations,
      junctionTangent(contour, piece.start),
      negate(junctionTangent(contour, endVertex)),
    )
    d += cubicsD(cubics, p)
  }
  return `${d}Z`
}

/** Fit a group once: open chains fit directly, closed loops split at the x-extremes. */
function fitGroup(group: Group, params: TraceParams): number[] {
  const epsilon = params.lengthThreshold / 2
  if (!group.closed) {
    const simplified = simplifyOpen(group.pts, epsilon)
    return fitChain(
      simplified,
      epsilon,
      params.maxIterations,
      chordTangent(simplified),
      chordTangentEnd(simplified),
    )
  }
  const n = group.pts.length / 2
  let lo = 0
  let hi = 0
  for (let i = 1; i < n; i++) {
    if (group.pts[i * 2] < group.pts[lo * 2]) lo = i
    if (group.pts[i * 2] > group.pts[hi * 2]) hi = i
  }
  const [arcA, arcB] = arcsBetween(group.pts, lo, hi)
  return [
    ...fitChain(arcA, epsilon, params.maxIterations, chordTangent(arcA), chordTangentEnd(arcA)),
    ...fitChain(arcB, epsilon, params.maxIterations, chordTangent(arcB), chordTangentEnd(arcB)),
  ]
}

/** The two open arcs of a closed loop between vertex indexes i and j (both inclusive). */
function arcsBetween(pts: number[], i: number, j: number): [number[], number[]] {
  const n = pts.length / 2
  const arc = (from: number, to: number): number[] => {
    const out: number[] = []
    let k = from
    for (;;) {
      out.push(pts[k * 2], pts[k * 2 + 1])
      if (k === to) break
      k = (k + 1) % n
    }
    return out
  }
  return [arc(i, j), arc(j, i)]
}

/** One-sided forward unit tangent of the first segment. */
function chordTangent(pts: number[]): Tangent {
  const dx = pts[2] - pts[0]
  const dy = pts[3] - pts[1]
  const len = Math.hypot(dx, dy)
  return len < 1e-12 ? [0, 0] : [dx / len, dy / len]
}

/** Backward unit tangent at the chain end (points from the last vertex toward the previous). */
function chordTangentEnd(pts: number[]): Tangent {
  const n = pts.length
  const dx = pts[n - 2] - pts[n - 4]
  const dy = pts[n - 1] - pts[n - 3]
  const len = Math.hypot(dx, dy)
  return len < 1e-12 ? [0, 0] : [dx / len, dy / len]
}

/** Two-sided tangent through a junction vertex, along the contour's own geometry. */
function junctionTangent(contour: Contour, vertexIndex: number): Tangent {
  const n = contour.pts.length / 2
  const px = contour.pts[((vertexIndex - 1 + n) % n) * 2]
  const py = contour.pts[((vertexIndex - 1 + n) % n) * 2 + 1]
  const nx = contour.pts[((vertexIndex + 1) % n) * 2]
  const ny = contour.pts[((vertexIndex + 1) % n) * 2 + 1]
  const dx = nx - px
  const dy = ny - py
  const len = Math.hypot(dx, dy)
  return len < 1e-12 ? [0, 0] : [dx / len, dy / len]
}

function negate(t: Tangent): Tangent {
  return [-t[0], -t[1]]
}

function reverseCubics(cubics: number[]): number[] {
  const out: number[] = []
  for (let c = cubics.length - 8; c >= 0; c -= 8) {
    out.push(
      cubics[c + 6],
      cubics[c + 7],
      cubics[c + 4],
      cubics[c + 5],
      cubics[c + 2],
      cubics[c + 3],
      cubics[c],
      cubics[c + 1],
    )
  }
  return out
}

function cubicsD(cubics: number[], precision: number): string {
  let d = ''
  for (let c = 0; c < cubics.length; c += 8) {
    const f = (v: number) => formatNum(v, precision)
    d += `C${f(cubics[c + 2])},${f(cubics[c + 3])} ${f(cubics[c + 4])},${f(cubics[c + 5])} ${f(cubics[c + 6])},${f(cubics[c + 7])} `
  }
  return d.trimEnd()
}
