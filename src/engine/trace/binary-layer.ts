/**
 * Binary mask → closed boundary contours — the vtracer V1 tracing stage. Components smaller than
 * `minArea` pixels are dropped first (the speckle filter). Boundaries are collected as directed
 * pixel-edge segments (foreground kept on the right of travel) and stitched into closed lattice
 * loops; at ambiguous diagonal joints the right turn wins, which keeps loops 4-connected — matching
 * the component labeling. Under this convention outer loops have positive signed area and hole
 * loops negative; nested contours compose via evenodd, and the `hole` flag lets consumers drop
 * holes ("без дырок").
 *
 * All geometry is flat number arrays of x,y pairs in lattice coordinates (0..w, 0..h).
 */

export interface Contour {
  /** Flat x,y pairs along the loop; the last vertex does not repeat the first */
  pts: number[]
  /** True when the loop winds around a hole (negative signed area under our convention) */
  hole: boolean
}

/**
 * Trace a mask into closed contours. `minArea` filters same-color components (speckles); 0 keeps
 * everything. The input mask is never modified.
 */
export function traceMask(mask: Uint8Array, w: number, h: number, minArea: number): Contour[] {
  const filtered = minArea > 0 ? dropSpeckles(mask, w, h, minArea) : mask
  return stitchLoops(collectBoundaryEdges(filtered, w, h), w)
}

/** Remove 4-connected components with fewer than `minArea` pixels; returns a filtered copy. */
function dropSpeckles(mask: Uint8Array, w: number, h: number, minArea: number): Uint8Array {
  const out = mask.slice()
  const seen = new Uint8Array(mask.length)
  const stack: number[] = []
  const comp: number[] = []
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue
    comp.length = 0
    stack.push(start)
    seen[start] = 1
    while (stack.length > 0) {
      const i = stack.pop()!
      comp.push(i)
      const x = i % w
      const y = (i - x) / w
      if (x > 0 && mask[i - 1] && !seen[i - 1]) {
        seen[i - 1] = 1
        stack.push(i - 1)
      }
      if (x + 1 < w && mask[i + 1] && !seen[i + 1]) {
        seen[i + 1] = 1
        stack.push(i + 1)
      }
      if (y > 0 && mask[i - w] && !seen[i - w]) {
        seen[i - w] = 1
        stack.push(i - w)
      }
      if (y + 1 < h && mask[i + w] && !seen[i + w]) {
        seen[i + w] = 1
        stack.push(i + w)
      }
    }
    if (comp.length < minArea) for (const i of comp) out[i] = 0
  }
  return out
}

/** Directed boundary edges packed as [fromKey, toKey] vertex pairs (vertex key = y*(w+1)+x). */
function collectBoundaryEdges(mask: Uint8Array, w: number, h: number): number[] {
  const edges: number[] = []
  const W = w + 1
  const at = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] !== 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue
      const k = y * W + x
      if (!at(x, y - 1)) edges.push(k, k + 1) // top side, moving right
      if (!at(x + 1, y)) edges.push(k + 1, k + 1 + W) // right side, moving down
      if (!at(x, y + 1)) edges.push(k + 1 + W, k + W) // bottom side, moving left
      if (!at(x - 1, y)) edges.push(k + W, k) // left side, moving up
    }
  }
  return edges
}

/**
 * Stitch directed edges into closed loops. At a vertex with two outgoing edges (a diagonal joint)
 * prefer the right turn relative to the incoming direction, so diagonally touching pixels trace as
 * separate 4-connected loops.
 */
function stitchLoops(edges: number[], w: number): Contour[] {
  const W = w + 1
  const outgoing = new Map<number, number[]>()
  for (let s = 0; s < edges.length; s += 2) {
    const from = edges[s]
    let list = outgoing.get(from)
    if (!list) outgoing.set(from, (list = []))
    list.push(s)
  }
  const used = new Uint8Array(edges.length / 2)
  const contours: Contour[] = []
  for (let s = 0; s < edges.length; s += 2) {
    if (used[s >> 1]) continue
    used[s >> 1] = 1
    const from = edges[s]
    const pts: number[] = [from % W, Math.floor(from / W)]
    let cur = edges[s + 1]
    let guard = edges.length
    while (cur !== from && guard-- > 0) {
      pts.push(cur % W, Math.floor(cur / W))
      const next = pickNext(edges, used, outgoing.get(cur), pts, W)
      if (next < 0) break // open chain (corrupt input) — drop the partial loop
      used[next >> 1] = 1
      cur = edges[next + 1]
    }
    if (pts.length >= 6 && cur === from) pushContour(contours, pts)
  }
  return contours
}

/** Pick the next unused outgoing edge at a vertex; two candidates = diagonal joint. */
function pickNext(
  edges: number[],
  used: Uint8Array,
  candidates: number[] | undefined,
  pts: number[],
  W: number,
): number {
  if (!candidates) return -1
  const n = pts.length
  // incoming direction: previous vertex → current vertex
  const inX = pts[n - 2] - pts[n - 4]
  const inY = pts[n - 1] - pts[n - 3]
  const cx = pts[n - 2]
  const cy = pts[n - 1]
  let only = -1
  let count = 0
  for (const s of candidates) {
    if (!used[s >> 1]) {
      only = s
      count++
    }
  }
  if (count <= 1) return count === 1 ? only : -1
  // right turn in y-down screen space: (dx,dy) → (-dy,dx); keeps diagonals 4-connected
  const wantX = -inY
  const wantY = inX
  let right = -1
  let other = -1
  for (const s of candidates) {
    if (used[s >> 1]) continue
    const to = edges[s + 1]
    const stepX = (to % W) - cx
    const stepY = Math.floor(to / W) - cy
    if (stepX === wantX && stepY === wantY) right = s
    else other = s
  }
  return right >= 0 ? right : other
}

function pushContour(contours: Contour[], pts: number[]): void {
  let area2 = 0
  for (let i = 0; i < pts.length; i += 2) {
    const j = (i + 2) % pts.length
    area2 += pts[i] * pts[j + 1] - pts[j] * pts[i + 1]
  }
  contours.push({ pts, hole: area2 < 0 })
}
