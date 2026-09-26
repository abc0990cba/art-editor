/* ------------------------------- skull ------------------------------- */
//
// A front-view skull built from one closed silhouette (cranium dome → brow →
// cheekbones → jaw → chin) plus nested hole loops: two eye sockets, the nasal
// aperture and the toothed mouth opening. Later loops punch holes, so the fill
// must be even-odd (see shapeHasHoles / fillCellsEvenOdd).

import { decoratePolylines, roundedRectPolyline } from './shape-decorate.ts'
import type { ShapeOpts } from './shape-tools.ts'
import type { Polyline } from './shape-util.ts'
import { clamp, clampInt } from './shape-util.ts'

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

/** Ellipse arc span: start/end angles (radians), sample count, optional rotation. */
interface ArcSpan {
  a0: number
  a1: number
  n: number
  rot?: number
}

/** Ellipse arc sampler with optional rotation (radians) around its center. */
function ellipseArc(cx: number, cy: number, rx: number, ry: number, span: ArcSpan): Polyline {
  const { a0, a1, n, rot = 0 } = span
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

/** The parsed skull knobs shared by the silhouette and the hole-loop builders. */
interface SkullGeom {
  craniumW: number
  craniumH: number
  crown: 'round' | 'flat'
  brow: number
  cheekW: number
  jawW: number
  jawH: number
  mandible: boolean
  eyeR: number
  eyeDX: number
  eyeY: number
  eyeShape: 'round' | 'oval' | 'square' | 'angled'
  eyeTilt: number
  eyeAsym: number
  noseW: number
  noseH: number
  noseY: number
  noseShape: 'triangle' | 'heart' | 'teardrop' | 'slit'
  teeth: number
  teethLen: number
  teethGap: number
  teethShape: 'rect' | 'rounded' | 'pointed' | 'fangs'
  mouthY: number
}

function skullCraniumGeom(
  opts: ShapeOpts,
): Pick<SkullGeom, 'craniumW' | 'craniumH' | 'crown' | 'brow' | 'cheekW'> {
  return {
    craniumW: clamp(opts.skullCraniumWidth ?? 1, 0.6, 1.25),
    craniumH: clamp(opts.skullCraniumHeight ?? 0.6, 0.45, 0.75),
    crown: opts.skullCrown ?? 'round',
    brow: clamp(opts.skullBrowRidge ?? 0.03, 0, 0.12),
    cheekW: clamp(opts.skullCheekWidth ?? 0.92, 0.6, 1.1),
  }
}

function skullJawGeom(opts: ShapeOpts): Pick<SkullGeom, 'jawW' | 'jawH' | 'mandible'> {
  return {
    jawW: clamp(opts.skullJawWidth ?? 0.72, 0.35, 0.95),
    jawH: clamp(opts.skullJawHeight ?? 0.22, 0.1, 0.3),
    mandible: opts.skullMandible ?? true,
  }
}

function skullEyeGeom(
  opts: ShapeOpts,
): Pick<SkullGeom, 'eyeR' | 'eyeDX' | 'eyeY' | 'eyeShape' | 'eyeTilt' | 'eyeAsym'> {
  return {
    eyeR: clamp(opts.skullEyeSize ?? 0.16, 0.06, 0.26) * 0.5,
    eyeDX: clamp(opts.skullEyeSpacing ?? 0.26, 0.12, 0.4) * 0.5,
    eyeY: clamp(opts.skullEyeY ?? 0.48, 0.38, 0.6),
    eyeShape: opts.skullEyeShape ?? 'round',
    eyeTilt: clamp(opts.skullEyeTilt ?? 0, -1, 1),
    eyeAsym: clamp(opts.skullEyeAsym ?? 0, 0, 1),
  }
}

function skullNoseGeom(
  opts: ShapeOpts,
): Pick<SkullGeom, 'noseW' | 'noseH' | 'noseY' | 'noseShape'> {
  return {
    noseW: clamp(opts.skullNoseWidth ?? 0.09, 0.04, 0.16),
    noseH: clamp(opts.skullNoseHeight ?? 0.11, 0.05, 0.2),
    noseY: clamp(opts.skullNoseY ?? 0.63, 0.52, 0.75),
    noseShape: opts.skullNoseShape ?? 'triangle',
  }
}

function skullMouthGeom(
  opts: ShapeOpts,
): Pick<SkullGeom, 'teeth' | 'teethLen' | 'teethGap' | 'teethShape' | 'mouthY'> {
  return {
    teeth: clampInt(opts.skullTeethCount ?? 8, 0, 14),
    teethLen: clamp(opts.skullTeethLen ?? 0.08, 0.04, 0.14),
    teethGap: clamp(opts.skullTeethGap ?? 0.35, 0, 1),
    teethShape: opts.skullTeethShape ?? 'rect',
    mouthY: clamp(opts.skullMouthY ?? 0.82, 0.68, 0.9),
  }
}

function skullGeom(opts: ShapeOpts): SkullGeom {
  return {
    ...skullCraniumGeom(opts),
    ...skullJawGeom(opts),
    ...skullEyeGeom(opts),
    ...skullNoseGeom(opts),
    ...skullMouthGeom(opts),
  }
}

export function skullPolylines(opts: ShapeOpts, steps: number): Polyline[] {
  const g = skullGeom(opts)
  return [
    skullSilhouette(g, opts, steps),
    skullEye(g, 1),
    skullEye(g, -1),
    skullNose(g),
    skullMouth(g),
  ]
}

/* ---- silhouette: right half from the crown down, mirrored to the left ---- */
function skullSilhouette(g: SkullGeom, opts: ShapeOpts, steps: number): Polyline {
  const domeRx = Math.min(0.49, 0.5 * g.craniumW)
  const domeCy = g.craniumH
  const domePow = g.crown === 'flat' ? 0.55 : 1 // superellipse exponent 2/p: 2 → round, ~3.6 → boxy
  const templeA = -0.12 // radians below the equator where the dome hands over
  const domeEndX = 0.5 + domeRx * Math.cos(templeA)
  const domeEndY = domeCy + domeCy * Math.sin(templeA)
  const browX = Math.min(0.49, domeRx * 0.94 + g.brow)
  const browY = domeEndY + 0.03
  const cheekY = Math.min(0.78, g.eyeY + 0.1)
  const jawTopY = Math.min(0.94, Math.max(g.mouthY + g.teethLen + 0.04, 1 - g.jawH))
  const chinY = g.mandible ? 1 : jawTopY + 0.02
  const jawX = 0.5 + 0.5 * g.jawW
  const cheekX = 0.5 + 0.5 * g.cheekW

  const right: Polyline = []
  // crown: superellipse arc from the top center to the temple
  const domeRy = domeCy // top of the dome sits on y=0
  const domeSeg = Math.max(14, Math.ceil(steps / 8))
  for (let i = 0; i <= domeSeg; i++) {
    const a = -Math.PI / 2 + ((templeA + Math.PI / 2) * i) / domeSeg
    const ct = Math.cos(a)
    const st = Math.sin(a)
    right.push([
      0.5 + domeRx * Math.sign(ct) * Math.abs(ct) ** domePow,
      domeCy + domeRy * Math.sign(st) * Math.abs(st) ** domePow,
    ])
  }
  right.push([domeEndX, domeEndY])
  // brow ridge: small outward bump under the temple
  right.push(...quadSeg([domeEndX, domeEndY], [browX + 0.01, browY - 0.02], [browX, browY], 6))
  // cheekbone: curve out to the widest lower point
  right.push(...quadSeg([browX, browY], [cheekX + 0.02, cheekY - 0.07], [cheekX, cheekY], 8))
  // taper to the jaw corner
  right.push(...quadSeg([cheekX, cheekY], [jawX + 0.02, cheekY + 0.08], [jawX, jawTopY], 8))
  if (g.mandible) {
    // jaw side down to the rounded chin
    right.push(...quadSeg([jawX, jawTopY], [jawX, chinY - 0.06], [0.5, chinY], 8))
  } else {
    right.push(...quadSeg([jawX, jawTopY], [0.5 + g.jawW * 0.25, chinY], [0.5, chinY], 6))
  }
  const loop: Polyline = [...right]
  // mirror the right half (skip duplicated endpoints) in reverse
  for (let i = right.length - 2; i >= 1; i--) {
    loop.push([1 - right[i][0], right[i][1]])
  }
  loop.push(loop[0])
  return decoratePolylines([loop], opts)[0]
}

/* ---- eye sockets ---- */
function skullEye(g: SkullGeom, side: 1 | -1): Polyline {
  const cx = 0.5 + side * g.eyeDX
  const cy = g.eyeY + (side === -1 ? g.eyeAsym * 0.035 : 0)
  const r = g.eyeR * (side === -1 ? 1 - g.eyeAsym * 0.22 : 1)
  const rot = g.eyeTilt * 0.32 * side
  const n = 24
  if (g.eyeShape === 'square') {
    return roundedRectPolyline(cx - r * 0.95, cy - r * 0.72, cx + r * 0.95, cy + r * 0.72, r * 0.35)
  }
  const ry = g.eyeShape === 'oval' ? r * 1.4 : g.eyeShape === 'angled' ? r * 0.62 : r
  const rx = g.eyeShape === 'angled' ? r * 1.18 : r
  const pts = ellipseArc(cx, cy, rx, ry, { a0: 0, a1: 2 * Math.PI, n, rot })
  pts.push(pts[0])
  return pts
}

/* ---- nasal aperture ---- */
function skullNose(g: SkullGeom): Polyline {
  const noseW = g.noseW
  const noseH = g.noseH
  const top = g.noseY - noseH / 2
  const bot = g.noseY + noseH / 2
  const w2 = noseW / 2
  const cx = 0.5
  if (g.noseShape === 'slit') {
    return roundedRectPolyline(cx - w2 * 0.45, top, cx + w2 * 0.45, bot, w2 * 0.2)
  }
  if (g.noseShape === 'triangle') {
    return [
      [cx - w2, top],
      [cx + w2, top],
      [cx + w2 * 0.3, bot - noseH * 0.12],
      [cx, bot],
      [cx - w2 * 0.3, bot - noseH * 0.12],
      [cx - w2, top],
    ]
  }
  if (g.noseShape === 'heart') {
    // two lobes on top, tapering to a point — the classic nasal aperture
    const pts: Polyline = []
    pts.push(
      ...quadSeg([cx - w2, top + noseH * 0.3], [cx - w2 * 0.8, bot - noseH * 0.2], [cx, bot], 8),
      ...quadSeg([cx, bot], [cx + w2 * 0.8, bot - noseH * 0.2], [cx + w2, top + noseH * 0.3], 8),
      ...quadSeg(
        [cx + w2, top + noseH * 0.3],
        [cx + w2 * 0.5, top - noseH * 0.08],
        [cx + w2 * 0.12, top + noseH * 0.16],
        6,
      ),
      ...quadSeg(
        [cx + w2 * 0.12, top + noseH * 0.16],
        [cx, top + noseH * 0.26],
        [cx - w2 * 0.12, top + noseH * 0.16],
        5,
      ),
      ...quadSeg(
        [cx - w2 * 0.12, top + noseH * 0.16],
        [cx - w2 * 0.5, top - noseH * 0.08],
        [cx - w2, top + noseH * 0.3],
        6,
      ),
    )
    pts.push(pts[0])
    return pts
  }
  // teardrop: round top, tapering to the bottom point
  const r = w2 * 0.9
  const cyc = top + r
  const pts: Polyline = []
  pts.push(
    ...ellipseArc(cx, cyc, r, r, { a0: Math.PI * 0.95, a1: Math.PI * 2.05, n: 14 }),
    ...quadSeg([cx + r * 0.95, cyc + r * 0.3], [cx + w2 * 0.4, bot - noseH * 0.18], [cx, bot], 6),
    ...quadSeg([cx, bot], [cx - w2 * 0.4, bot - noseH * 0.18], [cx - r * 0.95, cyc + r * 0.3], 6),
  )
  pts.push(pts[0])
  return pts
}

/* ---- mouth opening with a toothed top edge ---- */
function skullMouth(g: SkullGeom): Polyline {
  const mouthW = g.jawW * 0.68
  const ml = 0.5 - mouthW / 2
  const mr = 0.5 + mouthW / 2
  const mt = g.mouthY
  const mb = mt + g.teethLen * 1.2
  if (g.teeth < 1) {
    return roundedRectPolyline(ml, mt, mr, mb, g.teethLen * 0.3)
  }
  const teeth = g.teeth
  const tw = mouthW / teeth
  const gapFrac = 0.12 + g.teethGap * 0.3 // bare gum strip on each side of a tooth
  const tipOf = (i: number) =>
    g.teethShape === 'fangs' && (i === 1 || i === teeth - 2) ? g.teethLen * 1.7 : g.teethLen
  const pts: Polyline = []
  pts.push([ml, mt])
  for (let i = 0; i < teeth; i++) {
    const x0 = ml + i * tw + tw * gapFrac
    const x1 = ml + (i + 1) * tw - tw * gapFrac
    const depth = mt + tipOf(i)
    pts.push([x0, mt])
    if (g.teethShape === 'rect') {
      pts.push([x0, depth], [x1, depth])
    } else if (g.teethShape === 'rounded') {
      pts.push(
        ...quadSeg([x0, mt], [x0 + (x1 - x0) * 0.1, depth], [0.5 * (x0 + x1), depth], 4),
        ...quadSeg([0.5 * (x0 + x1), depth], [x1 - (x1 - x0) * 0.1, depth], [x1, mt], 4),
      )
    } else {
      // pointed teeth and fangs: a V dip under every tooth
      pts.push([0.5 * (x0 + x1), depth])
    }
  }
  pts.push([mr, mt])
  // bottom edge: shallow arc suggesting the lower jaw line
  pts.push(
    ...quadSeg([mr, mt], [mr, mb], [0.5, mb], 6),
    ...quadSeg([0.5, mb], [ml, mb], [ml, mt], 6),
  )
  pts.push(pts[0])
  return pts
}
