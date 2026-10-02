import { describe, expect, it } from 'vitest'

import { hatchDistance, hatchFragments, stripPath } from './screen-lines.ts'

const sys = (
  over: Partial<Parameters<typeof hatchDistance>[0]>,
): Parameters<typeof hatchDistance>[0] => ({
  angle: 45,
  spacing: 4,
  phase: 0,
  waveAmp: 0,
  waveLen: 24,
  ...over,
})

describe('hatchDistance', () => {
  it('is periodic with the spacing and zero on centerlines', () => {
    const s = sys({})
    expect(hatchDistance(s, 1, 1)).toBeCloseTo(0, 6)
    expect(hatchDistance(s, 1 + 4, 1 + 4)).toBeCloseTo(0, 6)
    // perpendicular offset (0, ±2) from the centerline: |(0,2)·n| = 2·sin45°
    expect(hatchDistance(s, 1, 1 + 2)).toBeCloseTo(Math.SQRT2, 6)
    expect(hatchDistance(s, 1, 1 - 2)).toBeCloseTo(Math.SQRT2, 6)
  })

  it('agrees with the sampled centerline of a waved system', () => {
    const s = sys({ waveAmp: 1.5, waveLen: 10 })
    for (let t = 0; t < 40; t += 0.5) {
      // line k=0: normal offset phase + wave, walking along the line direction
      const rad = (s.angle * Math.PI) / 180
      const x =
        Math.cos(rad) * t -
        Math.sin(rad) * (s.phase + 1.5 * Math.sin((t * 2 * Math.PI) / s.waveLen))
      const y =
        Math.sin(rad) * t +
        Math.cos(rad) * (s.phase + 1.5 * Math.sin((t * 2 * Math.PI) / s.waveLen))
      expect(hatchDistance(s, x, y)).toBeLessThan(1e-6)
    }
  })
})

describe('stripPath', () => {
  it('emits exactly one closed subpath (even-odd safe)', () => {
    const d = stripPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
      ],
      1,
    )
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d.split('M').length).toBe(2) // one M command only
  })

  it('is symmetric around the centerline', () => {
    const d = stripPath(
      [
        { x: 2, y: 3 },
        { x: 12, y: 3 },
      ],
      0.5,
    )
    const nums = d.match(/-?[\d.]+/g) ?? []
    const ys = nums
      .filter((_, i) => i % 2 === 1)
      .map(Number)
      .sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(2.5, 3)
    expect(ys[ys.length - 1]).toBeCloseTo(3.5, 3)
    for (const v of ys) expect(v === ys[0] || v === ys[ys.length - 1]).toBe(true)
  })

  it('rejects degenerate input', () => {
    expect(stripPath([{ x: 1, y: 1 }], 1)).toBe('')
    expect(
      stripPath(
        [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
        1,
      ),
    ).toBe('')
    expect(
      stripPath(
        [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
        ],
        0,
      ),
    ).toBe('')
  })
})

describe('hatchFragments', () => {
  const inBox = (x: number, y: number, hw: number): boolean =>
    x - hw >= 0 && x + hw <= 20 && y - hw >= 0 && y + hw <= 20
  const scan = (
    over: Record<string, unknown>,
    inside?: (x: number, y: number, hw: number) => boolean,
  ) =>
    ({
      ox: 0,
      oy: 0,
      w: 20,
      h: 20,
      system: sys({}),
      widthAt: () => 2,
      inside: inside ?? inBox,
      step: 0.5,
      maxLines: 400,
      maxRuns: 6000,
      ...over,
    }) as Parameters<typeof hatchFragments>[0]

  it('draws one strip per interior line across an open box', () => {
    const d = hatchFragments(scan({ system: sys({ angle: 0, spacing: 4 }) }))
    const lines = d.split('M').length - 1
    expect(lines).toBe(4) // lines at y = 4, 8, 12, 16 fit with hw = 1
  })

  it('clips strips to the inside test', () => {
    const d = hatchFragments(
      scan({ system: sys({ angle: 0, spacing: 5 }) }, (_x, y, hw) => y + hw <= 10),
    )
    const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
    const ys = nums.filter((_, i) => i % 2 === 1)
    for (const y of ys) expect(y).toBeLessThanOrEqual(10 + 1e-6)
    expect(d.length).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    const a = hatchFragments(scan({}))
    expect(a).toBe(hatchFragments(scan({})))
    expect(a.length).toBeGreaterThan(0)
  })

  it('waved lines carry more vertices than straight ones', () => {
    const straight = hatchFragments(scan({ system: sys({ angle: 0 }) }))
    const waved = hatchFragments(
      scan({ system: sys({ angle: 0, waveAmp: 1, waveLen: 8 }), step: 0.5 }),
    )
    expect(waved.length).toBeGreaterThan(straight.length)
  })

  it('respects the run budget', () => {
    const d = hatchFragments(scan({ maxRuns: 2, system: sys({ angle: 0, spacing: 2 }) }))
    expect(d.split('M').length - 1).toBeLessThanOrEqual(2)
  })

  it('offset boxes keep their coordinate space', () => {
    const d = hatchFragments(
      scan(
        {
          ox: 100,
          oy: 200,
          system: sys({ angle: 0, spacing: 4 }),
        },
        (x, y, hw) => x - hw >= 100 && x + hw <= 120 && y - hw >= 200 && y + hw <= 220,
      ),
    )
    expect(d).toContain('2')
    const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
    const ys = nums.filter((_, i) => i % 2 === 1)
    for (const y of ys) expect(y).toBeGreaterThanOrEqual(199)
  })
})
