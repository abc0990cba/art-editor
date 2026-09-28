import { describe, expect, it } from 'vitest'

import type { Doc, Link } from '../../engine/doc.ts'
import {
  constrainShapeEnd,
  marqueeRect,
  objectsInMarquee,
  rectHasInk,
} from './canvas-stage.util.ts'

const sub = 1

/** Minimal doc stub: a 10×10 cell canvas (cols·sub = buffer width), cells + links as given. */
function docWith(cellObj: Uint32Array, links: Link[] = []): Doc {
  return { cols: 10, rows: 10, sub, cellObj, links } as unknown as Doc
}

describe('objectsInMarquee', () => {
  // buffer 10×10; two 2×2 objects: id 1 at (1,1), id 2 at (5,5)
  const cellObj = new Uint32Array(100)
  for (const [y, x, id] of [
    [1, 1, 1],
    [1, 2, 1],
    [2, 1, 1],
    [2, 2, 1],
    [5, 5, 2],
    [5, 6, 2],
    [6, 5, 2],
    [6, 6, 2],
  ] as const) {
    cellObj[y * 10 + x] = id
  }
  const pickable = () => true

  it('collects every object the band touches', () => {
    const doc = docWith(cellObj)
    expect(objectsInMarquee(doc, marqueeRect({ x: 0, y: 0 }, { x: 4, y: 4 }), pickable)).toEqual([
      1,
    ])
    expect(objectsInMarquee(doc, marqueeRect({ x: 0, y: 0 }, { x: 10, y: 10 }), pickable)).toEqual([
      1, 2,
    ])
  })

  it('matches bbox intersection, not just full containment', () => {
    // the band only grazes the top-left corner of object 2's box
    const hits = objectsInMarquee(
      docWith(cellObj),
      marqueeRect({ x: 4.5, y: 4.5 }, { x: 5.5, y: 5.5 }),
      pickable,
    )
    expect(hits).toEqual([2])
  })

  it('an empty band selects nothing', () => {
    const hits = objectsInMarquee(
      docWith(cellObj),
      marqueeRect({ x: 7, y: 0 }, { x: 9, y: 3 }),
      pickable,
    )
    expect(hits).toEqual([])
  })

  it('connectors count through their link endpoints', () => {
    const links: Link[] = [{ ax: 8, ay: 8, bx: 9, by: 9, v: 1, obj: 7 }]
    const hits = objectsInMarquee(
      docWith(new Uint32Array(100), links),
      marqueeRect({ x: 7, y: 7 }, { x: 9, y: 9 }),
      pickable,
    )
    expect(hits).toEqual([7])
  })

  it('locked or hidden objects are filtered by the pickable callback', () => {
    const hits = objectsInMarquee(
      docWith(cellObj),
      marqueeRect({ x: 0, y: 0 }, { x: 10, y: 10 }),
      (id) => id !== 1,
    )
    expect(hits).toEqual([2])
  })
})

describe('rectHasInk', () => {
  const cells = new Uint16Array(100)
  cells[0] = 1 // painted cell at (0,0)
  cells[55] = 1 // painted cell at (5,5)

  it('finds painted cells inside the band', () => {
    expect(rectHasInk(cells, 10, 10, sub, marqueeRect({ x: 4, y: 4 }, { x: 7, y: 7 }))).toBe(true)
    expect(rectHasInk(cells, 10, 10, sub, marqueeRect({ x: 0, y: 0 }, { x: 0.5, y: 0.5 }))).toBe(
      true,
    )
  })

  it('returns false for empty areas', () => {
    expect(rectHasInk(cells, 10, 10, sub, marqueeRect({ x: 7, y: 7 }, { x: 9, y: 9 }))).toBe(false)
  })
})

describe('constrainShapeEnd', () => {
  const start = { x: 0, y: 0 }

  it('the line snaps to horizontal, vertical and 45° diagonals', () => {
    expect(constrainShapeEnd('line', start, { x: 8, y: 3 })).toEqual({ x: 8, y: 0 })
    // cos(π/2) is 6e-17, not 0 — compare with a tolerance
    const v = constrainShapeEnd('line', start, { x: 3, y: 8 })
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(8)
    // 52° leans to the 45° diagonal; the dominant length (9) rides the snapped ray
    const d = constrainShapeEnd('line', start, { x: 7, y: 9 })
    expect(d.x).toBeCloseTo(9 / Math.SQRT2)
    expect(d.y).toBeCloseTo(9 / Math.SQRT2)
  })

  it('shapes keep a square 1:1 box under the dominant axis', () => {
    expect(constrainShapeEnd('rect', start, { x: 8, y: 3 })).toEqual({ x: 8, y: 8 })
    expect(constrainShapeEnd('ellipse', start, { x: -2, y: -9 })).toEqual({ x: -9, y: -9 })
  })

  it('without a dominant delta the corner stays put', () => {
    expect(constrainShapeEnd('rect', start, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
  })
})
