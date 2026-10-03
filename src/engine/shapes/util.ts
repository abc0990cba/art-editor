/** Shared primitives of the shape module: the polyline type and tiny math helpers. */

export type Polyline = [number, number][]

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export function clampInt(v: number, lo: number, hi: number): number {
  return Math.round(clamp(v, lo, hi))
}

/** Rotate normalized polylines around the box center by `deg` degrees. */
export function rotated(polys: Polyline[], deg: number): Polyline[] {
  if (!deg) return polys
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return polys.map((poly) =>
    poly.map(([x, y]) => {
      const dx = x - 0.5
      const dy = y - 0.5
      return [0.5 + dx * cos - dy * sin, 0.5 + dx * sin + dy * cos] as [number, number]
    }),
  )
}
