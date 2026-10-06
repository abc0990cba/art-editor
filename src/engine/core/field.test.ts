import { describe, expect, it } from 'vitest'

import { normalizePresetConfig } from '../presets/index.ts'
import { defaultDoc, elementFromDoc, sameElementStyle, type Doc } from './doc.ts'
import { DEFAULT_FIELD, hasField, normalizeField, sameField } from './field.ts'
import { serialize } from './project-json.ts'
import { deserializeInternal } from './project-parse.ts'

describe('normalizeField', () => {
  it('falls back to defaults for missing data', () => {
    expect(normalizeField(undefined)).toEqual(DEFAULT_FIELD)
    expect(normalizeField({})).toEqual(DEFAULT_FIELD)
  })

  it('keeps known kinds and rejects unknown ones', () => {
    expect(normalizeField({ size: 'rings' }).size).toBe('rings')
    expect(normalizeField({ size: 'bogus' as 'rings' }).size).toBe(DEFAULT_FIELD.size)
    expect(normalizeField({ align: 'truchet' }).align).toBe('truchet')
    expect(normalizeField({ offset: 'nope' as 'drift' }).offset).toBe(DEFAULT_FIELD.offset)
  })

  it('clamps every numeric field', () => {
    const n = normalizeField({
      amount: 5,
      min: 0.001,
      angle: 720,
      period: 1,
      phase: -90,
      seed: 0,
      invert: true,
    })
    expect(n.amount).toBe(1)
    expect(n.min).toBe(0.05)
    expect(n.angle).toBe(0)
    expect(n.period).toBe(2)
    expect(n.phase).toBe(270)
    expect(n.seed).toBe(DEFAULT_FIELD.seed)
    expect(n.invert).toBe(true)
  })

  it('hasField reports any active kind', () => {
    expect(hasField(DEFAULT_FIELD)).toBe(false)
    expect(hasField({ ...DEFAULT_FIELD, offset: 'scatter' })).toBe(true)
  })

  it('sameField compares every field', () => {
    expect(sameField(DEFAULT_FIELD, { ...DEFAULT_FIELD })).toBe(true)
    expect(sameField(DEFAULT_FIELD, { ...DEFAULT_FIELD, size: 'funnel' })).toBe(false)
    expect(sameField(DEFAULT_FIELD, { ...DEFAULT_FIELD, phase: 90 })).toBe(false)
  })
})

describe('field plumbing', () => {
  const withField = (doc: Doc): Doc => ({
    ...doc,
    style: {
      ...doc.style,
      field: {
        size: 'funnel',
        align: 'swirl',
        offset: 'scatter',
        amount: 0.8,
        min: 0.15,
        angle: 30,
        period: 12,
        phase: 45,
        seed: 42,
        invert: true,
      },
    },
  })

  it('elementFromDoc deep-copies the field block', () => {
    const doc = withField(defaultDoc())
    const el = elementFromDoc(doc)
    el.style.field.amount = 0
    expect(doc.style.field.amount).toBe(0.8)
  })

  it('elements differing only in the field are not the same style', () => {
    const doc = defaultDoc()
    const a = elementFromDoc(doc)
    const b = elementFromDoc(doc)
    b.style.field = { ...b.style.field, size: 'funnel' }
    expect(sameElementStyle(a, b)).toBe(false)
    b.style.field = { ...b.style.field, size: 'none' }
    expect(sameElementStyle(a, b)).toBe(true)
  })

  it('round-trips through project serialize/deserialize', () => {
    const doc = withField(defaultDoc())
    const parsed = deserializeInternal(JSON.parse(JSON.stringify(serialize(doc))))
    expect(parsed.style.field).toEqual(doc.style.field)
  })

  it('loads legacy projects without field data as off', () => {
    const data = JSON.parse(JSON.stringify(serialize(defaultDoc())))
    delete (data.style as Record<string, unknown>)['field']
    const parsed = deserializeInternal(data)
    expect(parsed.style.field).toEqual(DEFAULT_FIELD)
  })

  it('clamps through preset normalization', () => {
    const doc = withField(defaultDoc())
    const config = normalizePresetConfig(JSON.parse(JSON.stringify(serialize(doc))))
    expect(config.style.field).toEqual(doc.style.field)
    const junk = normalizePresetConfig({
      ...JSON.parse(JSON.stringify(serialize(defaultDoc()))),
      style: { field: { size: 'bogus', amount: 9, period: 1 } },
    })
    expect(junk.style.field.size).toBe('none')
    expect(junk.style.field.amount).toBe(1)
    expect(junk.style.field.period).toBe(2)
  })
})
