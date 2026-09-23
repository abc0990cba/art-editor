import { medianCut } from '../engine/importImage'
import { parsePaletteText } from '../engine/paletteIO'

/**
 * DOM glue for palette files: read .hex / .gpl / loose text or a palette image
 * (any bitmap — colors are median-cut sampled), and render the strip PNG export.
 */

/** Parse a palette file into a normalized color list, or null when nothing parses. */
export async function readPaletteFile(file: File): Promise<string[] | null> {
  if (file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file)
    try {
      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => resolve(null)
        el.src = url
      })
      if (!img || img.naturalWidth === 0) return null
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(img, 0, 0)
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const sample = new Float64Array(data.length)
      sample.set(data)
      return medianCut(sample, 64)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  return parsePaletteText(await file.text())
}

/** Render the palette as a one-row PNG strip (one square per color). */
export async function palettePngBlob(colors: readonly string[], cell = 16): Promise<Blob | null> {
  if (colors.length === 0) return null
  const canvas = document.createElement('canvas')
  canvas.width = colors.length * cell
  canvas.height = cell
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  colors.forEach((hex, i) => {
    ctx.fillStyle = hex
    ctx.fillRect(i * cell, 0, cell, cell)
  })
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}
