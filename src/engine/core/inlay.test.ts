import { describe, expect, it } from 'vitest'

import { normalizePresetConfig } from '../presets/index.ts'
import { defaultDoc, elementFromDoc, sameElementStyle, type Doc } from './doc.ts'
import { DEFAULT_INLAY, normalizeInlay, sameInlay } from './inlay.ts'
import { serialize } from './project-json.ts'
import { deserializeInternal } from './project-parse.ts'

describe('normalizeInlay', () => {
  it('falls back to defaults for missing data', () => {
    expect(normalizeInlay(undefined)).toEqual(DEFAULT_INLAY)
    expect(normalizeInlay(null)).toEqual(DEFAULT_INLAY)
    expect(normalizeInlay({})).toEqual(DEFAULT_INLAY)
  })

  it('keeps registered shapes and rejects unknown ones', () => {
    expect(normalizeInlay({ shape: 'star' }).shape).toBe('star')
    expect(normalizeInlay({ shape: 'none' }).shape).toBe('none')
    expect(normalizeInlay({ shape: 'bogus' }).shape).toBe(DEFAULT_INLAY.shape)
  })

  it('clamps every field', () => {
    const n = normalizeInlay({
      shape: 'ring',
      scale: 5,
      offsetX: 9,
      offsetY: -9,
      rotation: 725,
      thickness: 3,
      points: 1,
      colorMode: 'bogus' as 'darken',
      slot: -4,
      depth: 12,
    })
    expect(n.scale).toBe(0.9)
    expect(n.offsetX).toBe(0.5)
    expect(n.offsetY).toBe(-0.5)
    expect(n.rotation).toBe(5)
    expect(n.thickness).toBe(0.5)
    expect(n.points).toBe(3)
    expect(n.colorMode).toBe(DEFAULT_INLAY.colorMode)
    expect(n.slot).toBe(1)
    expect(n.depth).toBe(1)
  })
})

describe('sameInlay', () => {
  it('is true for equal blocks and false on any differing field', () => {
    expect(sameInlay(DEFAULT_INLAY, { ...DEFAULT_INLAY })).toBe(true)
    expect(sameInlay(DEFAULT_INLAY, { ...DEFAULT_INLAY, scale: 0.5 })).toBe(false)
    expect(sameInlay(DEFAULT_INLAY, { ...DEFAULT_INLAY, colorMode: 'slot' })).toBe(false)
  })
})

describe('inlay style plumbing', () => {
  it('elementFromDoc deep-copies the inlay block', () => {
    const doc = defaultDoc()
    const el = elementFromDoc(doc)
    el.style.inlay.scale = 0.9
    expect(doc.style.inlay.scale).toBe(DEFAULT_INLAY.scale)
  })

  it('elements differing only in inlay are not the same style', () => {
    const doc = defaultDoc()
    const a = elementFromDoc(doc)
    const b = elementFromDoc(doc)
    b.style.inlay = { ...b.style.inlay, shape: 'ring' }
    expect(sameElementStyle(a, b)).toBe(false)
    b.style.inlay = { ...b.style.inlay, shape: 'none' }
    expect(sameElementStyle(a, b)).toBe(true)
  })
})

describe('inlay persistence', () => {
  const withInlay = (doc: Doc): Doc => ({
    ...doc,
    style: {
      ...doc.style,
      inlay: {
        ...doc.style.inlay,
        shape: 'ring',
        scale: 0.6,
        offsetX: 0.1,
        offsetY: -0.2,
        rotation: 90,
        thickness: 0.3,
        points: 7,
        colorMode: 'slot',
        slot: 2,
        depth: 0.4,
      },
    },
  })

  it('round-trips through project serialize/deserialize', () => {
    const doc = withInlay(defaultDoc())
    const parsed = deserializeInternal(JSON.parse(JSON.stringify(serialize(doc))))
    expect(parsed.style.inlay).toEqual(doc.style.inlay)
  })

  it('loads legacy projects without inlay data as none', () => {
    const data = JSON.parse(JSON.stringify(serialize(defaultDoc())))
    delete (data.style as Record<string, unknown>)['inlay']
    const parsed = deserializeInternal(data)
    expect(parsed.style.inlay).toEqual(DEFAULT_INLAY)
    expect(parsed.style.inlay.shape).toBe('none')
  })

  it('clamps through preset normalization', () => {
    const doc = withInlay(defaultDoc())
    const config = normalizePresetConfig(JSON.parse(JSON.stringify(serialize(doc))))
    expect(config.style.inlay).toEqual(doc.style.inlay)
    const junk = normalizePresetConfig({
      ...JSON.parse(JSON.stringify(serialize(defaultDoc()))),
      style: { inlay: { shape: 'bogus', scale: 99, colorMode: 'nope' } },
    })
    expect(junk.style.inlay.shape).toBe('none')
    expect(junk.style.inlay.scale).toBe(0.9)
    expect(junk.style.inlay.colorMode).toBe(DEFAULT_INLAY.colorMode)
  })
})
