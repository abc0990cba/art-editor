import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_TRACE_PARAMS, normalizeTraceParams } from '../engine/trace/params.ts'
import { clearVectorJob, loadVectorJob, saveVectorJob } from './vector-job.ts'
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

describe('vector job autosave', () => {
  it('degrades gracefully when IndexedDB is unavailable (like the doc autosave)', async () => {
    const ok = await saveVectorJob({
      source: { width: 1, height: 2, data: new ArrayBuffer(8) },
      sourceName: 'test.png',
      params: DEFAULT_TRACE_PARAMS,
      svg: '<svg/>',
      stats: null,
    })
    // Node test env has no IndexedDB: the save is a no-op and loads stay empty
    expect(ok).toBe(false)
    expect(await loadVectorJob()).toBeNull()
    await expect(clearVectorJob()).resolves.toBeUndefined()
  })
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
