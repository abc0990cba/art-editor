import { describe, expect, it } from 'vitest'

import {
  anchoredZoom,
  isHorizontalWheel,
  viewOffscreen,
  wheelDeltaPx,
  wheelZoomFactor,
} from './canvas-view-math.util.ts'

describe('wheelDeltaPx', () => {
  it('passes pixel-mode deltas through', () => {
    expect(wheelDeltaPx(-120, 0)).toBe(-120)
  })
  it('converts line-mode deltas (a notch = 16 px)', () => {
    expect(wheelDeltaPx(-3, 1)).toBe(-48)
  })
  it('converts page-mode deltas', () => {
    expect(wheelDeltaPx(1, 2)).toBe(100)
  })
})

describe('wheelZoomFactor', () => {
  it('zooms out on positive (scroll-down) deltas and in on negative', () => {
    expect(wheelZoomFactor(-100, false)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100, false)).toBeLessThan(1)
  })
  it('is stronger per delta under pinch (trackpad sends tiny ctrl+wheel deltas)', () => {
    const d = 5
    const pinch = Math.abs(Math.log(wheelZoomFactor(d, true)))
    const plain = Math.abs(Math.log(wheelZoomFactor(d, false)))
    expect(pinch).toBeGreaterThan(plain)
  })
})

describe('anchoredZoom', () => {
  const view = { zoom: 2, x: 10, y: 20 }
  it('keeps the doc point under the anchor fixed', () => {
    const ax = 100
    const ay = 50
    const next = anchoredZoom(view, 4, ax, ay)
    // doc point at the anchor before === doc point at the anchor after
    expect((ax - view.x) / view.zoom).toBeCloseTo((ax - next.x) / next.zoom)
    expect((ay - view.y) / view.zoom).toBeCloseTo((ay - next.y) / next.zoom)
  })
  it('clamps to the zoom bounds', () => {
    expect(anchoredZoom(view, 1000, 0, 0).zoom).toBe(80)
    expect(anchoredZoom(view, 0.01, 0, 0).zoom).toBe(0.5)
  })
  it('is a no-op when already at the clamped zoom', () => {
    expect(anchoredZoom(view, 1000, 5, 5)).toEqual(anchoredZoom(view, 80, 5, 5))
  })
})

describe('isHorizontalWheel', () => {
  it('shift alone makes it horizontal (mouse wheels keep the value in deltaY)', () => {
    expect(isHorizontalWheel(0, -100, true)).toBe(true)
  })
  it('horizontal-dominant deltas pan (sideways trackpad scroll)', () => {
    expect(isHorizontalWheel(80, 2, false)).toBe(true)
  })
  it('vertical wheel stays zoom', () => {
    expect(isHorizontalWheel(0, -100, false)).toBe(false)
  })
})

describe('viewOffscreen', () => {
  it('centered art is on screen', () => {
    expect(viewOffscreen({ zoom: 1, x: 10, y: 10 }, 100, 100, 200, 200)).toBe(false)
  })
  it('art fully to the left/above is off screen', () => {
    expect(viewOffscreen({ zoom: 1, x: -150, y: 10 }, 100, 100, 200, 200)).toBe(true)
    expect(viewOffscreen({ zoom: 1, x: 10, y: -150 }, 100, 100, 200, 200)).toBe(true)
  })
  it('art fully past the right/bottom edge is off screen', () => {
    expect(viewOffscreen({ zoom: 1, x: 201, y: 10 }, 100, 100, 200, 200)).toBe(true)
    expect(viewOffscreen({ zoom: 1, x: 10, y: 201 }, 100, 100, 200, 200)).toBe(true)
  })
  it('a doc edge exactly on the viewport edge still counts as visible', () => {
    // doc spans 100..200: its right edge touches the viewport's right edge
    expect(viewOffscreen({ zoom: 1, x: 100, y: 10 }, 100, 100, 200, 200)).toBe(false)
  })
})
