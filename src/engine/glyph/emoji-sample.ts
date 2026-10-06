/**
 * Character → ink-bitmap sampling for the glyph inlay: a character/emoji is rasterized through the
 * system font stack on an offscreen canvas, alpha-thresholded and block-averaged into a resolution
 * × resolution bitmap of 0/1. Bounded LRU keyed `char@resolution` — geometry calls this once per
 * fragment build. Node environments (tests) get a centered-dot fallback, keeping the geometry pure
 * there. Canvas-in-engine precedent: output/png.ts.
 */

const SAMPLE_PX = 8 // canvas pixels per matrix cell at sampling time
const THRESHOLD = 96 // alpha ≥ this counts as ink
const LRU_MAX = 32

const cache = new Map<string, Uint8Array>()

/** Centered dot fallback for DOM-less environments: an inset disc of on-bits. */
function fallbackBitmap(res: number): Uint8Array {
  const bm = new Uint8Array(res * res)
  const mid = (res - 1) / 2
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      if (Math.hypot(x - mid, y - mid) <= res * 0.3) bm[y * res + x] = 1
    }
  }
  return bm
}

/** First grapheme of the input (code-point safe; emoji ZWJ sequences stay one glyph). */
export function firstGrapheme(text: string): string {
  const trimmed = text.trim()
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return new Intl.Segmenter().segment(trimmed)[Symbol.iterator]().next().value?.segment ?? ''
  }
  return [...trimmed][0] ?? ''
}

/**
 * Ink bitmap of one character at the given resolution (row-major, values 0/1). Deterministic per
 * (character, resolution); platform fonts make emoji silhouettes differ between systems — the
 * bitmap is a stencil, not typesetting.
 */
export function sampleGlyph(ch: string, resolution: number): Uint8Array {
  const res = Math.max(4, Math.min(12, Math.round(resolution)))
  const key = `${ch}@${res}`
  const hit = cache.get(key)
  if (hit) return hit
  const bm = draw(ch, res)
  if (cache.size >= LRU_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, bm)
  return bm
}

function draw(ch: string, res: number): Uint8Array {
  if (typeof document === 'undefined') return fallbackBitmap(res)
  const canvas = document.createElement('canvas')
  const side = res * SAMPLE_PX
  canvas.width = side
  canvas.height = side
  const ctx = canvas.getContext('2d')
  if (!ctx) return fallbackBitmap(res)
  ctx.clearRect(0, 0, side, side)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${side * 0.9}px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`
  ctx.fillText(ch, side / 2, side / 2 + side * 0.04)
  const data = ctx.getImageData(0, 0, side, side).data
  // block-average alpha over each SAMPLE_PX² tile, then threshold — robust to AA edges
  const bm = new Uint8Array(res * res)
  for (let by = 0; by < res; by++) {
    for (let bx = 0; bx < res; bx++) {
      let acc = 0
      for (let py = 0; py < SAMPLE_PX; py++) {
        const row = (by * SAMPLE_PX + py) * side
        for (let px = 0; px < SAMPLE_PX; px++) {
          acc += data[((row + bx * SAMPLE_PX + px) << 2) + 3]
        }
      }
      bm[by * res + bx] = acc >= THRESHOLD * SAMPLE_PX * SAMPLE_PX * 0.35 ? 1 : 0
    }
  }
  return bm
}

/** Test hook: drop the memoized bitmaps. */
export function clearGlyphCache(): void {
  cache.clear()
}
