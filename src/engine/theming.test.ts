import { describe, expect, it } from 'vitest'

import { nextThemePref, resolvedTheme, THEME_PREF_CYCLE } from '../state/editor.store'
import { STAGE_THEMES } from './doc.ts'

describe('theming', () => {
  const themeNames = Object.keys(STAGE_THEMES) as (keyof typeof STAGE_THEMES)[]

  it('provides full stage theme objects for every theme with the same keys', () => {
    const keys = Object.keys(STAGE_THEMES.dark)
    expect(keys.length).toBeGreaterThanOrEqual(6)
    for (const name of themeNames) {
      expect(Object.keys(STAGE_THEMES[name])).toEqual(keys)
    }
  })

  it('gives every theme distinct stage values (against copy-paste drift)', () => {
    // the hover core is intentionally theme-invariant: a white core over a
    // theme-specific dark halo reads on any background
    const themeInvariant = new Set(['hover'])
    for (const a of themeNames) {
      for (const b of themeNames) {
        if (a >= b) continue
        for (const k of Object.keys(STAGE_THEMES.dark) as (keyof typeof STAGE_THEMES.dark)[]) {
          if (themeInvariant.has(k)) continue
          expect(`${a}.${k}: ${STAGE_THEMES[a][k]}`).not.toBe(`${b}.${k}: ${STAGE_THEMES[b][k]}`)
        }
      }
    }
  })

  it('resolves explicit preferences directly', () => {
    for (const name of themeNames) {
      expect(resolvedTheme(name)).toBe(name)
    }
    // 'auto' depends on the environment; just require a valid resolution
    expect(['dark', 'paper']).toContain(resolvedTheme('auto'))
  })

  it('cycles every preference exactly once back to the start', () => {
    const visited = new Set<string>()
    let pref = THEME_PREF_CYCLE[0]
    for (let i = 0; i < THEME_PREF_CYCLE.length; i++) {
      visited.add(pref)
      pref = nextThemePref(pref)
    }
    expect(pref).toBe(THEME_PREF_CYCLE[0])
    expect(visited.size).toBe(THEME_PREF_CYCLE.length)
  })
})
