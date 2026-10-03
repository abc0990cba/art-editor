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

  it('corner-bridge adds a junction-aligned diamond overlay as a same-color path', () => {
    const doc = diagonalDoc()
    doc.connectivity = 'corner-bridge'
    const g = buildGeometry(doc)
    // silhouette path (single pinched loop) + separate bridge path of the same color
    expect((g.paths[0].d.match(/M/g) ?? []).length).toBe(1)
    expect(g.paths[1].fill).toBe(g.paths[0].fill)
    // junction is the doc point (2,2); the diamond spans the surrounding edge midpoints
    // (1.5..2.5 on both axes) with concave-radius fillets
    expect(g.paths[1].d).toContain('M2.323 1.823')
    expect(g.paths[1].d).toContain('A0.25')
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
    return g.paths[1].d // bridge overlay path
  }
  const sorted = (pts: [number, number][]) =>
    JSON.stringify(
      [...pts]
        .map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000])
        .sort((p, q) => p[0] - q[0] || p[1] - q[1]),
    )

  it('overlay is identical for the two diagonal orientations', () => {
    // ↘ pair and ↗ pair sharing the same junction (2,2)
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
          [2, 1],
          [1, 2],
        ]),
      ),
    )
    expect(a).toBe(b)
  })

  it('overlay is identical for a vertical mirror of the same pair', () => {
    // mirror across x = 3.5: (1,1)→(6,1), (2,2)→(5,2)
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
      ).map(([x, y]) => [x - 4, y] as [number, number]),
    )
    expect(a).toBe(bm)
  })
})
