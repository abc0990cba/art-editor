import { describe, expect, it } from 'vitest'

import type { ImportBitmap } from '../import/index.ts'
import { DEFAULT_TRACE_PARAMS } from './params.ts'
import { clusterImage } from './quantize.ts'

function bitmap(
  w: number,
  h: number,
  fill: (x: number, y: number) => [number, number, number, number],
): ImportBitmap {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fill(x, y)
      const o = (y * w + x) * 4
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = a
    }
  }
  return { width: w, height: h, data }
}

describe('clusterImage', () => {
  it('splits two solid regions into two layers, big one first', () => {
    // red quadrant (256 px) on a green field (768 px)
    const bmp = bitmap(32, 32, (x, y) => (x < 16 && y < 16 ? [255, 0, 0, 255] : [0, 255, 0, 255]))
    const { labels, layers } = clusterImage(bmp, {
      ...DEFAULT_TRACE_PARAMS,
      colorPrecision: 8,
      layerDifference: 0,
    })
    expect(layers).toHaveLength(2)
    // green covers more pixels → bottom layer
    expect(layers[0].color).toBe('#00ff00')
    expect(layers[1].color).toBe('#ff0000')
    expect(labels[0]).toBe(1) // red quadrant gets paint order 1
    expect(labels[16 * 32 + 16]).toBe(0)
  })

  it('merges colors within layerDifference', () => {
    const bmp = bitmap(8, 8, (x) => (x < 4 ? [0, 0, 0, 255] : [32, 32, 32, 255]))
    const merged = clusterImage(bmp, {
      ...DEFAULT_TRACE_PARAMS,
      layerDifference: 32,
      colorPrecision: 8,
    })
    expect(merged.layers).toHaveLength(1)
    const separate = clusterImage(bmp, {
      ...DEFAULT_TRACE_PARAMS,
      layerDifference: 16,
      colorPrecision: 8,
    })
    expect(separate.layers).toHaveLength(2)
  })

  it('skips transparent pixels', () => {
    const bmp = bitmap(8, 8, (_x, y) => (y < 4 ? [0, 0, 255, 255] : [0, 0, 0, 0]))
    const { labels, layers } = clusterImage(bmp, { ...DEFAULT_TRACE_PARAMS, layerDifference: 0 })
    expect(layers).toHaveLength(1)
    expect(labels[0]).toBe(0)
    expect(labels[7 * 8]).toBe(255)
  })

  it('caps layers at 254 so the label byte never overflows', () => {
    // 300 distinct far-apart colors, precision 8, no merging
    const bmp = bitmap(300, 1, (x) => [x % 256, Math.floor(x / 2) % 256, (x * 7) % 256, 255])
    const { labels, layers } = clusterImage(bmp, {
      ...DEFAULT_TRACE_PARAMS,
      colorPrecision: 8,
      layerDifference: 0,
    })
    expect(layers.length).toBeLessThanOrEqual(254)
    for (const l of labels) expect(l).toBeLessThanOrEqual(254)
  })
})
