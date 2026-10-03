import { describe, expect, it } from 'vitest'

import { defaultDoc } from '../core/doc.ts'
import { deserialize, serialize } from '../core/project.ts'
import { gridBuildGeometry } from '../grids/geometry.ts'
import { normalizePresetConfig } from '../presets/index.ts'
import {
  buildMetaballField,
  kernelRadius,
  loopsToSmoothPath,
  metaballIso,
  traceMetaballLoops,
  type MetaballSource,
} from './metaball-field.ts'
import { metaballGeometry, metaballPreviewField } from './metaball.ts'

/** Field value at a doc-space probe point (nearest node). */
function probe(opts: Parameters<typeof buildMetaballField>[0], x: number, y: number): number {
  const field = buildMetaballField(opts)
  const ix = Math.min(field.fw - 1, Math.max(0, Math.round(x / field.scale)))
  const iy = Math.min(field.fh - 1, Math.max(0, Math.round(y / field.scale)))
  return field.f[iy * field.fw + ix]
}

const base = {
  w: 8,
  h: 8,
  step: 1 / 4,
  sources: [{ x: 3.5, y: 3.5, v: 1 }],
  capsules: [],
  take: () => true,
  strength: 50,
  sub: 1,
  falloff: 'tight',
  squareEdges: false,
} as const

describe('metaball field', () => {
  it('reaches further out for gooier falloff curves at the same probe point', () => {
    const x = 4.3 // inside the kernel skirt, off-center
    const gooey = probe({ ...base, falloff: 'gooey' }, x, 3.5)
    const smooth = probe({ ...base, falloff: 'smooth' }, x, 3.5)
    const tight = probe({ ...base, falloff: 'tight' }, x, 3.5)
    expect(gooey).toBeGreaterThan(smooth)
    expect(smooth).toBeGreaterThan(tight)
    expect(tight).toBeGreaterThan(0)
  })

  it('clamps the merge threshold into 0.2–0.8', () => {
    const doc = defaultDoc()
    doc.metaball.iso = 0.05
    expect(metaballIso(doc)).toBe(0.2)
    doc.metaball.iso = 0.95
    expect(metaballIso(doc)).toBe(0.8)
    doc.metaball.iso = 0.42
    expect(metaballIso(doc)).toBe(0.42)
  })

  it('kernel radius grows with strength and shrinks with sub-detail', () => {
    expect(kernelRadius(0, 1)).toBeCloseTo(0.815)
    expect(kernelRadius(100, 1)).toBeCloseTo(1.255)
    expect(kernelRadius(50, 2)).toBeCloseTo(kernelRadius(50, 1) / 2)
  })

  it('mirrors border nodes only with squareEdges', () => {
    const near: MetaballSource[] = [{ x: 0.75, y: 3.5, v: 1 }]
    const clamped = probe({ ...base, sources: near }, 0, 3.5)
    expect(clamped).toBe(0)
    const mirrored = probe({ ...base, sources: near, squareEdges: true }, 0, 3.5)
    expect(mirrored).toBeGreaterThan(0)
  })

  it('filters sources and capsules by color value', () => {
    const field = buildMetaballField({
      ...base,
      sources: [
        { x: 2.5, y: 3.5, v: 1 },
        { x: 5.5, y: 3.5, v: 2 },
      ],
      capsules: [
        { ax: 2.5, ay: 3.5, bx: 3.5, by: 3.5, v: 1 },
        { ax: 5.5, ay: 3.5, bx: 6.5, by: 3.5, v: 2 },
      ],
      take: (v) => v === 1,
    })
    // only the color-1 splat and capsule contribute
    expect(
      field.f[Math.round(2.75 / field.scale) * field.fw + Math.round(2.5 / field.scale)],
    ).toBeGreaterThan(0)
    expect(field.f[Math.round(3.5 / field.scale) * field.fw + Math.round(5.5 / field.scale)]).toBe(
      0,
    )
  })
})

/** Approximate extent of a compound path: max distance of any coordinate from the path origin. */
function pathExtent(d: string): number {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  let max = 0
  for (let i = 0; i + 1 < nums.length; i += 2) {
    max = Math.max(max, Math.hypot(nums[i] - 4, nums[i + 1] - 4))
  }
  return max
}

function twoCellSquareDoc() {
  const doc = defaultDoc()
  doc.cols = 8
  doc.rows = 8
  doc.cells = new Uint16Array(64)
  doc.cells[3 * 8 + 3] = 1
  doc.cells[3 * 8 + 4] = 1
  doc.renderMode = 'metaball'
  return doc
}

describe('diffusion controls end to end', () => {
  it('a lower threshold grows every square-grid blob', () => {
    const doc = twoCellSquareDoc()
    doc.metaball.strength = 60
    doc.metaball.iso = 0.7
    const tight = metaballGeometry(doc, doc.cells, doc.links)
    doc.metaball.iso = 0.3
    const fat = metaballGeometry(doc, doc.cells, doc.links)
    expect(pathExtent(fat.paths[0].d)).toBeGreaterThan(pathExtent(tight.paths[0].d))
  })

  it('a tighter falloff narrows the neck between two cells', () => {
    const doc = twoCellSquareDoc()
    doc.metaball.strength = 60
    doc.metaball.iso = 0.5
    doc.metaball.falloff = 'gooey'
    const gooey = metaballGeometry(doc, doc.cells, doc.links)
    doc.metaball.falloff = 'tight'
    const tight = metaballGeometry(doc, doc.cells, doc.links)
    // the merged blob persists, but its silhouette hugs the cells closer
    expect(tight.paths).toHaveLength(1)
    expect(pathExtent(tight.paths[0].d)).toBeLessThan(pathExtent(gooey.paths[0].d))
  })

  it('non-square grids honor threshold and falloff', () => {
    const doc = defaultDoc()
    doc.gridType = 'hex'
    doc.cols = 8
    doc.rows = 8
    doc.renderMode = 'metaball'
    doc.metaball.strength = 60
    const hex = (iso: number, falloff: 'tight' | 'gooey') => {
      doc.metaball.iso = iso
      doc.metaball.falloff = falloff
      const cells = new Uint16Array(64)
      cells[3 * 8 + 4] = 1
      cells[4 * 8 + 4] = 1
      return gridBuildGeometry(doc, cells, doc.links)
    }
    expect(pathExtent(hex(0.3, 'gooey')[0].d)).toBeGreaterThan(pathExtent(hex(0.7, 'gooey')[0].d))
    expect(pathExtent(hex(0.5, 'tight')[0].d)).toBeLessThan(pathExtent(hex(0.5, 'gooey')[0].d))
  })

  it('round-trips iso and falloff through project JSON', () => {
    const doc = twoCellSquareDoc()
    doc.metaball.iso = 0.33
    doc.metaball.falloff = 'gooey'
    const back = deserialize(serialize(doc))
    expect(back.metaball.iso).toBeCloseTo(0.33)
    expect(back.metaball.falloff).toBe('gooey')
  })

  it('clamps out-of-range preset metaball values', () => {
    const config = normalizePresetConfig({
      metaball: {
        strength: 45,
        perColor: true,
        quality: 4,
        squareEdges: false,
        iso: 5,
        falloff: 'wobbly',
      },
    })
    expect(config.metaball.iso).toBe(0.8)
    expect(config.metaball.falloff).toBe('tight')
  })

  it('exposes the merged overlay field for the diffusion guides', () => {
    const doc = twoCellSquareDoc()
    const { field, iso } = metaballPreviewField(doc, doc.cells, doc.links)
    expect(iso).toBe(0.5)
    expect(field.f.some((v) => v > 0.5)).toBe(true)
    const loops = traceMetaballLoops(field, iso, doc.metaball.squareEdges)
    expect(loops.length).toBeGreaterThan(0)
    expect(loopsToSmoothPath(loops, field.scale)).toMatch(/^M/)
  })
})
