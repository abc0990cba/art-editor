import { describe, expect, it } from 'vitest'

import { defaultDoc, type Doc } from '../core/doc.ts'
import { deserialize, serialize } from '../core/project.ts'
import { buildGeometry } from './index.ts'

function docWith(cells: [number, number][], cols = 8, rows = 8): Doc {
  const doc = defaultDoc()
  doc.cols = cols
  doc.rows = rows
  doc.cells = new Uint16Array(cols * rows)
  for (const [x, y] of cells) doc.cells[y * cols + x] = 1
  doc.renderMode = 'outline'
  doc.style.convexRadius = 0.25
  doc.style.concaveRadius = 0.25
  return doc
}

/** Two same-color cells touching at a corner: (1,1) and (2,2) */
function diagonalDoc(): Doc {
  return docWith([
    [1, 1],
    [2, 2],
  ])
}

describe('outline connectivity', () => {
  it('edge (default) keeps corner-touching cells as two subpaths', () => {
    const g = buildGeometry(diagonalDoc())
    expect((g.paths[0].d.match(/M/g) ?? []).length).toBe(2)
  })

  it('corner connectivity traces one pinched silhouette', () => {
    const doc = diagonalDoc()
    doc.connectivity = 'corner'
    const g = buildGeometry(doc)
    expect((g.paths[0].d.match(/M/g) ?? []).length).toBe(1)
  })

  it('corner-bridge fuses a square web into the single silhouette path', () => {
    const doc = diagonalDoc()
    doc.connectivity = 'corner-bridge'
    const g = buildGeometry(doc)
    // one continuous path — the web is part of the silhouette, no overlay path anymore
    expect(g.paths).toHaveLength(1)
    expect((g.paths[0].d.match(/M/g) ?? []).length).toBe(1)
    // junction is the doc point (2,2); each web leaves the cell edges 0.25 (concave radius)
    // before the junction and turns through the cell-grid corner (e.g. 1.75, 2.25), filleted
    // with tangent arcs clamped to half the step (r = 0.12)
    const d = g.paths[0].d
    expect(d).toContain('A0.12')
    // ↖ web (into the empty cell (1,2)): tangent points on the cell grid
    expect(d).toContain('1.75 2.13')
    expect(d).toContain('1.87 2.25')
    // ↘ web (into the empty cell (2,1))
    expect(d).toContain('2.13 1.75')
    expect(d).toContain('2.25 1.87')
  })

  it('zero concave radius makes corner-bridge byte-identical to corner mode', () => {
    const bridged = diagonalDoc()
    bridged.connectivity = 'corner-bridge'
    bridged.style.concaveRadius = 0
    const corner = diagonalDoc()
    corner.connectivity = 'corner'
    corner.style.concaveRadius = 0
    expect(buildGeometry(bridged).paths[0].d).toBe(buildGeometry(corner).paths[0].d)
  })

  it('no web where an orthogonal neighbor is filled (L-shape)', () => {
    const bridged = docWith([
      [1, 1],
      [2, 1],
      [1, 2],
    ])
    bridged.connectivity = 'corner-bridge'
    const corner = docWith([
      [1, 1],
      [2, 1],
      [1, 2],
    ])
    corner.connectivity = 'corner'
    expect(buildGeometry(bridged).paths[0].d).toBe(buildGeometry(corner).paths[0].d)
  })

  it('web scales with sub-detail', () => {
    const doc = diagonalDoc()
    doc.connectivity = 'corner-bridge'
    doc.sub = 2
    doc.cells = new Uint16Array(16 * 16)
    for (const [cx, cy] of [
      [1, 1],
      [2, 2],
    ] as const) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) doc.cells[(cy * 2 + dy) * 16 + cx * 2 + dx] = 1
      }
    }
    const g = buildGeometry(doc)
    expect(g.paths).toHaveLength(1)
    // step s = 0.125, delta = 0.005: the web enters at the grid line x = 1.875 on the contour
    // edge, tangent arc r = (s − delta)/2 = 0.06
    expect(g.paths[0].d).toContain('1.815 2.005')
    expect(g.paths[0].d).toContain('2.185 1.995')
  })

  it('chamfer style cuts the web corners straight', () => {
    const doc = diagonalDoc()
    doc.connectivity = 'corner-bridge'
    doc.style.cornerStyle = 'chamfer'
    const d = buildGeometry(doc).paths[0].d
    expect((d.match(/A/g) ?? []).length).toBe(0)
    // the chamfer passes through the web tangent points on the cell grid
    expect(d).toContain('1.75 2.13')
  })

  it('different colors never join even with corner connectivity', () => {
    const doc = diagonalDoc()
    doc.connectivity = 'corner'
    doc.cells[2 * 8 + 2] = 2
    const g = buildGeometry(doc)
    expect(g.paths).toHaveLength(2)
    for (const p of g.paths) {
      expect((p.d.match(/M/g) ?? []).length).toBe(1)
    }
  })
})

describe('metaball connectivity', () => {
  it('corner connectivity merges diagonal blobs at low strength', () => {
    const doc = diagonalDoc()
    doc.renderMode = 'metaball'
    doc.metaball.strength = 10
    doc.metaball.perColor = true
    const g = buildGeometry(doc)
    expect((g.paths[0].d.match(/M/g) ?? []).length).toBe(2) // edge: separate blobs

    doc.connectivity = 'corner'
    const g2 = buildGeometry(doc)
    expect((g2.paths[0].d.match(/M/g) ?? []).length).toBe(1) // joined through the junction
  })
})

describe('connectivity round trip', () => {
  it('persists through project save/load and falls back to edge for garbage', () => {
    const doc = diagonalDoc()
    doc.connectivity = 'corner-bridge'
    expect(deserialize(JSON.parse(JSON.stringify(serialize(doc)))).connectivity).toBe(
      'corner-bridge',
    )
    expect(deserialize({ connectivity: 'nonsense' }).connectivity).toBe('edge')
    expect(deserialize({}).connectivity).toBe('edge')
  })
})

describe('bridge junction direction symmetry', () => {
  const pts = (d: string) => {
    const out: [number, number][] = []
    const re = /([MLAZ])([^MLAZ]*)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(d))) {
      const nums = (m[2].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
      if (m[1] === 'A') {
        if (nums.length >= 6) out.push([nums[5], nums[6]])
      } else {
        for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]])
      }
    }
    return out
  }
  const mk = (cells: [number, number][]) => {
    const doc = defaultDoc()
    doc.cols = 8
    doc.rows = 8
    doc.cells = new Uint16Array(64)
    for (const [x, y] of cells) doc.cells[y * 8 + x] = 1
    doc.renderMode = 'outline'
    doc.connectivity = 'corner-bridge'
    const g = buildGeometry(doc)
    return g.paths[0].d // fused silhouette with the webs
  }
  const sorted = (pts: [number, number][]) =>
    JSON.stringify(
      [...pts]
        .map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000])
        .sort((p, q) => p[0] - q[0] || p[1] - q[1]),
    )

  it('web mirrors with the pair across the junction line', () => {
    // the ↗ pair (1,2),(2,1) is the ↘ pair (1,1),(2,2) mirrored across y = 2 through the junction
    const a = sorted(
      pts(
        mk([
          [1, 1],
          [2, 2],
        ]),
      ),
    )
    const b = sorted(
      pts(
        mk([
          [1, 2],
          [2, 1],
        ]),
      ).map(([x, y]) => [x, 4 - y] as [number, number]),
    )
    expect(a).toBe(b)
  })

  it('web mirrors with the pair across a vertical line', () => {
    // ↘ pair (1,1),(2,2) mirrored across x = 4: (1,1)→(6,1), (2,2)→(5,2), junction (2,2)→(6,2)
    const a = sorted(
      pts(
        mk([
          [1, 1],
          [2, 2],
        ]),
      ),
    )
    const bm = sorted(
      pts(
        mk([
          [6, 1],
          [5, 2],
        ]),
      ).map(([x, y]) => [8 - x, y] as [number, number]),
    )
    expect(a).toBe(bm)
  })
})
