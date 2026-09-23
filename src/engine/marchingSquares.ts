/**
 * Marching squares over a scalar field given as Float32Array of fw*fh node values.
 * Returns closed loops (arrays of {x, y} points in node coordinates).
 * Contour follows nodes where value crosses `iso` (inside = value > iso).
 */
export interface Pt {
  x: number
  y: number
}

export function marchingSquares(field: Float32Array, fw: number, fh: number, iso: number): Pt[][] {
  const H = fw * fh // edge id offset: horizontal edges use id, vertical use id + H

  // Lazy edge-point cache: each crossing computed once so adjacent cells
  // reference the exact same coordinates.
  const cache = new Map<number, Pt>()

  const at = (x: number, y: number) => field[y * fw + x]

  const hPoint = (x: number, y: number): Pt => {
    const key = y * fw + x
    let p = cache.get(key)
    if (!p) {
      const a = field[key]
      const b = field[key + 1]
      const t = Math.abs(b - a) < 1e-12 ? 0.5 : (iso - a) / (b - a)
      p = { x: x + t, y }
      cache.set(key, p)
    }
    return p
  }
  const vPoint = (x: number, y: number): Pt => {
    const key = y * fw + x
    let p = cache.get(key + H)
    if (!p) {
      const a = field[key]
      const b = field[key + fw]
      const t = Math.abs(b - a) < 1e-12 ? 0.5 : (iso - a) / (b - a)
      p = { x, y: y + t }
      cache.set(key + H, p)
    }
    return p
  }

  // Segment list; each segment connects two edge ids.
  const segs: Array<[number, number]> = []

  for (let y = 0; y < fh - 1; y++) {
    for (let x = 0; x < fw - 1; x++) {
      const tl = at(x, y)
      const tr = at(x + 1, y)
      const br = at(x + 1, y + 1)
      const bl = at(x, y + 1)
      let idx = 0
      if (tl > iso) idx |= 1
      if (tr > iso) idx |= 2
      if (br > iso) idx |= 4
      if (bl > iso) idx |= 8
      if (idx === 0 || idx === 15) continue
      const Tk = y * fw + x
      const Bk = (y + 1) * fw + x
      const Lk = y * fw + x + H
      const Rk = y * fw + x + 1 + H
      const add = (a: number, b: number) => segs.push([a, b])

      switch (idx) {
        case 1:
          add(Tk, Lk)
          break
        case 2:
          add(Tk, Rk)
          break
        case 3:
          add(Lk, Rk)
          break
        case 4:
          add(Rk, Bk)
          break
        case 5:
          // saddle: resolve by center average
          if ((tl + tr + br + bl) / 4 > iso) {
            add(Tk, Rk)
            add(Bk, Lk)
          } else {
            add(Tk, Lk)
            add(Rk, Bk)
          }
          break
        case 6:
          add(Tk, Bk)
          break
        case 7:
          add(Lk, Bk)
          break
        case 8:
          add(Lk, Bk)
          break
        case 9:
          add(Tk, Bk)
          break
        case 10:
          if ((tl + tr + br + bl) / 4 > iso) {
            add(Tk, Lk)
            add(Rk, Bk)
          } else {
            add(Tk, Rk)
            add(Bk, Lk)
          }
          break
        case 11:
          add(Rk, Bk)
          break
        case 12:
          add(Lk, Rk)
          break
        case 13:
          add(Tk, Rk)
          break
        case 14:
          add(Tk, Lk)
          break
      }
    }
  }

  const posOf = (id: number): Pt => {
    if (id >= H) {
      const key = id - H
      const x = key % fw
      const y = (key - x) / fw
      return vPoint(x, y)
    }
    const x = id % fw
    const y = (id - x) / fw
    return hPoint(x, y)
  }

  // adjacency: edge id -> segment indices
  const adj = new Map<number, number[]>()
  segs.forEach(([a, b], i) => {
    let la = adj.get(a)
    if (!la) adj.set(a, (la = []))
    la.push(i)
    let lb = adj.get(b)
    if (!lb) adj.set(b, (lb = []))
    lb.push(i)
  })

  const used = new Set<number>()
  const loops: Pt[][] = []
  for (let i = 0; i < segs.length; i++) {
    if (used.has(i)) continue
    used.add(i)
    const startKey = segs[i][0]
    const loop: Pt[] = [posOf(startKey)]
    let curKey = segs[i][1]
    let curSeg = i
    let guard = segs.length * 2
    while (curKey !== startKey && guard-- > 0) {
      loop.push(posOf(curKey))
      const links = adj.get(curKey) ?? []
      const nextSeg = links[0] === curSeg ? links[1] : links[0]
      if (nextSeg === undefined || used.has(nextSeg)) break // open chain; drop
      used.add(nextSeg)
      const [a2, b2] = segs[nextSeg]
      curKey = a2 === curKey ? b2 : a2
      curSeg = nextSeg
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}
