import type { Brush } from '../engine/brush.ts'
import { normalizeBrush, resizeBrush, squareBrush } from '../engine/brush.ts'
import type { SymmetryState } from '../engine/doc.ts'
import { DEFAULT_FILL_STYLE, type FillStyle } from '../engine/fillpatterns.ts'
import { DEFAULT_CONCENTRIC_RADII } from '../engine/shapes.ts'
import type { State } from './editor.store.ts'

export type Tool =
  | 'select'
  | 'pencil'
  | 'eraser'
  | 'fill'
  | 'picker'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'connector'
  | 'star'
  | 'polygon'
  | 'diamond'
  | 'heart'
  | 'spiral'
  | 'arrow'
  | 'lightning'
  | 'moon'
  | 'wave'
  | 'cross'
  | 'flower'
  | 'gear'
  | 'sun'
  | 'bento'
  | 'zigzag'
  | 'ring'
  | 'arc'
  | 'drop'
  | 'chevron'
  | 'concentric'
  | 'concentricRect'
  | 'skull'

/**
 * Fill + stroke semantics of the shape tools (Illustrator-style): a drawn shape is one object whose
 * interior fill and brush outline move together via selection. `fill` 'pattern' reuses the fill
 * tool's current dither/pattern style; `strokeColor` may be any hex (resolved into the palette at
 * draw time).
 */
export interface ShapePaint {
  fill: 'none' | 'solid' | 'pattern'
  stroke: boolean
  /** Outline placement relative to the shape edge */
  align: 'inner' | 'center' | 'outer'
  strokeColor: string
}

const DEFAULT_SHAPE_PAINT: ShapePaint = {
  fill: 'none',
  stroke: true,
  align: 'center',
  // empty = follow the current brush color, so fresh installs draw exactly like before
  strokeColor: '',
}

/** How importPixels stacks a converted image into the scene tree. */
export interface ImportLayering {
  /** One layer per distinct final color; off = everything lands on a single layer */
  splitByColor: boolean
  /** Every connected region of one color becomes its own object inside its layer */
  splitConnected: boolean
  /** Layer stacking: by covered area (largest at the bottom) or strict palette order */
  layerOrder: 'palette' | 'area'
}

const DEFAULT_IMPORT_LAYERING: ImportLayering = {
  splitByColor: true,
  splitConnected: false,
  layerOrder: 'area',
}

/** Geometry knobs of the shape tools, edited via the rail's per-tool settings. */
/** ToolOpts keys that hold numbers — the sliders' writable keys. */
export type NumericOptKey = {
  [K in keyof ToolOpts]: ToolOpts[K] extends number ? K : never
}[keyof ToolOpts]

export interface ToolOpts {
  starRays: number
  starInner: number
  starRotation: number
  polygonSides: number
  polygonRotation: number
  diamondRotation: number
  heartRotation: number
  spiralTurns: number
  spiralDir: number
  spiralRotation: number
  arrowHead: number
  arrowSpread: number
  lightningRotation: number
  moonThickness: number
  moonRotation: number
  wavePeriods: number
  waveAmplitude: number
  crossThickness: number
  crossRotation: number
  flowerPetals: number
  flowerRotation: number
  gearTeeth: number
  gearDepth: number
  gearRotation: number
  sunRays: number
  sunCore: number
  sunRayBase: number
  sunRayLength: number
  sunAlternate: number
  sunTaper: number
  sunWidth: number
  sunWave: number
  sunWavePeriods: number
  sunTwist: number
  sunRotation: number
  bentoCols: number
  bentoRows: number
  bentoGap: number
  bentoRadius: number
  bentoInset: number
  bentoChaos: number
  bentoMerge: number
  bentoSeed: number
  /** Corner rounding shared by rect/diamond/polygon/star, 0..0.5 */
  shapeCorner: number
  /** Side curvature shared by rect/diamond: negative = pinched, positive = bowed */
  shapeBulge: number
  /** Superellipse exponent for the ellipse tool: <2 pinched, 2 = ellipse, >2 squircle */
  ellipsePower: number
  /** Hole radius of the ring tool as a fraction of the outer radius */
  ringThickness: number
  /* --- skull --- */
  skullCraniumWidth: number
  skullCraniumHeight: number
  skullCrown: 'round' | 'flat'
  skullBrowRidge: number
  skullCheekWidth: number
  skullJawWidth: number
  skullJawHeight: number
  skullMandible: boolean
  skullEyeSize: number
  skullEyeSpacing: number
  skullEyeY: number
  skullEyeShape: 'round' | 'oval' | 'square' | 'angled'
  skullEyeTilt: number
  skullEyeAsym: number
  skullNoseWidth: number
  skullNoseHeight: number
  skullNoseY: number
  skullNoseShape: 'triangle' | 'heart' | 'teardrop' | 'slit'
  skullTeethCount: number
  skullTeethLen: number
  skullTeethGap: number
  skullTeethShape: 'rect' | 'rounded' | 'pointed' | 'fangs'
  skullMouthY: number
}

const DEFAULT_TOOL_OPTS: ToolOpts = {
  starRays: 5,
  starInner: 0.42,
  starRotation: 0,
  polygonSides: 6,
  polygonRotation: 0,
  diamondRotation: 0,
  heartRotation: 0,
  spiralTurns: 2.75,
  spiralDir: 1,
  spiralRotation: 0,
  arrowHead: 0.35,
  arrowSpread: 0.6,
  lightningRotation: 0,
  moonThickness: 0.293,
  moonRotation: 0,
  wavePeriods: 3,
  waveAmplitude: 0.15,
  crossThickness: 1 / 3,
  crossRotation: 0,
  flowerPetals: 5,
  flowerRotation: 0,
  gearTeeth: 8,
  gearDepth: 0.14,
  gearRotation: 0,
  sunRays: 12,
  sunCore: 0.18,
  sunRayBase: 0.22,
  sunRayLength: 1,
  sunAlternate: 1,
  sunTaper: 0,
  sunWidth: 0.55,
  sunWave: 0,
  sunWavePeriods: 2,
  sunTwist: 0,
  sunRotation: 0,
  bentoCols: 3,
  bentoRows: 3,
  bentoGap: 0.08,
  bentoRadius: 0.15,
  bentoInset: 0,
  bentoChaos: 0,
  bentoMerge: 0,
  bentoSeed: 1,
  shapeCorner: 0,
  shapeBulge: 0,
  ellipsePower: 2,
  ringThickness: 0.25,
  skullCraniumWidth: 1,
  skullCraniumHeight: 0.6,
  skullCrown: 'round',
  skullBrowRidge: 0.03,
  skullCheekWidth: 0.92,
  skullJawWidth: 0.72,
  skullJawHeight: 0.22,
  skullMandible: true,
  skullEyeSize: 0.16,
  skullEyeSpacing: 0.26,
  skullEyeY: 0.48,
  skullEyeShape: 'round',
  skullEyeTilt: 0,
  skullEyeAsym: 0,
  skullNoseWidth: 0.09,
  skullNoseHeight: 0.11,
  skullNoseY: 0.63,
  skullNoseShape: 'triangle',
  skullTeethCount: 8,
  skullTeethLen: 0.08,
  skullTeethGap: 0.35,
  skullTeethShape: 'rect',
  skullMouthY: 0.82,
}

/** What one fill click covers on a radial grid: a cell, the whole sector wedge or the ring. */
export type FillScope = 'cell' | 'sector' | 'ring'

/** The tool slice: active tool plus its knobs (brush, symmetry, fills, shape geometry). */
export interface ToolsSlice {
  tool: Tool
  color: string
  /** Active brush: pixel size (tip grid) + on/off tip pattern */
  brush: Brush
  /** Which brush preset is current (built-in or user id); null = tip edited by hand */
  brushId: string | null
  /** Snap brush stamps to the pixel-size grid (Alt stamps freely, centered on the cursor) */
  brushSnap: boolean
  symmetry: SymmetryState
  /** Radial grid only: what a fill click covers (cell / sector wedge / ring) */
  fillScope: FillScope
  /** Fill tool styling: solid color or a two-color pattern/dither fill */
  fillStyle: FillStyle
  /** Shape tools styling: interior fill + outline with placement, drawn as one object */
  shapePaint: ShapePaint
  /** Per-tool shape settings (star rays, gear teeth, rotation, …) */
  toolOpts: ToolOpts
  /**
   * Sample grid of the tool-settings preview, in cells; null = the automatic per-context size.
   * User-adjustable, clamped to the current canvas dimensions.
   */
  previewGrid: { cols: number; rows: number } | null
  /** How an imported image splits into layers/objects at commit time */
  importLayering: ImportLayering
  /** Normalized radii of the concentric-circles / concentric-rects tools */
  concentricRadii: number[]
  setTool: (tool: Tool) => void
  setColor: (color: string) => void
  patchBrush: (patch: Partial<Brush>) => void
  setBrushSnap: (v: boolean) => void
  patchSymmetry: (patch: Partial<SymmetryState>) => void
  setFillScope: (scope: FillScope) => void
  patchFillStyle: (patch: Partial<FillStyle>) => void
  patchShapePaint: (patch: Partial<ShapePaint>) => void
  patchToolOpts: (patch: Partial<ToolOpts>) => void
  /** Override the tool-settings preview grid; null returns to the automatic size */
  setPreviewGrid: (grid: { cols: number; rows: number } | null) => void
  /** Layer/object split and stacking of imported images */
  patchImportLayering: (patch: Partial<ImportLayering>) => void
  /** Resize the radii list of the concentric tools (1..8 loops) */
  setConcentricCount: (n: number) => void
  /** Set one loop radius of the concentric tools */
  setConcentricRadius: (index: number, r: number) => void
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

/**
 * Tool state and its direct setters, composed into the main store. Kept apart so editor.store.ts
 * stays under the file-size ratchet.
 */
export function createToolsSlice({ set }: SliceApi): ToolsSlice {
  return {
    tool: 'pencil',
    color: '#e63946',
    brush: squareBrush(1),
    brushId: 'px1',
    brushSnap: true,
    symmetry: { mode: 'none', n: 8, cell: 16, showGuides: true, fill: 100, phase: 0, twist: 0 },
    fillScope: 'cell',
    fillStyle: { ...DEFAULT_FILL_STYLE },
    shapePaint: { ...DEFAULT_SHAPE_PAINT },
    toolOpts: { ...DEFAULT_TOOL_OPTS },
    previewGrid: null,
    importLayering: { ...DEFAULT_IMPORT_LAYERING },
    concentricRadii: [...DEFAULT_CONCENTRIC_RADII],

    setTool: (tool) =>
      set((s) => {
        // the fill tool keeps the selection: clicking a selected shape re-fills it whole
        if (tool !== 'select' && tool !== 'fill' && s.selection.length > 0) {
          return { tool, selection: [] }
        }
        return { tool }
      }),
    setColor: (color) => set({ color }),
    patchBrush: (patch) =>
      set((s) => {
        // any hand edit makes the current tip a custom one (no preset selected)
        if (patch.size !== undefined && patch.size !== s.brush.size) {
          return { brushId: null, brush: resizeBrush(s.brush, patch.size) }
        }
        return { brushId: null, brush: normalizeBrush({ ...s.brush, ...patch }) }
      }),
    setBrushSnap: (brushSnap) => set({ brushSnap }),
    patchSymmetry: (patch) => set((s) => ({ symmetry: { ...s.symmetry, ...patch } })),
    setFillScope: (fillScope) => set({ fillScope }),
    patchFillStyle: (patch) => set((s) => ({ fillStyle: { ...s.fillStyle, ...patch } })),
    patchShapePaint: (patch) => set((s) => ({ shapePaint: { ...s.shapePaint, ...patch } })),
    patchToolOpts: (patch) => set((s) => ({ toolOpts: { ...s.toolOpts, ...patch } })),
    setPreviewGrid: (grid) => set({ previewGrid: grid }),
    patchImportLayering: (patch) =>
      set((s) => ({ importLayering: { ...s.importLayering, ...patch } })),
    setConcentricCount: (n) => {
      const target = Math.max(1, Math.min(8, Math.round(n)))
      set((s) => {
        const cur = s.concentricRadii
        if (cur.length === target) return s
        if (cur.length > target) return { concentricRadii: cur.slice(0, target) }
        // new loops slot evenly between the smallest radius and zero
        const last = cur.at(-1) ?? 1
        const add = Array.from({ length: target - cur.length }, (_, i) =>
          Math.max(0.05, (last * (target - cur.length - i)) / (target - cur.length + 1)),
        )
        return { concentricRadii: [...cur, ...add] }
      })
    },
    setConcentricRadius: (index, r) =>
      set((s) => {
        const v = Math.max(0.05, Math.min(1, r))
        if (index < 0 || index >= s.concentricRadii.length) return s
        const next = [...s.concentricRadii]
        next[index] = v
        return { concentricRadii: next }
      }),
  }
}
