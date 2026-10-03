/** Drag-direction shapes: arrow, wave and zigzag outlines around the start → end drag. */

import type { ShapeOpts } from './tools.ts'
import type { Polyline } from './util.ts'
import { clamp, clampInt } from './util.ts'

/** Arrow: shaft plus a triangular head around the drag tip. */
export function arrowPolylines(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  opts: ShapeOpts,
): Polyline[] {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return [[[ax, ay]]]
  const ux = dx / len
  const uy = dy / len
  const px = -uy
  const py = ux
  const head = clamp(opts.arrowHead ?? 0.35, 0.1, 0.6) * len
  const width = head * clamp(opts.arrowSpread ?? 0.6, 0.2, 1.2)
  const cx = bx - ux * head
  const cy = by - uy * head
  const b1: [number, number] = [cx + px * width, cy + py * width]
  const b2: [number, number] = [cx - px * width, cy - py * width]
  return [
    [
      [ax, ay],
      [cx, cy],
    ],
    [b1, [bx, by], b2, b1],
  ]
}

/** Wave: sine along the drag; periods and amplitude come from the tool options. */
export function wavePolylines(
  a: [number, number],
  b: [number, number],
  opts: ShapeOpts,
  steps: number,
): Polyline[] {
  const [ax, ay] = a
  const [bx, by] = b
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return [[[ax, ay]]]
  const px = -dy / len
  const py = dx / len
  const periods = clampInt(opts.wavePeriods ?? 3, 1, 8)
  const amp = clamp(opts.waveAmplitude ?? 0.15, 0.02, 0.45) * len
  const n = Math.max(16, steps)
  const pts: Polyline = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const off = amp * Math.sin(t * periods * 2 * Math.PI)
    pts.push([ax + dx * t + px * off, ay + dy * t + py * off])
  }
  return [pts]
}

/** Zigzag: linear extremes along the drag, same knobs as the wave. */
export function zigzagPolylines(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  opts: ShapeOpts,
): Polyline[] {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return [[[ax, ay]]]
  const px = -dy / len
  const py = dx / len
  const periods = clampInt(opts.wavePeriods ?? 3, 1, 8)
  const amp = clamp(opts.waveAmplitude ?? 0.15, 0.02, 0.45) * len
  const n = periods * 2
  const pts: Polyline = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const off = amp * (i % 2 === 0 ? -1 : 1)
    pts.push([ax + dx * t + px * off, ay + dy * t + py * off])
  }
  return [pts]
}
