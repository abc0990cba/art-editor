/** Editor config presets: named snapshots of every changeable parameter, no painted content. */

import type {
  Connectivity,
  Doc,
  GridType,
  MetaballSettings,
  PixelStyle,
  RenderMode,
  StyleScope,
  SubDetail,
  SymmetryState,
  TextureSettings,
} from './doc'
import { defaultDoc, MAX_SIZE, MIN_SIZE } from './doc'
import { clampCell, REPEAT_MODES } from './symmetry'

export interface PresetConfig {
  v: 1
  gridType: GridType
  cols: number
  rows: number
  sub: SubDetail
  /** radial grid only: ~equal cells per ring */
  radialEven: boolean
  palette: string[]
  style: PixelStyle
  renderMode: RenderMode
  connectivity: Connectivity
  metaball: MetaballSettings
  texture: TextureSettings
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

const SYM_MODES = [
  'none',
  'mirrorX',
  'mirrorY',
  'quad',
  'diag8',
  'radial',
  'kaleido',
  ...REPEAT_MODES,
] as const

const DEFAULT_SYMMETRY: SymmetryState = {
  mode: 'none',
  n: 8,
  cell: 16,
  showGuides: true,
  fill: 100,
  phase: 0,
  twist: 0,
}

const TEXTURE_EFFECTS = ['none', 'grain', 'grunge', 'halftone'] as const
const TEXTURE_DISTS = ['scatter', 'clumps', 'streaks', 'perlin', 'voronoi'] as const
const TEXTURE_SHAPES = ['square', 'dot', 'chip'] as const

/** Snapshot of the current editor configuration (document settings + symmetry). */
export function presetFromDoc(doc: Doc, symmetry: SymmetryState): PresetConfig {
  return {
    v: 1,
    gridType: doc.gridType,
    cols: doc.cols,
    rows: doc.rows,
    sub: doc.sub,
    radialEven: doc.gridType === 'radial' && doc.radialEven,
    palette: [...doc.palette],
    style: { ...doc.style, corners: { ...doc.style.corners } },
    renderMode: doc.renderMode,
    connectivity: doc.connectivity,
    metaball: { ...doc.metaball },
    texture: { ...doc.texture },
    styleScope: doc.styleScope,
    bg: doc.bg,
    connectorWidth: doc.connectorWidth,
    symmetry: { ...symmetry },
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const hex = (s: unknown): string =>
  typeof s === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s) ? s.toLowerCase() : ''

/** Defensive validation for stored/raw configs, clamped like the document deserializer. */
export function normalizePresetConfig(raw: unknown): PresetConfig {
  const base = presetFromDoc(defaultDoc(), DEFAULT_SYMMETRY)
  if (typeof raw !== 'object' || raw === null) return base
  const d = raw as Record<string, unknown>
  const st = (d.style ?? {}) as Partial<PixelStyle>
  const co = (st.corners ?? {}) as Partial<PixelStyle['corners']>
  const mb = (d.metaball ?? {}) as Partial<MetaballSettings>
  const tx = (d.texture ?? {}) as Partial<TextureSettings> & { size?: unknown }
  const sym = (d.symmetry ?? {}) as Partial<SymmetryState>
  const corner = (v: unknown) => (typeof v === 'number' ? clamp(v, 0, 0.5) : null)
  const palette = Array.isArray(d.palette) ? d.palette.map(hex).filter(Boolean) : base.palette
  const gridTypes = ['square', 'hex', 'triangle', 'radial'] as const
  const renderModes = ['pixels', 'outline', 'metaball'] as const
  const connectivities = ['edge', 'corner', 'corner-bridge'] as const
  return {
    v: 1,
    gridType: gridTypes.includes(d.gridType as GridType) ? (d.gridType as GridType) : base.gridType,
    cols: clamp(Math.round(Number(d.cols) || base.cols), MIN_SIZE, MAX_SIZE),
    rows: clamp(Math.round(Number(d.rows) || base.rows), MIN_SIZE, MAX_SIZE),
    sub: ([1, 2, 3] as SubDetail[]).includes(d.sub as SubDetail) ? (d.sub as SubDetail) : base.sub,
    radialEven: d.radialEven === true,
    palette: palette.length > 0 ? palette : base.palette,
    style: {
      radius: clamp(Number(st.radius ?? base.style.radius), 0, 0.5),
      corners: {
        tl: corner(co.tl),
        tr: corner(co.tr),
        br: corner(co.br),
        bl: corner(co.bl),
      },
      sizeX: clamp(Number(st.sizeX ?? base.style.sizeX), 0.05, 1),
      sizeY: clamp(Number(st.sizeY ?? base.style.sizeY), 0.05, 1),
      convexRadius: clamp(Number(st.convexRadius ?? base.style.convexRadius), 0, 0.5),
      concaveRadius: clamp(Number(st.concaveRadius ?? base.style.concaveRadius), 0, 0.5),
      cornerStyle: st.cornerStyle === 'chamfer' ? 'chamfer' : 'arc',
      squareEdges: st.squareEdges === true,
    },
    renderMode: renderModes.includes(d.renderMode as RenderMode)
      ? (d.renderMode as RenderMode)
      : base.renderMode,
    connectivity: connectivities.includes(d.connectivity as Connectivity)
      ? (d.connectivity as Connectivity)
      : base.connectivity,
    metaball: {
      strength: clamp(Number(mb.strength ?? base.metaball.strength), 0, 100),
      perColor: Boolean(mb.perColor ?? base.metaball.perColor),
      quality: clamp(Math.round(Number(mb.quality) || base.metaball.quality), 2, 8),
      squareEdges: mb.squareEdges === true,
    },
    texture: (() => {
      const sizeMin =
        tx.sizeMin !== undefined
          ? Number(tx.sizeMin)
          : Number(tx.size) > 0
            ? Number(tx.size) * 0.18
            : base.texture.sizeMin
      const sizeMax =
        tx.sizeMax !== undefined
          ? Number(tx.sizeMax)
          : Number(tx.size) > 0
            ? Number(tx.size) * 0.35
            : base.texture.sizeMax
      return {
        effect: TEXTURE_EFFECTS.includes(tx.effect as TextureSettings['effect'])
          ? (tx.effect as TextureSettings['effect'])
          : base.texture.effect,
        amount: clamp(Number(tx.amount ?? base.texture.amount), 0, 100),
        scale: clamp(Number(tx.scale) || base.texture.scale, 0.1, 8),
        sizeMin: clamp(
          Number.isFinite(sizeMin) && sizeMin > 0 ? sizeMin : base.texture.sizeMin,
          0.05,
          0.6,
        ),
        sizeMax: clamp(
          Number.isFinite(sizeMax) && sizeMax > 0 ? sizeMax : base.texture.sizeMax,
          0.05,
          0.6,
        ),
        shape: TEXTURE_SHAPES.includes(tx.shape as TextureSettings['shape'])
          ? (tx.shape as TextureSettings['shape'])
          : base.texture.shape,
        edge: clamp(Number(tx.edge ?? base.texture.edge), 0, 100),
        dist: TEXTURE_DISTS.includes(tx.dist as TextureSettings['dist'])
          ? (tx.dist as TextureSettings['dist'])
          : base.texture.dist,
        gap: clamp(Number(tx.gap ?? base.texture.gap), 0, 0.45),
        angle: clamp(Number(tx.angle ?? base.texture.angle), 0, 180),
        seed: Math.max(0, Math.round(Number(tx.seed) || base.texture.seed)),
        jitter: clamp(Number(tx.jitter ?? base.texture.jitter), 0, 100),
        variation: clamp(Number(tx.variation ?? base.texture.variation), 0, 100),
        wobble: clamp(Number(tx.wobble ?? base.texture.wobble), 0, 100),
        merge: clamp(Number(tx.merge ?? base.texture.merge), 0, 100),
        dropout: clamp(Number(tx.dropout ?? base.texture.dropout), 0, 100),
        spray: clamp(Number(tx.spray ?? base.texture.spray), 0, 100),
        ramp: clamp(Number(tx.ramp ?? base.texture.ramp), 0, 100),
      }
    })(),
    styleScope: d.styleScope === 'global' || d.styleScope === 'element' ? d.styleScope : undefined,
    bg: hex(d.bg),
    connectorWidth: clamp(Number(d.connectorWidth ?? base.connectorWidth), 0.05, 1),
    symmetry: {
      mode: SYM_MODES.includes(sym.mode as SymmetryState['mode'])
        ? (sym.mode as SymmetryState['mode'])
        : base.symmetry.mode,
      n: clamp(Math.round(Number(sym.n) || base.symmetry.n), 2, 24),
      cell: clampCell(sym.cell, base.symmetry.cell),
      showGuides: Boolean(sym.showGuides ?? base.symmetry.showGuides),
      fill: clamp(Math.round(Number(sym.fill) || base.symmetry.fill), 10, 100),
      phase: clamp(Math.round(Number(sym.phase) || 0), 0, 359),
      twist: clamp(
        Number.isFinite(Number(sym.twist)) ? Math.round(Number(sym.twist)) : base.symmetry.twist,
        -45,
        45,
      ),
    },
  }
}

function stylesEqual(a: PixelStyle, b: PixelStyle): boolean {
  return (
    a.radius === b.radius &&
    a.sizeX === b.sizeX &&
    a.sizeY === b.sizeY &&
    a.convexRadius === b.convexRadius &&
    a.concaveRadius === b.concaveRadius &&
    a.cornerStyle === b.cornerStyle &&
    a.squareEdges === b.squareEdges &&
    a.corners.tl === b.corners.tl &&
    a.corners.tr === b.corners.tr &&
    a.corners.br === b.corners.br &&
    a.corners.bl === b.corners.bl
  )
}

/** Whether the current editor state exactly matches a preset configuration. */
export function configMatchesState(
  config: PresetConfig,
  doc: Doc,
  symmetry: SymmetryState,
): boolean {
  const c = presetFromDoc(doc, symmetry)
  return (
    c.gridType === config.gridType &&
    c.cols === config.cols &&
    c.rows === config.rows &&
    c.sub === config.sub &&
    c.radialEven === config.radialEven &&
    c.renderMode === config.renderMode &&
    c.connectivity === config.connectivity &&
    (!config.styleScope || c.styleScope === config.styleScope) &&
    c.bg === config.bg &&
    c.connectorWidth === config.connectorWidth &&
    c.palette.length === config.palette.length &&
    c.palette.every((h, i) => h === config.palette[i].toLowerCase()) &&
    stylesEqual(c.style, config.style) &&
    c.metaball.strength === config.metaball.strength &&
    c.metaball.perColor === config.metaball.perColor &&
    c.metaball.quality === config.metaball.quality &&
    c.metaball.squareEdges === config.metaball.squareEdges &&
    c.texture.effect === config.texture.effect &&
    c.texture.amount === config.texture.amount &&
    c.texture.scale === config.texture.scale &&
    c.texture.sizeMin === config.texture.sizeMin &&
    c.texture.sizeMax === config.texture.sizeMax &&
    c.texture.shape === config.texture.shape &&
    c.texture.edge === config.texture.edge &&
    c.texture.dist === config.texture.dist &&
    c.texture.gap === config.texture.gap &&
    c.texture.angle === config.texture.angle &&
    c.texture.seed === config.texture.seed &&
    c.texture.jitter === config.texture.jitter &&
    c.texture.variation === config.texture.variation &&
    c.texture.wobble === config.texture.wobble &&
    c.texture.merge === config.texture.merge &&
    c.texture.dropout === config.texture.dropout &&
    c.texture.spray === config.texture.spray &&
    c.texture.ramp === config.texture.ramp &&
    c.symmetry.mode === config.symmetry.mode &&
    c.symmetry.n === config.symmetry.n &&
    c.symmetry.showGuides === config.symmetry.showGuides &&
    c.symmetry.fill === config.symmetry.fill &&
    c.symmetry.phase === config.symmetry.phase &&
    c.symmetry.twist === config.symmetry.twist
  )
}

export const isBuiltinPreset = (p: EditorPreset): boolean => p.id.startsWith('builtin.')

/** Merge partial input over the default config, then validate — built-in definitions stay terse. */
function builtin(
  name: string,
  id: string,
  input: {
    style?: Partial<PixelStyle>
    metaball?: Partial<MetaballSettings>
    texture?: Partial<TextureSettings>
    symmetry?: Partial<SymmetryState>
  } & Partial<Omit<PresetConfig, 'v' | 'style' | 'metaball' | 'texture' | 'symmetry'>>,
): EditorPreset {
  const base = presetFromDoc(defaultDoc(), DEFAULT_SYMMETRY)
  const config = normalizePresetConfig({
    ...base,
    ...input,
    style: { ...base.style, ...input.style },
    metaball: { ...base.metaball, ...input.metaball },
    texture: { ...base.texture, ...input.texture },
    symmetry: { ...base.symmetry, ...input.symmetry },
  })
  return { id, name, config }
}

// Sweetie 16 (same canonical colors as the palette preset of that name).
const SWEETIE_16 = [
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

export const BUILTIN_PRESETS: EditorPreset[] = [
  builtin('Newspaper', 'builtin.newspaper', {
    gridType: 'square',
    cols: 26,
    rows: 26,
    sub: 2,
    palette: ['#1c1c1c', '#4a4a4a', '#8a8a8a', '#f4f1ea'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0, sizeX: 1, sizeY: 1 },
    bg: '#f4f1ea',
    texture: { effect: 'halftone', amount: 55, scale: 1.6, angle: 45 },
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Comic Pop', 'builtin.comic-pop', {
    gridType: 'square',
    cols: 24,
    rows: 24,
    sub: 2,
    palette: ['#d7263d', '#1b998b', '#ffcd38', '#2e294e', '#ffffff'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0.5, sizeX: 0.94, sizeY: 0.94 },
    bg: '#fffdf7',
    texture: { effect: 'halftone', amount: 65, scale: 2.2, angle: 15, seed: 7 },
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Ink Blobs', 'builtin.ink-blobs', {
    gridType: 'square',
    cols: 22,
    rows: 22,
    sub: 2,
    palette: ['#101014', '#2b2d42', '#8d99ae', '#edf2f4'],
    renderMode: 'metaball',
    connectivity: 'corner-bridge',
    metaball: { strength: 55, perColor: true, quality: 5 },
    bg: '#edf2f4',
    texture: {
      effect: 'halftone',
      amount: 80,
      scale: 1.2,
      angle: 45,
      jitter: 40,
      variation: 45,
      merge: 70,
      wobble: 55,
      seed: 11,
    },
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Worn Poster', 'builtin.worn-poster', {
    gridType: 'square',
    cols: 26,
    rows: 26,
    sub: 2,
    palette: ['#e07a5f', '#3d405b', '#81b29a', '#f2cc8f', '#f4f1de'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0, sizeX: 1, sizeY: 1 },
    bg: '#f4f1de',
    texture: {
      effect: 'halftone',
      amount: 65,
      scale: 1.8,
      angle: 25,
      jitter: 30,
      variation: 40,
      dropout: 35,
      spray: 45,
      ramp: 30,
      seed: 23,
    },
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Silk Screen', 'builtin.silk-screen', {
    gridType: 'square',
    cols: 24,
    rows: 24,
    sub: 2,
    palette: ['#0f0e17', '#ff8906', '#f25f4c', '#e53170', '#fffffe'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0, sizeX: 1, sizeY: 1 },
    bg: '#fffffe',
    texture: { effect: 'halftone', amount: 40, scale: 2.6, angle: 25 },
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Sunfade', 'builtin.sunfade', {
    gridType: 'square',
    cols: 24,
    rows: 24,
    sub: 2,
    palette: ['#ffba08', '#faa307', '#f48c06', '#dc2f02', '#6a040f'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0, sizeX: 1, sizeY: 1 },
    bg: '#fff3b0',
    texture: { effect: 'halftone', amount: 80, scale: 1.4, angle: 135, ramp: 95, seed: 5 },
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Vintage Photo', 'builtin.vintage-photo', {
    gridType: 'square',
    cols: 30,
    rows: 30,
    sub: 2,
    palette: ['#3b3128', '#6f5e46', '#a8906f', '#d4bd9c', '#efe6d5'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0, sizeX: 1, sizeY: 1 },
    bg: '#efe6d5',
    texture: {
      effect: 'halftone',
      amount: 70,
      scale: 1.2,
      angle: 45,
      jitter: 25,
      variation: 35,
      wobble: 30,
      dropout: 20,
      spray: 25,
      seed: 42,
    },
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Dot Gradient', 'builtin.dot-gradient', {
    gridType: 'square',
    cols: 24,
    rows: 24,
    sub: 2,
    palette: ['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#caf0f8'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0, sizeX: 1, sizeY: 1 },
    bg: '#caf0f8',
    texture: { effect: 'halftone', amount: 90, scale: 1.3, angle: 90, ramp: 100, seed: 9 },
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Neon Metaballs', 'builtin.neon-metaballs', {
    gridType: 'square',
    cols: 24,
    rows: 24,
    sub: 2,
    palette: ['#00e5ff', '#ff2e88', '#ffe600', '#7c4dff', '#00ff9d', '#ff6d00'],
    renderMode: 'metaball',
    connectivity: 'corner-bridge',
    metaball: { strength: 62, perColor: true, quality: 6 },
    bg: '#0b0f1c',
    symmetry: { mode: 'kaleido', n: 6, showGuides: true },
  }),
  builtin('Game Boy', 'builtin.gameboy', {
    gridType: 'square',
    cols: 20,
    rows: 18,
    sub: 1,
    palette: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0, sizeX: 0.92, sizeY: 0.92 },
    bg: '#9bbc0f',
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Bubblegum', 'builtin.bubblegum', {
    gridType: 'square',
    cols: 20,
    rows: 20,
    sub: 2,
    palette: [
      '#ff8fab',
      '#ffb3c6',
      '#ffd6a5',
      '#fdffb6',
      '#b9fbc0',
      '#90dbf4',
      '#a78bfa',
      '#ffffff',
    ],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0.5, sizeX: 0.85, sizeY: 0.85 },
    bg: '#fff5fa',
    symmetry: { mode: 'quad', n: 8, showGuides: true },
  }),
  builtin('Blueprint', 'builtin.blueprint', {
    gridType: 'square',
    cols: 28,
    rows: 28,
    sub: 1,
    palette: ['#cfe8ff', '#7fb8ff', '#ffffff', '#4a90d9'],
    renderMode: 'outline',
    connectivity: 'corner-bridge',
    style: { convexRadius: 0.12, concaveRadius: 0.08 },
    bg: '#0a2f5c',
    symmetry: { mode: 'none', n: 8, showGuides: true },
  }),
  builtin('Kaleido Bloom', 'builtin.kaleido-bloom', {
    gridType: 'hex',
    cols: 22,
    rows: 22,
    sub: 1,
    palette: ['#f72585', '#7209b7', '#3a0ca3', '#4361ee', '#4cc9f0', '#ffd60a'],
    renderMode: 'metaball',
    connectivity: 'corner-bridge',
    metaball: { strength: 55, perColor: true, quality: 6 },
    bg: '#12081f',
    symmetry: { mode: 'radial', n: 12, showGuides: false },
  }),
  builtin('Retro Chamfer', 'builtin.retro-chamfer', {
    gridType: 'square',
    cols: 24,
    rows: 24,
    sub: 1,
    palette: SWEETIE_16,
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0.3, sizeX: 0.9, sizeY: 0.9, cornerStyle: 'chamfer' },
    bg: '#1a1c2c',
    symmetry: { mode: 'diag8', n: 8, showGuides: true },
  }),
  builtin('Mandala', 'builtin.mandala', {
    gridType: 'radial',
    cols: 16,
    rows: 14,
    sub: 1,
    palette: ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86ff'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0.18, sizeX: 0.95, sizeY: 0.95 },
    bg: '#160e24',
    symmetry: { mode: 'radial', n: 16, showGuides: false },
  }),
  builtin('Sticker Pop', 'builtin.sticker-pop', {
    gridType: 'square',
    cols: 20,
    rows: 20,
    sub: 1,
    palette: ['#e63946', '#2a9d8f', '#4361ee', '#ffb703', '#7209b7', '#f72585'],
    renderMode: 'outline',
    connectivity: 'corner',
    style: { convexRadius: 0.42, concaveRadius: 0.3, sizeX: 0.9, sizeY: 0.9 },
    bg: '#ffffff',
    symmetry: { mode: 'mirrorX', n: 8, showGuides: true },
  }),
  builtin('Vaporwave', 'builtin.vaporwave', {
    gridType: 'square',
    cols: 24,
    rows: 20,
    sub: 2,
    palette: ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff', '#fffb96', '#e8437f'],
    renderMode: 'outline',
    connectivity: 'corner-bridge',
    style: { convexRadius: 0.25, concaveRadius: 0.15 },
    bg: '#160e2e',
    symmetry: { mode: 'mirrorX', n: 8, showGuides: true },
  }),
  builtin('Circuit Board', 'builtin.circuit', {
    gridType: 'square',
    cols: 28,
    rows: 28,
    sub: 1,
    palette: ['#00ff9d', '#00b8d9', '#a7f070', '#0f5132', '#343a40'],
    renderMode: 'outline',
    connectivity: 'corner-bridge',
    style: { convexRadius: 0.12, concaveRadius: 0.06 },
    bg: '#04140f',
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Ice Garden', 'builtin.ice-garden', {
    gridType: 'hex',
    cols: 20,
    rows: 20,
    sub: 1,
    palette: ['#e0f2fe', '#a5f3fc', '#7fb8ff', '#3b82f6', '#1e3a8a', '#ffffff'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0.5, sizeX: 0.92, sizeY: 0.92 },
    bg: '#0c1b33',
    symmetry: { mode: 'mirrorX', n: 8, showGuides: false },
  }),
  builtin('Ember Field', 'builtin.ember-field', {
    gridType: 'radial',
    cols: 16,
    rows: 14,
    sub: 1,
    palette: ['#ff6d00', '#ff2e00', '#ffc300', '#fed7aa', '#7c2d12'],
    renderMode: 'metaball',
    connectivity: 'corner-bridge',
    metaball: { strength: 58, perColor: true, quality: 5 },
    bg: '#1a0a05',
    symmetry: { mode: 'radial', n: 10, showGuides: false },
  }),
  builtin('Film Noir', 'builtin.film-noir', {
    gridType: 'square',
    cols: 32,
    rows: 32,
    sub: 1,
    palette: ['#e8e8e8', '#000000', '#8a8a8a', '#3d3d3d'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0, sizeX: 0.95, sizeY: 0.95 },
    bg: '#101010',
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Candy Rush', 'builtin.candy-rush', {
    gridType: 'triangle',
    cols: 24,
    rows: 20,
    sub: 1,
    palette: ['#ff5d8f', '#ffb3c6', '#ffe066', '#7ce577', '#5bc0eb', '#f187fb'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0.35, sizeX: 0.9, sizeY: 0.9 },
    bg: '#fff0f6',
    symmetry: { mode: 'quad', n: 8, showGuides: true },
  }),
  builtin('Terminal', 'builtin.terminal', {
    gridType: 'square',
    cols: 32,
    rows: 24,
    sub: 1,
    palette: ['#00ff41', '#0fff50', '#39ff14', '#003b00', '#052b0d'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0, sizeX: 0.9, sizeY: 0.9 },
    bg: '#001100',
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Pastel Hex', 'builtin.pastel-hex', {
    gridType: 'hex',
    cols: 22,
    rows: 22,
    sub: 1,
    palette: ['#ffd6e0', '#ffefcf', '#d1f5d3', '#cfe8ff', '#e5d4ff', '#fefae0'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0.25, sizeX: 0.92, sizeY: 0.92 },
    bg: '#fdf6f9',
    symmetry: { mode: 'mirrorX', n: 8, showGuides: true },
  }),
  builtin('Sunflower', 'builtin.sunflower', {
    gridType: 'radial',
    cols: 18,
    rows: 16,
    sub: 1,
    palette: ['#ffd60a', '#ffb703', '#fb8500', '#bc6c25', '#603808'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0.2, sizeX: 0.95, sizeY: 0.95 },
    bg: '#2b1d0e',
    symmetry: { mode: 'radial', n: 18, showGuides: true },
  }),
  builtin('Chalk Outline', 'builtin.chalk-outline', {
    gridType: 'square',
    cols: 26,
    rows: 26,
    sub: 1,
    palette: ['#f0ede4', '#b9c0c9', '#8a9199', '#d7d2c0'],
    renderMode: 'outline',
    connectivity: 'corner',
    style: { convexRadius: 0.15, concaveRadius: 0.1 },
    bg: '#22332d',
    symmetry: { mode: 'mirrorX', n: 8, showGuides: false },
  }),
  builtin('Aurora', 'builtin.aurora', {
    gridType: 'hex',
    cols: 20,
    rows: 20,
    sub: 2,
    palette: ['#00ffc8', '#00b4d8', '#7b2ff7', '#48f0a0', '#1c6e8c'],
    renderMode: 'metaball',
    connectivity: 'corner-bridge',
    metaball: { strength: 66, perColor: false, quality: 6 },
    bg: '#06121f',
    symmetry: { mode: 'mirrorX', n: 8, showGuides: false },
  }),
  builtin('Pixel Dungeon', 'builtin.pixel-dungeon', {
    gridType: 'square',
    cols: 24,
    rows: 24,
    sub: 1,
    palette: SWEETIE_16,
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0, sizeX: 0.95, sizeY: 0.95 },
    bg: '#1a1c2c',
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Koi Pond', 'builtin.koi-pond', {
    gridType: 'square',
    cols: 24,
    rows: 24,
    sub: 3,
    palette: ['#ffffff', '#e63946', '#f4a261', '#457b9d', '#94d2bd', '#f1faee'],
    renderMode: 'metaball',
    connectivity: 'corner-bridge',
    metaball: { strength: 45, perColor: true, quality: 5 },
    bg: '#123a47',
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Stained Glass', 'builtin.stained-glass', {
    gridType: 'square',
    cols: 22,
    rows: 22,
    sub: 1,
    palette: ['#e63946', '#2a9d8f', '#457b9d', '#ffc300', '#7209b7', '#f7f4ea'],
    renderMode: 'outline',
    connectivity: 'corner',
    style: { convexRadius: 0.3, concaveRadius: 0.25 },
    bg: '#0d0d12',
    symmetry: { mode: 'quad', n: 8, showGuides: true },
  }),
  builtin('Dither Study', 'builtin.dither-study', {
    gridType: 'square',
    cols: 28,
    rows: 28,
    sub: 1,
    palette: ['#26262b', '#e6e6e6'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0.5, sizeX: 0.6, sizeY: 0.6 },
    bg: '#e6e6e6',
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Vintage Print', 'builtin.vintage-print', {
    gridType: 'square',
    cols: 26,
    rows: 26,
    sub: 1,
    palette: ['#3d2b1f', '#7a5230', '#b08968', '#d4a373', '#606c38', '#bc4749'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0.12, sizeX: 0.9, sizeY: 0.9 },
    texture: { effect: 'grain', amount: 55, scale: 1.1, seed: 1948 },
    bg: '#f2e8cf',
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Rust Bloom', 'builtin.rust-bloom', {
    gridType: 'square',
    cols: 24,
    rows: 24,
    sub: 1,
    palette: ['#20201d', '#8c2f1b', '#b4552d', '#d98e4a', '#3f3a34'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0.2, sizeX: 1, sizeY: 1 },
    texture: {
      effect: 'grunge',
      amount: 72,
      scale: 1.5,
      sizeMin: 0.14,
      sizeMax: 0.5,
      shape: 'chip',
      edge: 65,
      dist: 'voronoi',
      gap: 0.16,
      angle: 45,
      seed: 7134,
    },
    bg: '#20201d',
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Concrete', 'builtin.concrete', {
    gridType: 'square',
    cols: 26,
    rows: 26,
    sub: 1,
    palette: ['#4e4a44', '#d7d3cb', '#a8a29a', '#7a756d'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0.08, sizeX: 1, sizeY: 1 },
    texture: {
      effect: 'grain',
      amount: 78,
      scale: 1.2,
      sizeMin: 0.08,
      sizeMax: 0.3,
      shape: 'square',
      edge: 100,
      dist: 'perlin',
      gap: 0.1,
      angle: 45,
      seed: 5150,
    },
    bg: '#4e4a44',
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Dot Matrix', 'builtin.dot-matrix', {
    gridType: 'square',
    cols: 24,
    rows: 24,
    sub: 1,
    palette: ['#1d2126', '#39c2d7', '#f4f7f5', '#e0a526'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0.5, sizeX: 1, sizeY: 1 },
    texture: {
      effect: 'halftone',
      amount: 55,
      scale: 0.9,
      sizeMin: 0.12,
      sizeMax: 0.35,
      shape: 'dot',
      edge: 100,
      dist: 'scatter',
      gap: 0,
      angle: 45,
      seed: 808,
    },
    bg: '#f4f7f5',
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Teletext', 'builtin.teletext', {
    gridType: 'square',
    cols: 32,
    rows: 24,
    sub: 1,
    palette: [
      '#000000',
      '#ff0000',
      '#00ff00',
      '#ffff00',
      '#0000ff',
      '#ff00ff',
      '#00ffff',
      '#ffffff',
    ],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0, sizeX: 0.9, sizeY: 0.9 },
    bg: '#000000',
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('CGA Terminal', 'builtin.cga-terminal', {
    gridType: 'square',
    cols: 32,
    rows: 20,
    sub: 1,
    palette: ['#000000', '#55ffff', '#ff55ff', '#ffffff'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0, sizeX: 0.7, sizeY: 0.9 },
    bg: '#000000',
    symmetry: { mode: 'mirrorX', n: 8, showGuides: true },
  }),
  builtin('Macintosh Classic', 'builtin.macintosh-classic', {
    gridType: 'square',
    cols: 24,
    rows: 24,
    sub: 1,
    palette: ['#000000', '#444444', '#888888', '#bbbbbb', '#ffffff'],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0.1, sizeX: 0.95, sizeY: 0.95 },
    bg: '#ffffff',
    symmetry: { mode: 'none', n: 8, showGuides: false },
  }),
  builtin('Gruvbox Study', 'builtin.gruvbox-study', {
    gridType: 'square',
    cols: 26,
    rows: 26,
    sub: 1,
    palette: [
      '#282828',
      '#3c3836',
      '#504945',
      '#665c54',
      '#bdae93',
      '#d5c4a1',
      '#ebdbb2',
      '#fbf1c7',
      '#cc241d',
      '#b16286',
      '#98971a',
      '#d79921',
      '#458588',
      '#689d6a',
      '#d65d0e',
      '#b8bb26',
    ],
    renderMode: 'pixels',
    connectivity: 'edge',
    style: { radius: 0.15, sizeX: 0.9, sizeY: 0.9 },
    bg: '#282828',
    symmetry: { mode: 'quad', n: 8, showGuides: true },
  }),
]
