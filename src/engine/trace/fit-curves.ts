/**
 * Schneider's error-bounded least-squares cubic fitting (Graphics Gems "FitCurves") — the curve
 * stage shared by outline and centerline tracing (it is also what potrace and vtracer use). Chains
 * are fit with chord-length parameterization, refined by Newton–Raphson reparameterization (bounded
 * by `maxIterations`), and hard chains split at the maximum-error point. Forced end tangents let
 * the caller produce kinks at corners and smooth pass-throughs at soft anchors.
 *
 * Geometry is flat number arrays of x,y pairs; a fitted cubic is 8 numbers
 * (x0,y0,x1,y1,x2,y2,x3,y3).
 */

export type Tangent = readonly [number, number]

const EPS = 1e-12

function b0(u: number): number {
  const t = 1 - u
  return t * t * t
}
function b1(u: number): number {
  const t = 1 - u
  return 3 * u * t * t
}
function b2(u: number): number {
  const t = 1 - u
  return 3 * u * u * t
}
function b3(u: number): number {
  return u * u * u
}

function normalize(x: number, y: number): Tangent {
  const len = Math.hypot(x, y)
  return len < EPS ? [0, 0] : [x / len, y / len]
}

function negate(t: Tangent): Tangent {
  return [-t[0], -t[1]]
}

/**
 * Fit the open flat-point chain to cubics within `maxError` px. `tHat1` points from the first point
 * into the chain, `tHat2` from the last point backward; omitted tangents fall back to the chord
 * directions. Returns flat cubics.
 */
export function fitChain(
  pts: number[],
  maxError: number,
  maxIterations: number,
  tHat1?: Tangent,
  tHat2?: Tangent,
): number[] {
  const out: number[] = []
  const n = pts.length / 2
  if (n < 2) return out
  const last = n - 1
  const t1 = tHat1 ?? normalize(pts[2] - pts[0], pts[3] - pts[1])
  const t2 =
    tHat2 ??
    normalize(pts[(last - 1) * 2] - pts[last * 2], pts[(last - 1) * 2 + 1] - pts[last * 2 + 1])
  fitCubic(pts, 0, last, [t1, t2], { errorSq: maxError * maxError, depth: 0, maxIterations, out })
  return out
}

interface FitCtx {
  errorSq: number
  depth: number
  maxIterations: number
  out: number[]
}

/** Turn angle in degrees at the middle point of the (prev, cur, next) triple (0 = straight). */
export function turnDeg(
  prev: readonly [number, number],
  cur: readonly [number, number],
  next: readonly [number, number],
): number {
  const d1x = cur[0] - prev[0]
  const d1y = cur[1] - prev[1]
  const d2x = next[0] - cur[0]
  const d2y = next[1] - cur[1]
  const cross = d1x * d2y - d1y * d2x
  const dot = d1x * d2x + d1y * d2y
  return (Math.atan2(Math.abs(cross), dot) * 180) / Math.PI
}

function distSq(pts: number[], i: number, j: number): number {
  const dx = pts[j * 2] - pts[i * 2]
  const dy = pts[j * 2 + 1] - pts[i * 2 + 1]
  return dx * dx + dy * dy
}

function fitCubic(
  pts: number[],
  first: number,
  last: number,
  tangents: readonly [Tangent, Tangent],
  ctx: FitCtx,
): void {
  const [tHat1, tHat2] = tangents
  const { out } = ctx
  if (last - first === 1) {
    // two points: heuristic straight-ish cubic with chord/3 handles
    const dist = Math.sqrt(distSq(pts, first, last)) / 3
    out.push(
      pts[first * 2],
      pts[first * 2 + 1],
      pts[first * 2] + tHat1[0] * dist,
      pts[first * 2 + 1] + tHat1[1] * dist,
      pts[last * 2] + tHat2[0] * dist,
      pts[last * 2 + 1] + tHat2[1] * dist,
      pts[last * 2],
      pts[last * 2 + 1],
    )
    return
  }
  let u = chordLengthParameterize(pts, first, last)
  let bez = generateBezier(pts, first, last, u, tangents)
  let [maxErrSq, split] = computeMaxError(pts, first, last, bez, u)
  if (maxErrSq < ctx.errorSq) {
    out.push(...bez)
    return
  }
  // error is close: refine the parameterization instead of splitting
  if (maxErrSq < ctx.errorSq * 16) {
    for (let i = 0; i < ctx.maxIterations; i++) {
      u = reparameterize(pts, first, last, u, bez)
      bez = generateBezier(pts, first, last, u, tangents)
      const r = computeMaxError(pts, first, last, bez, u)
      maxErrSq = r[0]
      split = r[1]
      if (maxErrSq < ctx.errorSq) {
        out.push(...bez)
        return
      }
    }
  }
  if (ctx.depth > 32 || split <= first || split >= last) {
    out.push(...bez) // give up gracefully on degenerate input
    return
  }
  const center = computeCenterTangent(pts, split)
  const deeper = { ...ctx, depth: ctx.depth + 1 }
  fitCubic(pts, first, split, tangents, deeper)
  fitCubic(pts, split, last, [negate(center), tHat2], deeper)
}

/** Cumulative chord-length parameters of the chain, normalized to 0..1. */
function chordLengthParameterize(pts: number[], first: number, last: number): number[] {
  const u: number[] = [0]
  for (let i = first + 1; i <= last; i++) {
    u.push(u[i - first - 1] + Math.sqrt(distSq(pts, i - 1, i)))
  }
  const total = u[u.length - 1]
  if (total <= EPS) return u.map(() => 0)
  return u.map((v) => v / total)
}

/** Least-squares cubic through the chain with fixed end tangents. */
function generateBezier(
  pts: number[],
  first: number,
  last: number,
  u: number[],
  tangents: readonly [Tangent, Tangent],
): number[] {
  const [tHat1, tHat2] = tangents
  const n = last - first + 1
  const p0x = pts[first * 2]
  const p0y = pts[first * 2 + 1]
  const p3x = pts[last * 2]
  const p3y = pts[last * 2 + 1]
  let c00 = 0
  let c01 = 0
  let c11 = 0
  let x0 = 0
  let x1 = 0
  for (let i = 0; i < n; i++) {
    const t = u[i]
    const a0x = tHat1[0] * b1(t)
    const a0y = tHat1[1] * b1(t)
    const a1x = tHat2[0] * b2(t)
    const a1y = tHat2[1] * b2(t)
    c00 += a0x * a0x + a0y * a0y
    c01 += a0x * a1x + a0y * a1y
    c11 += a1x * a1x + a1y * a1y
    const baseX = p0x * (b0(t) + b1(t)) + p3x * (b2(t) + b3(t))
    const baseY = p0y * (b0(t) + b1(t)) + p3y * (b2(t) + b3(t))
    const tmpX = pts[(first + i) * 2] - baseX
    const tmpY = pts[(first + i) * 2 + 1] - baseY
    x0 += a0x * tmpX + a0y * tmpY
    x1 += a1x * tmpX + a1y * tmpY
  }
  const det = c00 * c11 - c01 * c01
  const seg = Math.sqrt(distSq(pts, first, last)) / 3
  let alphaL = seg
  let alphaR = seg
  if (Math.abs(det) > EPS) {
    alphaL = (x0 * c11 - x1 * c01) / det
    alphaR = (x0 * c01 - x1 * c00) / det
  }
  if (!(alphaL > EPS) || alphaL > seg * 2) alphaL = seg
  if (!(alphaR > EPS) || alphaR > seg * 2) alphaR = seg
  return [
    p0x,
    p0y,
    p0x + tHat1[0] * alphaL,
    p0y + tHat1[1] * alphaL,
    p3x + tHat2[0] * alphaR,
    p3y + tHat2[1] * alphaR,
    p3x,
    p3y,
  ]
}

/** [max squared distance, worst vertex index] of the chain against its fitted cubic. */
function computeMaxError(
  pts: number[],
  first: number,
  last: number,
  bez: number[],
  u: number[],
): [number, number] {
  let maxDistSq = 0
  let split = Math.floor((first + last) / 2)
  for (let i = first + 1; i < last; i++) {
    const t = u[i - first]
    const omt = 1 - t
    const bx =
      omt * omt * omt * bez[0] +
      3 * omt * omt * t * bez[2] +
      3 * omt * t * t * bez[4] +
      t * t * t * bez[6]
    const by =
      omt * omt * omt * bez[1] +
      3 * omt * omt * t * bez[3] +
      3 * omt * t * t * bez[5] +
      t * t * t * bez[7]
    const dx = pts[i * 2] - bx
    const dy = pts[i * 2 + 1] - by
    const d = dx * dx + dy * dy
    if (d > maxDistSq) {
      maxDistSq = d
      split = i
    }
  }
  return [maxDistSq, split]
}

/** Newton–Raphson reparameterization of u against the fitted cubic. */
function reparameterize(
  pts: number[],
  first: number,
  last: number,
  u: number[],
  bez: number[],
): number[] {
  const out: number[] = []
  for (let i = first; i <= last; i++) {
    out.push(newtonRaphson(pts[i * 2], pts[i * 2 + 1], u[i - first], bez))
  }
  return out
}

function newtonRaphson(px: number, py: number, u: number, bez: number[]): number {
  const omt = 1 - u
  // point, first and second derivatives at u
  const qx =
    omt * omt * omt * bez[0] +
    3 * omt * omt * u * bez[2] +
    3 * omt * u * u * bez[4] +
    u * u * u * bez[6]
  const qy =
    omt * omt * omt * bez[1] +
    3 * omt * omt * u * bez[3] +
    3 * omt * u * u * bez[5] +
    u * u * u * bez[7]
  const qdx =
    3 * omt * omt * (bez[2] - bez[0]) +
    6 * omt * u * (bez[4] - bez[2]) +
    3 * u * u * (bez[6] - bez[4])
  const qdy =
    3 * omt * omt * (bez[3] - bez[1]) +
    6 * omt * u * (bez[5] - bez[3]) +
    3 * u * u * (bez[7] - bez[5])
  const qddx = 6 * omt * (bez[4] - 2 * bez[2] + bez[0]) + 6 * u * (bez[6] - 2 * bez[4] + bez[2])
  const qddy = 6 * omt * (bez[5] - 2 * bez[3] + bez[1]) + 6 * u * (bez[7] - 2 * bez[5] + bez[3])
  const dx = qx - px
  const dy = qy - py
  const num = dx * qdx + dy * qdy
  const den = qdx * qdx + qdy * qdy + dx * qddx + dy * qddy
  if (Math.abs(den) < EPS) return u
  return Math.max(0, Math.min(1, u - num / den))
}

/** Two-sided unit tangent at an interior split point (points from p+1 toward p-1). */
function computeCenterTangent(pts: number[], center: number): Tangent {
  const t = normalize(
    pts[(center - 1) * 2] - pts[(center + 1) * 2],
    pts[(center - 1) * 2 + 1] - pts[(center + 1) * 2 + 1],
  )
  if (t[0] === 0 && t[1] === 0) {
    return normalize(
      pts[center * 2] - pts[(center + 1) * 2],
      pts[center * 2 + 1] - pts[(center + 1) * 2 + 1],
    )
  }
  return t
}
