/**
 * Editable Bézier path model: a chain of anchors, each optionally carrying arrival/departure
 * control handles in absolute doc-space coordinates. Every consecutive anchor pair is one cubic
 * segment; a missing handle collapses onto its anchor and the segment degrades to a straight line.
 * A closed path connects the last anchor back to the first.
 */

export type Pt = [number, number]

export interface CurveAnchor {
  x: number
  y: number
  /** Arrival handle of the segment entering this anchor; null = straight arrival. */
  hIn: Pt | null
  /** Departure handle of the segment leaving this anchor; null = straight departure. */
  hOut: Pt | null
}

export interface CurvePath {
  anchors: CurveAnchor[]
  closed: boolean
}

export function makeAnchor(x: number, y: number): CurveAnchor {
  return { x, y, hIn: null, hOut: null }
}

/** The empty draft: no anchors, open. */
export function emptyPath(): CurvePath {
  return { anchors: [], closed: false }
}

/** Index of the anchor segment `i` leads into (wraps around on closed paths). */
export function segmentEnd(path: CurvePath, i: number): number {
  return path.closed ? (i + 1) % path.anchors.length : i + 1
}

/** Number of cubic segments: one per anchor pair, plus the wrap-around on closed paths. */
export function segmentCount(path: CurvePath): number {
  if (path.anchors.length < 2) return 0
  return path.closed ? path.anchors.length : path.anchors.length - 1
}

/** The cubic leaving anchor `i`: start point, both control points, end point. */
export function segmentCubic(path: CurvePath, i: number): [Pt, Pt, Pt, Pt] {
  const a = path.anchors[i]
  const b = path.anchors[segmentEnd(path, i)]
  return [[a.x, a.y], a.hOut ?? [a.x, a.y], b.hIn ?? [b.x, b.y], [b.x, b.y]]
}

/** Deep clone sharing nothing with the source (the store treats paths as immutable). */
export function clonePath(path: CurvePath): CurvePath {
  return {
    anchors: path.anchors.map((a) => ({
      x: a.x,
      y: a.y,
      hIn: a.hIn ? ([a.hIn[0], a.hIn[1]] as Pt) : null,
      hOut: a.hOut ? ([a.hOut[0], a.hOut[1]] as Pt) : null,
    })),
    closed: path.closed,
  }
}

const fmt = (v: number): string => String(Math.round(v * 100) / 100)

/**
 * Serialize as an absolute SVG path. Straight segments (both handles null) emit `L` so the
 * corner-vs-smooth distinction survives the round-trip through parametric node params.
 */
export function pathToD(path: CurvePath): string {
  if (path.anchors.length === 0) return ''
  const a0 = path.anchors[0]
  let d = `M ${fmt(a0.x)} ${fmt(a0.y)}`
  const count = segmentCount(path)
  for (let i = 0; i < count; i++) {
    const [, c1, c2, p3] = segmentCubic(path, i)
    const straight = path.anchors[i].hOut === null && path.anchors[segmentEnd(path, i)].hIn === null
    d += straight
      ? ` L ${fmt(p3[0])} ${fmt(p3[1])}`
      : ` C ${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(p3[0])} ${fmt(p3[1])}`
  }
  return path.closed ? `${d} Z` : d
}

const TOKEN = /([MLCZ])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi

/**
 * Parse an absolute `M`/`L`/`C`/`Z` path (the dialect `pathToD` emits). Anything else — relative
 * commands, multiple subpaths, malformed numbers — returns null so callers keep their old draft.
 */
export function pathFromD(d: string): CurvePath | null {
  const tokens: (string | number)[] = []
  for (const m of d.matchAll(TOKEN)) tokens.push(m[1] ?? Number(m[2]))
  let pos = 0
  const peekNumber = (): number | null => {
    const v = tokens[pos]
    if (typeof v === 'number' && Number.isFinite(v)) {
      pos++
      return v
    }
    return null
  }
  const point = (): Pt | null => {
    const x = peekNumber()
    if (x === null) return null
    const y = peekNumber()
    return y === null ? null : [x, y]
  }
  if (tokens[pos++] !== 'M') return null
  const start = point()
  if (!start) return null
  const anchors: CurveAnchor[] = [makeAnchor(start[0], start[1])]
  let closed = false
  while (pos < tokens.length) {
    const cmd = tokens[pos]
    if (cmd === 'Z') {
      closed = true
      pos++
      continue
    }
    if (cmd !== 'L' && cmd !== 'C') return null
    pos++
    if (cmd === 'C') {
      const c1 = point()
      const c2 = point()
      const end = point()
      if (!c1 || !c2 || !end) return null
      anchors[anchors.length - 1].hOut = c1
      anchors.push({ x: end[0], y: end[1], hIn: c2, hOut: null })
    } else {
      const end = point()
      if (!end) return null
      anchors.push(makeAnchor(end[0], end[1]))
    }
  }
  if (anchors.length === 0) return null
  if (closed && anchors.length > 1) {
    const first = anchors[0]
    const last = anchors[anchors.length - 1]
    // `pathToD` draws the wrap-around segment explicitly, so the parsed first point reappears
    // as a duplicate: fold its arrival handle back into the real first anchor
    if (first.x === last.x && first.y === last.y) {
      first.hIn = last.hIn
      anchors.pop()
    }
  }
  return { anchors, closed }
}
