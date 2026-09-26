import type { SymmetryState } from './doc.ts'
import { MAX_ORBIT } from './symmetry-radial.ts'

export type SymMode = SymmetryState['mode']

/** The 17 classical wallpaper groups plus hex/diagonal p1 variants. */
export const WALLPAPER_MODES = [
  'p1',
  'p1hex',
  'p1diag',
  'p2',
  'pm',
  'pg',
  'cm',
  'pmm',
  'pmg',
  'pgg',
  'cmm',
  'p4',
  'p4m',
  'p4g',
  'p3',
  'p3m1',
  'p31m',
  'p6',
  'p6m',
] as const

/** Non-classical repeat layouts. */
export const TILING_MODES = ['brick', 'halfdrop'] as const

/** Modes that tile the canvas by lattice translation (wallpaper-style). */
export const REPEAT_MODES = [...WALLPAPER_MODES, ...TILING_MODES] as const

export function isRepeat(mode: SymMode): boolean {
  return (REPEAT_MODES as readonly string[]).includes(mode)
}

/**
 * One symmetry operation in lattice-fractional coordinates: (u, v) → (m0·u + m1·v + f0, m2·u + m3·v +
 * f1)
 */
export interface Op {
  m: [number, number, number, number]
  f: [number, number]
}

export interface RepeatDef {
  /** Lattice basis vectors in units of the cell size */
  A: [number, number]
  B: [number, number]
  /** Point-group operations (identity included) */
  ops: Op[]
  /** Extra fractional translation of the lattice (centered cells: cm/cmm) */
  centering?: [number, number]
  /** Mirror-axis directions through lattice points, as fractional direction vectors */
  mirrors?: [number, number][]
}

const op = (m: Op['m'], f: [number, number] = [0, 0]): Op => ({ m, f })
const ID: Op = op([1, 0, 0, 1])
const S2 = Math.SQRT1_2
const H3 = Math.sqrt(3) / 2

// basis sets (×cell size)
const SQUARE: Pick<RepeatDef, 'A' | 'B'> = { A: [1, 0], B: [0, 1] }
const HEX: Pick<RepeatDef, 'A' | 'B'> = { A: [1, 0], B: [0.5, H3] }
const DIAG: Pick<RepeatDef, 'A' | 'B'> = { A: [S2, S2], B: [-S2, S2] }

// square-lattice point groups (fractional coords)
const R180 = op([-1, 0, 0, -1])
const MX = op([-1, 0, 0, 1]) // mirror u → −u
const MY = op([1, 0, 0, -1]) // mirror v → −v
const P4_ROTS: Op[] = [ID, op([0, -1, 1, 0]), R180, op([0, 1, -1, 0])]
const P3_ROTS: Op[] = [ID, op([-1, -1, 1, 0]), op([0, 1, -1, -1])]
const P6_ROTS: Op[] = [
  ID,
  op([0, -1, 1, 1]),
  op([-1, -1, 1, 0]),
  R180,
  op([0, 1, -1, -1]),
  op([1, 1, -1, 0]),
]

const defs: Record<string, RepeatDef> = {
  p1: { ...SQUARE, ops: [ID] },
  p1hex: { ...HEX, ops: [ID] },
  p1diag: { ...DIAG, ops: [ID] },
  brick: { A: [1, 0], B: [0.5, 1], ops: [ID] },
  halfdrop: { A: [1, 0.5], B: [0, 1], ops: [ID] },
  p2: { ...SQUARE, ops: [ID, R180] },
  pm: { ...SQUARE, ops: [ID, MX] },
  pg: { ...SQUARE, ops: [ID, op([-1, 0, 0, 1], [0, 0.5])] },
  cm: { ...SQUARE, ops: [ID, MX], centering: [0.5, 0.5] },
  pmm: { ...SQUARE, ops: [ID, MX, MY, R180] },
  pmg: {
    ...SQUARE,
    ops: [ID, MX, op([1, 0, 0, -1], [0.5, 0]), op([-1, 0, 0, -1], [0.5, 0])],
  },
  pgg: {
    ...SQUARE,
    ops: [
      ID,
      op([-1, 0, 0, 1], [0, 0.5]),
      op([1, 0, 0, -1], [0.5, 0]),
      op([-1, 0, 0, -1], [0.5, 0.5]),
    ],
  },
  cmm: { ...SQUARE, ops: [ID, MX, MY, R180], centering: [0.5, 0.5] },
  p4: { ...SQUARE, ops: P4_ROTS },
  p4m: {
    ...SQUARE,
    ops: [...P4_ROTS, MX, MY, op([0, 1, 1, 0]), op([0, -1, -1, 0])],
    mirrors: [
      [1, 1],
      [1, -1],
    ],
  },
  p4g: {
    ...SQUARE,
    ops: [
      ...P4_ROTS,
      op([1, 0, 0, -1], [0.5, 0.5]),
      op([0, -1, -1, 0], [0.5, 0.5]),
      op([-1, 0, 0, 1], [0.5, 0.5]),
      op([0, 1, 1, 0], [0.5, 0.5]),
    ],
  },
  p3: { ...HEX, ops: P3_ROTS },
  p3m1: {
    ...HEX,
    ops: [...P3_ROTS, op([1, 1, 0, -1]), op([-1, 0, 1, 1]), op([0, -1, -1, 0])],
    mirrors: [
      [1, 0],
      [0.5, H3],
      [-0.5, H3],
    ],
  },
  p31m: {
    ...HEX,
    ops: [
      ...P3_ROTS,
      op([1, 1, 0, -1], [-1 / 3, 2 / 3]),
      op([-1, 0, 1, 1], [-1 / 3, -1 / 3]),
      op([0, -1, -1, 0], [2 / 3, -1 / 3]),
    ],
  },
  p6: { ...HEX, ops: P6_ROTS },
  p6m: {
    ...HEX,
    ops: [
      ...P6_ROTS,
      op([1, 1, 0, -1]),
      op([0, 1, 1, 0]),
      op([-1, 0, 1, 1]),
      op([-1, -1, 0, 1]),
      op([0, -1, -1, 0]),
      op([1, 0, -1, -1]),
    ],
    mirrors: [
      [1, 0],
      [0.5, H3],
      [-0.5, H3],
      [0.5, -H3],
      [0, 1],
      [-1, 0],
    ],
  },
} satisfies Record<string, RepeatDef>

export function repeatDef(mode: SymMode): RepeatDef | null {
  return (defs as Record<string, RepeatDef | undefined>)[mode] ?? null
}

export function repeatPoints(
  x: number,
  y: number,
  bw: number,
  bh: number,
  def: RepeatDef,
  c: number,
  seen: Set<number>,
  push: (px: number, py: number) => void,
): void {
  const [ax, ay] = def.A
  const [bx, by] = def.B
  const det = (ax * by - ay * bx) * c * c
  // fractional coordinates: [u; v] = inverse([[ax, bx], [ay, by]]·c)·[x; y]
  const fracU = (px: number, py: number) => (by * c * px - bx * c * py) / det
  const fracV = (px: number, py: number) => (ax * c * py - ay * c * px) / det
  const u0 = fracU(x, y)
  const v0 = fracV(x, y)
  let uMin = Infinity
  let uMax = -Infinity
  let vMin = Infinity
  let vMax = -Infinity
  for (const [cx, cy] of [
    [0, 0],
    [bw, 0],
    [0, bh],
    [bw, bh],
  ]) {
    const u = fracU(cx, cy)
    const v = fracV(cx, cy)
    uMin = Math.min(uMin, u)
    uMax = Math.max(uMax, u)
    vMin = Math.min(vMin, v)
    vMax = Math.max(vMax, v)
  }
  const [cu, cv] = def.centering ?? [0, 0]
  const copies = def.centering ? 2 : 1
  for (const { m, f } of def.ops) {
    const u = m[0] * u0 + m[1] * v0 + f[0]
    const v = m[2] * u0 + m[3] * v0 + f[1]
    for (let k = 0; k < copies; k++) {
      const uc = u + k * cu
      const vc = v + k * cv
      const iLo = Math.floor(uMin - uc) - 1
      const iHi = Math.ceil(uMax - uc) + 1
      const jLo = Math.floor(vMin - vc) - 1
      const jHi = Math.ceil(vMax - vc) + 1
      for (let i = iLo; i <= iHi; i++) {
        for (let j = jLo; j <= jHi; j++) {
          if (seen.size >= MAX_ORBIT) return
          const px = Math.round((uc + i) * ax * c + (vc + j) * bx * c)
          const py = Math.round((uc + i) * ay * c + (vc + j) * by * c)
          push(px, py)
        }
      }
    }
  }
}
