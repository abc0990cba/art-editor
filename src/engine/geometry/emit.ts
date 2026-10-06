/**
 * Path-group emitters shared by the square-grid and non-square-grid builders: the base ink group
 * (hollow/stroke attributes) and the inlay color groups painted after every base figure.
 */

import type { InlaySettings } from '../core/inlay.ts'
import { isStrokeOn, strokeColorOf, type StrokeSettings } from '../core/stroke.ts'
import { createInlayColorOf } from './inlay.ts'
import type { StyledPath } from './types.ts'

/** One base-ink path group: hollow/stroke attributes when the stroke block is active. */
export function baseGroupPath(
  color: string,
  palette: readonly string[],
  stroke: StrokeSettings,
  v: number,
  d: string,
): StyledPath {
  if (!isStrokeOn(stroke)) return { d, fill: color }
  return {
    d,
    fill: stroke.fill ? color : undefined,
    stroke: strokeColorOf(palette, stroke, v),
    strokeWidth: stroke.width,
  }
}

/** Inlay color groups appended after every base figure: the inlay reads as a mark on the ink. */
export function emitInlayPaths(
  palette: readonly string[],
  inlay: InlaySettings,
  inlayGroups: Map<number, string[]>,
  paths: StyledPath[],
): void {
  if (inlayGroups.size === 0) return
  const inlayColorOf = createInlayColorOf(palette, inlay)
  for (const [v, frags] of inlayGroups) {
    paths.push({ d: frags.join(''), fill: inlayColorOf(v) })
  }
}
