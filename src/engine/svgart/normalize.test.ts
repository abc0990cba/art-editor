import { describe, expect, it } from 'vitest'

import { mustHex } from './index.ts'
import { normalizePaint, normalizeScene, normalizeShape, paintPreviewHex } from './index.ts'
import { starScene } from './index.ts'

describe('normalizeScene', () => {
  it('round-trips a generated scene losslessly', () => {
    const scene = starScene()
    const back = normalizeScene(JSON.parse(JSON.stringify(scene)))
    expect(back).toEqual(scene)
  })

  it('returns a blank scene for garbage input', () => {
    for (const garbage of [null, 42, 'x', {}, { layers: 'no' }, { width: -5 }]) {
      const scene = normalizeScene(garbage)
      expect(scene.width).toBeGreaterThan(0)
      expect(scene.height).toBeGreaterThan(0)
      expect(Number.isFinite(scene.width)).toBe(true)
    }
  })

  it('drops broken layers but keeps valid siblings', () => {
    const scene = normalizeScene({
      width: 100,
      height: 100,
      background: null,
      layers: [
        {
          id: 'ok',
          name: 'Ok',
          visible: true,
          opacity: 0.5,
          shape: { kind: 'rect', cx: { x: 1, y: 2 }, w: 3, h: 4, radius: 0, rotation: 0 },
          fills: [{ kind: 'solid', color: { r: 1, g: 0, b: 0 }, alpha: 1 }],
        },
        { id: 'bad', shape: { kind: 'wat' } },
        null,
      ],
    })
    expect(scene.layers).toHaveLength(1)
    expect(scene.layers[0]?.opacity).toBe(0.5)
  })

  it('repairs partial shapes and paints with defaults', () => {
    const shape = normalizeShape({ kind: 'rect' })
    expect(shape).toMatchObject({ kind: 'rect', w: 10, h: 10 })
    const paint = normalizePaint({ kind: 'radial', units: 'nonsense', cx: 'x', stops: 'no' })
    expect(paint).toMatchObject({ kind: 'radial', units: 'bbox', cx: 0.5 })
    expect(paint?.kind === 'radial' && paint.stops.length > 0).toBe(true)
  })

  it('parses hex colors and clamps channels', () => {
    const paint = normalizePaint({ kind: 'solid', color: '#00ff00', alpha: 5 })
    expect(paint).toEqual({ kind: 'solid', color: { r: 0, g: 1, b: 0 }, alpha: 1 })
    expect(normalizePaint({ kind: 'solid', color: '#zzz', alpha: 1 })).toBeNull()
  })

  it('normalizes radial focus pairs only when both parts exist', () => {
    const withFocus = normalizePaint({
      kind: 'radial',
      units: 'user',
      cx: 1,
      cy: 2,
      r: 3,
      fx: 0.5,
      fy: 0.25,
      stops: [],
    })
    expect(withFocus).toMatchObject({ fx: 0.5, fy: 0.25 })
    const halfFocus = normalizePaint({
      kind: 'radial',
      units: 'user',
      cx: 1,
      cy: 2,
      r: 3,
      fx: 0.5,
      stops: [],
    })
    expect(halfFocus).toMatchObject({ fx: null, fy: null })
  })
})

describe('paintPreviewHex', () => {
  it('uses the first stop color', () => {
    expect(
      paintPreviewHex({
        kind: 'linear',
        p1: { x: 0, y: 0 },
        p2: { x: 1, y: 0 },
        stops: [
          { offset: 0, color: mustHex('#123456'), alpha: 1 },
          { offset: 1, color: mustHex('#654321'), alpha: 1 },
        ],
        alpha: 1,
      }),
    ).toBe('#123456')
    expect(paintPreviewHex({ kind: 'solid', color: mustHex('#abcdef'), alpha: 0.5 })).toBe(
      '#abcdef',
    )
  })
})
