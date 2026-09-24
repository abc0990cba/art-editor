import { describe, expect, it } from 'vitest'

import { en } from '../i18n/en'
import { useStore } from '../state/store'
import { cellColor, defaultDoc } from './doc'
import { buildGeometry } from './geometry'
import { PALETTES, matchedPresetId } from './palettes'
import { deserialize, serialize } from './project'

describe('palette presets', () => {
  it('all presets have unique valid hex colors and sane sizes', () => {
    for (const p of PALETTES) {
      expect(p.colors.length).toBeGreaterThanOrEqual(2)
      expect(p.colors.length).toBeLessThanOrEqual(64)
      expect(new Set(p.colors).size).toBe(p.colors.length)
      for (const c of p.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('have unique ids and display names in both dicts', () => {
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length)
    for (const p of PALETTES) {
      expect(en[`palette.${p.id}` as keyof typeof en]).toBeTruthy()
      expect(en[`palette.${p.id}.desc` as keyof typeof en]).toBeTruthy()
    }
  })

  it('matchedPresetId recognizes the default document palette as classic12', () => {
    expect(matchedPresetId(defaultDoc().palette)).toBe('classic12')
  })

  it('applying a preset recolors artwork by index with modulo wrapping', () => {
    const doc = defaultDoc()
    doc.cols = 4
    doc.rows = 1
    doc.cells = new Uint16Array([1, 2, 3, 4]) // values over the 12-color palette
    // Game Boy has 4 colors: value 4 → index 3, value 3 → index 2 (no wrap needed)
    const gb = PALETTES.find((p) => p.id === 'gameboy')!
    doc.palette = [...gb.colors]
    // value 2 (index 1) is now the Game Boy mid tone
    expect(cellColor(doc, 2)).toBe('#306230')
    // value 13 wraps modulo 4 back to index 0
    expect(cellColor(doc, 13)).toBe('#0f380f')
  })

  it('applied palette survives a project round trip', () => {
    const doc = defaultDoc()
    doc.palette = [...PALETTES.find((p) => p.id === 'pico8')!.colors]
    const restored = deserialize(JSON.parse(JSON.stringify(serialize(doc))))
    expect(restored.palette).toEqual(doc.palette)
  })

  it('geometry stays valid after recolor (fill uses new palette)', () => {
    const doc = defaultDoc()
    doc.cells[0] = 1
    doc.palette = [...PALETTES.find((p) => p.id === 'pico8')!.colors]
    const g = buildGeometry(doc)
    expect(g.paths[0].fill).toBe('#000000') // PICO-8 black
  })

  it('store applyPalette replaces the palette (undoable slice)', () => {
    const store = useStore
    const before = store.getState().doc.palette
    const gb = PALETTES.find((p) => p.id === 'gameboy')!
    store.getState().applyPalette(gb)
    expect(store.getState().doc.palette).toEqual(gb.colors)
    expect(store.getState().doc.palette).not.toEqual(before)
  })
})
