import { beforeEach, describe, expect, it } from 'vitest'

import { normalizeTraceParams } from '../engine/trace/params.ts'
import {
  clearVectorPresetsForTests,
  listVectorPresets,
  newVectorPresetId,
  saveVectorPreset,
  sortVectorPresets,
  type VectorPresetEntry,
} from './vector-presets.ts'

beforeEach(() => {
  clearVectorPresetsForTests()
})

describe('vector presets store', () => {
  it('validates params on read and sorts by recency', async () => {
    const a: VectorPresetEntry = {
      id: newVectorPresetId(),
      name: 'a',
      createdAt: 1,
      updatedAt: 1,
      params: normalizeTraceParams({ filterSpeckle: 999 }),
    }
    const b: VectorPresetEntry = { ...a, id: newVectorPresetId(), name: 'b', updatedAt: 2 }
    await saveVectorPreset(a)
    await saveVectorPreset(b)
    const list = await listVectorPresets()
    expect(list.map((p) => p.name)).toEqual(['b', 'a'])
    // out-of-range values are clamped back into range by the engine normalizer
    expect(list[0].params.filterSpeckle).toBe(128)
    expect(sortVectorPresets([...list]).length).toBe(2)
  })
})
