/**
 * Interior/exterior classification for shape fills and stroke alignment. The square grid
 * flood-fills the outside around the outline inside its bounding window (cells the flood never
 * reaches are inside); other grids test cell centers against the outline polylines with the
 * even-odd rule.
 */

export interface ShapeRegion {
  /** Cells strictly enclosed by the outline (outline cells excluded) */
  inside: Set<number>
  /** Window cells reachable from the boundary without crossing the outline */
  outside: Set<number>
}

/**
 * Split the square buffer around an outline into interior and exterior. The flood runs inside the
 * outline's bounding box inflated by one cell, so shapes touching the canvas border still classify
 * correctly and the cost stays proportional to the shape, not the canvas.
 */
export function regionCells(outline: ReadonlySet<number>, bw: number, bh: number): ShapeRegion {
  const inside = new Set<number>()
  const outside = new Set<number>()
  if (outline.size === 0 || bw <= 0 || bh <= 0) return { inside, outside }
  let minX = bw
  let minY = bh
  let maxX = -1
  let maxY = -1
  for (const i of outline) {
    const x = i % bw
    const y = (i - x) / bw
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  minX = Math.max(0, minX - 1)
  minY = Math.max(0, minY - 1)
  maxX = Math.min(bw - 1, maxX + 1)
  maxY = Math.min(bh - 1, maxY + 1)
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  if (w <= 0 || h <= 0) return { inside, outside }
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  const visit = (x: number, y: number) => {
    if (x < minX || x > maxX || y < minY || y > maxY) return
    const li = (y - minY) * w + (x - minX)
    if (seen[li] || outline.has(y * bw + x)) return
    seen[li] = 1
    outside.add(y * bw + x)
    stack.push(li)
  }
  for (let x = minX; x <= maxX; x++) {
    visit(x, minY)
    visit(x, maxY)
  }
  for (let y = minY; y <= maxY; y++) {
    visit(minX, y)
    visit(maxX, y)
  }
  while (stack.length > 0) {
    const li = stack.pop() as number
    const lx = li % w
    const ly = (li - lx) / w
    const x = minX + lx
    const y = minY + ly
    visit(x - 1, y)
    visit(x + 1, y)
    visit(x, y - 1)
    visit(x, y + 1)
  }
  for (let ly = 0; ly < h; ly++) {
    for (let lx = 0; lx < w; lx++) {
      if (seen[ly * w + lx]) continue
      const i = (minY + ly) * bw + minX + lx
      if (!outline.has(i)) inside.add(i)
    }
  }
  return { inside, outside }
}

/**
 * Even-odd filled cell set of traced integer loops — the fill for shapes whose loops punch holes
 * (e.g. the skull's eye sockets). Half-integer test points keep boundary cells out; callers stamp
 * the outline cells separately as material.
 */
export function fillCellsEvenOdd(
  loops: readonly (readonly (readonly [number, number])[])[],
  bw: number,
  bh: number,
): Set<number> {
  const inside = new Set<number>()
  if (loops.length === 0 || bw <= 0 || bh <= 0) return inside
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const loop of loops) {
    for (const [x, y] of loop) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  minX = Math.max(0, Math.floor(minX))
  minY = Math.max(0, Math.floor(minY))
  maxX = Math.min(bw - 1, Math.ceil(maxX))
  maxY = Math.min(bh - 1, Math.ceil(maxY))
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInPolys(loops as never, x + 0.5, y + 0.5)) inside.add(y * bw + x)
    }
  }
  return inside
}

/** Even-odd containment test of a point against a set of polylines. */
export function pointInPolys(
  polys: readonly (readonly (readonly [number, number])[])[],
  x: number,
  y: number,
): boolean {
  let inside = false
  for (const poly of polys) {
    for (let i = 1; i < poly.length; i++) {
      const ax = poly[i - 1][0]
      const ay = poly[i - 1][1]
      const bx = poly[i][0]
      const by = poly[i][1]
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside
    }
  }
  return inside
}
