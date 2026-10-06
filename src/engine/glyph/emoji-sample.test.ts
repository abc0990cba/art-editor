import { describe, expect, it } from 'vitest'

import { clearGlyphCache, firstGrapheme, sampleGlyph } from './emoji-sample.ts'

describe('firstGrapheme', () => {
  it('keeps emoji ZWJ sequences as one glyph', () => {
    expect(firstGrapheme('👩‍🚀 x')).toBe('👩‍🚀')
  })
  it('takes the first letter and trims', () => {
    expect(firstGrapheme('  Ab ')).toBe('A')
    expect(firstGrapheme('')).toBe('')
  })
})

describe('sampleGlyph', () => {
  it('clamps the resolution to 4..12', () => {
    clearGlyphCache()
    const bm = sampleGlyph('●', 99)
    expect(bm.length).toBe(144)
    clearGlyphCache()
    expect(sampleGlyph('●', 1).length).toBe(16)
  })

  it('is deterministic per (char, resolution) and memoized', () => {
    clearGlyphCache()
    const a = sampleGlyph('★', 8)
    const b = sampleGlyph('★', 8)
    expect(b).toBe(a)
    expect(sampleGlyph('★', 9)).not.toBe(a)
  })

  it('node fallback emits a centered disc of on-bits', () => {
    clearGlyphCache()
    const bm = sampleGlyph('●', 8)
    const ink = bm.reduce((s, v) => s + v, 0)
    expect(ink).toBeGreaterThan(8)
    // center is ink, far corner is paper
    expect(bm[4 * 8 + 4]).toBe(1)
    expect(bm[0]).toBe(0)
  })
})
