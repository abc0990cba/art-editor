/**
 * Organic auto-filters on ink maps — seeded melt and decay. `dripInk` grows gravity trails from
 * every run-end cell (no ink neighbor along the drip direction): each trail's length varies between
 * `length·(1−variation)` and `length` by a per-cell hash, walking through empty cells only so
 * parallel trails merge into curtains instead of overwriting ink. `dissolveInk` keeps ink only
 * where a seeded noise sample passes the amount — pure per-pixel scatter at scale 1, smooth clumped
 * value noise above. Both deterministic (no Math.random) and integer-exact.
 */

import { hash2, valueNoise } from '../texture/core.ts'
import type { InkCell } from './selection-xform.ts'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Drip knobs. */
export interface DripParams {
  /** Drip direction per axis, -1|0|1 (orthogonal: exactly one is 0) */
  dx: -1 | 0 | 1
  dy: -1 | 0 | 1
  /** Max trail length in cells (1..16) */
  length: number
  /** Length spread 0..1 (0 = every trail at full length) */
  variation: number
  /** Hash seed */
  seed: number
}

/**
 * Gravity melt: from every source cell without a source-ink neighbor along (dx, dy) a trail of
 * `round(length · (1 − variation + variation · hash))` empty cells grows in that direction, stopped
 * by other source ink and the buffer edge. Returns the complete ink including trails.
 */
export function dripInk(
  src: Map<number, InkCell>,
  p: DripParams,
  bw: number,
  bh: number,
): Map<number, InkCell> {
  const dx = Math.sign(Math.round(p.dx))
  let dy = Math.sign(Math.round(p.dy))
  if (dx !== 0 && dy !== 0) dy = 0
  if (dx === 0 && dy === 0) dy = 1
  const len = clamp(Math.round(p.length), 1, 16)
  const variation = clamp(p.variation, 0, 1)
  const out = new Map(src)
  for (const [i, cell] of src) {
    const x = i % bw
    const y = (i - x) / bw
    // run end only: interior and trailing cells of a run emit nothing
    const nx = x + dx
    const ny = y + dy
    if (nx >= 0 && nx < bw && ny >= 0 && ny < bh && src.has(ny * bw + nx)) continue
    const r = hash2(x, y, Math.round(p.seed)) / 4_294_967_296
    const steps = Math.round(len * (1 - variation + variation * r))
    for (let s = 1; s <= steps; s++) {
      const tx = x + dx * s
      const ty = y + dy * s
      if (tx < 0 || ty < 0 || tx >= bw || ty >= bh) break
      const ti = ty * bw + tx
      if (src.has(ti)) break
      out.set(ti, cell)
    }
  }
  return out
}

/** Dissolve knobs. */
export interface DissolveParams {
  /** Keep threshold 0..0.95 — the fraction of ink that melts away */
  amount: number
  /** 1 = per-pixel scatter, >1 = clumps of roughly this many cells (1..8) */
  scale: number
  /** Noise seed */
  seed: number
}

/**
 * Noise-gated removal: ink survives where a seeded hash (scale 1) or smooth value noise (scale
 *
 * > 1, clumping the holes) exceeds `amount`. Returns the surviving subset.
 */
export function dissolveInk(
  src: Map<number, InkCell>,
  p: DissolveParams,
  bw: number,
): Map<number, InkCell> {
  const a = clamp(p.amount, 0, 0.95)
  const s = Math.max(1, Math.round(p.scale))
  const seed = Math.round(p.seed)
  const out = new Map<number, InkCell>()
  for (const [i, cell] of src) {
    const x = i % bw
    const y = (i - x) / bw
    const n = s === 1 ? hash2(x, y, seed) / 4_294_967_296 : valueNoise(x / s, y / s, seed)
    if (n > a) out.set(i, cell)
  }
  return out
}
