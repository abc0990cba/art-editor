import { MAX_SIZE } from './doc'

/**
 * Popular canvas size presets grouped by aspect ratio. Every base size comes with an odd sibling
 * (+1 on both axes, stepping down when +1 would exceed MAX_SIZE): odd grids have a central
 * row/column, so symmetry axes can anchor on a real pixel line.
 */
export interface SizeOption {
  cols: number
  rows: number
  /** +1 variant with a center row/column for symmetry */
  odd: boolean
}

export interface SizeGroup {
  /** Aspect ratio label, e.g. "16:9" */
  ratio: string
  /** Optional friendly reference (console name) */
  name?: string
  sizes: SizeOption[]
}

function pair(cols: number, rows: number): SizeOption[] {
  const odd = (n: number) => (n + 1 <= MAX_SIZE ? n + 1 : n - 1)
  return [
    { cols, rows, odd: false },
    { cols: odd(cols), rows: odd(rows), odd: true },
  ]
}

const squares = (ns: number[]): SizeOption[] => ns.flatMap((n) => pair(n, n))
const rects = (rs: [number, number][]): SizeOption[] => rs.flatMap(([c, r]) => pair(c, r))

export const SIZE_GROUPS: SizeGroup[] = [
  { ratio: '1:1', sizes: squares([16, 32, 48, 64, 128, 256, 512, 1024, 2048, 4096]) },
  {
    ratio: '4:3',
    sizes: rects([
      [64, 48],
      [128, 96],
      [256, 192],
      [1024, 768],
    ]),
  },
  {
    ratio: '3:2',
    sizes: rects([
      [48, 32],
      [96, 64],
      [192, 128],
    ]),
  },
  {
    ratio: '16:9',
    sizes: rects([
      [64, 36],
      [128, 72],
      [256, 144],
      [1024, 576],
      [2048, 1152],
    ]),
  },
  {
    ratio: '21:9',
    sizes: rects([
      [84, 36],
      [168, 72],
    ]),
  },
  {
    ratio: '2:1',
    sizes: rects([
      [64, 32],
      [128, 64],
      [256, 128],
    ]),
  },
  {
    ratio: '10:9',
    name: 'Game Boy',
    sizes: rects([
      [80, 72],
      [160, 144],
    ]),
  },
  {
    ratio: '8:7',
    name: 'NES',
    sizes: rects([
      [64, 56],
      [128, 112],
    ]),
  },
]

/** All preset sizes, flattened. */
export function allSizeOptions(): SizeOption[] {
  return SIZE_GROUPS.flatMap((g) => g.sizes)
}
