import { DEFAULT_IMPORT_OPTIONS, type ImportOptions, type ImportPaletteChoice } from './importImage'
import { PALETTES } from './palettes'

/**
 * One-click recipes for the image-import dialog: each preset pins a complete ImportOptions snapshot
 * (palette + dither + processing) tuned for a look, the same idea as Dither Boy's preset library
 * but for still images.
 */

export interface ImportPreset {
  id: string
  /** Built-in palette id to sync the palette select with, when applicable */
  paletteId?: string
  opts: ImportOptions
}

const presetPalette = (id: string): ImportPaletteChoice => {
  const p = PALETTES.find((q) => q.id === id)
  return p ? { kind: 'preset', colors: [...p.colors] } : { kind: 'auto', colors: 16 }
}

const preset = (
  id: string,
  paletteId: string | undefined,
  patch: Partial<ImportOptions>,
): ImportPreset => ({
  id,
  paletteId,
  opts: {
    ...DEFAULT_IMPORT_OPTIONS,
    palette: paletteId ? presetPalette(paletteId) : DEFAULT_IMPORT_OPTIONS.palette,
    ...patch,
  },
})

/** Curated import presets in UI order. */
export const IMPORT_PRESETS: ImportPreset[] = [
  preset('gameboy', 'gameboy', { dither: 'bayer4', contrast: 10 }),
  preset('gameboy-pocket', 'gameboy-pocket', { dither: 'sierra-lite' }),
  preset('macintosh', 'macintosh', { dither: 'atkinson', ditherStrength: 90 }),
  // newsprint: denoise first, then a clustered print screen with punchy contrast
  preset('newspaper', 'bw', { dither: 'cluster-dot', preDenoise: 2, contrast: 15 }),
  preset('halftone-print', 'bw', { dither: 'halftone', preSmooth: 1, contrast: 10 }),
  preset('nes', 'nes', { dither: 'burkes' }),
  // spectrum color clash is tamed by blending ramp steps between palette entries
  preset('zx-spectrum', 'zx-spectrum', { dither: 'floyd', blend: 50 }),
  preset('cga-vaporwave', 'cga4', {
    dither: 'crosshatch',
    glowRadius: 6,
    glowIntensity: 45,
    aberration: 2,
    saturation: 20,
  }),
  preset('teletext', 'teletext', { dither: 'bayer8' }),
  preset('gruvbox', 'gruvbox', { dither: 'sierra', glowRadius: 5, glowIntensity: 35 }),
]
