import { describe, expect, it } from 'vitest'

import { resolvedTheme } from '../state/store'
import { STAGE_THEMES } from './doc'

describe('theming', () => {
  it('provides full stage theme objects for both themes with distinct values', () => {
    const keys = Object.keys(STAGE_THEMES.dark)
    expect(keys).toEqual(Object.keys(STAGE_THEMES.light))
    expect(keys.length).toBeGreaterThanOrEqual(6)
    // the hover core is intentionally theme-invariant: a white core over a
    // theme-specific dark halo reads on any background
    const themeInvariant = new Set(['hover'])
    for (const k of keys as Array<keyof typeof STAGE_THEMES.dark>) {
      if (themeInvariant.has(k)) continue
      expect(STAGE_THEMES.dark[k]).not.toBe(STAGE_THEMES.light[k])
    }
  })

  it('resolves explicit preferences directly', () => {
    expect(resolvedTheme('dark')).toBe('dark')
    expect(resolvedTheme('light')).toBe('light')
    // 'auto' depends on the environment; just require a valid resolution
    expect(['dark', 'light']).toContain(resolvedTheme('auto'))
  })
})
