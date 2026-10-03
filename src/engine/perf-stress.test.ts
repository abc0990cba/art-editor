import { describe, expect, it } from 'vitest'

import { flatBenchDoc, flatRunsBenchDoc } from './bench-doc.util.ts'
import { defaultDoc, type Doc } from './core/doc.ts'
import { buildGeometry, stagingPreview, PENDING_OBJ, type Staging } from './geometry/index.ts'

/** A 500×500 pixels-mode doc with ~half the canvas painted in a two-color checker. */
function bigDoc(opts?: { sub?: Doc['sub']; radius?: number; chamfer?: boolean }): Doc {
  const doc = defaultDoc()
  doc.cols = 500
  doc.rows = 500
  doc.sub = opts?.sub ?? 1
  doc.cells = new Uint16Array(doc.cols * doc.sub * (doc.rows * doc.sub))
  doc.styleScope = 'global'
  doc.cellObj = null
  doc.style.radius = opts?.radius ?? 0.42
  doc.style.cornerStyle = opts?.chamfer ? 'chamfer' : 'arc'
  const bw = doc.cols * doc.sub
  const bh = doc.rows * doc.sub
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (x > bw * 0.7 || y > bh * 0.7) continue
      doc.cells[y * bw + x] = ((x + y) % 2) + 1
    }
  }
  return doc
}

/** A pencil stroke in flight: `frames` stamps of 16 cells each, growing every frame. */
function strokeStaging(frame: number): Staging {
  const cells = new Map<number, number | null>()
  const objs = new Map<number, number | null>()
  for (let k = 0; k <= frame; k++) {
    for (let d = 0; d < 16; d++) {
      const i = 3 * k + d
      cells.set(i, (i % 3) + 1)
      objs.set(i, PENDING_OBJ)
    }
  }
  return { cells, objs }
}

describe('stagingPreview correctness', () => {
  it('previews staged ink and erase punches in pixels mode', () => {
    const doc = bigDoc()
    const cells = new Map<number, number | null>()
    cells.set(0, 3)
    cells.set(1, null)
    const preview = stagingPreview(doc, { cells, objs: new Map([[0, PENDING_OBJ]]) })
    expect(preview).not.toBeNull()
    expect(preview!.paths.length).toBe(1)
    expect(preview!.paths[0].fill).toBe(doc.palette[2])
    expect(preview!.erase).toEqual([1])
  })

  it('falls back to the full rebuild for global outline/metaball, textures, links and non-square grids', () => {
    const outline = bigDoc()
    outline.renderMode = 'outline'
    expect(stagingPreview(outline, strokeStaging(0))).toBeNull()

    const metaball = bigDoc()
    metaball.renderMode = 'metaball'
    expect(stagingPreview(metaball, strokeStaging(0))).toBeNull()

    const textured = bigDoc()
    textured.texture.effect = 'grain'
    expect(stagingPreview(textured, strokeStaging(0))).toBeNull()

    const linked = bigDoc()
    linked.links = [{ ax: 1, ay: 1, bx: 2, by: 1, v: 1 }]
    // connector add/remove changes the link list: full rebuild
    expect(stagingPreview(linked, { cells: strokeStaging(0).cells, links: [] })).toBeNull()
    // same-length link lists mean "unchanged": incremental preview stays on
    expect(
      stagingPreview(linked, { cells: strokeStaging(0).cells, links: linked.links }),
    ).not.toBeNull()

    const hex = bigDoc()
    hex.gridType = 'hex'
    expect(stagingPreview(hex, strokeStaging(0))).toBeNull()

    const rotated = bigDoc()
    rotated.gridRotation = 45
    expect(stagingPreview(rotated, strokeStaging(0))).toBeNull()
  })

  it('renders staged cells with per-element styles in element scope', () => {
    const doc = bigDoc()
    doc.styleScope = 'element'
    doc.cellObj = new Uint32Array(doc.cells.length)
    doc.elements = [
      {
        style: { ...doc.style, radius: 0, sizeX: 1, sizeY: 1 },
        renderMode: 'pixels',
        connectivity: 'edge',
        metaball: { ...doc.metaball },
        texture: { ...doc.texture },
      },
    ]
    const cells = new Map<number, number | null>([[5, 1]])
    const preview = stagingPreview(doc, { cells, objs: new Map([[5, 1]]) })
    expect(preview).not.toBeNull()
    // radius 0, full size: fragment is a plain 1×1 square at the cell position
    expect(preview!.paths[0].d).toBe('M5 0L6 0L6 1L5 1L5 0Z')
  })
})

describe('2048² perf budgets (bench/PERFLOG.md ratchet)', () => {
  const S = 1024
  const CELLS = 0.25

  it('run-friendly ink builds geometry far cheaper than scattered ink at equal cell count', () => {
    // equal painted cell counts, only the run structure differs: run-merging must win big
    const scatter = flatBenchDoc(S, S, CELLS)
    const runs = flatRunsBenchDoc(S, S, CELLS)
    const t0 = performance.now()
    buildGeometry(scatter)
    const scatterMs = performance.now() - t0
    const t1 = performance.now()
    buildGeometry(runs)
    const runsMs = performance.now() - t1
    // eslint-disable-next-line no-console
    console.log(
      `${S}² ${(CELLS * 100) | 0}% ink: scatter ${scatterMs.toFixed(0)}ms, runs-64 ${runsMs.toFixed(1)}ms (${(scatterMs / Math.max(runsMs, 0.01)).toFixed(0)}x)`,
    )
    // ratio assertion (machine-independent): merging must stay a large constant-factor win
    expect(runsMs * 5).toBeLessThan(scatterMs)
  })

  it('commit-sized rebuilds on 2048² stay under a frame-budget multiple', () => {
    // relative ratchet: 2048² rebuild must not exceed the 512² cost by more than the
    // cell-count ratio + slack (catches accidental O(n²) regressions in geometry)
    const small = flatRunsBenchDoc(512, 512, 0.25)
    const big = flatRunsBenchDoc(2048, 2048, 0.25)
    const t0 = performance.now()
    buildGeometry(small)
    const smallMs = performance.now() - t0
    const t1 = performance.now()
    buildGeometry(big)
    const bigMs = performance.now() - t1
    // 16× the cells; run-merging keeps the absolute work tiny, allow 40× for scheduler noise
    expect(bigMs).toBeLessThan(Math.max(20, smallMs * 40))
  })
})

describe('500×500 render correctness across style options', () => {
  it('stays incremental across rounding options (arc/chamfer, radius 0…0.5, sub 3)', () => {
    for (const opts of [
      { radius: 0 },
      { radius: 0.5 },
      { radius: 0.35, chamfer: true },
      { sub: 3 as const },
    ]) {
      const doc = bigDoc(opts)
      const preview = stagingPreview(doc, strokeStaging(5))
      expect(preview).not.toBeNull()
      expect(preview!.paths.length).toBeGreaterThan(0)
    }
  })
})
