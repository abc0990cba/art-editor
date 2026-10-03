import { describe, expect, it } from 'vitest'

import { scrollbarMetrics } from './scrollbars.ts'

describe('scrollbarMetrics', () => {
  it('hides the axis when the whole canvas fits the viewport', () => {
    const m = scrollbarMetrics(100, 0, 100, 400)
    expect(m.visible).toBe(false)
    const zoomedOut = scrollbarMetrics(100, -5, 110, 400)
    expect(zoomedOut.visible).toBe(false)
  })

  it('shows the axis and sizes the thumb proportionally', () => {
    // viewport shows half the canvas on a 400px track
    const m = scrollbarMetrics(100, 0, 50, 400)
    expect(m.visible).toBe(true)
    expect(m.scale).toBe(4)
    expect(m.thumbLen).toBe(200)
    expect(m.thumbPos).toBe(0)
  })

  it('clamps the thumb to the minimum size and the track ends', () => {
    // tiny viewport → min thumb 28px, not 0.4px
    const zoomedIn = scrollbarMetrics(1000, 500, 1, 400)
    expect(zoomedIn.thumbLen).toBe(28)
    expect(zoomedIn.thumbPos).toBe(200) // 500 * 0.4
    // panned past the left edge → thumb pins at the track start
    const overscrolledLeft = scrollbarMetrics(100, -30, 50, 400)
    expect(overscrolledLeft.thumbPos).toBe(0)
    // panned past the right edge → thumb pins at the track end
    const overscrolledRight = scrollbarMetrics(100, 80, 50, 400)
    expect(overscrolledRight.thumbPos).toBe(200)
  })

  it('maps track px to doc units consistently in both directions', () => {
    const m = scrollbarMetrics(200, 50, 100, 500)
    // the thumb covers exactly the visible doc window on the track
    const startDoc = m.thumbPos / m.scale
    const endDoc = (m.thumbPos + m.thumbLen) / m.scale
    expect(startDoc).toBeCloseTo(50)
    expect(endDoc).toBeCloseTo(150)
    // a 25px drag moves the viewport by 25px of screen space (10 doc units at 2.5x zoom)
    expect(25 / m.scale).toBeCloseTo(10)
  })
})
