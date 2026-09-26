/** Curated classic palettes. Hex values are the canonical published colors. */

import { CLASSIC_12, PALETTES } from './palettes-data.ts'

export type { PalettePreset } from './palettes-data.ts'
export { CLASSIC_12, PALETTES }

/** The preset a document palette currently matches, if any. */
export function matchedPresetId(palette: string[]): string | null {
  for (const p of PALETTES) {
    if (p.colors.length !== palette.length) continue
    if (p.colors.every((c, i) => c === palette[i].toLowerCase())) return p.id
  }
  return null
}
