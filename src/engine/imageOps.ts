/**
 * Raster operations for the image-import pipeline, all over straight RGBA
 * Float64Array buffers (row-major, 4 floats per pixel) — the same format
 * fitToGrid produces. Pure and deterministic: no DOM, no random.
 */

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v)

/**
 * Gaussian blur approximated by three box-blur passes (separable), the standard
 * Kovesi trick: visually indistinguishable from a true gaussian at these radii.
 * Radius is in pixels of the buffer (cell/sample space).
 */
export function gaussianBlurRGBA(buf: Float64Array, w: number, h: number, radius: number): void {
  if (radius <= 0 || w < 2 || h < 2) return
  const boxes = boxesForGauss(radius, 3)
  const tmp = new Float64Array(buf.length)
  for (const box of boxes) {
    boxBlurPass(buf, tmp, w, h, (box - 1) / 2)
    boxBlurPass(tmp, buf, w, h, (box - 1) / 2)
  }
}

function boxesForGauss(sigma: number, n: number): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1)
  let wl = Math.floor(wIdeal)
  if (wl % 2 === 0) wl--
  const wu = wl + 2
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4)
  const m = Math.round(mIdeal)
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(i < m ? wl : wu)
  return out
}

/** One horizontal+vertical box-blur pass with a sliding window, edge-clamped. */
function boxBlurPass(src: Float64Array, dst: Float64Array, w: number, h: number, r: number): void {
  dst.fill(0)
  if (r < 0.5) {
    dst.set(src)
    return
  }
  const ri = Math.round(r)
  const win = ri * 2 + 1
  // horizontal
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let c = 0; c < 4; c++) {
      let acc = 0
      for (let x = -ri; x <= ri; x++) acc += src[(row + clampI(x, w)) * 4 + c]
      for (let x = 0; x < w; x++) {
        dst[(row + x) * 4 + c] = acc / win
        const add = src[(row + clampI(x + ri + 1, w)) * 4 + c]
        const sub = src[(row + clampI(x - ri, w)) * 4 + c]
        acc += add - sub
      }
    }
  }
  // vertical (reads the horizontal result from dst, writes back over src)
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      let acc = 0
      for (let y = -ri; y <= ri; y++) acc += dst[(clampI(y, h) * w + x) * 4 + c]
      for (let y = 0; y < h; y++) {
        src[(y * w + x) * 4 + c] = acc / win
        const add = dst[(clampI(y + ri + 1, h) * w + x) * 4 + c]
        const sub = dst[(clampI(y - ri, h) * w + x) * 4 + c]
        acc += add - sub
      }
    }
  }
}

const clampI = (v: number, lim: number): number => (v < 0 ? 0 : v >= lim ? lim - 1 : v)

/**
 * Unsharp mask: one pass of base + (base − blur) · amount. amount 0..2 covers
 * subtle crisping to an aggressive edge pop; deterministic (blur is gaussian r=1).
 */
export function sharpenRGBA(buf: Float64Array, w: number, h: number, amount: number): void {
  if (amount <= 0 || w < 3 || h < 3) return
  const blur = buf.slice()
  gaussianBlurRGBA(blur, w, h, 1)
  for (let i = 0; i < buf.length; i += 4) {
    for (let c = 0; c < 4; c++) {
      buf[i + c] = clamp255(buf[i + c] + (buf[i + c] - blur[i + c]) * amount)
    }
  }
}

/** Rotate hue by `deg` degrees in HSV space, per pixel; alpha untouched. */
export function hueRotateRGBA(buf: Float64Array, deg: number): void {
  if (deg === 0) return
  const shift = ((deg % 360) + 360) % 360
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] === 0) continue
    const { h, s, v } = rgbToHsv(buf[i], buf[i + 1], buf[i + 2])
    if (s === 0) continue
    const { r, g, b } = hsvToRgb((h + shift) % 360, s, v)
    buf[i] = r
    buf[i + 1] = g
    buf[i + 2] = b
  }
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = (60 * ((g - b) / d) + 360) % 360
    else if (max === g) h = 60 * ((b - r) / d) + 120
    else h = 60 * ((r - g) / d) + 240
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = v - c
  return { r: clamp255(r + m), g: clamp255(g + m), b: clamp255(b + m) }
}

/**
 * Median filter for denoising: strength 1..5 → window 3..11 per side step.
 * Slow at big windows but the import grid is small; deterministic ordering.
 */
export function medianDenoiseRGBA(buf: Float64Array, w: number, h: number, strength: number): void {
  if (strength <= 0) return
  const r = Math.min(5, Math.round(strength))
  const win = r * 2 + 1
  const src = buf.slice()
  const acc: number[] = Array.from({ length: win * win }, () => 0)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let n = 0
        for (let dy = -r; dy <= r; dy++) {
          const sy = clampI(y + dy, h)
          for (let dx = -r; dx <= r; dx++) {
            acc[n++] = src[(sy * w + clampI(x + dx, w)) * 4 + c]
          }
        }
        // full sort keeps the result stable and simple; windows are tiny
        acc.sort((a, b) => a - b)
        buf[(y * w + x) * 4 + c] = acc[n >> 1]
      }
    }
  }
}

/**
 * Additive glow: screen-blend the blurred copy back over the base —
 * out = base + glow·k − base·glow·k/255. Brightens highlights like a bloom.
 */
export function glowScreenRGBA(
  buf: Float64Array,
  w: number,
  h: number,
  radius: number,
  intensity: number,
): void {
  if (radius <= 0 || intensity <= 0) return
  const glow = buf.slice()
  gaussianBlurRGBA(glow, w, h, radius)
  const k = intensity > 1 ? intensity / 100 : intensity
  for (let i = 0; i < buf.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const base = buf[i + c]
      const g = glow[i + c] * k
      buf[i + c] = clamp255(base + g - (base * g) / 255)
    }
  }
}

/**
 * Horizontal chromatic aberration: the red channel shifts left and the blue
 * channel shifts right by `shift` pixels (alpha and green untouched). Edge
 * pixels clamp.
 */
export function chromaticAberrationRGBA(
  buf: Float64Array,
  w: number,
  h: number,
  shift: number,
): void {
  const s = Math.round(Math.abs(shift))
  if (s <= 0 || w < 2) return
  const src = buf.slice()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      buf[o] = src[(y * w + clampI(x + s, w)) * 4]
      buf[o + 2] = src[(y * w + clampI(x - s, w)) * 4 + 2]
    }
  }
}
