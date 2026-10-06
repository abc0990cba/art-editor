import { describe, expect, it } from 'vitest'

import { shadeHex, tintHex } from './shade.ts'

describe('shade/tint hex mixing', () => {
  it('mixes toward black by depth', () => {
    expect(shadeHex('#ffffff', 1)).toBe('#000000')
    expect(shadeHex('#ffffff', 0)).toBe('#ffffff')
    expect(shadeHex('#ff0000', 0.5)).toBe('#800000')
  })

  it('mixes toward white by depth', () => {
    expect(tintHex('#000000', 1)).toBe('#ffffff')
    expect(tintHex('#000000', 0)).toBe('#000000')
    expect(tintHex('#0000ff', 0.5)).toBe('#8080ff')
  })

  it('clamps out-of-range depths', () => {
    expect(shadeHex('#808080', 2)).toBe('#000000')
    expect(tintHex('#808080', 2)).toBe('#ffffff')
    expect(shadeHex('#808080', -1)).toBe('#808080')
  })

  it('passes unparsable colors through', () => {
    expect(shadeHex('nope', 0.5)).toBe('nope')
    expect(tintHex('', 0.5)).toBe('')
  })
})
