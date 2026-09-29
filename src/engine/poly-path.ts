import type { Pt } from './marching-squares.ts'

/** Generic SVG path helpers shared by the grid renderer and the cell-form registry. */

export const fmt = (v: number) => String(Math.round(v * 1000) / 1000)

/** Rounded polygon: fillet every true corner (turns below 10° read as arc samples). */
/**
 * Rounded polygon: fillet every true corner (turns below 10° read as arc samples). Shared with the
 * non-square grid renderer.
 */
export function roundedPolygonPath(poly: Pt[], r: number, chamfer: boolean): string {
  const n = poly.length
  const corners: number[] = []
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n]
    const b = poly[i]
    const c = poly[(i + 1) % n]
    const d1x = b.x - a.x
    const d1y = b.y - a.y
    const d2x = c.x - b.x
    const d2y = c.y - b.y
    const l1 = Math.hypot(d1x, d1y)
    const l2 = Math.hypot(d2x, d2y)
    if (l1 === 0 || l2 === 0) continue
    const cos = (d1x * d2x + d1y * d2y) / (l1 * l2)
    if (cos < 0.985) corners.push(i) // turn angle above ~10°
  }
  if (corners.length < 3) {
    // degenerate: plain polygon
    return `M${poly.map((p) => `${fmt(p.x)} ${fmt(p.y)}`).join('L')}Z`
  }
  const isCorner = new Set(corners)
  let d = ''
  let first = true
  for (let i = 0; i < n; i++) {
    if (!isCorner.has(i)) {
      // arc sample between corners: keep it, or the whole curved edge collapses
      // into the straight chord joining the two fillets
      d += `${first ? 'M' : 'L'}${fmt(poly[i].x)} ${fmt(poly[i].y)}`
      first = false
      continue
    }
    const p = poly[i]
    const prev = poly[(i - 1 + n) % n]
    const next = poly[(i + 1) % n]
    const inLen = Math.hypot(p.x - prev.x, p.y - prev.y)
    const outLen = Math.hypot(next.x - p.x, next.y - p.y)
    const t = Math.min(r, inLen / 2, outLen / 2)
    const d1x = (p.x - prev.x) / inLen
    const d1y = (p.y - prev.y) / inLen
    const d2x = (next.x - p.x) / outLen
    const d2y = (next.y - p.y) / outLen
    const ax = p.x - d1x * t
    const ay = p.y - d1y * t
    const bx = p.x + d2x * t
    const by = p.y + d2y * t
    d += `${first ? 'M' : 'L'}${fmt(ax)} ${fmt(ay)}`
    first = false
    if (t > 0) {
      const cross = d1x * d2y - d1y * d2x
      d += chamfer
        ? `L${fmt(bx)} ${fmt(by)}`
        : `A${fmt(t)} ${fmt(t)} 0 0 ${cross > 0 ? 1 : 0} ${fmt(bx)} ${fmt(by)}`
    }
  }
  return `${d}Z`
}
