// ---- shape tools (star, spiral, ...) ----------------------------------------
//
// Each tool is an outline traced from a drag (start a → end b). Box-filling
// shapes are defined as normalized polylines in the unit square and scaled to
// the drag's bounding box; arrow and wave follow the drag direction instead.
// The float polylines double as doc-space paths for the non-square grids,
// which sample them through their own cell lookup.

export type ShapeToolId =
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

/** Rail display order of the shape tools. */
export const SHAPE_TOOLS: readonly ShapeToolId[] = [
  'star',
  'polygon',
  'diamond',
  'heart',
  'spiral',
  'arrow',
  'lightning',
  'moon',
  'wave',
  'zigzag',
  'cross',
  'flower',
  'gear',
  'sun',
  'bento',
  'ring',
  'arc',
  'drop',
  'chevron',
  'concentric',
  'concentricRect',
  'skull',
]

const SHAPE_TOOL_IDS = new Set<string>(SHAPE_TOOLS)

export function isShapeTool(tool: string): tool is ShapeToolId {
  return SHAPE_TOOL_IDS.has(tool)
}

/** Box-filling shape tools: outlined from the drag's bounding box. */
export type BoxShapeId = Exclude<ShapeToolId, 'arrow' | 'wave' | 'zigzag'>

/** Box-filling shapes routed to the radial/composite outline builders. */
export type RadialShapeId =
  | 'sun'
  | 'bento'
  | 'ring'
  | 'arc'
  | 'drop'
  | 'chevron'
  | 'concentric'
  | 'concentricRect'
  | 'skull'

/** Per-tool geometry knobs; every field is optional and falls back to its default. */
export interface ShapeOpts {
  starRays?: number
  /** Inner/outer radius ratio of the star */
  starInner?: number
  /** Rotation in degrees, around the box center */
  starRotation?: number
  polygonSides?: number
  polygonRotation?: number
  diamondRotation?: number
  heartRotation?: number
  /** Full revolutions of the spiral */
  spiralTurns?: number
  /** 1 = clockwise winding, -1 = counter-clockwise */
  spiralDir?: number
  spiralRotation?: number
  /** Head length as a fraction of the drag length */
  arrowHead?: number
  /** Barb half-width as a fraction of the head length */
  arrowSpread?: number
  lightningRotation?: number
  /** 0.05 = thin sliver … 0.45 = almost a full circle */
  moonThickness?: number
  moonRotation?: number
  /** Full sine periods along the drag */
  wavePeriods?: number
  /** Amplitude as a fraction of the drag length */
  waveAmplitude?: number
  /** Arm width as a fraction of the box side */
  crossThickness?: number
  crossRotation?: number
  flowerPetals?: number
  flowerRotation?: number
  gearTeeth?: number
  /** Tooth height as a fraction of the radius */
  gearDepth?: number
  gearRotation?: number
  sunRays?: number
  /** Radius of the sun's core disc as a fraction of the outer radius */
  sunCore?: number
  /** Radius where the rays start */
  sunRayBase?: number
  /** Ray tip radius as a fraction of the outer radius */
  sunRayLength?: number
  /** Length factor applied to every second ray (1 = all rays equal) */
  sunAlternate?: number
  /** Ray narrowing toward the tip: 1 = rectangular, 0 = triangular */
  sunTaper?: number
  /** Angular width of a ray as a fraction of its sector */
  sunWidth?: number
  /** Sine bending along the ray (0 = straight) */
  sunWave?: number
  /** Full sine periods along a ray */
  sunWavePeriods?: number
  /** Progressive angular bend of the ray, -1..1 */
  sunTwist?: number
  sunRotation?: number
  bentoCols?: number
  bentoRows?: number
  /** Width of the gap stripes between cells, fraction of the box side */
  bentoGap?: number
  /** Corner rounding of the bento cells, 0..0.5 of the cell size */
  bentoRadius?: number
  /** Margin between the drag box and the outer cells */
  bentoInset?: number
  /** Deterministic jitter of the dividing lines (seeded) */
  bentoChaos?: number
  /** Probability of merging neighboring slots into spans (seeded) */
  bentoMerge?: number
  /** Layout seed; reroll for a different split */
  bentoSeed?: number
  /** Corner rounding shared by rect/diamond/polygon/star, 0..0.5 */
  shapeCorner?: number
  /** Side curvature shared by rect/diamond: negative = pinched in, positive = bowed out */
  shapeBulge?: number
  /** Superellipse exponent for the ellipse tool: <1 pinched, 1 = ellipse, >1 squircle */
  ellipsePower?: number
  /** Hole radius of the ring tool as a fraction of the outer radius */
  ringThickness?: number
  /** Normalized radii (0..1, roughly descending) of the concentric tools' loops */
  circles?: number[]
  /* --- skull: cranium --- */
  /** Dome width as a fraction of the drag box width */
  skullCraniumWidth?: number
  /** Dome height as a fraction of the drag box height */
  skullCraniumHeight?: number
  /** 'round' = spherical vault, 'flat' = boxy (superellipse) crown */
  skullCrown?: 'round' | 'flat'
  /** Brow ridge bulge below the temples, fraction of the box width */
  skullBrowRidge?: number
  /** Width at the cheekbones, fraction of the box width */
  skullCheekWidth?: number
  /* --- skull: jaw --- */
  /** Width of the lower face, fraction of the box width */
  skullJawWidth?: number
  /** Lower-face depth: how far the chin section rises, fraction of the box height */
  skullJawHeight?: number
  /** Mandible visible: false closes the silhouette just under the mouth */
  skullMandible?: boolean
  /* --- skull: eyes --- */
  /** Eye socket radius, fraction of the box width */
  skullEyeSize?: number
  /** Distance between the socket centers, fraction of the box width */
  skullEyeSpacing?: number
  /** Socket line height, fraction of the box height from the top */
  skullEyeY?: number
  /** Socket silhouette */
  skullEyeShape?: 'round' | 'oval' | 'square' | 'angled'
  /** Socket slant, -1 = sad (outer corners down) … 1 = angry (outer corners up) */
  skullEyeTilt?: number
  /** Left socket smaller and lower (0 = symmetric) */
  skullEyeAsym?: number
  /* --- skull: nose --- */
  skullNoseWidth?: number
  skullNoseHeight?: number
  /** Nasal aperture center height, fraction of the box height */
  skullNoseY?: number
  skullNoseShape?: 'triangle' | 'heart' | 'teardrop' | 'slit'
  /* --- skull: mouth / teeth --- */
  /** Number of upper teeth (0 = a plain dark opening) */
  skullTeethCount?: number
  /** Tooth length, fraction of the box height */
  skullTeethLen?: number
  /** How deep the gaps between teeth cut in, 0..1 */
  skullTeethGap?: number
  skullTeethShape?: 'rect' | 'rounded' | 'pointed' | 'fangs'
  /** Mouth line height, fraction of the box height */
  skullMouthY?: number
}
