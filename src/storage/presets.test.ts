import { beforeEach, describe, expect, it } from 'vitest'

import { MAX_SIZE, defaultDoc } from '../engine/doc.ts'
import { BUILTIN_PRESETS, presetFromDoc } from '../engine/presets.ts'
import {
  clearPresetsForTests,
  deletePreset,
  listPresets,
  loadPreset,
  newPresetId,
  savePreset,
  sortPresets,
  type PresetEntry,
} from './presets.ts'

function entry(id: string, name: string, updatedAt: number): PresetEntry {
  return {
    id,
    name,
    createdAt: updatedAt,
    updatedAt,
    config: presetFromDoc(
      { ...defaultDoc(), cols: 16, rows: 16 },
      { mode: 'quad', n: 8, cell: 16, showGuides: true, fill: 100, phase: 0, twist: 0 },
    ),
  }
}

describe('preset storage helpers', () => {
  it('sortPresets orders newest first', () => {
    const sorted = sortPresets([entry('a', 'A', 100), entry('b', 'B', 300), entry('c', 'C', 200)])
    expect(sorted.map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('newPresetId returns unique ids', () => {
    expect(newPresetId()).not.toBe(newPresetId())
  })
})

describe('preset store (in-memory fallback)', () => {
  beforeEach(() => clearPresetsForTests())

  it('save/list/load/delete round trip', async () => {
    await savePreset(entry('s1', 'One', 100))
    await savePreset(entry('s2', 'Two', 200))
    const list = await listPresets()
    expect(list.map((e) => e.id)).toEqual(['s2', 's1'])
    const loaded = await loadPreset('s1')
    expect(loaded?.name).toBe('One')
    expect(loaded?.config.cols).toBe(16)
    expect(loaded?.config.symmetry.mode).toBe('quad')
    await deletePreset('s1')
    expect(await loadPreset('s1')).toBeUndefined()
    expect((await listPresets()).length).toBe(1)
  })

  it('savePreset overwrites an existing id', async () => {
    await savePreset(entry('same', 'Old', 100))
    await savePreset(entry('same', 'New', 200))
    const list = await listPresets()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('New')
  })

  it('normalizes configs on read and write', async () => {
    const broken = {
      ...entry('bad', 'Bad', 50),
      config: {
        ...entry('bad', 'Bad', 50).config,
        cols: 9999,
        renderMode: 'sparkles' as unknown as 'pixels',
        palette: ['nope'],
      },
    }
    await savePreset(broken)
    const loaded = await loadPreset('bad')
    expect(loaded?.config.cols).toBe(MAX_SIZE)
    expect(loaded?.config.renderMode).toBe('pixels')
    expect(loaded?.config.palette.length).toBeGreaterThan(0)
  })

  it('round-trips a built-in configuration', async () => {
    const src = BUILTIN_PRESETS[0]
    await savePreset({ ...entry('copy', src.name, 10), config: src.config })
    const loaded = await loadPreset('copy')
    expect(loaded?.config).toEqual(src.config)
  })
})
