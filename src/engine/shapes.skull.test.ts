import { describe, expect, it } from 'vitest'

import { fillCellsEvenOdd } from './shapefill'
import { shapeHasHoles, shapePathLoops, shapePathPoints, type ShapeOpts } from './shapes'

const BW = 80
const BH = 80

const fill = (opts: ShapeOpts = {}) => {
  const loops = shapePathLoops('skull', 8, 8, 72, 72, opts)
  const outline = new Set(shapePathPoints('skull', 8, 8, 72, 72, opts).map(([x, y]) => y * BW + x))
  return { loops, outline, inside: fillCellsEvenOdd(loops, BW, BH) }
}

const cell = (x: number, y: number) => y * BW + x

/** Cells in a rect that are neither fill nor outline — i.e. holes */
const holesIn = (f: ReturnType<typeof fill>, x0: number, y0: number, x1: number, y1: number) => {
  let n = 0
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = cell(x, y)
      if (!f.inside.has(i) && !f.outline.has(i)) n++
    }
  }
  return n
}

/** Filled (bone) cells in a rect */
const boneIn = (f: ReturnType<typeof fill>, x0: number, y0: number, x1: number, y1: number) => {
  let n = 0
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (f.inside.has(cell(x, y))) n++
  return n
}

describe('skull tool', basicGeometry)

function basicGeometry() {
  it('is a hole-bearing shape', () => {
    expect(shapeHasHoles('skull')).toBe(true)
    expect(shapeHasHoles('heart')).toBe(false)
  })

  it('draws five loops: silhouette, two sockets, nose, mouth', () => {
    const { loops } = fill()
    expect(loops.length).toBe(5)
  })

  it('keeps the silhouette inside the drag box', () => {
    const pts = shapePathPoints('skull', 8, 8, 72, 72)
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(7)
      expect(x).toBeLessThanOrEqual(73)
      expect(y).toBeGreaterThanOrEqual(7)
      expect(y).toBeLessThanOrEqual(73)
    }
    expect(pts.length).toBeGreaterThan(100)
  })

  it('fills the bone and leaves the sockets, nose and mouth hollow', () => {
    const f = fill()
    // bone: forehead between and above the eyes
    expect(f.inside.has(cell(40, 22))).toBe(true)
    // bone: cheeks out wide of the sockets
    expect(f.inside.has(cell(18, 40))).toBe(true)
    // both eye sockets are real holes
    expect(holesIn(f, 22, 33, 36, 45)).toBeGreaterThan(10)
    expect(holesIn(f, 44, 33, 58, 45)).toBeGreaterThan(10)
    // the nasal aperture is a hole
    expect(holesIn(f, 35, 44, 45, 51)).toBeGreaterThan(2)
    // the mouth reads as teeth: bone columns and dark gaps in the same row
    expect(boneIn(f, 24, 59, 56, 64)).toBeGreaterThan(8)
    expect(holesIn(f, 24, 59, 56, 64)).toBeGreaterThan(8)
  })

  it('is deterministic', () => {
    expect(shapePathPoints('skull', 8, 8, 72, 72)).toEqual(shapePathPoints('skull', 8, 8, 72, 72))
  })
}

describe('skull tool', knobs)

function knobs() {
  it('moves the sockets with the height knob', () => {
    const high = fill({ skullEyeY: 0.4 })
    const low = fill({ skullEyeY: 0.58 })
    const socketAt = (f: ReturnType<typeof fill>, y: number) => f.inside.has(cell(29, y))
    // at the high setting the low row is bone, and vice versa
    expect(socketAt(high, 36)).toBe(false)
    expect(socketAt(high, 46)).toBe(true)
    expect(socketAt(low, 36)).toBe(true)
    expect(socketAt(low, 46)).toBe(false)
  })

  it('teeth=0 leaves one plain mouth opening (still a hole)', () => {
    const f = fill({ skullTeethCount: 0 })
    expect(f.loops.length).toBe(5)
    // a plain dark opening: the mouth rect is one hole, no bone teeth inside it
    expect(holesIn(f, 30, 61, 50, 65)).toBeGreaterThan(40)
    expect(boneIn(f, 30, 61, 50, 65)).toBe(0)
  })

  it('crown flat changes the outline but stays in the box', () => {
    const pts = shapePathPoints('skull', 8, 8, 72, 72, { skullCrown: 'flat' })
    expect(pts.length).toBeGreaterThan(100)
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(7)
      expect(y).toBeGreaterThanOrEqual(7)
    }
  })

  it('mandible off closes the silhouette above the box bottom', () => {
    const withJaw = shapePathPoints('skull', 8, 8, 72, 72)
    const noJaw = shapePathPoints('skull', 8, 8, 72, 72, { skullMandible: false })
    const maxY = (pts: Array<[number, number]>) => Math.max(...pts.map(([, y]) => y))
    expect(maxY(noJaw)).toBeLessThan(maxY(withJaw))
  })

  it('style presets all render non-empty geometry', () => {
    for (const preset of [
      {
        skullCraniumWidth: 1.15,
        skullCraniumHeight: 0.66,
        skullEyeShape: 'oval' as const,
        skullNoseShape: 'heart' as const,
        skullTeethShape: 'rounded' as const,
        skullTeethCount: 6,
      },
      {
        skullCrown: 'flat' as const,
        skullEyeShape: 'angled' as const,
        skullEyeTilt: 0.9,
        skullNoseShape: 'slit' as const,
        skullTeethShape: 'fangs' as const,
        skullTeethCount: 10,
      },
      { skullEyeAsym: 0.6, skullTeethGap: 0.8, skullBrowRidge: 0.1, skullJawWidth: 0.4 },
    ]) {
      const { loops, inside } = fill(preset)
      expect(loops.length).toBe(5)
      expect(inside.size).toBeGreaterThan(50)
    }
  })
}
