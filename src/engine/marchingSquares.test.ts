import { describe, expect, it } from 'vitest'
import { marchingSquares } from './marchingSquares'

function discField(fw: number, fh: number, cx: number, cy: number, r: number): Float32Array {
  const f = new Float32Array(fw * fh)
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const d = Math.hypot(x - cx, y - cy)
      f[y * fw + x] = Math.max(0, r - d)
    }
  }
  return f
}

describe('marchingSquares', () => {
  it('returns one closed loop for a single blob', () => {
    const loops = marchingSquares(discField(40, 40, 20, 20, 10), 40, 40, 0.5)
    expect(loops).toHaveLength(1)
    expect(loops[0].length).toBeGreaterThan(10)
  })

  it('returns two loops for a ring (outer + hole)', () => {
    const fw = 40
    const fh = 40
    const f = new Float32Array(fw * fh)
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const d = Math.hypot(x - 20, y - 20)
        f[y * fw + x] = d > 6 && d < 12 ? 1 : 0
      }
    }
    const loops = marchingSquares(f, fw, fh, 0.5)
    expect(loops).toHaveLength(2)
  })

  it('returns two loops for two separated blobs', () => {
    const fw = 60
    const fh = 40
    const f = new Float32Array(fw * fh)
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        if (Math.hypot(x - 15, y - 20) < 8) f[y * fw + x] = 1
        if (Math.hypot(x - 45, y - 20) < 8) f[y * fw + x] = 1
      }
    }
    const loops = marchingSquares(f, fw, fh, 0.5)
    expect(loops).toHaveLength(2)
  })

  it('produces a single loop for two merging blobs', () => {
    const fw = 60
    const fh = 40
    const f = new Float32Array(fw * fh)
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const d = Math.min(Math.hypot(x - 25, y - 20), Math.hypot(x - 35, y - 20))
        f[y * fw + x] = Math.max(0, 8 - d)
      }
    }
    const loops = marchingSquares(f, fw, fh, 0.5)
    expect(loops).toHaveLength(1)
  })

  it('loop points stay within the field bounds', () => {
    const loops = marchingSquares(discField(30, 30, 15, 15, 12), 30, 30, 0.5)
    for (const p of loops[0]) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(29)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(29)
    }
  })
})
