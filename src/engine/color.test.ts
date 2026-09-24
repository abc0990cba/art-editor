import { describe, expect, it } from 'vitest'

import {
  cmykToHex,
  cmykToRgb,
  hexToCmyk,
  hexToHsv,
  hexToRgb,
  hsvToHex,
  normalizeHex,
  rgbToCmyk,
  rgbToHsv,
} from './color'

describe('color conversions', () => {
  it('round trips representative colors through hsv and back', () => {
    for (const hex of [
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#000000',
      '#ffffff',
      '#e63946',
      '#7e2553',
      '#808080',
    ]) {
      const hsv = hexToHsv(hex)!
      expect(hsvToHex(hsv.h, hsv.s, hsv.v)).toBe(hex)
      const rgb = hexToRgb(hex)!
      const back = rgbToHsv(rgb.r, rgb.g, rgb.b)
      expect(hsvToHex(back.h, back.s, back.v)).toBe(hex)
    }
  })

  it('maps primary hues correctly', () => {
    expect(hsvToHex(0, 1, 1)).toBe('#ff0000')
    expect(hsvToHex(120, 1, 1)).toBe('#00ff00')
    expect(hsvToHex(240, 1, 1)).toBe('#0000ff')
    expect(hsvToHex(90, 0, 0)).toBe('#000000') // s=0 → black regardless of hue
    expect(hsvToHex(200, 0, 1)).toBe('#ffffff') // s=0 → white
  })

  it('parses 3-digit and 6-digit hex and rejects garbage', () => {
    expect(hexToRgb('#7e2553')).toEqual({ r: 126, g: 37, b: 83 })
    expect(hexToRgb('7e2')).toEqual({ r: 119, g: 238, b: 34 })
    expect(hexToRgb('#7E2')?.g).toBe(238) // case-insensitive
    expect(hexToRgb('#zzzzzz')).toBeNull()
    expect(hexToRgb('nope')).toBeNull()
  })

  it('normalizeHex expands and lowercases', () => {
    expect(normalizeHex('#E63946')).toBe('#e63946')
    expect(normalizeHex('f00')).toBe('#ff0000')
    expect(normalizeHex('oops')).toBeNull()
  })

  it('maps primary colors to cmyk correctly', () => {
    expect(rgbToCmyk(255, 0, 0)).toEqual({ c: 0, m: 1, y: 1, k: 0 })
    expect(rgbToCmyk(0, 255, 0)).toEqual({ c: 1, m: 0, y: 1, k: 0 })
    expect(rgbToCmyk(0, 0, 255)).toEqual({ c: 1, m: 1, y: 0, k: 0 })
    expect(rgbToCmyk(0, 0, 0)).toEqual({ c: 0, m: 0, y: 0, k: 1 })
    expect(rgbToCmyk(255, 255, 255)).toEqual({ c: 0, m: 0, y: 0, k: 0 })
  })

  it('round trips representative colors through cmyk', () => {
    for (const hex of [
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#000000',
      '#ffffff',
      '#e63946',
      '#7e2553',
      '#808080',
    ]) {
      expect(cmykToHex(hexToCmyk(hex)!)).toBe(hex)
    }
  })

  it('cmykToRgb clamps out-of-range channels', () => {
    const rgb = cmykToRgb({ c: -1, m: 2, y: 0.5, k: 1.5 })
    expect(rgb).toEqual({ r: 0, g: 0, b: 0 }) // k clamps to 1 → black
  })

  it('rgbToHsv reports saturation 0 for grays', () => {
    const { s, v } = rgbToHsv(128, 128, 128)
    expect(s).toBe(0)
    expect(v).toBeCloseTo(128 / 255, 5)
  })
})
