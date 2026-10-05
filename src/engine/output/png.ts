import type { Doc } from '../core/doc'
import { docExtent } from '../core/doc'
import { buildGeometry, type StyledPath } from '../geometry'
import { fillCoverageBg } from './coverage-bg'

/**
 * Parsed Path2D cache keyed by the path string itself. Geometry rebuilds (every commit, pan or
 * zoom) produce fresh StyledPath objects with identical strings, so an identity cache would
 * re-parse megabytes of path data on every frame; equal strings are the same path by construction.
 * Bounded by total cached characters with FIFO eviction.
 */
const pathCache = new Map<string, Path2D>()
const PATH_CACHE_BUDGET = 32_000_000
let pathCacheChars = 0

function pathFor(d: string): Path2D {
  const hit = pathCache.get(d)
  if (hit) return hit
  const path = new Path2D(d)
  if (pathCacheChars + d.length > PATH_CACHE_BUDGET) {
    for (const k of pathCache.keys()) {
      pathCache.delete(k)
      pathCacheChars -= k.length
      if (pathCacheChars + d.length <= PATH_CACHE_BUDGET) break
    }
  }
  pathCache.set(d, path)
  pathCacheChars += d.length
  return path
}

/** Draw engine paths onto a 2D context already scaled so 1 unit = 1 doc unit. */
export function drawGeometry(ctx: CanvasRenderingContext2D, paths: StyledPath[]): void {
  for (const p of paths) {
    const path = pathFor(p.d)
    if (p.fill) {
      ctx.fillStyle = p.fill
      ctx.fill(path, 'evenodd')
    }
    if (p.stroke) {
      ctx.strokeStyle = p.stroke
      ctx.lineWidth = p.strokeWidth ?? 0.3
      ctx.lineCap = 'round'
      ctx.stroke(path)
    }
  }
}

/** Maximum exported PNG side length in pixels. */
const MAX_PNG_SIDE = 5000

export interface PngSize {
  width: number
  height: number
}

/** Clamp an arbitrary export side to whole pixels within 1..MAX_PNG_SIDE. */
export function clampPngSide(v: number): number {
  const n = Math.round(v)
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(MAX_PNG_SIDE, n))
}

/** Auto export size: the canvas at the default 8 px per cell, clamped to the limit. */
export function autoPngSize(doc: Doc): PngSize {
  const { w, h } = docExtent(doc)
  return { width: clampPngSide(w * 8), height: clampPngSide(h * 8) }
}

/** Render the document to a PNG blob at an arbitrary pixel size (each side 1..5000 px). */
export async function renderPng(doc: Doc, size: PngSize, includeBg: boolean): Promise<Blob> {
  const { w, h } = docExtent(doc)
  const canvas = document.createElement('canvas')
  canvas.width = clampPngSide(size.width)
  canvas.height = clampPngSide(size.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.scale(canvas.width / w, canvas.height / h)
  if (includeBg && doc.bg) fillCoverageBg(ctx, doc, doc.bg)
  drawGeometry(ctx, buildGeometry(doc).paths)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('toBlob failed'))
    }, 'image/png')
  })
}

/** Render a small PNG data-url preview of the document (longest side ≈ maxSide px). */
export function renderThumbnailDataURL(doc: Doc, maxSide = 320): string {
  const { w, h } = docExtent(doc)
  const scale = Math.max(0.05, maxSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.scale(scale, scale)
  if (doc.bg) fillCoverageBg(ctx, doc, doc.bg)
  drawGeometry(ctx, buildGeometry(doc).paths)
  return canvas.toDataURL('image/png')
}
