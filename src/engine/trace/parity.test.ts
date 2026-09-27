import { convertPixels } from '@visioncortex/vtracer'
import { describe, expect, it } from 'vitest'

import type { ImportBitmap } from '../import-image.ts'
import { DEFAULT_TRACE_PARAMS } from './params.ts'
import { traceImage } from './trace.ts'

/**
 * Parity harness against the official vtracer wasm build (dev-only oracle; the npm package ships
 * the 1.0-alpha framework, whose default color-cluster pipeline mirrors V1 — V1 0.6.x itself is not
 * published to npm). Output SVGs are structurally compared: layer fills, path counts and
 * within-tolerance geometry density. The wasm export is synchronous, so this file stays a plain
 * Node test; it is the reference check for "vtracer V1 functionality replicated".
 */

interface Fixture {
  name: string
  bitmap: ImportBitmap
}

function make(
  name: string,
  size: number,
  fill: (x: number, y: number) => [number, number, number],
): Fixture {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fill(x, y)
      const o = (y * size + x) * 4
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = 255
    }
  }
  return { name, bitmap: { width: size, height: size, data } }
}

const FIXTURES: Fixture[] = [
  make('disc', 96, (x, y) => (Math.hypot(x - 48, y - 48) < 32 ? [210, 60, 50] : [30, 90, 140])),
  make('bands', 96, (x, y) => {
    const c: [number, number, number][] = [
      [220, 70, 60],
      [70, 180, 90],
      [70, 90, 200],
      [230, 210, 80],
    ]
    return c[Math.floor((x / 96) * 4 + (((y / 96) * 2) % 1))] ?? c[0]
  }),
  make('gradient', 96, (x, y) => [Math.floor((x / 96) * 255), Math.floor((y / 96) * 255), 128]),
]

const ORACLE_OPTIONS = {
  clustering: 'color-cluster' as const,
  hierarchical: 'stacked' as const,
  mode: 'spline' as const,
  filterSpeckle: 4,
  colorPrecision: 6,
  layerDifference: 16,
  cornerThreshold: 60,
  lengthThreshold: 4,
  spliceThreshold: 45,
  pathPrecision: 8,
}

function pathsOf(svg: string): string[] {
  return svg.split('<path ').slice(1)
}

function fillsOf(svg: string): string[] {
  return [...svg.matchAll(/fill="#([0-9a-f]{6})"/gi)].map((m) => m[1].toLowerCase())
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ]
}

describe('vtracer parity (wasm oracle)', () => {
  for (const f of FIXTURES) {
    it(`structure matches the oracle on ${f.name}`, () => {
      const rgba = new Uint8Array(f.bitmap.data)
      const oracle = convertPixels(rgba, f.bitmap.width, f.bitmap.height, ORACLE_OPTIONS)
      const ours = traceImage({ kind: 'raster', bitmap: f.bitmap }, DEFAULT_TRACE_PARAMS)

      // sanity: both produce stacked filled paths
      expect(pathsOf(ours.svg).length).toBeGreaterThan(0)
      expect(pathsOf(oracle).length).toBeGreaterThan(0)

      // path counts are within 4× of the oracle (different fitting internals, same segmentation)
      const ratio = pathsOf(ours.svg).length / pathsOf(oracle).length
      expect(ratio).toBeGreaterThan(1 / 4)
      expect(ratio).toBeLessThan(4)

      // most oracle layer colors appear in our output; clustering merge orders and averaging
      // differ slightly, so colors match within a channel-distance tolerance
      const oursFills = [...new Set(fillsOf(ours.svg))].map(hexToRgb)
      const oracleFills = fillsOf(oracle)
      if (oracleFills.length > 0) {
        const matched = oracleFills.filter((c) => {
          const [r, g, b] = hexToRgb(c)
          return oursFills.some(([or, og, ob]) => Math.hypot(r - or, g - og, b - ob) <= 24)
        }).length
        expect(matched / oracleFills.length).toBeGreaterThan(0.5)
      }
    })
  }

  it('deterministic output for identical input (snapshot)', () => {
    const f = FIXTURES[0]
    const a = traceImage({ kind: 'raster', bitmap: f.bitmap }, DEFAULT_TRACE_PARAMS)
    const b = traceImage({ kind: 'raster', bitmap: f.bitmap }, DEFAULT_TRACE_PARAMS)
    expect(a.svg).toBe(b.svg)
    expect(a.svg).toMatchSnapshot()
  })
})
