/** Rasterized shape outlines in integer buffer coordinates. */

export function linePoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  let dx = Math.abs(x1 - x0)
  let dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let x = x0
  let y = y0
  for (let guard = 0; guard < 100000; guard++) {
    pts.push([x, y])
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
  return pts
}

export function rectPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opts: ShapeOpts = {},
): Array<[number, number]> {
  const ax = Math.min(x0, x1)
  const bx = Math.max(x0, x1)
  const ay = Math.min(y0, y1)
  const by = Math.max(y0, y1)
  const corner = clamp(opts.shapeCorner ?? 0, 0, 0.5)
  const bulge = clamp(opts.shapeBulge ?? 0, -1, 1)
  // fast path keeps the pixel-exact rows/columns of the plain rectangle
  if (corner <= 1e-9 && Math.abs(bulge) <= 1e-9) {
    const pts = new Map<string, [number, number]>()
    for (let x = ax; x <= bx; x++) {
      pts.set(`${x},${ay}`, [x, ay])
      pts.set(`${x},${by}`, [x, by])
    }
    for (let y = ay; y <= by; y++) {
      pts.set(`${ax},${y}`, [ax, y])
      pts.set(`${bx},${y}`, [bx, y])
    }
    return [...pts.values()]
  }
  let poly = roundedRectPolyline(ax, ay, bx, by, corner * Math.min(bx - ax, by - ay))
  if (Math.abs(bulge) > 1e-9) poly = bulgePolyline(poly, bulge * 0.25)
  return polylineCells([poly])
}

export function ellipsePoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opts: ShapeOpts = {},
): Array<[number, number]> {
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const a = Math.abs(x1 - x0) / 2
  const b = Math.abs(y1 - y0) / 2
  if (a === 0 && b === 0) return [[x0, y0]]
  // superellipse exponent: 2 = ordinary ellipse, <2 pinched, >2 squircle
  const power = clamp(opts.ellipsePower ?? 2, 0.5, 8)
  const e = 2 / power
  const steps = Math.max(16, Math.ceil((a + b) * 4))
  const pts = new Map<string, [number, number]>()
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    const ct = Math.cos(t)
    const st = Math.sin(t)
    const px = Math.round(cx + a * Math.sign(ct) * Math.pow(Math.abs(ct), e))
    const py = Math.round(cy + b * Math.sign(st) * Math.pow(Math.abs(st), e))
    pts.set(`${px},${py}`, [px, py])
  }
  return [...pts.values()]
}

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

type Polyline = Array<[number, number]>

type BoxShapeId = Exclude<ShapeToolId, 'arrow' | 'wave' | 'zigzag'>

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.round(clamp(v, lo, hi))
}

/** Rotate normalized polylines around the box center by `deg` degrees. */
function rotated(polys: Polyline[], deg: number): Polyline[] {
  if (!deg) return polys
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return polys.map((poly) =>
    poly.map(([x, y]) => {
      const dx = x - 0.5
      const dy = y - 0.5
      return [0.5 + dx * cos - dy * sin, 0.5 + dx * sin + dy * cos] as [number, number]
    }),
  )
}

/** Closed/open outline pieces of a box-filling shape in the unit square. */
function boxShapePolylines(tool: BoxShapeId, opts: ShapeOpts, steps: number): Polyline[] {
  switch (tool) {
    case 'star': {
      const rays = clampInt(opts.starRays ?? 5, 3, 12)
      const inner = clamp(opts.starInner ?? 0.42, 0.15, 0.49)
      const pts: Polyline = []
      for (let i = 0; i < rays * 2; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / rays
        const r = i % 2 === 0 ? 0.5 : 0.5 * inner
        pts.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)])
      }
      pts.push(pts[0])
      return rotated(decoratePolylines([pts], opts), opts.starRotation ?? 0)
    }
    case 'polygon': {
      const sides = clampInt(opts.polygonSides ?? 6, 3, 12)
      const pts: Polyline = []
      for (let i = 0; i < sides; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides
        pts.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)])
      }
      pts.push(pts[0])
      return rotated(decoratePolylines([pts], opts), opts.polygonRotation ?? 0)
    }
    case 'diamond':
      return rotated(
        decoratePolylines(
          [
            [
              [0.5, 0],
              [1, 0.5],
              [0.5, 1],
              [0, 0.5],
              [0.5, 0],
            ],
          ],
          opts,
        ),
        opts.diamondRotation ?? 0,
      )
    case 'cross': {
      const a = clamp(opts.crossThickness ?? 1 / 3, 0.15, 0.45)
      return rotated(
        [
          [
            [a, 0],
            [1 - a, 0],
            [1 - a, a],
            [1, a],
            [1, 1 - a],
            [1 - a, 1 - a],
            [1 - a, 1],
            [a, 1],
            [a, 1 - a],
            [0, 1 - a],
            [0, a],
            [a, a],
            [a, 0],
          ],
        ],
        opts.crossRotation ?? 0,
      )
    }
    case 'lightning':
      return rotated(
        [
          [
            [0.62, 0],
            [0.18, 0.58],
            [0.44, 0.58],
            [0.3, 1],
            [0.82, 0.42],
            [0.54, 0.42],
            [0.74, 0],
            [0.62, 0],
          ],
        ],
        opts.lightningRotation ?? 0,
      )
    case 'heart': {
      // classic parametric heart, auto-fitted and centered into the unit box
      const pad = 0.07
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      const raw: Polyline = []
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * 2 * Math.PI
        const x = 16 * Math.sin(t) ** 3
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
        raw.push([x, y])
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      const scale = (1 - pad * 2) / Math.max(maxX - minX, maxY - minY)
      const cx = pad + (1 - pad * 2 - (maxX - minX) * scale) / 2
      const cy = pad + (1 - pad * 2 - (maxY - minY) * scale) / 2
      return rotated(
        [
          raw.map(
            ([x, y]) => [cx + (x - minX) * scale, cy + (y - minY) * scale] as [number, number],
          ),
        ],
        opts.heartRotation ?? 0,
      )
    }
    case 'spiral': {
      const turns = clamp(opts.spiralTurns ?? 2.75, 0.5, 6)
      const dir = (opts.spiralDir ?? 1) >= 0 ? 1 : -1
      const phase = ((opts.spiralRotation ?? 0) * Math.PI) / 180 - Math.PI / 2
      const tmax = turns * 2 * Math.PI
      const pts: Polyline = []
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * tmax
        const r = (t / tmax) * 0.5
        pts.push([0.5 + r * Math.cos(dir * t + phase), 0.5 + r * Math.sin(dir * t + phase)])
      }
      return [pts]
    }
    case 'moon': {
      // outer right semicircle + inner arc bulging less, sharing both tips;
      // thickness t is the empty gap between the arcs at the widest point
      const t = clamp(opts.moonThickness ?? 0.293, 0.05, 0.45)
      const c = ((1 - t) * (1 - t) - 0.5) / (1 - 2 * t)
      const r2 = 1 - t - c
      const seg = Math.max(8, Math.ceil(steps / 2))
      const ang = Math.atan2(0.5, 0.5 - c)
      const pts: Polyline = []
      for (let i = 0; i <= seg; i++) {
        const a = -Math.PI / 2 + (i / seg) * Math.PI
        pts.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)])
      }
      for (let i = 0; i <= seg; i++) {
        const a = ang - (i / seg) * 2 * ang
        pts.push([c + r2 * Math.cos(a), 0.5 + r2 * Math.sin(a)])
      }
      return rotated([pts], opts.moonRotation ?? 0)
    }
    case 'flower': {
      // rose curve; odd petal counts use signed cos(kθ), even ones use |cos(kθ)|
      const petals = clampInt(opts.flowerPetals ?? 5, 3, 12)
      const k = petals % 2 === 0 ? petals / 2 : petals
      const phase = ((opts.flowerRotation ?? 0) * Math.PI) / 180
      const pts: Polyline = []
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * 2 * Math.PI
        const raw = 0.5 * Math.cos(k * t)
        const r = petals % 2 === 0 ? Math.abs(raw) : raw
        pts.push([0.5 + r * Math.cos(t + phase), 0.5 + r * Math.sin(t + phase)])
      }
      return [pts]
    }
    case 'gear': {
      const teeth = clampInt(opts.gearTeeth ?? 8, 4, 16)
      const depth = clamp(opts.gearDepth ?? 0.14, 0.05, 0.3)
      const root = 0.5 - depth
      const sect = (2 * Math.PI) / teeth
      const pts: Polyline = []
      for (let i = 0; i < teeth; i++) {
        const s = i * sect
        const angs = [s + 0.04 * sect, s + 0.14 * sect, s + 0.36 * sect, s + 0.46 * sect]
        const rads = [root, 0.5, 0.5, root]
        for (let j = 0; j < 4; j++) {
          pts.push([0.5 + rads[j] * Math.cos(angs[j]), 0.5 + rads[j] * Math.sin(angs[j])])
        }
      }
      pts.push(pts[0])
      return rotated([pts], opts.gearRotation ?? 0)
    }
    case 'sun': {
      // gear generalization: a core disc plus rays that can be rectangular or
      // triangular, straight, wavy or twisted — one closed polyline per part
      const rays = clampInt(opts.sunRays ?? 12, 3, 32)
      const core = clamp(opts.sunCore ?? 0.18, 0.02, 0.45)
      const rBase = clamp(opts.sunRayBase ?? 0.22, 0.02, 0.49)
      const rayLen = clamp(opts.sunRayLength ?? 1, 0.3, 1)
      const alt = clamp(opts.sunAlternate ?? 1, 0.05, 1)
      const taper = clamp(opts.sunTaper ?? 0, 0, 1)
      const width = clamp(opts.sunWidth ?? 0.55, 0.1, 1)
      const wave = clamp(opts.sunWave ?? 0, 0, 1)
      const periods = clampInt(opts.sunWavePeriods ?? 2, 1, 8)
      const twist = clamp(opts.sunTwist ?? 0, -1, 1)
      const polys: Polyline[] = []
      const cseg = Math.max(16, steps)
      const corePts: Polyline = []
      for (let i = 0; i <= cseg; i++) {
        const a = -Math.PI / 2 + (i / cseg) * 2 * Math.PI
        corePts.push([0.5 + core * Math.cos(a), 0.5 + core * Math.sin(a)])
      }
      corePts[cseg] = corePts[0] // close exactly, without float drift
      polys.push(corePts)
      const sect = (2 * Math.PI) / rays
      // lateral sine amplitude relative to the ray's own span
      const amp = wave * 0.5 * Math.abs(rayLen * 0.5 - rBase)
      const seg = Math.min(64, Math.max(8, periods * 6 + 4))
      const twistSpan = twist * Math.PI * 0.5
      const put = (poly: Polyline, r: number, ang: number) => {
        // clamp into the inscribed circle so wavy rays never leave the box
        let x = 0.5 + r * Math.cos(ang)
        let y = 0.5 + r * Math.sin(ang)
        const dx = x - 0.5
        const dy = y - 0.5
        const d = Math.hypot(dx, dy)
        if (d > 0.5) {
          x = 0.5 + (dx / d) * 0.5
          y = 0.5 + (dy / d) * 0.5
        }
        poly.push([x, y])
      }
      const edge = (poly: Polyline, t: number, a0: number, rTip: number, side: 1 | -1) => {
        const r = rBase + (rTip - rBase) * t
        const th = twistSpan * t + (r > 1e-6 ? (amp * Math.sin(t * periods * 2 * Math.PI)) / r : 0)
        const hw = ((sect * width) / 2) * (1 + (taper - 1) * t)
        put(poly, r, a0 + th + side * hw)
      }
      for (let i = 0; i < rays; i++) {
        const a0 = -Math.PI / 2 + i * sect
        const rTip = 0.5 * rayLen * (i % 2 === 1 ? alt : 1)
        const poly: Polyline = []
        for (let j = 0; j <= seg; j++) edge(poly, j / seg, a0, rTip, -1)
        for (let j = seg; j >= 0; j--) edge(poly, j / seg, a0, rTip, 1)
        poly.push(poly[0])
        polys.push(poly)
      }
      return rotated(polys, opts.sunRotation ?? 0)
    }
    case 'bento': {
      // rounded cells separated by gap stripes; chaos offsets the dividers and
      // merge glues neighboring slots into spans (both seeded, so the drag
      // preview is stable between frames)
      const cells = bentoSlots(opts)
      const r = clamp(opts.bentoRadius ?? 0.15, 0, 0.5)
      return cells.map((c) => roundedRectPolyline(c.x0, c.y0, c.x1, c.y1, r))
    }
    case 'ring': {
      // outer circle + inner hole loop; both stamped, the union reads as a ring band
      const t = clamp(opts.ringThickness ?? 0.25, 0.1, 0.45)
      const outer: Polyline = []
      const inner: Polyline = []
      for (let i = 0; i <= steps; i++) {
        const a = -Math.PI / 2 + (i / steps) * 2 * Math.PI
        outer.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)])
        inner.push([0.5 + (0.5 - t) * Math.cos(a), 0.5 + (0.5 - t) * Math.sin(a)])
      }
      return [outer, inner]
    }
    case 'arc': {
      // open semicircle resting on the bottom edge of the box
      const seg = Math.max(16, steps)
      const pts: Polyline = []
      for (let i = 0; i <= seg; i++) {
        const a = Math.PI - (i / seg) * Math.PI
        pts.push([0.5 + 0.5 * Math.cos(a), 1 - 0.5 * Math.sin(a)])
      }
      return rotated([pts], opts.starRotation ?? 0)
    }
    case 'drop': {
      // pin/teardrop: bottom circle + two tangents meeting at the top apex
      const R = 0.34
      const cyc = 0.64
      const ay = 0.08
      const alpha = Math.acos(R / (cyc - ay))
      const seg = Math.max(16, Math.ceil(steps * 0.7))
      const a0 = -Math.PI / 2 + alpha
      const sweep = 2 * Math.PI - 2 * alpha
      const pts: Polyline = []
      for (let i = 0; i <= seg; i++) {
        const a = a0 + (i / seg) * sweep
        pts.push([0.5 + R * Math.cos(a), cyc + R * Math.sin(a)])
      }
      pts.push([0.5, ay])
      pts.push(pts[0])
      return rotated([pts], opts.polygonRotation ?? 0)
    }
    case 'chevron': {
      // "^" band: outer V with an inner V cut back into it
      const t = clamp(opts.crossThickness ?? 0.3, 0.15, 0.45)
      const tipY = 0.12
      const baseY = 0.88
      const inset = 0.22
      return rotated(
        [
          [
            [inset, baseY],
            [0.5, tipY],
            [1 - inset, baseY],
            [1 - inset - t, baseY],
            [0.5, tipY + t * 1.6],
            [inset + t, baseY],
            [inset, baseY],
          ],
        ],
        opts.crossRotation ?? 0,
      )
    }
    case 'concentric': {
      // one full circle per normalized radius; radii are user-editable
      const radii = concentricRadii(opts)
      return radii.map((r) => {
        const pts: Polyline = []
        for (let i = 0; i <= steps; i++) {
          const a = -Math.PI / 2 + (i / steps) * 2 * Math.PI
          pts.push([0.5 + 0.5 * r * Math.cos(a), 0.5 + 0.5 * r * Math.sin(a)])
        }
        return pts
      })
    }
    case 'concentricRect': {
      // concentric rectangles sharing the box center
      const radii = concentricRadii(opts)
      return radii.map((r) => {
        const hw = 0.5 * r
        return [
          [0.5 - hw, 0.5 - hw],
          [0.5 + hw, 0.5 - hw],
          [0.5 + hw, 0.5 + hw],
          [0.5 - hw, 0.5 + hw],
          [0.5 - hw, 0.5 - hw],
        ]
      })
    }
    case 'skull':
      return skullPolylines(opts, steps)
  }
}

/* ------------------------------- skull ------------------------------- */
//
// A front-view skull built from one closed silhouette (cranium dome → brow →
// cheekbones → jaw → chin) plus nested hole loops: two eye sockets, the nasal
// aperture and the toothed mouth opening. Later loops punch holes, so the fill
// must be even-odd (see shapeHasHoles / fillCellsEvenOdd).

/** Quadratic Bézier sampler: from a through control c to b. */
function quadSeg(
  a: [number, number],
  c: [number, number],
  b: [number, number],
  n: number,
): Polyline {
  const pts: Polyline = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    pts.push([
      u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
    ])
  }
  return pts
}

/** Ellipse arc sampler with optional rotation (radians) around its center. */
function ellipseArc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
  n: number,
  rot = 0,
): Polyline {
  const pts: Polyline = []
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  for (let i = 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n
    const x = rx * Math.cos(t)
    const y = ry * Math.sin(t)
    pts.push([cx + x * cos - y * sin, cy + x * sin + y * cos])
  }
  return pts
}

function skullPolylines(opts: ShapeOpts, steps: number): Polyline[] {
  const craniumW = clamp(opts.skullCraniumWidth ?? 1, 0.6, 1.25)
  const craniumH = clamp(opts.skullCraniumHeight ?? 0.6, 0.45, 0.75)
  const crown = opts.skullCrown ?? 'round'
  const brow = clamp(opts.skullBrowRidge ?? 0.03, 0, 0.12)
  const cheekW = clamp(opts.skullCheekWidth ?? 0.92, 0.6, 1.1)
  const jawW = clamp(opts.skullJawWidth ?? 0.72, 0.35, 0.95)
  const jawH = clamp(opts.skullJawHeight ?? 0.22, 0.1, 0.3)
  const mandible = opts.skullMandible ?? true
  const eyeR = clamp(opts.skullEyeSize ?? 0.16, 0.06, 0.26) * 0.5
  const eyeDX = clamp(opts.skullEyeSpacing ?? 0.26, 0.12, 0.4) * 0.5
  const eyeY = clamp(opts.skullEyeY ?? 0.48, 0.38, 0.6)
  const eyeShape = opts.skullEyeShape ?? 'round'
  const eyeTilt = clamp(opts.skullEyeTilt ?? 0, -1, 1)
  const eyeAsym = clamp(opts.skullEyeAsym ?? 0, 0, 1)
  const noseW = clamp(opts.skullNoseWidth ?? 0.09, 0.04, 0.16)
  const noseH = clamp(opts.skullNoseHeight ?? 0.11, 0.05, 0.2)
  const noseY = clamp(opts.skullNoseY ?? 0.63, 0.52, 0.75)
  const noseShape = opts.skullNoseShape ?? 'triangle'
  const teeth = clampInt(opts.skullTeethCount ?? 8, 0, 14)
  const teethLen = clamp(opts.skullTeethLen ?? 0.08, 0.04, 0.14)
  const teethGap = clamp(opts.skullTeethGap ?? 0.35, 0, 1)
  const teethShape = opts.skullTeethShape ?? 'rect'
  const mouthY = clamp(opts.skullMouthY ?? 0.82, 0.68, 0.9)

  const polys: Polyline[] = []

  /* ---- silhouette: right half from the crown down, mirrored to the left ---- */
  const domeRx = Math.min(0.49, 0.5 * craniumW)
  const domeCy = craniumH
  const domePow = crown === 'flat' ? 0.55 : 1 // superellipse exponent 2/p: 2 → round, ~3.6 → boxy
  const templeA = -0.12 // radians below the equator where the dome hands over
  const domeEndX = 0.5 + domeRx * Math.cos(templeA)
  const domeEndY = domeCy + domeCy * Math.sin(templeA)
  const browX = Math.min(0.49, domeRx * 0.94 + brow)
  const browY = domeEndY + 0.03
  const cheekY = Math.min(0.78, eyeY + 0.1)
  const jawTopY = Math.min(0.94, Math.max(mouthY + teethLen + 0.04, 1 - jawH))
  const chinY = mandible ? 1 : jawTopY + 0.02
  const jawX = 0.5 + 0.5 * jawW
  const cheekX = 0.5 + 0.5 * cheekW

  const right: Polyline = []
  // crown: superellipse arc from the top center to the temple
  const domeRy = domeCy // top of the dome sits on y=0
  const domeSeg = Math.max(14, Math.ceil(steps / 8))
  for (let i = 0; i <= domeSeg; i++) {
    const a = -Math.PI / 2 + ((templeA + Math.PI / 2) * i) / domeSeg
    const ct = Math.cos(a)
    const st = Math.sin(a)
    right.push([
      0.5 + domeRx * Math.sign(ct) * Math.pow(Math.abs(ct), domePow),
      domeCy + domeRy * Math.sign(st) * Math.pow(Math.abs(st), domePow),
    ])
  }
  right.push([domeEndX, domeEndY])
  // brow ridge: small outward bump under the temple
  right.push(...quadSeg([domeEndX, domeEndY], [browX + 0.01, browY - 0.02], [browX, browY], 6))
  // cheekbone: curve out to the widest lower point
  right.push(...quadSeg([browX, browY], [cheekX + 0.02, cheekY - 0.07], [cheekX, cheekY], 8))
  // taper to the jaw corner
  right.push(...quadSeg([cheekX, cheekY], [jawX + 0.02, cheekY + 0.08], [jawX, jawTopY], 8))
  if (mandible) {
    // jaw side down to the rounded chin
    right.push(...quadSeg([jawX, jawTopY], [jawX, chinY - 0.06], [0.5, chinY], 8))
  } else {
    right.push(...quadSeg([jawX, jawTopY], [0.5 + jawW * 0.25, chinY], [0.5, chinY], 6))
  }
  const loop: Polyline = [...right]
  // mirror the right half (skip duplicated endpoints) in reverse
  for (let i = right.length - 2; i >= 1; i--) {
    loop.push([1 - right[i][0], right[i][1]])
  }
  loop.push(loop[0])
  polys.push(decoratePolylines([loop], opts)[0])

  /* ---- eye sockets ---- */
  const eye = (side: 1 | -1) => {
    const cx = 0.5 + side * eyeDX
    const cy = eyeY + (side === -1 ? eyeAsym * 0.035 : 0)
    const r = eyeR * (side === -1 ? 1 - eyeAsym * 0.22 : 1)
    const rot = eyeTilt * 0.32 * side
    const n = 24
    if (eyeShape === 'square') {
      return roundedRectPolyline(
        cx - r * 0.95,
        cy - r * 0.72,
        cx + r * 0.95,
        cy + r * 0.72,
        r * 0.35,
      )
    }
    const ry = eyeShape === 'oval' ? r * 1.4 : eyeShape === 'angled' ? r * 0.62 : r
    const rx = eyeShape === 'angled' ? r * 1.18 : r
    const pts = ellipseArc(cx, cy, rx, ry, 0, 2 * Math.PI, n, rot)
    pts.push(pts[0])
    return pts
  }
  polys.push(eye(1), eye(-1))

  /* ---- nasal aperture ---- */
  {
    const top = noseY - noseH / 2
    const bot = noseY + noseH / 2
    const w2 = noseW / 2
    const cx = 0.5
    if (noseShape === 'slit') {
      const pts = roundedRectPolyline(cx - w2 * 0.45, top, cx + w2 * 0.45, bot, w2 * 0.2)
      polys.push(pts)
    } else if (noseShape === 'triangle') {
      polys.push([
        [cx - w2, top],
        [cx + w2, top],
        [cx + w2 * 0.3, bot - noseH * 0.12],
        [cx, bot],
        [cx - w2 * 0.3, bot - noseH * 0.12],
        [cx - w2, top],
      ])
    } else if (noseShape === 'heart') {
      // two lobes on top, tapering to a point — the classic nasal aperture
      const pts: Polyline = []
      pts.push(
        ...quadSeg([cx - w2, top + noseH * 0.3], [cx - w2 * 0.8, bot - noseH * 0.2], [cx, bot], 8),
      )
      pts.push(
        ...quadSeg([cx, bot], [cx + w2 * 0.8, bot - noseH * 0.2], [cx + w2, top + noseH * 0.3], 8),
      )
      pts.push(
        ...quadSeg(
          [cx + w2, top + noseH * 0.3],
          [cx + w2 * 0.5, top - noseH * 0.08],
          [cx + w2 * 0.12, top + noseH * 0.16],
          6,
        ),
      )
      pts.push(
        ...quadSeg(
          [cx + w2 * 0.12, top + noseH * 0.16],
          [cx, top + noseH * 0.26],
          [cx - w2 * 0.12, top + noseH * 0.16],
          5,
        ),
      )
      pts.push(
        ...quadSeg(
          [cx - w2 * 0.12, top + noseH * 0.16],
          [cx - w2 * 0.5, top - noseH * 0.08],
          [cx - w2, top + noseH * 0.3],
          6,
        ),
      )
      pts.push(pts[0])
      polys.push(pts)
    } else {
      // teardrop: round top, tapering to the bottom point
      const r = w2 * 0.9
      const cyc = top + r
      const pts: Polyline = []
      pts.push(...ellipseArc(cx, cyc, r, r, Math.PI * 0.95, Math.PI * 2.05, 14))
      pts.push(
        ...quadSeg(
          [cx + r * 0.95, cyc + r * 0.3],
          [cx + w2 * 0.4, bot - noseH * 0.18],
          [cx, bot],
          6,
        ),
      )
      pts.push(
        ...quadSeg(
          [cx, bot],
          [cx - w2 * 0.4, bot - noseH * 0.18],
          [cx - r * 0.95, cyc + r * 0.3],
          6,
        ),
      )
      pts.push(pts[0])
      polys.push(pts)
    }
  }

  /* ---- mouth opening with a toothed top edge ---- */
  {
    const mouthW = jawW * 0.68
    const ml = 0.5 - mouthW / 2
    const mr = 0.5 + mouthW / 2
    const mt = mouthY
    const mb = mt + teethLen * 1.2
    if (teeth < 1) {
      polys.push(roundedRectPolyline(ml, mt, mr, mb, teethLen * 0.3))
    } else {
      const tw = mouthW / teeth
      const gapFrac = 0.12 + teethGap * 0.3 // bare gum strip on each side of a tooth
      const tipOf = (i: number) =>
        teethShape === 'fangs' && (i === 1 || i === teeth - 2) ? teethLen * 1.7 : teethLen
      const pts: Polyline = []
      pts.push([ml, mt])
      for (let i = 0; i < teeth; i++) {
        const x0 = ml + i * tw + tw * gapFrac
        const x1 = ml + (i + 1) * tw - tw * gapFrac
        const depth = mt + tipOf(i)
        pts.push([x0, mt])
        if (teethShape === 'rect') {
          pts.push([x0, depth], [x1, depth])
        } else if (teethShape === 'rounded') {
          pts.push(...quadSeg([x0, mt], [x0 + (x1 - x0) * 0.1, depth], [0.5 * (x0 + x1), depth], 4))
          pts.push(...quadSeg([0.5 * (x0 + x1), depth], [x1 - (x1 - x0) * 0.1, depth], [x1, mt], 4))
        } else {
          // pointed teeth and fangs: a V dip under every tooth
          pts.push([0.5 * (x0 + x1), depth])
        }
      }
      pts.push([mr, mt])
      // bottom edge: shallow arc suggesting the lower jaw line
      pts.push(...quadSeg([mr, mt], [mr, mb], [0.5, mb], 6))
      pts.push(...quadSeg([0.5, mb], [ml, mb], [ml, mt], 6))
      pts.push(pts[0])
      polys.push(pts)
    }
  }

  return polys
}

/** Normalized radii of the concentric tools, sorted descending and clamped. */
function concentricRadii(opts: ShapeOpts): number[] {
  const list = opts.circles?.length ? opts.circles : [1, 0.66, 0.33]
  return list.map((r) => clamp(r, 0.05, 1)).sort((a, b) => b - a)
}

/** Deterministic PRNG (mulberry32) so seeded layouts stay stable between frames. */
function seededRandom(seed: number): () => number {
  let a = (Math.floor(seed) || 1) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Axis-aligned rounded rectangle as a closed polyline (r in the same units as the box). */
function roundedRectPolyline(x0: number, y0: number, x1: number, y1: number, r: number): Polyline {
  const w = Math.abs(x1 - x0)
  const h = Math.abs(y1 - y0)
  const rr = Math.min(r, w / 2, h / 2)
  if (rr <= 1e-9) {
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ]
  }
  const pts: Polyline = []
  const corner = (cx: number, cy: number, a0: number, a1: number) => {
    const n = 5
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)])
    }
  }
  corner(x1 - rr, y0 + rr, -Math.PI / 2, 0)
  corner(x1 - rr, y1 - rr, 0, Math.PI / 2)
  corner(x0 + rr, y1 - rr, Math.PI / 2, Math.PI)
  corner(x0 + rr, y0 + rr, Math.PI, (Math.PI * 3) / 2)
  pts.push(pts[0])
  return pts
}

/**
 * Round every vertex of a polyline by replacing it with a quadratic arc through the vertex (r in
 * the same units as the points). Closed loops repeat their first vertex, matching the shape-tool
 * convention.
 */
function roundedPolyline(pts: Polyline, r: number): Polyline {
  if (r <= 1e-9 || pts.length < 3) return pts
  const closed = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]
  const vs = closed ? pts.slice(0, -1) : pts
  if (vs.length < 3) return pts
  const out: Polyline = []
  const m = vs.length
  for (let i = 0; i < m; i++) {
    const v = vs[i]
    if (!closed && (i === 0 || i === m - 1)) {
      out.push(v)
      continue
    }
    const p = vs[(i - 1 + m) % m]
    const q = vs[(i + 1) % m]
    const d1 = Math.hypot(v[0] - p[0], v[1] - p[1])
    const d2 = Math.hypot(q[0] - v[0], q[1] - v[1])
    if (d1 < 1e-9 || d2 < 1e-9) {
      out.push(v)
      continue
    }
    const d = Math.min(r, d1 / 2, d2 / 2)
    const a: [number, number] = [v[0] + ((p[0] - v[0]) * d) / d1, v[1] + ((p[1] - v[1]) * d) / d1]
    const b: [number, number] = [v[0] + ((q[0] - v[0]) * d) / d2, v[1] + ((q[1] - v[1]) * d) / d2]
    for (let s = 0; s <= 4; s++) {
      const t = s / 4
      const u = 1 - t
      out.push([
        u * u * a[0] + 2 * u * t * v[0] + t * t * b[0],
        u * u * a[1] + 2 * u * t * v[1] + t * t * b[1],
      ])
    }
  }
  if (closed) out.push(out[0])
  return out
}

/**
 * Bow every edge of a closed polyline away from the centroid (positive) or pinch it toward the
 * centroid (negative); amount is a fraction of the edge length.
 */
function bulgePolyline(pts: Polyline, amount: number): Polyline {
  if (Math.abs(amount) < 1e-9 || pts.length < 3) return pts
  const closed = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]
  const vs = closed ? pts.slice(0, -1) : pts
  const m = vs.length
  if (m < 3) return pts
  let cx = 0
  let cy = 0
  for (const v of vs) {
    cx += v[0]
    cy += v[1]
  }
  cx /= m
  cy /= m
  const out: Polyline = []
  const edgeCount = closed ? m : m - 1
  for (let i = 0; i < edgeCount; i++) {
    const a = vs[i]
    const b = vs[(i + 1) % m]
    out.push(a)
    const mx = (a[0] + b[0]) / 2
    const my = (a[1] + b[1]) / 2
    let nx = mx - cx
    let ny = my - cy
    const nl = Math.hypot(nx, ny)
    if (nl < 1e-9) continue
    nx /= nl
    ny /= nl
    const off = amount * Math.hypot(b[0] - a[0], b[1] - a[1])
    for (const t of [0.25, 0.5, 0.75]) {
      const k = 4 * t * (1 - t) // quadratic bump peaking at the displaced midpoint
      out.push([mx + nx * off * k, my + ny * off * k])
    }
  }
  if (closed) out.push(out[0])
  else out.push(vs[m - 1])
  return out
}

/** Apply the shared corner-rounding / bulge knobs to a finished shape's polylines. */
function decoratePolylines(polys: Polyline[], opts: ShapeOpts): Polyline[] {
  const corner = clamp(opts.shapeCorner ?? 0, 0, 0.5)
  const bulge = clamp(opts.shapeBulge ?? 0, -1, 1)
  if (corner <= 1e-9 && Math.abs(bulge) <= 1e-9) return polys
  return polys.map((poly) => {
    let out = poly
    if (Math.abs(bulge) > 1e-9) out = bulgePolyline(out, bulge * 0.3)
    if (corner > 1e-9) out = roundedPolyline(out, corner)
    return out
  })
}

interface BentoRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Bento layout: the unit square split into cols×rows slots with seeded divider jitter (chaos) and
 * seeded slot merging (spans); cells are inset by half the gap stripe on interior boundaries.
 * Returns unit-square rects.
 */
function bentoSlots(opts: ShapeOpts): BentoRect[] {
  const cols = clampInt(opts.bentoCols ?? 3, 1, 8)
  const rows = clampInt(opts.bentoRows ?? 3, 1, 8)
  const gap = clamp(opts.bentoGap ?? 0.08, 0, 0.3)
  const inset = clamp(opts.bentoInset ?? 0, 0, 0.2)
  const chaos = clamp(opts.bentoChaos ?? 0, 0, 0.3)
  const merge = clamp(opts.bentoMerge ?? 0, 0, 1)
  const rnd = seededRandom(opts.bentoSeed ?? 1)
  const bx0 = inset
  const by0 = inset
  const bx1 = 1 - inset
  const by1 = 1 - inset
  const spanX = bx1 - bx0
  const spanY = by1 - by0

  // dividers as fractions of [0,1], jittered but monotone with a floor separation
  const divs = (n: number): number[] => {
    const d: number[] = []
    for (let i = 1; i < n; i++) {
      let v = i / n + chaos * (rnd() * 2 - 1) * (0.5 / n)
      const prev = d.length ? d[d.length - 1] : 0
      v = Math.min(Math.max(v, prev + 0.15 / n), 1 - 0.15 / n)
      d.push(v)
    }
    return d
  }
  const xs = [0, ...divs(cols), 1].map((f) => bx0 + f * spanX)
  const ys = [0, ...divs(rows), 1].map((f) => by0 + f * spanY)

  // seeded union-find merging of adjacent slots into spans
  const id = Array.from({ length: cols * rows }, (_, i) => i)
  const find = (i: number): number => {
    while (id[i] !== i) {
      id[i] = id[id[i]]
      i = id[i]
    }
    return i
  }
  if (merge > 0) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c + 1 < cols && rnd() < merge) {
          id[find(r * cols + c)] = find(r * cols + c + 1)
        }
        if (r + 1 < rows && rnd() < merge) {
          id[find(r * cols + c)] = find((r + 1) * cols + c)
        }
      }
    }
  }
  // each merged group becomes the bounding rect of its slots
  const groups = new Map<number, { r0: number; r1: number; c0: number; c1: number }>()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const g = groups.get(find(r * cols + c))
      if (!g) groups.set(find(r * cols + c), { r0: r, r1: r, c0: c, c1: c })
      else {
        g.r0 = Math.min(g.r0, r)
        g.r1 = Math.max(g.r1, r)
        g.c0 = Math.min(g.c0, c)
        g.c1 = Math.max(g.c1, c)
      }
    }
  }
  const slotW = spanX / cols
  const slotH = spanY / rows
  const g = Math.min(gap, 0.6 * Math.min(slotW, slotH))
  const rects: BentoRect[] = []
  for (const grp of groups.values()) {
    rects.push({
      x0: xs[grp.c0] + (grp.c0 > 0 ? g / 2 : 0),
      y0: ys[grp.r0] + (grp.r0 > 0 ? g / 2 : 0),
      x1: xs[grp.c1 + 1] - (grp.c1 < cols - 1 ? g / 2 : 0),
      y1: ys[grp.r1 + 1] - (grp.r1 < rows - 1 ? g / 2 : 0),
    })
  }
  rects.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  return rects
}

/** Rasterize float polylines into integer cells, Bresenham-traced between vertices. */
function polylineCells(segs: Polyline[]): Array<[number, number]> {
  const pts = new Map<string, [number, number]>()
  for (const poly of segs) {
    let px = Math.round(poly[0][0])
    let py = Math.round(poly[0][1])
    pts.set(`${px},${py}`, [px, py])
    for (let i = 1; i < poly.length; i++) {
      const qx = Math.round(poly[i][0])
      const qy = Math.round(poly[i][1])
      if (qx !== px || qy !== py) {
        for (const [lx, ly] of linePoints(px, py, qx, qy)) pts.set(`${lx},${ly}`, [lx, ly])
        px = qx
        py = qy
      }
    }
  }
  return [...pts.values()]
}

/** Arrow: shaft plus a triangular head around the drag tip. */
function arrowPolylines(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  opts: ShapeOpts,
): Polyline[] {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return [[[ax, ay]]]
  const ux = dx / len
  const uy = dy / len
  const px = -uy
  const py = ux
  const head = clamp(opts.arrowHead ?? 0.35, 0.1, 0.6) * len
  const width = head * clamp(opts.arrowSpread ?? 0.6, 0.2, 1.2)
  const cx = bx - ux * head
  const cy = by - uy * head
  const b1: [number, number] = [cx + px * width, cy + py * width]
  const b2: [number, number] = [cx - px * width, cy - py * width]
  return [
    [
      [ax, ay],
      [cx, cy],
    ],
    [b1, [bx, by], b2, b1],
  ]
}

/** Wave: sine along the drag; periods and amplitude come from the tool options. */
function wavePolylines(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  opts: ShapeOpts,
  steps: number,
): Polyline[] {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return [[[ax, ay]]]
  const px = -dy / len
  const py = dx / len
  const periods = clampInt(opts.wavePeriods ?? 3, 1, 8)
  const amp = clamp(opts.waveAmplitude ?? 0.15, 0.02, 0.45) * len
  const n = Math.max(16, steps)
  const pts: Polyline = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const off = amp * Math.sin(t * periods * 2 * Math.PI)
    pts.push([ax + dx * t + px * off, ay + dy * t + py * off])
  }
  return [pts]
}

/** Zigzag: linear extremes along the drag, same knobs as the wave. */
function zigzagPolylines(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  opts: ShapeOpts,
): Polyline[] {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return [[[ax, ay]]]
  const px = -dy / len
  const py = dx / len
  const periods = clampInt(opts.wavePeriods ?? 3, 1, 8)
  const amp = clamp(opts.waveAmplitude ?? 0.15, 0.02, 0.45) * len
  const n = periods * 2
  const pts: Polyline = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const off = amp * (i % 2 === 0 ? -1 : 1)
    pts.push([ax + dx * t + px * off, ay + dy * t + py * off])
  }
  return [pts]
}

/**
 * Outline pieces of a shape in the coordinates of its defining drag (start a → end b). Parametric
 * shapes sample at `steps` vertices; when omitted the count adapts to the shape size.
 */
export function shapePathSegments(
  tool: ShapeToolId,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  opts: ShapeOpts = {},
  steps?: number,
): Polyline[] {
  if (tool === 'arrow') return arrowPolylines(ax, ay, bx, by, opts)
  if (tool === 'wave') return wavePolylines(ax, ay, bx, by, opts, steps ?? 128)
  if (tool === 'zigzag') return zigzagPolylines(ax, ay, bx, by, opts)
  const x0 = Math.min(ax, bx)
  const y0 = Math.min(ay, by)
  const w = Math.abs(bx - ax)
  const h = Math.abs(by - ay)
  const n = steps ?? Math.max(32, Math.min(512, Math.ceil((w + h) * 3)))
  return boxShapePolylines(tool, opts, n).map((poly) =>
    poly.map(([nx, ny]) => [x0 + nx * w, y0 + ny * h] as [number, number]),
  )
}

/** Integer-cell outline of a shape for the square grid, traced with Bresenham. */
export function shapePathPoints(
  tool: ShapeToolId,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  opts: ShapeOpts = {},
  steps?: number,
): Array<[number, number]> {
  const segs = shapePathSegments(tool, ax, ay, bx, by, opts, steps)
  return polylineCells(segs)
}

/** Tools whose outline includes nested loops that must read as holes when filled. */
export function shapeHasHoles(tool: ShapeToolId): boolean {
  return tool === 'skull'
}

/**
 * Integer-cell outline loops of a shape, one entry per polyline (holes included as their own
 * loops). Union over the entries equals shapePathPoints; hole-aware fills run even-odd across the
 * entries instead.
 */
export function shapePathLoops(
  tool: ShapeToolId,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  opts: ShapeOpts = {},
  steps?: number,
): Polyline[] {
  return shapePathSegments(tool, ax, ay, bx, by, opts, steps).map((poly) => polylineCells([poly]))
}
