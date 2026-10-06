/**
 * Inner-figure inlay rendering (pixels mode): per-palette-value color resolution and fragment
 * placement inside the base figure box. Fragments go into their own per-value groups that the
 * geometry builders emit after the base figure paths, so the inlay paints on top.
 */

import { DEFAULT_SHAPE_PARAMS, cellShapeFragment } from '../cell-shapes/index.ts'
import { hexLuminance } from '../color/color.ts'
import { shadeHex, tintHex } from '../color/shade.ts'
import type { InlaySettings } from '../core/inlay.ts'
import { firstGrapheme, sampleGlyph } from '../glyph/emoji-sample.ts'

/** A placed figure box: the base figure after stretch, tone sizing and spread. */
export interface FigureBox {
  x: number
  y: number
  w: number
  h: number
}

export const isInlayOn = (inlay: InlaySettings): boolean => inlay.shape !== 'none'

/**
 * Inlay color resolver for one document palette; the tone extremes are computed once per build.
 * Value reads wrap modulo the palette length like `cellColor`.
 */
export function createInlayColorOf(
  palette: readonly string[],
  inlay: InlaySettings,
): (v: number) => string {
  const at = (v: number): string =>
    palette.length > 0 ? (palette[(v - 1) % palette.length] ?? '#888') : '#888'
  if (inlay.colorMode === 'toneDark' || inlay.colorMode === 'toneLight') {
    let dark = at(1)
    let light = at(1)
    let darkLuma = Infinity
    let lightLuma = -Infinity
    for (const hex of palette) {
      const luma = hexLuminance(hex)
      if (luma < darkLuma) {
        darkLuma = luma
        dark = hex
      }
      if (luma > lightLuma) {
        lightLuma = luma
        light = hex
      }
    }
    const fixed = inlay.colorMode === 'toneDark' ? dark : light
    return () => fixed
  }
  if (inlay.colorMode === 'slot') return () => at(inlay.slot)
  return (v) =>
    inlay.colorMode === 'darken' ? shadeHex(at(v), inlay.depth) : tintHex(at(v), inlay.depth)
}

/** Dot-matrix fragment of the sampled character inside the inlay box, rotated about its center. */
function glyphFragment(inlay: InlaySettings, box: FigureBox, angleDelta: number): string {
  const res = Math.max(4, Math.min(12, Math.round(inlay.resolution)))
  const bm = sampleGlyph(firstGrapheme(inlay.glyph), res)
  const mw = box.w / res
  const mh = box.h / res
  const dw = mw * inlay.dotScale
  const dh = mh * inlay.dotScale
  const rad = ((inlay.rotation + angleDelta) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  let d = ''
  for (let gy = 0; gy < res; gy++) {
    for (let gx = 0; gx < res; gx++) {
      if (!bm[gy * res + gx]) continue
      // matrix-cell center in the unrotated box, rotated about the box center
      const dx = box.x + (gx + 0.5) * mw - cx
      const dy = box.y + (gy + 0.5) * mh - cy
      d += cellShapeFragment({
        id: inlay.dotShape,
        x: cx + dx * cos - dy * sin - dw / 2,
        y: cy + dx * sin + dy * cos - dh / 2,
        w: dw,
        h: dh,
        params: DEFAULT_SHAPE_PARAMS,
        radius: 0,
        chamfer: false,
      })
    }
  }
  return d
}

/**
 * Path fragment of the inlay figure inside a base figure box. The box scales about the figure
 * center (offset as a fraction of the base box), and the per-cell angle delta of the base figure
 * rotates the inlay the same way so spread keeps figure and inlay coherent. Glyph mode emits one
 * dot per on-bit of the sampled character instead of a single form.
 */
export function inlayFragment(
  inlay: InlaySettings,
  box: FigureBox,
  angleDelta: number,
  radius: number,
  chamfer: boolean,
): string {
  if (inlay.shape === 'none') return ''
  if (inlay.source === 'glyph') return glyphFragment(inlay, box, angleDelta)
  const w = box.w * inlay.scale
  const h = box.h * inlay.scale
  const cx = box.x + box.w / 2 + inlay.offsetX * box.w
  const cy = box.y + box.h / 2 + inlay.offsetY * box.h
  return cellShapeFragment({
    id: inlay.shape,
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h,
    params: {
      thickness: inlay.thickness,
      points: inlay.points,
      rotation: (inlay.rotation + angleDelta + 360) % 360,
    },
    radius,
    chamfer,
  })
}
