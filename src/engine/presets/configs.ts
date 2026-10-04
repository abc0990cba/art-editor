/** Shared data shapes of the built-in editor presets: full configs and terse seeds. */

import type {
  Connectivity,
  ExtrudeSettings,
  GridType,
  MetaballSettings,
  PixelStyle,
  RenderMode,
  StyleScope,
  SubDetail,
  SymmetryState,
  TextureSettings,
} from '../core/doc'

export interface PresetConfig {
  v: 1
  gridType: GridType
  cols: number
  rows: number
  sub: SubDetail
  /** Radial grid only: ~equal cells per ring */
  radialEven: boolean
  /** Whole-grid rotation in degrees; absent when 0 */
  gridRotation?: number
  palette: string[]
  style: PixelStyle
  renderMode: RenderMode
  connectivity: Connectivity
  metaball: MetaballSettings
  texture: TextureSettings
  extrude: ExtrudeSettings
  styleScope?: StyleScope
  bg: string
  connectorWidth: number
  symmetry: SymmetryState
}

export interface EditorPreset {
  id: string
  name: string
  config: PresetConfig
}

/** Terse input for a built-in preset: merged over the default config, then validated. */
export type PresetInput = {
  style?: Partial<PixelStyle>
  metaball?: Partial<MetaballSettings>
  texture?: Partial<TextureSettings>
  symmetry?: Partial<SymmetryState>
} & Partial<Omit<PresetConfig, 'v' | 'style' | 'metaball' | 'texture' | 'symmetry'>>

/** Data-only seed of a built-in preset (name + id + terse config input). */
export interface PresetSeed {
  name: string
  id: string
  input: PresetInput
}

// Sweetie 16 (same canonical colors as the palette preset of that name).
export const SWEETIE_16 = [
  '#1a1c2c',
  '#5d275d',
  '#b13e53',
  '#ef7d57',
  '#ffcd75',
  '#a7f070',
  '#38b764',
  '#257179',
  '#29366f',
  '#3b5dc9',
  '#41a6f6',
  '#73eff7',
  '#f4f4f4',
  '#94b0c2',
  '#566c86',
  '#333c57',
]
