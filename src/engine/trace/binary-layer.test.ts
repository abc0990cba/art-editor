import { describe, expect, it } from 'vitest'

import { traceMask } from './binary-layer.ts'

function mask(w: number, h: number, on: (x: number, y: number) => boolean): Uint8Array {
  const m = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) m[y * w + x] = on(x, y) ? 1 : 0
  }
  return m
}

describe('traceMask', () => {
  it('traces a solid square into one positive outer loop', () => {
    const contours = traceMask(
      mask(16, 16, (x, y) => x >= 2 && x < 12 && y >= 2 && y < 12),
      16,
      16,
      0,
    )
    expect(contours).toHaveLength(1)
    expect(contours[0].hole).toBe(false)
    // lattice square: vertices at (2,2)..(12,12), signed area 100
    let area2 = 0
    const p = contours[0].pts
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length
      area2 += p[i] * p[j + 1] - p[j] * p[i + 1]
    }
    expect(area2).toBe(200)
  })

  it('traces a ring into an outer loop plus a negative hole loop', () => {
    const contours = traceMask(
      mask(20, 20, (x, y) => {
        const dx = x - 10
        const dy = y - 10
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        return d >= 3 && d < 6
      }),
      20,
      20,
      0,
    )
    expect(contours).toHaveLength(2)
    expect(contours.filter((c) => c.hole)).toHaveLength(1)
  })

  it('keeps diagonally touching pixels as separate 4-connected loops', () => {
    const contours = traceMask(
      mask(4, 4, (x, y) => (x === y && x < 2) || false),
      4,
      4,
      0,
    )
    expect(contours).toHaveLength(2)
  })

  it('drops components smaller than minArea (speckle filter)', () => {
    const contours = traceMask(
      mask(16, 16, (x, y) => (x === 0 && y === 0) || (x >= 4 && x < 12 && y >= 4 && y < 12)),
      16,
      16,
      4,
    )
    expect(contours).toHaveLength(1)
  })

  it('produces closed loops that return to their first vertex', () => {
    const contours = traceMask(
      mask(8, 8, (x, y) => x >= 1 && x < 7 && y >= 1 && y < 7),
      8,
      8,
      0,
    )
    const p = contours[0].pts
    const firstX = p[0]
    const firstY = p[1]
    let dx = 0
    let dy = 0
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length
      dx += p[j] - p[i]
      dy += p[j + 1] - p[i + 1]
    }
    expect(dx).toBe(0)
    expect(dy).toBe(0)
    expect(firstX).toBe(1)
    expect(firstY).toBe(1)
  })
})
