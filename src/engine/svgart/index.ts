/**
 * SVG studio engine: authored vector scenes with stacked native gradient paints, serialized to the
 * AI-safe SVG subset (see serialize.ts contract). Pure domain — no React, no DOM, no store.
 */

export { hexColor, mustHex, rgbToHex } from './color.ts'
export { paintCompat } from './compat.ts'
export { dragHandle, rotateLayer, translateLayer, translatePathData } from './edit.ts'
export {
  blobShape,
  mulberry32,
  num,
  pointsBBox,
  shapeBBox,
  shapePath,
  smoothClosedPath,
  starPoints,
} from './figures.ts'
export {
  fillHandles,
  nearestHandle,
  pointInShape,
  shapeCenter,
  topLayerAt,
  type Handle,
  type HandleId,
} from './hit.ts'
export { oklabLightness, oklabToRgb, rgbToOklab } from './oklab.ts'
export { normalizePaint, normalizeScene, normalizeShape, paintPreviewHex } from './normalize.ts'
export { mixColor, paintToCss, rampStops, sortStops, stopAlphaAt, stopColorAt } from './paint.ts'
export { FORBIDDEN_RE, sceneToSvg } from './serialize.ts'
export { softSpotLayer } from './softlayers.ts'
export {
  AURORA_DEFAULTS,
  SPHERE_DEFAULTS,
  STAR_DEFAULTS,
  TEMPLATE_IDS,
  auroraScene,
  blankScene,
  sphereScene,
  starScene,
  templateScene,
  type TemplateId,
} from './templates.ts'
export type { RGB } from '../color/color.ts'
export type { GradStop, Paint, Pt, Shape, SvgLayer, SvgScene } from './types.ts'
