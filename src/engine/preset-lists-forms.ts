/** Built-in form study presets: one cell shape per preset, with tuned size and palette. */

import { DEFAULT_SHAPE_PARAMS, type CellShapeId, type ShapeParams } from './cell-shapes.ts'
import type { PresetSeed } from './preset-configs'

interface FormSpec {
  name: string
  id: string
  shape: CellShapeId
  palette: string[]
  bg: string
  cols?: number
  /** SizeX = sizeY cell scale */
  size?: number
  radius?: number
  toneSize?: boolean
  toneSizeMin?: number
  params?: Partial<ShapeParams>
}

const formPreset = (s: FormSpec): PresetSeed => ({
  name: s.name,
  id: s.id,
  input: {
    gridType: 'square',
    cols: s.cols ?? 24,
    rows: s.cols ?? 24,
    sub: 1,
    palette: s.palette,
    renderMode: 'pixels',
    connectivity: 'edge',
    style: {
      shape: s.shape,
      shapeParams: { ...DEFAULT_SHAPE_PARAMS, ...s.params },
      radius: s.radius ?? 0,
      toneSize: s.toneSize ?? false,
      toneSizeMin: s.toneSizeMin ?? 0.15,
      sizeX: s.size ?? 1,
      sizeY: s.size ?? 1,
    },
    bg: s.bg,
    symmetry: { mode: 'none', n: 8, showGuides: false },
  },
})

export const FORMS_PRESETS: PresetSeed[] = [
  formPreset({
    name: 'Dot Screen',
    id: 'builtin.form-dot-screen',
    shape: 'circle',
    toneSize: true,
    toneSizeMin: 0.1,
    cols: 32,
    palette: ['#111111', '#555555', '#999999', '#dddddd'],
    bg: '#dddddd',
  }),
  formPreset({
    name: 'Cross Screen',
    id: 'builtin.form-cross-screen',
    shape: 'cross',
    toneSize: true,
    toneSizeMin: 0.12,
    cols: 32,
    params: { thickness: 0.3 },
    palette: ['#101418', '#3a4750', '#8b9ba3', '#e6e2d8'],
    bg: '#e6e2d8',
  }),
  formPreset({
    name: 'Polka Dots',
    id: 'builtin.form-dots',
    shape: 'circle',
    size: 0.82,
    palette: ['#22223b', '#4a4e69', '#9a8c98', '#c9ada7', '#f2e9e4'],
    bg: '#f2e9e4',
  }),
  formPreset({
    name: 'Rings',
    id: 'builtin.form-rings',
    shape: 'ring',
    size: 0.96,
    cols: 26,
    params: { thickness: 0.18 },
    palette: ['#0d1b2a', '#1b493b', '#5fa8d3', '#cae9ff', '#ffd166'],
    bg: '#0d1b2a',
  }),
  formPreset({
    name: 'Cross Stitch',
    id: 'builtin.form-crosses',
    shape: 'xCross',
    size: 0.92,
    radius: 0.06,
    cols: 28,
    params: { thickness: 0.34 },
    palette: ['#2d2016', '#8c5e3c', '#c98f4e', '#e8c896', '#5c4033'],
    bg: '#2d2016',
  }),
  formPreset({
    name: 'Star Field',
    id: 'builtin.form-stars',
    shape: 'star',
    size: 0.95,
    params: { thickness: 0.3 },
    palette: ['#0b0d17', '#f4d35e', '#ee964b', '#f95738', '#3d5a80'],
    bg: '#0b0d17',
  }),
  formPreset({
    name: 'Mosaic',
    id: 'builtin.form-mosaic',
    shape: 'hexagon',
    size: 0.9,
    cols: 26,
    palette: ['#31572c', '#4f772d', '#90a955', '#ecf39e', '#132a13'],
    bg: '#132a13',
  }),
  formPreset({
    name: 'Sweethearts',
    id: 'builtin.form-hearts',
    shape: 'heart',
    size: 0.84,
    cols: 22,
    palette: ['#641220', '#85182a', '#a71e34', '#bd1e36', '#fcd5ce'],
    bg: '#fcd5ce',
  }),
  formPreset({
    name: 'Crescents',
    id: 'builtin.form-crescents',
    shape: 'moon',
    toneSize: true,
    toneSizeMin: 0.12,
    size: 0.95,
    cols: 30,
    params: { thickness: 0.3 },
    palette: ['#141a2e', '#3c4a6b', '#7189a8', '#dde4f0'],
    bg: '#dde4f0',
  }),
  formPreset({
    name: 'Teardrops',
    id: 'builtin.form-teardrops',
    shape: 'teardrop',
    size: 0.88,
    cols: 26,
    palette: ['#1a2a33', '#2e4a56', '#4f7382', '#93b1bd', '#d9e7ec'],
    bg: '#d9e7ec',
  }),
  formPreset({
    name: 'Blooms',
    id: 'builtin.form-blooms',
    shape: 'flower',
    size: 0.95,
    cols: 26,
    params: { points: 6, thickness: 0.32 },
    palette: ['#33502f', '#5d8a4e', '#a4c58f', '#f0e9cf'],
    bg: '#f5efdb',
  }),
  formPreset({
    name: 'Half-Moons',
    id: 'builtin.form-half-moons',
    shape: 'semicircle',
    size: 0.9,
    cols: 28,
    palette: ['#8c3b4a', '#c96b5a', '#e8a07a', '#f4c9a5'],
    bg: '#fde8d4',
  }),
  formPreset({
    name: 'Gears',
    id: 'builtin.form-gears',
    shape: 'gear',
    size: 0.95,
    params: { points: 8, thickness: 0.3 },
    palette: ['#ced4da', '#adb5bd', '#6c757d', '#495057'],
    bg: '#22252a',
  }),
  formPreset({
    name: 'Asterisks',
    id: 'builtin.form-asterisks',
    shape: 'asterisk',
    toneSize: true,
    toneSizeMin: 0.12,
    cols: 30,
    params: { points: 6, thickness: 0.28 },
    palette: ['#f5f5f5', '#c0c0c8', '#8a8a96', '#54545e'],
    bg: '#101014',
  }),
  formPreset({
    name: 'Bolts',
    id: 'builtin.form-bolts',
    shape: 'lightning',
    size: 0.9,
    cols: 26,
    palette: ['#ef476f', '#06d6a0', '#118ab2', '#073b4c'],
    bg: '#ffe08a',
  }),
  formPreset({
    name: 'Chevrons',
    id: 'builtin.form-chevrons',
    shape: 'chevron',
    size: 0.9,
    cols: 26,
    params: { thickness: 0.3 },
    palette: ['#e63946', '#f1faee', '#a8dadc', '#457b9d'],
    bg: '#1b1b1e',
  }),
]
