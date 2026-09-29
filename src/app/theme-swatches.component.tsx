import type { ReactElement } from 'react'

import type { ThemePref } from '../state/editor.store.ts'

/**
 * Four preview colors per editor theme — app background, panel, accent hue, accent text — copied
 * from the theme blocks in index.css so the selector can show each palette without mounting it.
 * `auto` reads dark-left / light-right: both halves it switches between.
 */
export const THEME_SWATCHES: Record<ThemePref, readonly string[]> = {
  dark: ['#131316', '#17171b', '#818cf8', '#c7d2fe'],
  vscode: ['#1f1f1f', '#181818', '#268dfc', '#6cb8f7'],
  oled: ['#000000', '#0b0b0d', '#818cf8', '#c7d2fe'],
  nord: ['#2e3440', '#333b4a', '#88c0d0', '#8fbcbb'],
  catppuccin: ['#1e1e2e', '#181825', '#b4befe', '#c7d0fe'],
  paper: ['#f4f0e5', '#efebdf', '#5b93c4', '#205d95'],
  'tokyo-night': ['#e1e2e7', '#d6d8e1', '#2e7de9', '#3760bf'],
  auto: ['#17171b', '#818cf8', '#efebdf', '#205d95'],
}

/** The theme's four key colors as one thin strip (palette-preset row pattern). */
export function ThemeSwatchStrip({ pref }: { pref: ThemePref }): ReactElement {
  return (
    <span className="border-line flex h-3 w-14 shrink-0 overflow-hidden rounded-sm border">
      {THEME_SWATCHES[pref].map((c) => (
        <span key={c} className="flex-1" style={{ background: c }} />
      ))}
    </span>
  )
}
