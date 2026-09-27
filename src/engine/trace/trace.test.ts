import { describe, expect, it } from 'vitest'

import type { ImportBitmap } from '../import-image.ts'
import { DEFAULT_TRACE_PARAMS, normalizeTraceParams } from './params.ts'
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

/** Red 16×16 square centered on a green 48×48 field. */
function redSquareOnGreen(): ImportBitmap {
  return bitmap(48, 48, (x, y) => {
    const inside = x >= 16 && x < 32 && y >= 16 && y < 32
    return inside ? [255, 0, 0, 255] : [0, 128, 0, 255]
  })
}

function fills(svg: string): string[] {
  return [...svg.matchAll(/fill="(#[0-9a-f]+)"/g)].map((m) => m[1])
}

describe('traceImage outline', () => {
  it('stacks a red square over the green background', () => {
    const { svg, stats } = traceImage(
      { kind: 'raster', bitmap: redSquareOnGreen() },
      {
        ...DEFAULT_TRACE_PARAMS,
        colorPrecision: 8,
        layerDifference: 0,
        mode: 'polygon',
      },
    )
    expect(fills(svg)).toEqual(['#008000', '#ff0000'])
    expect(stats.clusters).toBe(2)
    expect(stats.paths).toBe(2)
    expect(svg).toContain('fill-rule="evenodd"')
  })

  it('keeps the square hole in keep mode and drops it in fill mode', () => {
    const ring = bitmap(48, 48, (x, y) => {
      const dx = Math.max(Math.abs(x - 24), Math.abs(y - 24))
      const band = dx >= 8 && dx < 14
      return band ? [255, 0, 0, 255] : [0, 128, 0, 255]
    })
    const params = {
      ...DEFAULT_TRACE_PARAMS,
      colorPrecision: 8,
      layerDifference: 0,
      mode: 'polygon' as const,
    }
    // stacked + keep: the red band path carries outer + hole subpaths (two M commands)
    const keep = traceImage({ kind: 'raster', bitmap: ring }, params)
    const keepRed = keep.svg.split('\n').find((l) => l.includes('#ff0000'))
    expect(keepRed?.match(/M/g)).toHaveLength(2)
    // holes: fill: the ring fills solid (one subpath)
    const fill = traceImage({ kind: 'raster', bitmap: ring }, { ...params, holes: 'fill' })
    const fillRed = fill.svg.split('\n').find((l) => l.includes('#ff0000'))
    expect(fillRed?.match(/M/g)).toHaveLength(1)
  })

  it('cutout removes the covered area from the background path', () => {
    const params = {
      ...DEFAULT_TRACE_PARAMS,
      colorPrecision: 8,
      layerDifference: 0,
      mode: 'polygon' as const,
      hierarchical: 'cutout' as const,
    }
    const { svg } = traceImage({ kind: 'raster', bitmap: redSquareOnGreen() }, params)
    const green = svg.split('\n').find((l) => l.includes('#008000'))
    // background = frame around the square: outer + inner hole subpaths
    expect(green?.match(/M/g)).toHaveLength(2)
  })

  it('binary mode traces one black layer by threshold', () => {
    const bmp = bitmap(32, 32, (x, y) =>
      x >= 8 && x < 24 && y >= 8 && y < 24 ? [10, 10, 10, 255] : [240, 240, 240, 255],
    )
    const { svg, stats } = traceImage(
      { kind: 'raster', bitmap: bmp },
      {
        ...DEFAULT_TRACE_PARAMS,
        colorMode: 'binary',
        binaryThreshold: 128,
        mode: 'polygon',
      },
    )
    expect(fills(svg)).toEqual(['#000000'])
    expect(stats.clusters).toBe(1)
  })

  it('accepts explicit color layers (mask input, no clustering)', () => {
    const mask = new Uint8Array(16 * 16)
    for (let y = 4; y < 12; y++) {
      for (let x = 4; x < 12; x++) mask[y * 16 + x] = 1
    }
    const { svg } = traceImage(
      {
        kind: 'layers',
        width: 16,
        height: 16,
        layers: [
          { color: '#123456', mask: new Uint8Array(16 * 16).fill(1) },
          { color: '#abcdef', mask },
        ],
      },
      { ...DEFAULT_TRACE_PARAMS, mode: 'polygon' },
    )
    expect(fills(svg)).toContain('#abcdef')
    expect(svg).not.toContain('#008000')
  })

  it('centerline traces a thick line into one stroke of matching width', () => {
    const bmp = bitmap(64, 64, (_x, y) =>
      y >= 30 && y < 34 ? [20, 20, 20, 255] : [235, 235, 235, 255],
    )
    const { svg, stats } = traceImage(
      { kind: 'raster', bitmap: bmp },
      {
        ...normalizeTraceParams(null),
        tracer: 'centerline',
        mode: 'spline',
        minStrokeLength: 4,
        strokeWidth: 0,
      },
    )
    expect(stats.strokes).toBe(1)
    expect(svg).toContain('fill="none"')
    const width = Number(svg.match(/stroke-width="([\d.]+)"/)?.[1])
    expect(width).toBeGreaterThan(2.5)
    expect(width).toBeLessThan(5.5)
  })

  it('traces dithered-palette masks directly (layers input, scenario A hook)', () => {
    // a "dithered" doc: two palette colors scattered as cells; masks derive per color without
    // any clustering, then the tracer turns them into flat color regions
    const size = 24
    const cells = new Uint16Array(size * size)
    const maskA = new Uint8Array(size * size)
    const maskB = new Uint8Array(size * size)
    for (let i = 0; i < cells.length; i++) {
      const on = (i % 7) % 3 === 0
      cells[i] = on ? 1 : 2
      if (on) maskA[i] = 1
      else maskB[i] = 1
    }
    const { svg, stats } = traceImage(
      {
        kind: 'layers',
        width: size,
        height: size,
        layers: [
          { color: '#111111', mask: maskA },
          { color: '#eeeeee', mask: maskB },
        ],
      },
      { ...DEFAULT_TRACE_PARAMS, mode: 'polygon', colorPrecision: 8, layerDifference: 0 },
    )
    expect(svg).toContain('#111111')
    expect(svg).toContain('#eeeeee')
    expect(stats.clusters).toBe(2)
    // every pixel of the dither belongs to exactly one mask → the plane tiles without gaps
    expect(stats.paths).toBe(2)
  })

  it('centerline on a cross yields strokes meeting at the junction', () => {
    const bmp = bitmap(64, 64, (x, y) => {
      const bar = (x >= 28 && x < 36) || (y >= 28 && y < 36)
      return bar ? [20, 20, 20, 255] : [235, 235, 235, 255]
    })
    const { stats } = traceImage(
      { kind: 'raster', bitmap: bmp },
      {
        ...DEFAULT_TRACE_PARAMS,
        tracer: 'centerline',
        mode: 'polygon',
        minStrokeLength: 8,
      },
    )
    // arms of the cross plus short junction bridges the thinning leaves in the crossing area
    // (they overlap the same pixels, so the rendered result is still a connected cross)
    expect(stats.strokes).toBeGreaterThanOrEqual(2)
    expect(stats.strokes).toBeLessThanOrEqual(12)
  })
})
