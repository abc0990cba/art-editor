/**
 * Shared types of the gradient engine: region samples, fitted paint models, fit options. A region
 * is a structure-of-arrays set of pixel samples in image coordinates; a fit is one of the
 * SVG-native paint models (solid / linear / radial) with piecewise-linear stops in sRGB — the
 * subset that browsers draw natively and Adobe Illustrator imports reliably.
 */

export interface Vec2 {
  x: number
  y: number
}

/** SRGB color, channels 0..1 in the SVG device space (not light-linearized). */
export interface RGB {
  r: number
  g: number
  b: number
}

/** One gradient stop: position 0..1 along the gradient axis, sRGB color. */
export interface GradStop {
  offset: number
  color: RGB
}

/** Approximation error of a fit against the region samples, in CIEDE2000. */
export interface FitError {
  mean: number
  p95: number
}

/** Structure-of-arrays pixel samples of one region; `weights` erode anti-aliased borders. */
export interface RegionPixels {
  count: number
  xs: Float32Array
  ys: Float32Array
  /** Length = count * 3, sRGB 0..1, layout r,g,b per sample */
  rgb: Float32Array
  weights: Float32Array
}

/** Small float image used for image-gradient estimation (radial center fit). */
export interface RgbField {
  width: number
  height: number
  /** Length = width * height * 3, sRGB 0..1 */
  rgb: Float32Array
}

export type GradFit =
  | { kind: 'solid'; color: RGB; error: FitError }
  | { kind: 'linear'; p1: Vec2; p2: Vec2; stops: GradStop[]; error: FitError }
  | { kind: 'radial'; center: Vec2; radius: number; stops: GradStop[]; error: FitError }

export interface FitOptions {
  /** Mean ΔE2000 a model must stay under to be accepted */
  deltaETolerance: number
  /** Upper bound of stops per gradient */
  maxStops: number
  /** Profile bins along the gradient axis (profile.ts) */
  bins: number
  /** Mean ΔE a quadratic surface may leave behind for the region to count as smooth */
  smoothnessDE: number
}

export const DEFAULT_FIT_OPTIONS: FitOptions = {
  deltaETolerance: 2,
  maxStops: 8,
  bins: 96,
  smoothnessDE: 8,
}

export interface FitResult {
  fit: GradFit
  /** Mean ΔE within the tolerance */
  accepted: boolean
  /** A quadratic surface fits well — a gradient model is meaningful at all */
  smooth: boolean
}
