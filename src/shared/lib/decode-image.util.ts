import type { ImportBitmap } from '../../engine/import/index.ts'

/** Decode an image file into an ImportBitmap, capped so the import pipeline stays fast. */
export async function decodeImageFile(file: Blob, maxSide = 2048): Promise<ImportBitmap> {
  let source: ImageBitmap | HTMLImageElement
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('image decode failed'))
      }
      img.src = url
    })
  }
  const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width
  const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height
  const scale = Math.min(1, maxSide / Math.max(1, Math.max(w, h)))
  const dw = Math.max(1, Math.round(w * scale))
  const dh = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = dw
  canvas.height = dh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no 2d context')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, dw, dh)
  if (source instanceof ImageBitmap) source.close()
  return { width: dw, height: dh, data: ctx.getImageData(0, 0, dw, dh).data }
}
