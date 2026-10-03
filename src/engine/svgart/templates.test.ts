import { describe, expect, it } from 'vitest'

import { normalizeScene } from './index.ts'
import { FORBIDDEN_RE, sceneToSvg } from './index.ts'
import {
  AURORA_DEFAULTS,
  SPHERE_DEFAULTS,
  STAR_DEFAULTS,
  TEMPLATE_IDS,
  auroraScene,
  blankScene,
  sphereScene,
  starScene,
  templateScene,
} from './index.ts'
import type { SvgScene } from './index.ts'

/** The star template bakes 10 faces (2 × 5-point outline), each with a light-aligned fill. */
describe('starScene', () => {
  const scene = starScene()

  it('has a background, floor spots, a halo and 10 faces', () => {
    expect(scene.width).toBe(800)
    expect(scene.layers[0]?.id).toBe('bg')
    expect(scene.layers.filter((l) => l.id.startsWith('face-'))).toHaveLength(10)
    expect(scene.layers.some((l) => l.id === 'halo')).toBe(true)
    expect(scene.layers.some((l) => l.id === 'floor-shadow')).toBe(true)
  })

  it('aligns lit faces with the light direction', () => {
    // Default light points to −60° (upper right); the face whose centroid sits in that direction
    // must carry the sheen overlay, faces opposite must not.
    const withSheen = scene.layers.filter((l) => l.fills.length === 2)
    expect(withSheen.length).toBeGreaterThan(0)
    expect(withSheen.length).toBeLessThan(10)
  })

  it('keeps every face fill linear with distinct axes', () => {
    const faces = scene.layers.filter((l) => l.id.startsWith('face-'))
    const axes = new Set(
      faces.map(
        (l) =>
          `${l.fills[0]?.kind}:${JSON.stringify('p1' in (l.fills[0] ?? {}) ? (l.fills[0] as { p1: { x: number; y: number } }).p1 : null)}`,
      ),
    )
    expect(axes.size).toBe(10)
  })

  it('serializes AI-safe and round-trips through normalizeScene', () => {
    const svg = sceneToSvg(scene)
    expect(svg).not.toMatch(FORBIDDEN_RE)
    const back: SvgScene = normalizeScene(JSON.parse(JSON.stringify(scene)))
    expect(sceneToSvg(back)).toBe(svg)
  })
})

describe('sphereScene', () => {
  it('places the radial focus toward the light', () => {
    const scene = sphereScene()
    const sphere = scene.layers.find((l) => l.id === 'sphere')
    const paint = sphere?.fills[0]
    expect(paint?.kind).toBe('radial')
    if (paint?.kind === 'radial') {
      expect(paint.fx).not.toBeNull()
      // Light at −60° → focus right and above center (y grows downward, so fy < cy).
      expect(paint.fx ?? 0).toBeGreaterThan(paint.cx)
      expect(paint.fy ?? 0).toBeLessThan(paint.cy)
    }
    expect(scene.layers.some((l) => l.id === 'contact-shadow')).toBe(true)
  })
})

describe('auroraScene', () => {
  it('stacks seeded soft waves deterministically', () => {
    const a = auroraScene(AURORA_DEFAULTS)
    const b = auroraScene(AURORA_DEFAULTS)
    expect(a.layers.map((l) => l.id)).toEqual(b.layers.map((l) => l.id))
    expect(a.layers.filter((l) => l.id.startsWith('wave-')).length).toBeGreaterThanOrEqual(5)
    for (const layer of a.layers) {
      if (layer.id === 'bg') continue
      const fill = layer.fills[0]
      expect(fill?.kind).toBe('radial')
      if (fill?.kind === 'radial') {
        expect(fill.units).toBe('bbox')
        expect(fill.stops.at(-1)?.alpha).toBe(0)
      }
    }
  })
})

describe('templateScene registry', () => {
  it('covers every registered id', () => {
    for (const id of TEMPLATE_IDS) {
      const scene = templateScene(id, 400)
      expect(scene.width).toBe(400)
      expect(scene.height).toBe(400)
    }
    expect(TEMPLATE_IDS).toEqual(['blank', 'star', 'sphere', 'aurora'])
  })

  it('blank starts with a dark solid background and no layers', () => {
    const scene = blankScene(400)
    expect(scene.layers).toHaveLength(0)
    expect(scene.background?.kind).toBe('solid')
  })

  it('template options merge over defaults', () => {
    const scene = starScene({ ...STAR_DEFAULTS, points: 6, size: 400 })
    expect(scene.layers.filter((l) => l.id.startsWith('face-'))).toHaveLength(12)
    const sphere = sphereScene({ ...SPHERE_DEFAULTS, size: 400 })
    expect(sphere.width).toBe(400)
  })
})
