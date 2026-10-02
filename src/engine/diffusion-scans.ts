/**
 * Scan-path orders for path-driven error diffusion: every order is a permutation of 0..w·h-1
 * describing the sequence in which pixels consume their error memory. Pure geometry.
 */

export type ScanKind = 'column' | 'diagonal' | 'spiral' | 'hilbert' | 'random'

/** Vertical serpentine: columns walked top-to-bottom / bottom-to-top alternately. */
function columnOrder(tw: number, th: number): Int32Array {
  const out = new Int32Array(tw * th)
  let k = 0
  for (let x = 0; x < tw; x++) {
    for (let j = 0; j < th; j++) {
      const y = x % 2 === 0 ? j : th - 1 - j
      out[k++] = y * tw + x
    }
  }
  return out
}

/** Anti-diagonal sweeps from the top-left corner, direction alternating per sweep. */
function diagonalOrder(tw: number, th: number): Int32Array {
  const out = new Int32Array(tw * th)
  let k = 0
  for (let d = 0; d <= tw + th - 2; d++) {
    const xLo = Math.max(0, d - (th - 1))
    const xHi = Math.min(tw - 1, d)
    if (d % 2 === 0) {
      for (let x = xLo; x <= xHi; x++) out[k++] = (d - x) * tw + x
    } else {
      for (let x = xHi; x >= xLo; x--) out[k++] = (d - x) * tw + x
    }
  }
  return out
}

/** Clockwise rectangular spiral winding in from the border. */
function spiralOrder(tw: number, th: number): Int32Array {
  const out = new Int32Array(tw * th)
  let k = 0
  let x0 = 0
  let y0 = 0
  let x1 = tw - 1
  let y1 = th - 1
  while (x0 <= x1 && y0 <= y1 && k < out.length) {
    for (let x = x0; x <= x1; x++) out[k++] = y0 * tw + x
    for (let y = y0 + 1; y <= y1; y++) out[k++] = y * tw + x1
    if (y1 > y0) for (let x = x1 - 1; x >= x0; x--) out[k++] = y1 * tw + x
    if (x1 > x0) for (let y = y1 - 1; y > y0; y--) out[k++] = y * tw + x0
    x0++
    y0++
    x1--
    y1--
  }
  return out
}

/** Hilbert d2xy over the bounding power-of-two square; out-of-bounds cells are skipped. */
function hilbertOrder(tw: number, th: number): Int32Array {
  const out = new Int32Array(tw * th)
  let side = 1
  while (side < Math.max(tw, th)) side *= 2
  let k = 0
  for (let d = 0; d < side * side && k < out.length; d++) {
    let x = 0
    let y = 0
    let t = d
    for (let s = 1; s < side; s *= 2) {
      const rx = (t >> 1) & 1
      const ry = (t ^ rx) & 1
      if (ry === 0) {
        if (rx === 1) {
          x = s - 1 - x
          y = s - 1 - y
        }
        const tmp = x
        x = y
        y = tmp
      }
      x += s * rx
      y += s * ry
      t >>= 2
    }
    if (x < tw && y < th) out[k++] = y * tw + x
  }
  return out
}

/** Seeded deterministic shuffle (Fisher–Yates over mulberry32). */
function randomOrder(tw: number, th: number): Int32Array {
  const total = tw * th
  const out = new Int32Array(total)
  for (let i = 0; i < total; i++) out[i] = i
  let a = 0x9e_37_79_b9
  const rand = (): number => {
    a = (a + 0x6d_2b_79_f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = out[i]
    out[i] = out[j]
    out[j] = t
  }
  return out
}

/** Visit order of one scan kind: a permutation of 0..tw·th-1. */
export function scanOrder(kind: ScanKind, tw: number, th: number): Int32Array {
  switch (kind) {
    case 'column':
      return columnOrder(tw, th)
    case 'diagonal':
      return diagonalOrder(tw, th)
    case 'spiral':
      return spiralOrder(tw, th)
    case 'hilbert':
      return hilbertOrder(tw, th)
    case 'random':
      return randomOrder(tw, th)
  }
}
