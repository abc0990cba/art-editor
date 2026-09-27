import { describe, expect, it } from 'vitest'

import { fitToSvg, gradientDef } from './compose.ts'
import type { GradFit, GradStop } from './types.ts'

const STOPS: GradStop[] = [
  { offset: 0, color: { r: 1, g: 0.5, b: 0 } },
  { offset: 1, color: { r: 0.2, g: 0, b: 0.6 } },
]

const linear: GradFit = {
  kind: 'linear',
  p1: { x: 10, y: 20 },
  p2: { x: 110, y: 20 },
  stops: STOPS,
  error: { mean: 0.5, p95: 1 },
}

const radial: GradFit = {
  kind: 'radial',
  center: { x: 50, y: 60 },
  radius: 70,
  stops: STOPS,
  error: { mean: 0.5, p95: 1 },
}

describe('gradientDef', () => {
  it('serializes a linear gradient with userSpaceOnUse geometry', () => {
    const def = gradientDef(linear, 'g1')
    expect(def).toContain('<linearGradient id="g1"')
    expect(def).toContain('gradientUnits="userSpaceOnUse"')
    expect(def).toContain('x1="10" y1="20"')
    expect(def).toContain('x2="110" y2="20"')
    expect(def).toContain('<stop offset="0" stop-color="#ff8000"/>')
    expect(def).toContain('<stop offset="1" stop-color="#330099"/>')
  })

  it('serializes a radial gradient with center and radius', () => {
    const def = gradientDef(radial, 'g2')
    expect(def).toContain('<radialGradient id="g2"')
    expect(def).toContain('cx="50" cy="60" r="70"')
    expect(def).toContain('gradientUnits="userSpaceOnUse"')
  })

  it('has no def for solid fits', () => {
    expect(
      gradientDef({ kind: 'solid', color: { r: 0, g: 0, b: 0 }, error: { mean: 0, p95: 0 } }, 'g'),
    ).toBe('')
  })
})

describe('fitToSvg', () => {
  it('wraps a gradient fit into a standalone document', () => {
    const svg = fitToSvg(radial, 120, 90)
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('<defs>')
    expect(svg).toContain('<rect width="120" height="90" fill="url(#g)"/>')
  })

  it('paints solid fits with a plain hex fill and no defs', () => {
    const svg = fitToSvg(
      { kind: 'solid', color: { r: 1, g: 1, b: 1 }, error: { mean: 0, p95: 0 } },
      10,
      10,
    )
    expect(svg).not.toContain('<defs>')
    expect(svg).toContain('fill="#ffffff"')
  })
})
