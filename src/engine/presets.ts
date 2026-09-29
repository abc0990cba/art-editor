/** Editor config presets: named snapshots of every changeable parameter, no painted content. */

import { isCellShapeId, normalizeShapeParams, sameShapeParams } from './cell-shapes.ts'
import type {
  Connectivity,
  Doc,
  GridType,
  MetaballSettings,
  PixelStyle,
  RenderMode,
  SubDetail,
  SymmetryState,
  TextureSettings,
} from './doc'
import { defaultDoc, MAX_SIZE, MIN_SIZE } from './doc'
import type { EditorPreset, PresetConfig, PresetInput, PresetSeed } from './preset-configs'
import { PRINT_PRESETS } from './preset-lists'
import { FORMS_PRESETS } from './preset-lists-forms'
import { RETRO_PRESETS } from './preset-lists-retro'
import { STUDIO_PRESETS } from './preset-lists-studio'
import { TEXTURE_PRESETS } from './preset-lists-textures'
import { clampCell, REPEAT_MODES } from './symmetry'

export type { EditorPreset, PresetConfig } from './preset-configs'

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
  const st = (d['style'] ?? {}) as Partial<PixelStyle>
  const co = (st.corners ?? {}) as Partial<PixelStyle['corners']>
  const mb = (d['metaball'] ?? {}) as Partial<MetaballSettings>
  const tx = (d['texture'] ?? {}) as Partial<TextureSettings> & { size?: unknown }
  const sym = (d['symmetry'] ?? {}) as Partial<SymmetryState>
  const corner = (v: unknown) => (typeof v === 'number' ? clamp(v, 0, 0.5) : null)
  const palette = Array.isArray(d['palette']) ? d['palette'].map(hex).filter(Boolean) : base.palette
  const gridTypes = ['square', 'hex', 'triangle', 'radial'] as const
  const renderModes = ['pixels', 'outline', 'metaball'] as const
  const connectivities = ['edge', 'corner', 'corner-bridge'] as const
  return {
    v: 1,
    gridType: gridTypes.includes(d['gridType'] as GridType)
      ? (d['gridType'] as GridType)
      : base.gridType,
    cols: clamp(Math.round(Number(d['cols']) || base.cols), MIN_SIZE, MAX_SIZE),
    rows: clamp(Math.round(Number(d['rows']) || base.rows), MIN_SIZE, MAX_SIZE),
    sub: ([1, 2, 3] as SubDetail[]).includes(d['sub'] as SubDetail)
      ? (d['sub'] as SubDetail)
      : base.sub,
    radialEven: d['radialEven'] === true,
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
    },
    renderMode: renderModes.includes(d['renderMode'] as RenderMode)
      ? (d['renderMode'] as RenderMode)
      : base.renderMode,
    connectivity: connectivities.includes(d['connectivity'] as Connectivity)
      ? (d['connectivity'] as Connectivity)
      : base.connectivity,
    metaball: {
      strength: clamp(Number(mb.strength ?? base.metaball.strength), 0, 100),
      perColor: Boolean(mb.perColor ?? base.metaball.perColor),
      quality: clamp(Math.round(Number(mb.quality) || base.metaball.quality), 2, 8),
      squareEdges: mb.squareEdges === true,
    },
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
