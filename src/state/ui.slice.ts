import { clampPngSide } from '../engine/output/png.ts'
import type { State } from './editor.store.ts'

export type ThemePref =
  | 'dark'
  | 'paper'
  | 'oled'
  | 'nord'
  | 'tokyo-night'
  | 'vscode'
  | 'catppuccin'
  | 'auto'
export type ResolvedTheme = Exclude<ThemePref, 'auto'>

/** Editor-palette themes in cycling order: darks, lights, then system auto. */
export const THEME_PREF_CYCLE: readonly ThemePref[] = [
  'dark',
  'vscode',
  'oled',
  'nord',
  'catppuccin',
  'paper',
  'tokyo-night',
  'auto',
]

/** Next preference in the cycle (the overflow menu's one-row theme switching). */
export function nextThemePref(pref: ThemePref): ThemePref {
  const i = THEME_PREF_CYCLE.indexOf(pref)
  return THEME_PREF_CYCLE[(i + 1) % THEME_PREF_CYCLE.length] ?? 'dark'
}

export function resolvedTheme(pref: ThemePref): ResolvedTheme {
  if (pref !== 'auto') return pref
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'paper' : 'dark'
  } catch {
    return 'dark'
  }
}

const LANG_KEY = 'glyph.lang'
const THEME_KEY = 'glyph.theme'
const RECENT_KEY = 'glyph.recent'
const RAIL_KEY = 'glyph.rail'
const FAB_KEY = 'glyph.fab'
const GRID_KEY = 'glyph.grid'
const EMPHASIS_KEY = 'glyph.gridEmphasis'
const DIFFUSION_KEY = 'glyph.diffusionGuides'

function initialThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v !== null && (THEME_PREF_CYCLE as readonly string[]).includes(v)) return v as ThemePref
  } catch {
    /* ignore */
  }
  return 'dark'
}

function initialLang(): 'en' | 'ru' {
  try {
    const v = localStorage.getItem(LANG_KEY)
    if (v === 'ru' || v === 'en') return v
  } catch {
    /* ignore */
  }
  return 'ru'
}

function initialPanelCollapsed(): boolean {
  return false // view-level state lives in the project route's search params, not in storage
}

function initialFabOpen(): boolean {
  try {
    return localStorage.getItem(FAB_KEY) !== '0'
  } catch {
    /* ignore */
  }
  return true
}

function initialRailOpen(): boolean {
  try {
    const v = localStorage.getItem(RAIL_KEY)
    if (v === '0') return false
    if (v === '1') return true
  } catch {
    /* ignore */
  }
  return true
}

function initialRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const arr = raw ? JSON.parse(raw) : []
    if (Array.isArray(arr)) return arr.filter((c) => typeof c === 'string')
  } catch {
    /* ignore */
  }
  return []
}

function initialShowGrid(): boolean {
  try {
    return localStorage.getItem(GRID_KEY) !== '0'
  } catch {
    /* ignore */
  }
  return true
}

function initialGridEmphasis(): number {
  try {
    const v = Number(localStorage.getItem(EMPHASIS_KEY))
    if (Number.isFinite(v) && v >= 0 && v <= 16) return Math.round(v)
  } catch {
    /* ignore */
  }
  return 0
}

function initialDiffusionGuides(): boolean {
  try {
    return localStorage.getItem(DIFFUSION_KEY) === '1'
  } catch {
    /* ignore */
  }
  return false
}

/** The UI slice: appearance, layout and canvas-area chrome (outside undo history). */
export interface UiSlice {
  lang: 'en' | 'ru'
  themePref: ThemePref
  resolvedTheme: ResolvedTheme
  showGrid: boolean
  /** Graph-paper major lines every N cells on the square grid; 0/1 = off */
  gridEmphasis: number
  setGridEmphasis: (v: number) => void
  /** Metaball diffusion aids: threshold contour, half-cell grid and kernel ring */
  showDiffusionGuides: boolean
  /** Left tool rail is expanded (names shown); false = collapsed to icon-only strip */
  railOpen: boolean
  /** Right settings panel collapsed to a section-icon strip (desktop only) */
  panelCollapsed: boolean
  /** Quick-settings fab panel next to the tool rail is expanded (desktop only) */
  fabOpen: boolean
  /** PNG export size in px; null = auto (canvas × 8, clamped) */
  pngWidth: number | null
  pngHeight: number | null
  exportBg: boolean
  recent: string[]
  /** On: picking a palette recolors the canvas; off: it only offers colors to paint with */
  paletteAutoApply: boolean
  /** Bumped to ask CanvasStage to zoom so the whole canvas is visible */
  fitSignal: number
  /** The dedicated node-editor space over the canvas area */
  nodeEditorOpen: boolean
  /**
   * How the node editor shares space with the canvas: `split` puts them side by side with a
   * draggable divider (live result feedback), `overlay` covers the canvas.
   */
  nodeEditorMode: 'split' | 'overlay'
  /** Editor width as a fraction of the canvas row (split mode, 0.25..0.8) */
  nodeEditorSplit: number
  setLang: (lang: 'en' | 'ru') => void
  setThemePref: (pref: ThemePref) => void
  setShowGrid: (v: boolean) => void
  setShowDiffusionGuides: (v: boolean) => void
  toggleRail: () => void
  togglePanelCollapsed: () => void
  toggleFab: () => void
  setPngWidth: (v: number | null) => void
  setPngHeight: (v: number | null) => void
  setExportBg: (v: boolean) => void
  setPaletteAutoApply: (v: boolean) => void
  pushRecent: (hex: string) => void
  requestFit: () => void
  openNodeEditor: () => void
  closeNodeEditor: () => void
  setNodeEditorMode: (mode: 'split' | 'overlay') => void
  setNodeEditorSplit: (fraction: number) => void
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

/**
 * Appearance + canvas chrome state and actions, composed into the main store. Kept apart so
 * editor.store.ts stays under the file-size ratchet.
 */
export function createUiSlice({ set }: SliceApi): UiSlice {
  return {
    lang: initialLang(),
    themePref: initialThemePref(),
    resolvedTheme: resolvedTheme(initialThemePref()),
    showGrid: initialShowGrid(),
    gridEmphasis: initialGridEmphasis(),
    showDiffusionGuides: initialDiffusionGuides(),
    railOpen: initialRailOpen(),
    panelCollapsed: initialPanelCollapsed(),
    fabOpen: initialFabOpen(),
    pngWidth: null,
    pngHeight: null,
    exportBg: true,
    recent: initialRecent(),
    paletteAutoApply: true,
    fitSignal: 0,
    nodeEditorOpen: false,
    nodeEditorMode: 'split',
    nodeEditorSplit: 0.45,

    setLang: (lang) => {
      try {
        localStorage.setItem(LANG_KEY, lang)
      } catch {
        /* ignore */
      }
      set({ lang })
    },
    setThemePref: (pref) => {
      try {
        localStorage.setItem(THEME_KEY, pref)
      } catch {
        /* ignore */
      }
      set({ themePref: pref, resolvedTheme: resolvedTheme(pref) })
    },
    setShowGrid: (showGrid) => {
      try {
        localStorage.setItem(GRID_KEY, showGrid ? '1' : '0')
      } catch {
        /* ignore */
      }
      set({ showGrid })
    },
    setShowDiffusionGuides: (showDiffusionGuides) => {
      try {
        localStorage.setItem(DIFFUSION_KEY, showDiffusionGuides ? '1' : '0')
      } catch {
        /* ignore */
      }
      set({ showDiffusionGuides })
    },
    setGridEmphasis: (gridEmphasis) => {
      const v = Math.max(0, Math.round(gridEmphasis))
      try {
        localStorage.setItem(EMPHASIS_KEY, String(v))
      } catch {
        /* ignore */
      }
      set({ gridEmphasis: v })
    },
    togglePanelCollapsed: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
    toggleFab: () =>
      set((s) => {
        const fabOpen = !s.fabOpen
        try {
          localStorage.setItem(FAB_KEY, fabOpen ? '1' : '0')
        } catch {
          /* ignore */
        }
        return { fabOpen }
      }),
    toggleRail: () =>
      set((s) => {
        const railOpen = !s.railOpen
        try {
          localStorage.setItem(RAIL_KEY, railOpen ? '1' : '0')
        } catch {
          /* ignore */
        }
        // refit so the canvas re-centers into the freed/claimed width
        return { railOpen, fitSignal: s.fitSignal + 1 }
      }),
    setPngWidth: (v) => set({ pngWidth: v === null ? null : clampPngSide(v) }),
    setPngHeight: (v) => set({ pngHeight: v === null ? null : clampPngSide(v) }),
    setExportBg: (exportBg) => set({ exportBg }),
    setPaletteAutoApply: (paletteAutoApply) => set({ paletteAutoApply }),
    pushRecent: (hex) =>
      set((s) => {
        const norm = hex.toLowerCase()
        const recent = [norm, ...s.recent.filter((c) => c !== norm)].slice(0, 12)
        try {
          localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
        } catch {
          /* ignore */
        }
        return { recent }
      }),
    requestFit: () => set((s) => ({ fitSignal: s.fitSignal + 1 })),
    openNodeEditor: () => set({ nodeEditorOpen: true }),
    closeNodeEditor: () => set({ nodeEditorOpen: false }),
    setNodeEditorMode: (mode) => set({ nodeEditorMode: mode }),
    setNodeEditorSplit: (fraction) =>
      set({ nodeEditorSplit: Math.max(0.25, Math.min(0.8, fraction)) }),
  }
}
