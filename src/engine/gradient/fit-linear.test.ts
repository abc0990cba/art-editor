import { describe, expect, it } from 'vitest'

import { fitLinear } from './fit-linear.ts'
import {
  fieldToPixels,
  linearField,
  mulberry32,
  quantize8,
  solidField,
  withNoise,
} from './synth.util.ts'
import { DEFAULT_FIT_OPTIONS, type GradFit, type GradStop, type Vec2 } from './types.ts'

const RED: GradStop = { offset: 0, color: { r: 0.85, g: 0.1, b: 0.1 } }
const YELLOW: GradStop = { offset: 0.5, color: { r: 0.95, g: 0.85, b: 0.2 } }
const TEAL: GradStop = { offset: 1, color: { r: 0.1, g: 0.65, b: 0.75 } }

/** Axis through the image center at `angleDeg`, long enough to cover the corners. */
function axis(size: number, angleDeg: number): { p1: Vec2; p2: Vec2 } {
  const c = size / 2
  const len = size * 0.85
  const dx = (Math.cos((angleDeg * Math.PI) / 180) * len) / 2
  const dy = (Math.sin((angleDeg * Math.PI) / 180) * len) / 2
  return { p1: { x: c - dx, y: c - dy }, p2: { x: c + dx, y: c + dy } }
}

function directionDeg(fit: GradFit, angleDeg: number): number {
  if (fit.kind !== 'linear') return 180
  const dx = fit.p2.x - fit.p1.x
  const dy = fit.p2.y - fit.p1.y
  const dot = Math.abs(
    (dx * Math.cos((angleDeg * Math.PI) / 180) + dy * Math.sin((angleDeg * Math.PI) / 180)) /
      Math.hypot(dx, dy),
  )
  return (Math.acos(Math.min(1, dot)) * 180) / Math.PI
}

describe('fitLinear', () => {
  it('recovers direction and stops of a banded noisy 3-stop ramp at 30°', () => {
    const size = 128
    const { p1, p2 } = axis(size, 30)
    const field = quantize8(
      withNoise(linearField(size, size, p1, p2, [RED, YELLOW, TEAL]), 2 / 255, mulberry32(7)),
    )
    const fit = fitLinear(fieldToPixels(field), DEFAULT_FIT_OPTIONS)
    expect(fit).not.toBeNull()
    if (!fit || fit.kind !== 'linear') return
    // banding steps are ~2 ΔE tall, so the tolerance-2 RDP legitimately keeps a few extra stops
    expect(directionDeg(fit, 30)).toBeLessThan(1.5)
    expect(fit.stops.length).toBeGreaterThanOrEqual(2)
    expect(fit.stops.length).toBeLessThanOrEqual(6)
    expect(fit.error.mean).toBeLessThanOrEqual(2)
    expect(fit.error.p95).toBeLessThanOrEqual(4)
  })

  it('recovers an exact continuous axis-aligned ramp direction precisely', () => {
    const size = 128
    const { p1, p2 } = axis(size, 0)
    const field = linearField(size, size, p1, p2, [RED, TEAL])
    const fit = fitLinear(fieldToPixels(field), DEFAULT_FIT_OPTIONS)
    expect(fit).not.toBeNull()
    if (!fit) return
    expect(directionDeg(fit, 0)).toBeLessThan(0.05)
    expect(fit.error.mean).toBeLessThanOrEqual(0.5)
  })

  it('keeps the 30° ramp within 1.5° (clamped corners bias the square-domain regression)', () => {
    const size = 128
    const { p1, p2 } = axis(size, 30)
    const field = linearField(size, size, p1, p2, [RED, TEAL])
    const fit = fitLinear(fieldToPixels(field), DEFAULT_FIT_OPTIONS)
    expect(fit).not.toBeNull()
    if (!fit) return
    expect(directionDeg(fit, 30)).toBeLessThan(1.5)
    expect(fit.error.mean).toBeLessThanOrEqual(2)
  })

  it('keeps the quantized two-stop ramp within 1.5°', () => {
    const size = 128
    const { p1, p2 } = axis(size, 30)
    const field = quantize8(linearField(size, size, p1, p2, [RED, TEAL]))
    const fit = fitLinear(fieldToPixels(field), DEFAULT_FIT_OPTIONS)
    expect(fit).not.toBeNull()
    if (!fit) return
    // 8-bit banding rows bias the structure tensor slightly — acceptable for real captures
    expect(directionDeg(fit, 30)).toBeLessThan(1.5)
    expect(fit.error.mean).toBeLessThanOrEqual(1)
  })

  it('recovers a vertical ramp at 90°', () => {
    const size = 128
    const { p1, p2 } = axis(size, 90)
    const field = quantize8(linearField(size, size, p1, p2, [RED, YELLOW, TEAL]))
    const fit = fitLinear(fieldToPixels(field), DEFAULT_FIT_OPTIONS)
    expect(fit).not.toBeNull()
    if (!fit) return
    expect(directionDeg(fit, 90)).toBeLessThan(0.5)
    expect(fit.error.mean).toBeLessThanOrEqual(1)
  })

  it('returns null for a constant field', () => {
    const field = solidField(32, 32, { r: 0.3, g: 0.6, b: 0.9 })
    expect(fitLinear(fieldToPixels(field), DEFAULT_FIT_OPTIONS)).toBeNull()
  })
})
