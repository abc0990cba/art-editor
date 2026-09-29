/**
 * Sources for the trace-workspace demos: a flat-shape raster that begs to be vectorized and a
 * smooth color field for the gradient tracer. Both are plain RGBA buffers with 2× supersampled
 * edges, so opening the project lands the user on the import surface with work already loaded.
 */

export interface DemoSource {
  width: number
  height: number
  /** RGBA quads, row-major — handed to the project entry as its ArrayBuffer. */
  rgba: Uint8Array
}

const S = 128

const hexRgb = (hex: string): readonly [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

const SUB: readonly (readonly [number, number])[] = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
]

const inDisc = (x: number, y: number, cx: number, cy: number, r: number): boolean =>
  (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r

function inTriangle(
  x: number,
  y: number,
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): boolean {
  const sign = (p: readonly number[], q: readonly number[], r: readonly [number, number]): number =>
    (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1])
  const d1 = sign([x, y], a, b)
  const d2 = sign([x, y], b, c)
  const d3 = sign([x, y], c, a)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

/** Flat vector-ish still life: two overlapping discs and a triangle on paper. */
export function vectorDemoSource(): DemoSource {
  const rgba = new Uint8Array(S * S * 4)
  const bg = hexRgb('#f2ede4')
  const shapes: readonly { test: (x: number, y: number) => boolean; rgb: readonly number[] }[] = [
    { test: (x, y) => inDisc(x, y, 48, 52, 26), rgb: hexRgb('#e76f51') },
    { test: (x, y) => inDisc(x, y, 78, 62, 21), rgb: hexRgb('#2a9d8f') },
    {
      test: (x, y) => inTriangle(x, y, [30, 108], [66, 84], [92, 112]),
      rgb: hexRgb('#264653'),
    },
  ]
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // 2×2 supersampling gives clean anti-aliased edges for the tracer to bite into
      let r = 0
      let g = 0
      let b = 0
      for (const [sx, sy] of SUB) {
        const px = x + sx
        const py = y + sy
        const shape = shapes.find((s) => s.test(px, py))
        const c = shape ? shape.rgb : bg
        r += c[0]
        g += c[1]
        b += c[2]
      }
      const i = (y * S + x) * 4
      rgba[i] = r / 4
      rgba[i + 1] = g / 4
      rgba[i + 2] = b / 4
      rgba[i + 3] = 255
    }
  }
  return { width: S, height: S, rgba }
}

/** Smooth four-color field (inverse-distance blend) for the gradient tracer. */
export function gradientDemoSource(): DemoSource {
  const rgba = new Uint8Array(S * S * 4)
  const cols: readonly { x: number; y: number; rgb: readonly number[] }[] = [
    { x: 0.2, y: 0.25, rgb: hexRgb('#312e81') },
    { x: 0.8, y: 0.2, rgb: hexRgb('#e879f9') },
    { x: 0.25, y: 0.85, rgb: hexRgb('#fbbf24') },
    { x: 0.85, y: 0.8, rgb: hexRgb('#2a9d8f') },
  ]
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = x / S
      const py = y / S
      let r = 0
      let g = 0
      let b = 0
      let wSum = 0
      for (const s of cols) {
        const d2 = (px - s.x) * (px - s.x) + (py - s.y) * (py - s.y) + 0.002
        const w = 1 / Math.sqrt(d2)
        r += s.rgb[0] * w
        g += s.rgb[1] * w
        b += s.rgb[2] * w
        wSum += w
      }
      const i = (y * S + x) * 4
      rgba[i] = r / wSum
      rgba[i + 1] = g / wSum
      rgba[i + 2] = b / wSum
      rgba[i + 3] = 255
    }
  }
  return { width: S, height: S, rgba }
}
