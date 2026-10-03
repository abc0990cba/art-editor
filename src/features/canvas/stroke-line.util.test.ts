import { describe, expect, it } from 'vitest'

import { lineAnchors } from './stroke-line.util.ts'

describe('lineAnchors', () => {
  it('walks a single cell', () => {
    expect(lineAnchors(3, 4, 3, 4)).toEqual([[3, 4]])
  })

  it('covers every cell of a horizontal segment inclusively', () => {
    expect(lineAnchors(2, 5, 6, 5)).toEqual([
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
      [6, 5],
    ])
  })

  it('covers every cell of a vertical segment backwards', () => {
    expect(lineAnchors(1, 4, 1, 1)).toEqual([
      [1, 4],
      [1, 3],
      [1, 2],
      [1, 1],
    ])
  })

  it('walks a diagonal without gaps', () => {
    expect(lineAnchors(0, 0, 3, 3)).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ])
  })

  it('keeps a shallow line step-connected (no skipped cells)', () => {
    const line = lineAnchors(0, 0, 4, 1)
    expect(line[0]).toEqual([0, 0])
    expect(line[line.length - 1]).toEqual([4, 1])
    for (let k = 1; k < line.length; k++) {
      const [ax, ay] = line[k - 1]
      const [bx, by] = line[k]
      expect(Math.abs(bx - ax)).toBeLessThanOrEqual(1)
      expect(Math.abs(by - ay)).toBeLessThanOrEqual(1)
      expect(bx !== ax || by !== ay).toBe(true)
    }
    // one cell per row: the shallow line never leaves a row unpainted
    const rows = new Set(line.map(([, y]) => y))
    expect(rows.size).toBe(2)
    expect(line).toHaveLength(5)
  })
})
