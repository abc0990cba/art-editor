import { describe, expect, it } from 'vitest'

import type { ImportBitmap } from '../import/index.ts'
import { DEFAULT_TRACE_PARAMS } from './params.ts'
import { traceImage } from './trace.ts'

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

/** Left half red, right half green: one straight shared edge at x = 16. */
function halves(): ImportBitmap {
  return bitmap(32, 32, (x) => (x < 16 ? [255, 0, 0, 255] : [0, 200, 0, 255]))
}

function pathOf(svg: string, fill: string): string {
  return svg.split('\n').find((l) => l.includes(`fill="${fill}"`)) ?? ''
}

/** All coordinate pairs mentioned by a path's data. */
function coords(d: string): [number, number][] {
  return [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])])
}

describe('mosaic composition', () => {
  it('both sides share the fitted curve on the common edge', () => {
    const { svg } = traceImage(
      { kind: 'raster', bitmap: halves() },
      {
        ...DEFAULT_TRACE_PARAMS,
        colorPrecision: 8,
        layerDifference: 0,
        hierarchical: 'mosaic',
        mode: 'spline',
        cornerThreshold: 180,
        spliceThreshold: 180,
      },
    )
    const red = coords(pathOf(svg, '#ff0000')).filter(([x]) => Math.abs(x - 16) < 0.01)
    const green = coords(pathOf(svg, '#00c800')).filter(([x]) => Math.abs(x - 16) < 0.01)
    // the shared vertical edge is emitted by both regions with identical vertices, reversed
    expect(red.length).toBeGreaterThan(0)
    expect(red).toEqual([...green].reverse())
  })

  it('mosaic and cutout produce the same region count', () => {
    const params = {
      ...DEFAULT_TRACE_PARAMS,
      colorPrecision: 8,
      layerDifference: 0,
      mode: 'spline' as const,
    }
    const cutout = traceImage(
      { kind: 'raster', bitmap: halves() },
      { ...params, hierarchical: 'cutout' },
    )
    const mosaic = traceImage(
      { kind: 'raster', bitmap: halves() },
      { ...params, hierarchical: 'mosaic' },
    )
    const paths = (svg: string): number => svg.split('<path ').length - 1
    expect(paths(mosaic.svg)).toBe(paths(cutout.svg))
    expect(paths(mosaic.svg)).toBe(2)
  })
})
