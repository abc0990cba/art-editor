import { describe, expect, it } from 'vitest'

import { MAX_SIZE, defaultDoc } from './doc.ts'
import {
  BUILTIN_PRESETS,
  configMatchesState,
  normalizePresetConfig,
  presetFromDoc,
} from './presets.ts'

const HEX = /^#[0-9a-f]{3,8}$/

describe('built-in presets', () => {
  it('are 20..48 with unique ids and sane configs', () => {
    expect(BUILTIN_PRESETS.length).toBeGreaterThanOrEqual(20)
    expect(BUILTIN_PRESETS.length).toBeLessThanOrEqual(48)
    expect(new Set(BUILTIN_PRESETS.map((p) => p.id)).size).toBe(BUILTIN_PRESETS.length)
    for (const p of BUILTIN_PRESETS) {
      expect(p.id.startsWith('builtin.')).toBe(true)
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.config.palette.length).toBeGreaterThan(0)
      for (const c of p.config.palette) expect(c).toMatch(HEX)
      expect(p.config.cols).toBeGreaterThanOrEqual(1)
      expect(p.config.rows).toBeGreaterThanOrEqual(1)
      expect([1, 2, 3]).toContain(p.config.sub)
      expect(p.config.bg).toMatch(HEX)
      expect(p.config.connectorWidth).toBeGreaterThanOrEqual(0.05)
      expect(p.config.metaball.quality).toBeGreaterThanOrEqual(2)
      expect(p.config.symmetry.n).toBeGreaterThanOrEqual(2)
      expect(p.config.symmetry.n).toBeLessThanOrEqual(24)
    }
  })

  it('cover every grid type and render mode', () => {
    for (const gt of ['square', 'hex', 'triangle', 'radial']) {
      expect(BUILTIN_PRESETS.some((p) => p.config.gridType === gt)).toBe(true)
    }
    for (const rm of ['pixels', 'outline', 'metaball']) {
      expect(BUILTIN_PRESETS.some((p) => p.config.renderMode === rm)).toBe(true)
    }
  })

  it('survive normalization unchanged', () => {
    for (const p of BUILTIN_PRESETS) {
      expect(normalizePresetConfig(p.config)).toEqual(p.config)
    }
  })
})

describe('normalizePresetConfig', () => {
  it('falls back to defaults for garbage input', () => {
    const cfg = normalizePresetConfig({
      gridType: 'spiral',
      renderMode: 'sparkles',
      connectivity: 'telepathy',
      sub: 9,
      palette: ['zzz', '#ABCDEF'],
      symmetry: { mode: 'spiral', n: 999 },
    })
    expect(cfg.gridType).toBe('square')
    expect(cfg.renderMode).toBe('pixels')
    expect(cfg.connectivity).toBe('edge')
    expect(cfg.sub).toBe(1)
    expect(cfg.palette).toEqual(['#abcdef'])
    expect(cfg.symmetry.mode).toBe('none')
    expect(cfg.symmetry.n).toBe(24)
  })

  it('clamps out-of-range numbers', () => {
    const cfg = normalizePresetConfig({
      cols: 5000,
      rows: -5,
      connectorWidth: 12,
      style: { radius: 9, sizeX: -1 },
      metaball: { strength: 1000, quality: 99 },
    })
    expect(cfg.cols).toBe(MAX_SIZE)
    expect(cfg.rows).toBe(1)
    expect(cfg.connectorWidth).toBe(1)
    expect(cfg.style.radius).toBe(0.5)
    expect(cfg.style.sizeX).toBe(0.05)
    expect(cfg.metaball.strength).toBe(100)
    expect(cfg.metaball.quality).toBe(8)
  })

  it('clamps and validates texture settings', () => {
    const cfg = normalizePresetConfig({
      texture: {
        effect: 'sparkle',
        amount: 500,
        scale: 99,
        sizeMin: 99,
        sizeMax: 0.01,
        shape: 'sparkle',
        edge: -5,
        dist: 'spiral',
        gap: 9,
        angle: -5,
        seed: -3,
      },
    })
    expect(cfg.texture.effect).toBe('none')
    expect(cfg.texture.amount).toBe(100)
    expect(cfg.texture.scale).toBe(8)
    expect(cfg.texture.sizeMin).toBe(0.6)
    expect(cfg.texture.sizeMax).toBe(0.05)
    expect(cfg.texture.shape).toBe('square')
    expect(cfg.texture.edge).toBe(0)
    expect(cfg.texture.dist).toBe('scatter')
    expect(cfg.texture.gap).toBe(0.45)
    expect(cfg.texture.angle).toBe(0)
    expect(cfg.texture.seed).toBe(0)
    const on = normalizePresetConfig({
      texture: {
        effect: 'grunge',
        amount: 42,
        scale: 1.5,
        sizeMin: 0.15,
        sizeMax: 0.5,
        shape: 'chip',
        edge: 55,
        dist: 'perlin',
        gap: 0.25,
        angle: 120,
        seed: 77,
      },
    })
    expect(on.texture).toEqual({
      effect: 'grunge',
      amount: 42,
      scale: 1.5,
      sizeMin: 0.15,
      sizeMax: 0.5,
      shape: 'chip',
      edge: 55,
      dist: 'perlin',
      gap: 0.25,
      angle: 120,
      seed: 77,
      jitter: 0,
      variation: 0,
      wobble: 0,
      merge: 0,
      dropout: 0,
      spray: 0,
      ramp: 0,
    })
    // legacy `size` migrates into the min/max range
    const legacy = normalizePresetConfig({ texture: { effect: 'grain', size: 1.4 } })
    expect(legacy.texture.sizeMin).toBeCloseTo(0.252, 3)
    expect(legacy.texture.sizeMax).toBeCloseTo(0.49, 3)
  })

  it('returns defaults for non-objects', () => {
    expect(normalizePresetConfig(null).cols).toBe(32)
    expect(normalizePresetConfig(42).palette.length).toBeGreaterThan(0)
  })
})

describe('presetFromDoc / configMatchesState', () => {
  it('matches the document it was snapshotted from', () => {
    const doc = { ...defaultDoc(), cols: 20, rows: 18, bg: '#112233' }
    const sym = {
      mode: 'quad' as const,
      n: 8,
      cell: 16,
      showGuides: true,
      fill: 100,
      phase: 0,
      twist: 0,
    }
    const cfg = presetFromDoc(doc, sym)
    expect(configMatchesState(cfg, doc, sym)).toBe(true)
  })

  it('stops matching when any captured parameter changes', () => {
    const doc = defaultDoc()
    const sym = {
      mode: 'none' as const,
      n: 8,
      cell: 16,
      showGuides: true,
      fill: 100,
      phase: 0,
      twist: 0,
    }
    const cfg = presetFromDoc(doc, sym)
    expect(configMatchesState(cfg, { ...doc, bg: '#000000' }, sym)).toBe(false)
    expect(configMatchesState(cfg, { ...doc, cols: 40 }, sym)).toBe(false)
    expect(configMatchesState(cfg, { ...doc, palette: ['#000000'] }, sym)).toBe(false)
    expect(configMatchesState(cfg, doc, { ...sym, mode: 'mirrorX' })).toBe(false)
    expect(configMatchesState(cfg, { ...doc, renderMode: 'outline' }, sym)).toBe(false)
    expect(
      configMatchesState(cfg, { ...doc, texture: { ...doc.texture, effect: 'grain' } }, sym),
    ).toBe(false)
  })
})
