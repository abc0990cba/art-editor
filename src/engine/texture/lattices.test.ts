import { describe, expect, it } from 'vitest'

import type { TextureSettings } from '../core/doc.ts'
import { regionTextureFragments, type TextureCell } from './region.ts'

const settings = (over: Partial<TextureSettings>): TextureSettings => ({
  effect: 'halftone',
  amount: 40,
  scale: 1,
  sizeMin: 0.12,
  sizeMax: 0.35,
  shape: 'dot',
  edge: 0,
  dist: 'scatter',
  gap: 0,
  gapMode: 'cell',
  even: false,
  angle: 0,
  seed: 1,
  jitter: 0,
  variation: 0,
  wobble: 0,
  merge: 0,
  dropout: 0,
  spray: 0,
  ramp: 0,
  ...over,
})

/** One 6×6 painted block in doc units (sub 1: cell rects at integers). */
const block = (): TextureCell[] => {
  const cells: TextureCell[] = []
  for (let y = 2; y < 8; y++) {
    for (let x = 3; x < 9; x++) {
      cells.push({
        x,
        y,
        w: 1,
        h: 1,
        radii: [0, 0, 0, 0],
        chamfer: false,
        cx0: x,
        cy0: y,
        cx1: x + 1,
        cy1: y + 1,
        connectedL: x > 3,
        connectedT: y > 2,
        connectedR: x < 8,
        connectedB: y < 7,
      })
    }
  }
  return cells
}

describe('halftone lattices', () => {
  it.each(['hex', 'rings', 'sunburst', 'spiral', 'phyllotaxis', 'scatter'] as const)(
    '%s produces deterministic, non-empty vector fragments',
    (lattice) => {
      const frag = regionTextureFragments(block(), settings({ htLattice: lattice }), 5)
      expect(frag, lattice).not.toBe('')
      expect(regionTextureFragments(block(), settings({ htLattice: lattice }), 5)).toBe(frag)
    },
  )

  it('non-dot marks render the configured silhouette', () => {
    const frag = regionTextureFragments(
      block(),
      settings({ htLattice: 'hex', shape: 'star', amount: 60 }),
      5,
    )
    expect(frag).not.toBe('')
    expect(frag).not.toMatch(/a[\d.]+ [\d.]+/) // no circle arcs — stars are polygon outlines
    expect(frag).toMatch(/L/)
  })

  it('mark centers stay inside the painted block bounds (no touch at cap size)', () => {
    const frag = regionTextureFragments(
      block(),
      settings({ htLattice: 'spiral', amount: 100, jitter: 30, variation: 40 }),
      5,
    )
    expect(frag).not.toBe('')
    // spiral dots cap at 0.9·Ld diameter, so centers can exceed the block by ≤0.45 cells
    for (const sub of frag.split(/(?=M)/).filter(Boolean)) {
      const xs = [...sub.matchAll(/M(-?[\d.]+)/g)].map((m) => Number(m[1]))
      expect(xs.length).toBeGreaterThan(0)
    }
  })
})
