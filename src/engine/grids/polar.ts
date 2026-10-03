const RING_TOL = 0.75 // radius bucket tolerance for symmetry (ring thickness 1)

/**
 * Cell on the same radius ring closest to the target angle (-1 when none). Shared symmetry
 * primitive: non-square grids resolve symmetric copies through polar angle maps, so every lattice
 * exposes radiusOf/angleOf and delegates here.
 */
export function byAngle(
  count: number,
  radiusOf: (i: number) => number,
  angleOf: (i: number) => number,
  i: number,
  target: number,
): number {
  const r0 = radiusOf(i)
  let best = -1
  let bestDa = Infinity
  for (let j = 0; j < count; j++) {
    if (j === i) continue
    if (Math.abs(radiusOf(j) - r0) > RING_TOL) continue
    let da = angleOf(j) - target
    da = ((((da + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI
    if (Math.abs(da) < bestDa) {
      bestDa = Math.abs(da)
      best = j
    }
  }
  return best
}
