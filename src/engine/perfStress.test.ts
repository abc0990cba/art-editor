import { describe, expect, it } from 'vitest'
import { defaultDoc, type Doc } from './doc'
import { buildGeometry, stagingPreview, PENDING_OBJ, type Staging } from './geometry'

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

describe('500×500 render performance', () => {
  it('in-stroke preview frames are far cheaper than a full rebuild', () => {
    const doc = bigDoc()

    let t0 = performance.now()
    const full = buildGeometry(doc)
    const rebuildMs = performance.now() - t0
    expect(full.paths.length).toBe(2)

    const FRAMES = 60
    t0 = performance.now()
    let previewFrames = 0
    for (let f = 0; f < FRAMES; f++) {
      const preview = stagingPreview(doc, strokeStaging(f))
      expect(preview).not.toBeNull()
      expect(preview!.paths.length).toBeGreaterThan(0)
      previewFrames++
    }
    const previewAvgMs = (performance.now() - t0) / previewFrames

    // the whole point: drawing must stay interactive on large grids, so a stroke frame
    // (staged cells only) must beat the full-document rebuild by a wide margin
    expect(previewAvgMs * 10).toBeLessThan(rebuildMs)
    // eslint-disable-next-line no-console
    console.log(
      `500×500 pixels: full rebuild ${rebuildMs.toFixed(1)}ms, staging frame ${previewAvgMs.toFixed(2)}ms`,
    )
  })

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
