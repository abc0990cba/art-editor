import { describe, expect, it } from 'vitest'

import { readBrowserZoom, shouldShowZoomChip, shouldShowZoomHint } from './browser-zoom.util.ts'

describe('readBrowserZoom', () => {
  it('reads 100% when the viewport equals the screen', () => {
    expect(readBrowserZoom(1440, 1440).zoom).toBe(1)
  })
  it('approximates the browser zoom level from the shrunken viewport', () => {
    // a 1280-wide MacBook at 150% browser zoom has a ~853px CSS viewport
    expect(readBrowserZoom(853, 1280).zoom).toBeCloseTo(1.5, 1)
  })
  it('guards against a zero viewport', () => {
    expect(readBrowserZoom(0, 1280).zoom).toBe(1)
  })
})

describe('shouldShowZoomHint', () => {
  const zoomed = readBrowserZoom(853, 1280)
  it('shows on a desktop screen pushed into the compact layout by zoom', () => {
    expect(shouldShowZoomHint(zoomed, false)).toBe(true)
  })
  it('stays hidden once dismissed', () => {
    expect(shouldShowZoomHint(zoomed, true)).toBe(false)
  })
  it('stays hidden on real phones (small screen, not browser zoom)', () => {
    expect(shouldShowZoomHint(readBrowserZoom(390, 390), false)).toBe(false)
  })
  it('stays hidden while the desktop layout still fits', () => {
    expect(shouldShowZoomHint(readBrowserZoom(1100, 1280), false)).toBe(false)
  })
})

describe('shouldShowZoomChip', () => {
  it('appears from 125%', () => {
    expect(shouldShowZoomChip(readBrowserZoom(1024, 1280))).toBe(true)
  })
  it('stays hidden at 100%', () => {
    expect(shouldShowZoomChip(readBrowserZoom(1280, 1280))).toBe(false)
  })
})
