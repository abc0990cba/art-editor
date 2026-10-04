/** Editor config presets: named snapshots of every changeable parameter, no painted content. */

import { isCellShapeId, normalizeShapeParams, sameShapeParams } from '../cell-shapes/index.ts'
import type {
  Connectivity,
  Doc,
  ExtrudeSettings,
  GridType,
  MetaballSettings,
  PixelStyle,
  RenderMode,
  SubDetail,
  SymmetryState,
  TextureSettings,
} from '../core/doc'
import { defaultDoc, MAX_SIZE, METABALL_FALLOFFS, METABALL_UNITS, MIN_SIZE } from '../core/doc'
import { clampCell, REPEAT_MODES } from '../effects/symmetry'
import { GRID_TYPES } from '../grids'
import type { EditorPreset, PresetConfig, PresetInput, PresetSeed } from './configs'
import { PRINT_PRESETS } from './lists'
import { FORMS_PRESETS } from './lists-forms'
import { RETRO_PRESETS } from './lists-retro'
import { STUDIO_PRESETS } from './lists-studio'
import { TEXTURE_PRESETS } from './lists-textures'

export type { EditorPreset, PresetConfig } from './configs'

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

const TEXTURE_EFFECTS = ['none', 'grain', 'grunge', 'halftone', 'hatch'] as const
const TEXTURE_DISTS = [
  'scatter',
  'clumps',
  'streaks',
  'perlin',
  'voronoi',
  'waves',
  'sunburst',
  'spiral',
  'honeycomb',
  'scales',
  'weave',
  'checker',
  'fade',
  'bayer',
] as const
const TEXTURE_SHAPES = [
  'square',
  'dot',
  'chip',
  'triangle',
  'diamond',
  'cross',
  'star',
  'hex',
  'ring',
  'dash',
] as const
const TEXTURE_GAP_MODES = ['cell', 'figure'] as const

/** Every compared texture field, in one place so equality checks never drift from the type. */
const TEXTURE_FIELDS = [
  'effect',
  'amount',
  'scale',
  'sizeMin',
  'sizeMax',
  'shape',
  'edge',
  'dist',
  'gap',
  'gapMode',
  'even',
  'angle',
  'seed',
  'jitter',
  'variation',
  'wobble',
  'merge',
  'dropout',
  'spray',
  'ramp',
  'htLattice',
  'hatchStyle',
] as const

function textureEqual(a: TextureSettings, b: TextureSettings): boolean {
  return TEXTURE_FIELDS.every((f) => a[f] === b[f])
}

/** Snapshot of the current editor configuration (document settings + symmetry). */
export function presetFromDoc(doc: Doc, symmetry: SymmetryState): PresetConfig {
  return {
    v: 1,
    gridType: doc.gridType,
    cols: doc.cols,
    rows: doc.rows,
    sub: doc.sub,
    radialEven: doc.gridType === 'radial' && doc.radialEven,
    ...(doc.gridRotation ? { gridRotation: doc.gridRotation } : {}),
    palette: [...doc.palette],
    style: { ...doc.style, corners: { ...doc.style.corners } },
    renderMode: doc.renderMode,
    connectivity: doc.connectivity,
    metaball: { ...doc.metaball },
    texture: { ...doc.texture },
    extrude: { ...doc.extrude },
    styleScope: doc.styleScope,
    bg: doc.bg,
    connectorWidth: doc.connectorWidth,
    symmetry: { ...symmetry },
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const hex = (s: unknown): string =>
  typeof s === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s) ? s.toLowerCase() : ''

/** One frozen corner override, clamped to 0..0.5 (null = follow the radius). */
const corner = (v: unknown): number | null => (typeof v === 'number' ? clamp(v, 0, 0.5) : null)

/** Defensive validation for one stored metaball block, clamped like the document deserializer. */
function normalizeMetaballConfig(
  mb: Partial<MetaballSettings>,
  base: MetaballSettings,
): MetaballSettings {
  return {
    strength: clamp(Number(mb.strength ?? base.strength), 0, 100),
    perColor: Boolean(mb.perColor ?? base.perColor),
    quality: clamp(Math.round(Number(mb.quality) || base.quality), 2, 8),
    squareEdges: mb.squareEdges === true,
    iso: clamp(Number(mb.iso ?? base.iso), 0.2, 0.8),
    falloff: METABALL_FALLOFFS.includes(mb.falloff as MetaballSettings['falloff'])
      ? (mb.falloff as MetaballSettings['falloff'])
      : base.falloff,
    unit: METABALL_UNITS.includes(mb.unit as MetaballSettings['unit'])
      ? (mb.unit as MetaballSettings['unit'])
      : base.unit,
    blockSize: clamp(Math.round(Number(mb.blockSize) || base.blockSize), 2, 8),
    fuseAll: mb.fuseAll === true,
    strokeWidth: clamp(Number(mb.strokeWidth ?? base.strokeWidth), 0.05, 1),
  }
}

/** Defensive validation for one stored extrude block, clamped like the document deserializer. */
function normalizeExtrudeConfig(
  raw: Partial<ExtrudeSettings> | undefined,
  base: ExtrudeSettings,
): ExtrudeSettings {
  const ex = raw ?? {}
  const axis = (v: unknown, fallback: -1 | 0 | 1): -1 | 0 | 1 =>
    v === -1 || v === 0 || v === 1 ? v : fallback
  const dx = axis(ex.dx, base.dx)
  const dy = axis(ex.dy, base.dy)
  // degenerate (0,0) extrusion renders nothing — fall back to the default diagonal
  const dead = dx === 0 && dy === 0
  return {
    depth: clamp(Math.round(Number(ex.depth) || base.depth), 1, 8),
    dx: dead ? base.dx : dx,
    dy: dead ? base.dy : dy,
    color: clamp(Math.round(Number(ex.color) || 0), 0, 9999),
  }
}

/** Defensive validation for stored/raw configs, clamped like the document deserializer. */
export function normalizePresetConfig(raw: unknown): PresetConfig {
  const base = presetFromDoc(defaultDoc(), DEFAULT_SYMMETRY)
  if (typeof raw !== 'object' || raw === null) return base
  const d = raw as Record<string, unknown>
  const st = (d['style'] ?? {}) as Partial<PixelStyle>
  const co = (st.corners ?? {}) as Partial<PixelStyle['corners']>
  const mb = (d['metaball'] ?? {}) as Partial<MetaballSettings>
  const tx = (d['texture'] ?? {}) as Partial<TextureSettings> & { size?: unknown }
  const sym = (d['symmetry'] ?? {}) as Partial<SymmetryState>
  const palette = Array.isArray(d['palette']) ? d['palette'].map(hex).filter(Boolean) : base.palette
  const renderModes = ['pixels', 'outline', 'metaball', 'contour', 'extrude'] as const
  const connectivities = ['edge', 'corner', 'corner-bridge'] as const
  return {
    v: 1,
    gridType: GRID_TYPES.includes(d['gridType'] as GridType)
      ? (d['gridType'] as GridType)
      : base.gridType,
    cols: clamp(Math.round(Number(d['cols']) || base.cols), MIN_SIZE, MAX_SIZE),
    rows: clamp(Math.round(Number(d['rows']) || base.rows), MIN_SIZE, MAX_SIZE),
    sub: ([1, 2, 3] as SubDetail[]).includes(d['sub'] as SubDetail)
      ? (d['sub'] as SubDetail)
      : base.sub,
    radialEven: d['radialEven'] === true,
    ...(typeof d['gridRotation'] === 'number' && Number.isFinite(d['gridRotation'])
      ? { gridRotation: ((Math.round(d['gridRotation']) % 360) + 360) % 360 }
      : {}),
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
      shape: isCellShapeId(st.shape) ? st.shape : base.style.shape,
      shapeParams: normalizeShapeParams(st.shapeParams),
      toneSize: st.toneSize === true,
      toneSizeMin: clamp(Number(st.toneSizeMin ?? base.style.toneSizeMin), 0.05, 1),
      sizeJitter: clamp(Number(st.sizeJitter ?? base.style.sizeJitter), 0, 1),
      angleJitter: clamp(Number(st.angleJitter ?? base.style.angleJitter), 0, 180),
      jitterSeed: clamp(Math.round(Number(st.jitterSeed) || base.style.jitterSeed), 1, 9999),
    },
    renderMode: renderModes.includes(d['renderMode'] as RenderMode)
      ? (d['renderMode'] as RenderMode)
      : base.renderMode,
    connectivity: connectivities.includes(d['connectivity'] as Connectivity)
      ? (d['connectivity'] as Connectivity)
      : base.connectivity,
    metaball: normalizeMetaballConfig(mb, base.metaball),
    extrude: normalizeExtrudeConfig(d['extrude'] as Partial<ExtrudeSettings>, base.extrude),
    texture: (() => {
      const sizeMin =
        tx.sizeMin === undefined
          ? Number(tx.size) > 0
            ? Number(tx.size) * 0.18
            : base.texture.sizeMin
          : Number(tx.sizeMin)
      const sizeMax =
        tx.sizeMax === undefined
          ? Number(tx.size) > 0
            ? Number(tx.size) * 0.35
            : base.texture.sizeMax
          : Number(tx.sizeMax)
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
        gapMode: TEXTURE_GAP_MODES.includes(tx.gapMode as TextureSettings['gapMode'])
          ? (tx.gapMode as TextureSettings['gapMode'])
          : base.texture.gapMode,
        even: tx.even === undefined ? base.texture.even : tx.even === true,
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
    styleScope:
      d['styleScope'] === 'global' || d['styleScope'] === 'element' ? d['styleScope'] : undefined,
    bg: hex(d['bg']),
    connectorWidth: clamp(Number(d['connectorWidth'] ?? base.connectorWidth), 0.05, 1),
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
    a.shape === b.shape &&
    sameShapeParams(a.shapeParams, b.shapeParams) &&
    a.toneSize === b.toneSize &&
    a.toneSizeMin === b.toneSizeMin &&
    a.sizeJitter === b.sizeJitter &&
    a.angleJitter === b.angleJitter &&
    a.jitterSeed === b.jitterSeed &&
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
    (c.gridRotation ?? 0) === (config.gridRotation ?? 0) &&
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
    c.metaball.iso === config.metaball.iso &&
    c.metaball.falloff === config.metaball.falloff &&
    textureEqual(c.texture, config.texture) &&
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
function builtin(name: string, id: string, input: PresetInput): EditorPreset {
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

/**
 * Built-in preset seeds, grouped by theme and kept in display order: print halftones, studio
 * variety, texture studies, cell forms, retro machines. Each seed is expanded through `builtin`, so
 * the assembled list below matches the original single-array definition exactly.
 */
const BUILTIN_SEEDS: PresetSeed[] = [
  ...PRINT_PRESETS,
  ...STUDIO_PRESETS,
  ...TEXTURE_PRESETS,
  ...FORMS_PRESETS,
  ...RETRO_PRESETS,
]

export const BUILTIN_PRESETS: EditorPreset[] = BUILTIN_SEEDS.map((seed) =>
  builtin(seed.name, seed.id, seed.input),
)
