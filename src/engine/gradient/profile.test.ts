import { describe, expect, it } from 'vitest'

import { buildProfile, simplifyProfile, type ProfilePoint } from './profile.ts'

function gray(v: number): ProfilePoint {
  return { t: v, color: { r: v, g: v, b: v } }
}

describe('buildProfile', () => {
  it('uses the weighted median, resisting outliers', () => {
    const n = 21
    const ts = new Float32Array(n)
    const colors = new Float32Array(n * 3)
    const weights = new Float32Array(n).fill(1)
    for (let i = 0; i < n; i++) {
      ts[i] = i / (n - 1)
      // one hot outlier among mostly-dark samples
      colors[i * 3] = i === 10 ? 1 : 0.1
      colors[i * 3 + 1] = 0.1
      colors[i * 3 + 2] = 0.1
    }
    const profile = buildProfile(ts, colors, weights, 3)
    expect(profile).toHaveLength(3)
    // every bin holds the dark median, not the outlier mean
    for (const p of profile) expect(p.color.r).toBeCloseTo(0.1)
  })

  it('places bin t at the sample mean inside the bin', () => {
    const ts = new Float32Array([0.05, 0.15])
    const colors = new Float32Array([0, 0, 0, 1, 1, 1])
    const weights = new Float32Array([1, 1])
    const profile = buildProfile(ts, colors, weights, 10)
    expect(profile).toHaveLength(2)
    expect(profile[0].t).toBeCloseTo(0.05)
    expect(profile[1].t).toBeCloseTo(0.15)
  })
})

describe('simplifyProfile', () => {
  it('keeps the kinks of a piecewise-linear gray ramp', () => {
    const points: ProfilePoint[] = []
    for (let i = 0; i <= 100; i++) {
      const t = i / 100
      const v = t <= 0.5 ? t : t <= 0.8 ? 0.5 : 0.5 + (t - 0.8)
      points.push({ t, color: { r: v, g: v, b: v } })
    }
    const offsets = simplifyProfile(points, 1, 8)
    expect(offsets).toHaveLength(4)
    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBeCloseTo(0.5, 1)
    expect(offsets[2]).toBeCloseTo(0.8, 1)
    expect(offsets[3]).toBe(1)
  })

  it('raises the tolerance until the stop budget is met', () => {
    // a curved gray ramp needs many vertices at a tiny tolerance, two at a coarse one
    const points: ProfilePoint[] = []
    for (let i = 0; i <= 100; i++) {
      const t = i / 100
      const v = t ** 1.8
      points.push({ t, color: { r: v, g: v, b: v } })
    }
    expect(simplifyProfile(points, 0.001, 8).length).toBeGreaterThan(2)
    expect(simplifyProfile(points, 0.001, 2)).toEqual([0, 1])
  })

  it('returns a two-stop ramp for a linear profile', () => {
    const points: ProfilePoint[] = [gray(0), gray(0.5), gray(1)]
    expect(simplifyProfile(points, 1, 8)).toEqual([0, 1])
  })
})
