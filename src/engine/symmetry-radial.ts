/** Extra knobs for the radial/kaleido modes (rosette drawing styles). */
export interface RadialOpts {
  /** Painted fraction of each sector, 0..100 (100 = full sector) */
  fill?: number
  /** Rotation of the sector pattern in degrees, 0..359 */
  phase?: number
  /** Extra rotation per unit radius in degrees (spiral twist), -45..45 */
  twist?: number
}

export const foldCount = (n: number) => Math.max(2, Math.round(n))
export const fillFrac = (radial: RadialOpts | undefined) =>
  Math.max(0, Math.min(100, radial?.fill ?? 100)) / 100
export const phaseRad = (radial: RadialOpts | undefined) => ((radial?.phase ?? 0) * Math.PI) / 180
export const twistRad = (radial: RadialOpts | undefined) => ((radial?.twist ?? 0) * Math.PI) / 180

/** Buffer-space wedge gate: is the point inside the painted part of its sector? */
export function inFilledWedge(
  x: number,
  y: number,
  bw: number,
  bh: number,
  n: number,
  radial: RadialOpts | undefined,
): boolean {
  const fill = fillFrac(radial)
  if (fill >= 1) return true
  const cx = (bw - 1) / 2
  const cy = (bh - 1) / 2
  const w = (2 * Math.PI) / foldCount(n)
  let a = Math.atan2(y - cy, x - cx) - phaseRad(radial)
  a = ((a % w) + w) % w
  return a / w <= fill + 1e-9
}

/** Polar-grid variant of the wedge gate for a center-relative angle. */
export function angleInFilledWedge(a: number, n: number, radial: RadialOpts | undefined): boolean {
  const fill = fillFrac(radial)
  if (fill >= 1) return true
  const w = (2 * Math.PI) / foldCount(n)
  let t = a - phaseRad(radial)
  t = ((t % w) + w) % w
  return t / w <= fill + 1e-9
}

/** Safety cap on a single repeat-mode orbit. */
export const MAX_ORBIT = 4096
