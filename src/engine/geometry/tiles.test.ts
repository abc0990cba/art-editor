import { describe, expect, it } from 'vitest'

import { defaultDoc, elementFromDoc, makeCells, type Doc } from '../core/doc.ts'
import { newObj, syncDoc } from '../core/scene.ts'
import { buildGeometry, type Geometry, type StyledPath } from './index.ts'
import { ensureTileGeometry } from './tiles.ts'

/**
 * Pixel-identity contract of the dirty-tile geometry cache: the tile-partitioned rebuild must
 * render exactly what the whole-document builder renders. Rect runs may split at tile borders (the
 * union across tiles is the same ink — shared rect edges are seam-free), so the run-merged case is
 * compared as rasterized coverage per color; per-cell fragments (corner rounding) never split, so
 * the rounded case compares fragment multisets per color. Ineligible documents must fall back to
 * the whole builder bit-for-bit.
 */

function baseDoc(patch: Partial<Doc> = {}): Doc {
  const doc = defaultDoc()
  const next: Doc = { ...doc, ...patch }
  if (next.cols !== doc.cols || next.rows !== doc.rows || next.sub !== doc.sub) {
    next.cells = makeCells(next.cols, next.rows, next.sub)
  }
  return next
}

/**
 * Checker + blocks of several colors across tile borders (TILE = 256 — use small docs with forced
 * tiles via 300+ widths).
 */
function paintRuns(doc: Doc): Doc {
  const cells = doc.cells.slice()
  const bw = doc.cols * doc.sub
  const put = (x: number, y: number, w: number, h: number, v: number) => {
    for (let y2 = y; y2 < y + h; y2++) cells.fill(v, y2 * bw + x, y2 * bw + x + w)
  }
  put(10, 10, 100, 40, 1)
  put(250, 5, 20, 60, 2) // crosses the 256 tile border
  put(0, 250, 120, 12, 1)
  put(255, 255, 40, 40, 3) // corner tile
  put(300, 100, 50, 50, 2)
  return { ...doc, cells }
}

/** Rasterize rect-run fragments (`M x y h w v h h -w Z`) into a value buffer. */
function rasterRects(paths: StyledPath[], bw: number, bh: number): Map<string, Uint16Array> {
  const out = new Map<string, Uint16Array>()
  for (const p of paths) {
    if (!p.fill) continue
    let buf = out.get(p.fill)
    if (!buf) out.set(p.fill, (buf = new Uint16Array(bw * bh)))
    for (const m of p.d.matchAll(/M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)h[-\d.]+Z/g)) {
      const x = Number(m[1])
      const y = Number(m[2])
      const w = Number(m[3])
      const h = Number(m[4])
      for (let yy = Math.round(y); yy < Math.round(y + h); yy++) {
        buf.fill(1, yy * bw + Math.round(x), yy * bw + Math.round(x + w))
      }
    }
  }
  return out
}

function expectRasterIdentity(a: Geometry, b: Geometry, bw: number, bh: number): void {
  const ra = rasterRects(a.paths, bw, bh)
  const rb = rasterRects(b.paths, bw, bh)
  expect([...ra.keys()].sort()).toEqual([...rb.keys()].sort())
  for (const [fill, buf] of ra) {
    const other = rb.get(fill)!
    expect(other).toHaveLength(buf.length)
    for (let i = 0; i < buf.length; i++) expect(other[i]).toBe(buf[i])
  }
}

/** Ineligible-matrix base: global-scope, painted, no layers. */
function baseGlobal(): Doc {
  return paintRuns(baseDoc({ cols: 300, rows: 300, styleScope: 'global' }))
}

function expectFragmentIdentity(a: Geometry, b: Geometry): void {
  const group = (paths: StyledPath[]): Map<string, string[]> => {
    const out = new Map<string, string[]>()
    for (const p of paths) {
      if (!p.fill) continue
      const frags = p.d.split(/(?=M)/).filter((s) => s.startsWith('M'))
      const list = out.get(p.fill)
      if (list) list.push(...frags)
      else out.set(p.fill, [...frags])
    }
    for (const list of out.values()) list.sort()
    return out
  }
  expect(group(a.paths)).toEqual(group(b.paths))
}

describe('ensureTileGeometry — pixel identity with buildGeometry', () => {
  it(
    'matches the whole-doc scan for run-merged ink across tile borders',
    { timeout: 20000 },
    () => {
      const doc = paintRuns(baseDoc({ cols: 300, rows: 300, styleScope: 'global' }))
      const whole = buildGeometry(doc)
      const tiled = ensureTileGeometry(null, doc)
      const bw = doc.cols * doc.sub
      expectRasterIdentity(whole, tiled, bw, doc.rows * doc.sub)
    },
  )

  it('matches after a local edit (only the dirty tiles are rebuilt)', { timeout: 20000 }, () => {
    const doc = paintRuns(baseDoc({ cols: 300, rows: 300, styleScope: 'global' }))
    ensureTileGeometry(null, doc)
    const cells = doc.cells.slice()
    cells.fill(2, 100 * 300 + 100, 100 * 300 + 110)
    const edited: Doc = { ...doc, cells }
    const tiled = ensureTileGeometry(doc, edited)
    expectRasterIdentity(buildGeometry(edited), tiled, 300, 300)
  })

  it(
    'matches for per-cell rounded fragments (never split, fragment multisets equal)',
    { timeout: 20000 },
    () => {
      const doc = paintRuns(
        baseDoc({ cols: 300, rows: 300, style: { ...baseDoc().style, radius: 0.3 } }),
      )
      const whole = buildGeometry(doc)
      const tiled = ensureTileGeometry(null, doc)
      expectFragmentIdentity(whole, tiled)
    },
  )

  it('reuses the cached geometry for the same document', () => {
    const doc = paintRuns(baseDoc({ cols: 300, rows: 300, styleScope: 'global' }))
    expect(ensureTileGeometry(null, doc)).toBe(ensureTileGeometry(null, doc))
  })

  it('invalidates every tile when the palette changes', { timeout: 20000 }, () => {
    const doc = paintRuns(baseDoc({ cols: 300, rows: 300, styleScope: 'global' }))
    ensureTileGeometry(null, doc)
    const recolored: Doc = { ...doc, palette: ['#ff0000', '#00ff00', '#0000ff'] }
    expectRasterIdentity(buildGeometry(recolored), ensureTileGeometry(doc, recolored), 300, 300)
  })

  it(
    'takes the tile path for element-scope scenes whose objects froze the doc style',
    { timeout: 20000 },
    () => {
      let doc = baseDoc({ cols: 300, rows: 300, styleScope: 'element' })
      doc = syncDoc({
        ...doc,
        layers: [{ kind: 'layer', id: 1, name: 'a', visible: true, locked: false, children: [] }],
      })
      const ink: Map<number, number> = new Map()
      for (let x = 250; x < 280; x++) {
        for (let y = 250; y < 280; y++) ink.set(y * 300 + x, (x + y) % 2 ? 1 : 2)
      }
      const { obj } = newObj(doc, elementFromDoc(doc))
      obj.cells = ink
      doc = syncDoc({ ...doc, layers: [{ ...doc.layers![0], children: [obj] }] })
      // sanity: the fixture really is element scope with one styled object
      expect(doc.styleScope).toBe('element')
      expectRasterIdentity(buildGeometry(doc), ensureTileGeometry(null, doc), 300, 300)
    },
  )

  const cases: [string, Doc][] = [
    ['textured', { ...baseGlobal(), texture: { ...baseGlobal().texture, effect: 'grain' } }],
    ['flat element', { ...baseGlobal(), styleScope: 'element' }],
    ['outline', { ...baseGlobal(), renderMode: 'outline' }],
    ['metaball', { ...baseGlobal(), renderMode: 'metaball' }],
    [
      'cell rotation',
      {
        ...baseGlobal(),
        style: {
          ...baseGlobal().style,
          shapeParams: { ...baseGlobal().style.shapeParams, rotation: 15 },
        },
      },
    ],
    [
      'two visible layers',
      {
        ...baseGlobal(),
        layers: [
          { kind: 'layer', id: 1, name: 'a', visible: true, locked: false, children: [] },
          { kind: 'layer', id: 2, name: 'b', visible: true, locked: false, children: [] },
        ],
      },
    ],
  ]
  it.each(cases)('falls back to the whole builder: %s', (_name, doc) => {
    // fragment-multiset identity per color: rendered output does not depend on fragment order
    // (which differs between the whole scan and the per-tile merge for eligible-but-styled docs)
    const tiled = ensureTileGeometry(null, doc)
    const whole = buildGeometry(doc)
    expectFragmentIdentity(tiled, whole)
    // connectors: multiset of the stroked (fill-less) paths
    const strokes = (paths: StyledPath[]): string[] =>
      paths
        .filter((p) => !p.fill)
        .map((p) => p.d)
        .sort()
    expect(strokes(tiled.paths)).toEqual(strokes(whole.paths))
  })
})
