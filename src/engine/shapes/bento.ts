/** Bento grid layout: the unit square split into seeded, jittered, mergeable slots. */

import type { ShapeOpts } from './tools.ts'
import { clamp, clampInt } from './util.ts'

interface BentoRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Slot bounds in box fractions, merged groups tracked as row/col spans. */
type SlotGroup = { r0: number; r1: number; c0: number; c1: number }

interface BentoGrid {
  xs: number[]
  ys: number[]
  cols: number
  rows: number
  gap: number
  spanX: number
  spanY: number
}

/** Deterministic PRNG (mulberry32) so seeded layouts stay stable between frames. */
function seededRandom(seed: number): () => number {
  let a = (Math.floor(seed) || 1) >>> 0
  return () => {
    a = (a + 0x6d_2b_79_f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** Dividers as fractions of [0,1], jittered but monotone with a floor separation. */
function dividers(n: number, chaos: number, rnd: () => number): number[] {
  const d: number[] = []
  for (let i = 1; i < n; i++) {
    let v = i / n + chaos * (rnd() * 2 - 1) * (0.5 / n)
    const prev = d.length > 0 ? d[d.length - 1] : 0
    v = Math.min(Math.max(v, prev + 0.15 / n), 1 - 0.15 / n)
    d.push(v)
  }
  return d
}

/** Seeded union-find merging of adjacent slots into spans, then bounding groups. */
function slotGroups(
  cols: number,
  rows: number,
  merge: number,
  rnd: () => number,
): Map<number, SlotGroup> {
  const id = Array.from({ length: cols * rows }, (_, i) => i)
  const find = (i: number): number => {
    while (id[i] !== i) {
      id[i] = id[id[i]]
      i = id[i]
    }
    return i
  }
  if (merge > 0) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c + 1 < cols && rnd() < merge) {
          id[find(r * cols + c)] = find(r * cols + c + 1)
        }
        if (r + 1 < rows && rnd() < merge) {
          id[find(r * cols + c)] = find((r + 1) * cols + c)
        }
      }
    }
  }
  // each merged group becomes the bounding rect of its slots
  const groups = new Map<number, SlotGroup>()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const g = groups.get(find(r * cols + c))
      if (g) {
        g.r0 = Math.min(g.r0, r)
        g.r1 = Math.max(g.r1, r)
        g.c0 = Math.min(g.c0, c)
        g.c1 = Math.max(g.c1, c)
      } else {
        groups.set(find(r * cols + c), { r0: r, r1: r, c0: c, c1: c })
      }
    }
  }
  return groups
}

/** Each group becomes a rect, inset by half the gap stripe on interior boundaries. */
function slotRects(groups: Map<number, SlotGroup>, grid: BentoGrid): BentoRect[] {
  const { xs, ys, cols, rows, gap, spanX, spanY } = grid
  const slotW = spanX / cols
  const slotH = spanY / rows
  const g = Math.min(gap, 0.6 * Math.min(slotW, slotH))
  const rects: BentoRect[] = []
  for (const grp of groups.values()) {
    rects.push({
      x0: xs[grp.c0] + (grp.c0 > 0 ? g / 2 : 0),
      y0: ys[grp.r0] + (grp.r0 > 0 ? g / 2 : 0),
      x1: xs[grp.c1 + 1] - (grp.c1 < cols - 1 ? g / 2 : 0),
      y1: ys[grp.r1 + 1] - (grp.r1 < rows - 1 ? g / 2 : 0),
    })
  }
  rects.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  return rects
}

/**
 * Bento layout: the unit square split into cols×rows slots with seeded divider jitter (chaos) and
 * seeded slot merging (spans); cells are inset by half the gap stripe on interior boundaries.
 * Returns unit-square rects.
 */
export function bentoSlots(opts: ShapeOpts): BentoRect[] {
  const cols = clampInt(opts.bentoCols ?? 3, 1, 8)
  const rows = clampInt(opts.bentoRows ?? 3, 1, 8)
  const gap = clamp(opts.bentoGap ?? 0.08, 0, 0.3)
  const inset = clamp(opts.bentoInset ?? 0, 0, 0.2)
  const chaos = clamp(opts.bentoChaos ?? 0, 0, 0.3)
  const merge = clamp(opts.bentoMerge ?? 0, 0, 1)
  const rnd = seededRandom(opts.bentoSeed ?? 1)
  const bx0 = inset
  const by0 = inset
  const bx1 = 1 - inset
  const by1 = 1 - inset
  const spanX = bx1 - bx0
  const spanY = by1 - by0

  const xs = [0, ...dividers(cols, chaos, rnd), 1].map((f) => bx0 + f * spanX)
  const ys = [0, ...dividers(rows, chaos, rnd), 1].map((f) => by0 + f * spanY)
  const groups = slotGroups(cols, rows, merge, rnd)
  return slotRects(groups, { xs, ys, cols, rows, gap, spanX, spanY })
}
