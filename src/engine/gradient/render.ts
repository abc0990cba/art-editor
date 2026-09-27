/**
 * Mathematical renderer of fitted models over sample points — the optimizer-side twin of the SVG
 * rasterizer. Must stay sRGB with piecewise-linear stop interpolation, matching how browsers draw
 * gradients, so that errors measured here predict the rendered result. Used for fit-error metrics
 * and tests.
 */

import { deltaE2000Rgb } from './color.ts'
import { stopColorAt } from './stop-colors.ts'
import type { FitError, GradFit, RegionPixels, RGB } from './types.ts'

/** Gradient coordinate t(p) of a fit at a point, unclamped for linear/radial geometry. */
export function fitCoordinate(fit: GradFit, x: number, y: number): number {
  if (fit.kind === 'solid') return 0
  if (fit.kind === 'linear') {
    const dx = fit.p2.x - fit.p1.x
    const dy = fit.p2.y - fit.p1.y
    const len2 = dx * dx + dy * dy
    if (len2 < 1e-9) return 0
    return ((x - fit.p1.x) * dx + (y - fit.p1.y) * dy) / len2
  }
  if (fit.radius < 1e-6) return 0
  return Math.hypot(x - fit.center.x, y - fit.center.y) / fit.radius
}

/** Device color the fit produces at a point. */
export function evalFitColor(fit: GradFit, x: number, y: number): RGB {
  if (fit.kind === 'solid') return fit.color
  return stopColorAt(fit.stops, fitCoordinate(fit, x, y))
}

/** Error of a fit against region samples: weighted mean ΔE2000 and unweighted p95. */
export function evaluateFit(fit: GradFit, pixels: RegionPixels): FitError {
  const des = new Array<number>(pixels.count)
  let sum = 0
  let wSum = 0
  for (let i = 0; i < pixels.count; i++) {
    const c = evalFitColor(fit, pixels.xs[i], pixels.ys[i])
    const de = deltaE2000Rgb(
      { r: pixels.rgb[i * 3], g: pixels.rgb[i * 3 + 1], b: pixels.rgb[i * 3 + 2] },
      c,
    )
    des[i] = de
    const w = pixels.weights[i]
    sum += de * w
    wSum += w
  }
  des.sort((a, b) => a - b)
  const rank = Math.min(des.length - 1, Math.max(0, Math.ceil(des.length * 0.95) - 1))
  return { mean: wSum > 0 ? sum / wSum : 0, p95: des[rank] }
}
