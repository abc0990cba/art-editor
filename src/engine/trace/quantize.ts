/**
 * Hierarchical color clustering — the vtracer V1 first stage (see docs/research/vectorization.md).
 * Colors are quantized to `colorPrecision` significant bits, identical pixels collapse into leaves
 * (real pixel sums, not bucket centers), then clusters agglomerate while their mean-color distance
 * stays within `layerDifference`. Candidate pairs come from a coarse RGB grid hash around each
 * cluster, so the merge loop is near-linear instead of quadratic. Output: a per-pixel paint-order
 * label buffer (bottom layer = 0, painted first) plus the layer colors.
 */

import type { ImportBitmap } from '../import-image.ts'
import type { TraceParams } from './params.ts'

/** A traced color layer: mask pixels are cut on demand from the label buffer. */
export interface ClusterLayer {
  color: string
  /** Pixel count (before speckle filtering) */
  count: number
}

export interface ClusterResult {
  /** Paint-order index per pixel, 255 = transparent (never painted) */
  labels: Uint8Array
  /** Layers in paint order (bottom first); index = label value */
  layers: ClusterLayer[]
}

interface Cluster {
  r: number
  g: number
  b: number
  n: number
}

const MAX_LAYERS = 254 // label 255 is reserved for transparent pixels

/** Quantize one channel to `bits` significant bits (vtracer's color_precision). */
function quantizeChannel(c: number, shift: number): number {
  return (c >> shift) << shift
}

function toHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/**
 * Mean-color distance between clusters, averaged over channels (matches the layer_difference
 * scale).
 */
function colorDistance(a: Cluster, b: Cluster): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return Math.sqrt((dr * dr + dg * dg + db * db) / 3)
}

/**
 * Merge priority: color distance weighted by the size ratio of the pair (vtracer behavior). Small
 * outliers fold into big neighbors almost regardless of color distance, while comparable-size
 * clusters only merge within the layer difference — this is what makes smooth gradients collapse
 * into few layers without smearing real color regions together.
 */
function mergeDistance(a: Cluster, b: Cluster): number {
  return colorDistance(a, b) * (Math.min(a.n, b.n) / Math.max(a.n, b.n))
}

/**
 * Cluster the bitmap into at most MAX_LAYERS color layers. Deterministic: leaves are built in scan
 * order, heap ties break by cluster indexes.
 */
export function clusterImage(bitmap: ImportBitmap, params: TraceParams): ClusterResult {
  const { width: w, height: h, data } = bitmap
  const shift = Math.max(0, 8 - params.colorPrecision)

  // 1. leaves: identical quantized colors collapse into one leaf carrying real pixel sums
  const sums = new Map<number, number[]>() // colorKey → [rsum, gsum, bsum, n]
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    if (data[o + 3]! < 128) continue
    const key =
      (quantizeChannel(data[o]!, shift) << 16) |
      (quantizeChannel(data[o + 1]!, shift) << 8) |
      quantizeChannel(data[o + 2]!, shift)
    const s = sums.get(key)
    if (s) {
      s[0] += data[o]!
      s[1] += data[o + 1]!
      s[2] += data[o + 2]!
      s[3]++
    } else {
      sums.set(key, [data[o]!, data[o + 1]!, data[o + 2]!, 1])
    }
  }
  const keys = [...sums.keys()]

  // 2. agglomerate while pairs stay within the layer distance; owners/members make every
  //    leaf color follow its surviving cluster
  const clusters: Cluster[] = keys.map((key) => {
    const [rs, gs, bs, n] = sums.get(key)!
    return { r: rs / n, g: gs / n, b: bs / n, n }
  })
  const owners = new Map<number, number>(keys.map((key, i) => [key, i]))
  const members: number[][] = keys.map((key) => [key])
  if (params.layerDifference > 0) {
    mergeCloseClusters(clusters, owners, members, params.layerDifference)
  }

  // 3. paint order: big clusters at the bottom; clusters past MAX_LAYERS fold into the
  //    nearest surviving color so the label byte never overflows. owners tracks survivors,
  //    so the alive set is exactly its values.
  const alive = new Set(owners.values())
  const order = [...alive].sort((a, b) => clusters[b]!.n - clusters[a]!.n || a - b)
  const rankOf = new Int32Array(clusters.length).fill(-1)
  order.forEach((ci, r) => {
    if (r < MAX_LAYERS) rankOf[ci] = r
  })
  for (let r = MAX_LAYERS; r < order.length; r++) {
    const ci = order[r]!
    let best = 0
    let bestD = Number.POSITIVE_INFINITY
    for (let s = 0; s < MAX_LAYERS; s++) {
      const d = colorDistance(clusters[ci]!, clusters[order[s]!]!)
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    rankOf[ci] = best
  }

  // 4. label buffer in paint order (leaf color → surviving cluster → rank)
  const labels = new Uint8Array(w * h).fill(255)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    if (data[o + 3]! < 128) continue
    const key =
      (quantizeChannel(data[o]!, shift) << 16) |
      (quantizeChannel(data[o + 1]!, shift) << 8) |
      quantizeChannel(data[o + 2]!, shift)
    const owner = owners.get(key)
    if (owner === undefined) continue
    labels[i] = rankOf[owner]!
  }
  const layers: ClusterLayer[] = order.slice(0, MAX_LAYERS).map((ci) => ({
    color: toHex(clusters[ci]!.r, clusters[ci]!.g, clusters[ci]!.b),
    count: clusters[ci]!.n,
  }))
  return { labels, layers }
}

/**
 * Agglomerative merging restricted to pairs within `cutoff`, via the nearest-neighbor-chain
 * algorithm: instead of a global pair heap (which the size weighting makes unbounded in color
 * space), chains of mutual nearest neighbors are followed and merged in nondecreasing distance
 * order until the cutoff is exceeded. Deterministic: ties break by cluster index.
 */
function mergeCloseClusters(
  clusters: Cluster[],
  owners: Map<number, number>,
  members: number[][],
  cutoff: number,
): void {
  const n = clusters.length
  const active = new Uint8Array(n).fill(1)
  let live = n
  // work budget: pathological images (tens of thousands of distinct colors) still terminate
  let budget = 2e8

  const nearestOf = (i: number): [number, number] => {
    let best = -1
    let bestD = Number.POSITIVE_INFINITY
    for (let j = 0; j < n; j++) {
      if (j === i || !active[j]) continue
      const d = mergeDistance(clusters[i]!, clusters[j]!)
      if (d < bestD || (d === bestD && j < best)) {
        bestD = d
        best = j
      }
    }
    return [best, bestD]
  }

  const merge = (a: number, b: number): void => {
    const ca = clusters[a]!
    const cb = clusters[b]!
    const total = ca.n + cb.n
    ca.r = (ca.r * ca.n + cb.r * cb.n) / total
    ca.g = (ca.g * ca.n + cb.g * cb.n) / total
    ca.b = (ca.b * ca.n + cb.b * cb.n) / total
    ca.n = total
    active[b] = 0
    live--
    for (const key of members[b]) {
      owners.set(key, a)
      members[a]!.push(key)
    }
    members[b] = []
  }

  const firstActive = (from: number): number => {
    for (let j = from; j < n; j++) {
      if (active[j]) return j
    }
    return -1
  }

  const chain: number[] = []
  let i = firstActive(0)
  while (i >= 0) {
    if (chain.length === 0 || chain[chain.length - 1] !== i) chain.push(i)
    const [j, d] = nearestOf(i)
    budget -= live
    if (budget <= 0) return
    const at = chain.indexOf(j)
    if (at >= 0) {
      if (d > cutoff) return // merges only get bigger from here
      merge(Math.min(i, j), Math.max(i, j))
      chain.length = at
      i = chain.length > 0 ? chain[chain.length - 1] : firstActive(0)
    } else {
      i = j
    }
  }
}
