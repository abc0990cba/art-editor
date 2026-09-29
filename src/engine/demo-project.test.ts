import { describe, expect, it } from 'vitest'

import {
  COLS,
  DEMO_PROJECT_NAME,
  DEMO_PROJECTS,
  demoProjectJSON,
  POSTER_DEMO,
  ROWS,
} from './demo-project.ts'
import { deserialize } from './project.ts'

describe('demo project generator', demo)

function demo() {
  it('is deterministic: two calls serialize identically', () => {
    expect(JSON.stringify(demoProjectJSON())).toBe(JSON.stringify(demoProjectJSON()))
  })

  it('deserializes into a 200×100 scene document', () => {
    const doc = deserialize(demoProjectJSON())
    expect(doc.cols).toBe(COLS)
    expect(doc.rows).toBe(ROWS)
    expect(doc.layers).not.toBeNull()
    expect(doc.layers!.length).toBe(4)
    const objs = doc.layers!.flatMap((l) => l.children).filter((o) => o.kind === 'obj')
    expect(objs.length).toBeGreaterThanOrEqual(6)
    expect(objs.every((o) => o.cells.size > 0)).toBe(true)
  })

  it('paints only valid palette values and covers the whole canvas', () => {
    const doc = deserialize(demoProjectJSON())
    expect(doc.cells.some((v) => v > doc.palette.length)).toBe(false)
    // sky + sea cover every row; nothing below the last row
    expect(doc.cells[0]).toBeGreaterThan(0)
    expect(doc.cells[doc.cells.length - 1]).toBeGreaterThan(0)
  })

  it('the poster shows the lettering, the sun and the accent details', () => {
    const doc = deserialize(demoProjectJSON())
    const at = (x: number, y: number) => doc.cells[y * COLS + x]
    // the ink of "DITHER" (letter D stem, glyph row 1), its shadow, sun and sparkles
    expect(at(12, 17)).toBe(7)
    // shadow peeks out under the bottom arc of the white D
    expect(at(20, 48)).toBe(8)
    const colors = new Set(doc.cells)
    expect(colors.has(5)).toBe(true) // sun core
    expect(colors.has(6)).toBe(true) // sun rim + reflection
    expect(colors.has(9)).toBe(true) // sparkles
  })

  it('carries the demo name and a fixed 9-color palette', () => {
    expect(DEMO_PROJECT_NAME).toBe('Ditherlab Demo')
    const json = demoProjectJSON()
    expect(json.palette).toHaveLength(9)
    expect(json.v).toBe(3)
  })
}

describe('demo project registry', registry)

function registry() {
  it('pins the poster def and uses stable unique demo. ids', () => {
    expect(POSTER_DEMO.id).toBe('demo.poster')
    const ids = DEMO_PROJECTS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => id.startsWith('demo.'))).toBe(true)
  })

  it('every pixel demo deserializes into a scene document of its own size', () => {
    for (const def of DEMO_PROJECTS) {
      const content = def.build()
      if (content.kind !== 'pixel') continue
      const doc = deserialize(content.doc)
      expect(doc.cols, def.id).toBe(content.doc.cols)
      expect(doc.rows, def.id).toBe(content.doc.rows)
      expect(doc.layers?.length ?? 0, def.id).toBeGreaterThan(0)
      expect(doc.cells.length, def.id).toBe(doc.cols * doc.rows)
      expect(
        doc.cells.some((v) => v > doc.palette.length),
        def.id,
      ).toBe(false)
    }
  })

  it('every pixel demo is deterministic: two builds serialize identically', () => {
    for (const def of DEMO_PROJECTS) {
      const a = def.build()
      const b = def.build()
      if (a.kind !== 'pixel' || b.kind !== 'pixel') continue
      expect(JSON.stringify(a.doc), def.id).toBe(JSON.stringify(b.doc))
    }
  })

  it('pins the canvas width of every pixel demo, icons first', () => {
    const sizes: Record<string, [number, number]> = {}
    for (const def of DEMO_PROJECTS) {
      const content = def.build()
      if (content.kind === 'pixel') sizes[def.id] = [content.doc.cols, content.doc.rows]
    }
    expect(sizes).toEqual({
      'demo.poster': [200, 100],
      'demo.invader': [32, 32],
      'demo.portrait': [64, 64],
      'demo.confetti': [64, 64],
      'demo.tone': [96, 96],
      'demo.hexreef': [96, 80],
      'demo.mandala': [128, 128],
      'demo.kaleido': [128, 128],
      'demo.galaxy': [128, 64],
      'demo.cubist': [128, 76],
      'demo.wallpaper': [128, 128],
      'demo.nodegarden': [128, 128],
      'demo.constellation': [128, 96],
      'demo.neoncity': [128, 96],
      'demo.tripeaks': [128, 88],
      'demo.lava': [96, 128],
      'demo.dollar': [192, 96],
      'demo.landscape': [512, 256],
    })
  })

  it('trace demos ship a source raster with default params and no svg yet', () => {
    for (const def of DEMO_PROJECTS) {
      const content = def.build()
      if (content.kind === 'pixel') continue
      expect(content.source.width, def.id).toBe(128)
      expect(content.source.height, def.id).toBe(128)
      expect(content.source.data.byteLength, def.id).toBe(128 * 128 * 4)
      expect(content.params, def.id).toBeTypeOf('object')
    }
  })
}
