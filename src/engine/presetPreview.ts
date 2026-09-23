/** Procedural preview thumbnails: sample artwork rendered through a preset's configuration. */

import type { Doc } from './doc'
import { makeCells } from './doc'
import { renderThumbnailDataURL } from './png'
import type { EditorPreset, PresetConfig } from './presets'

const cache = new Map<string, string>()

/** A deterministic blob-flower painted over the whole buffer, colors cycling the palette.
 * Dense enough that adjacent cells merge in metaball and outline render modes. */
function sampleCells(config: PresetConfig): Uint16Array {
  const bw = config.cols * config.sub
  const bh = config.rows * config.sub
  const cells = makeCells(config.cols, config.rows, config.sub)
  const len = config.palette.length
  const folds = Math.min(12, Math.max(5, config.symmetry.n))
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const u = bw > 1 ? (x / (bw - 1)) * 2 - 1 : 0
      const v = bh > 1 ? (y / (bh - 1)) * 2 - 1 : 0
      const r = Math.sqrt(u * u + v * v)
      const a = Math.atan2(v, u)
      const edge = 0.5 + 0.32 * Math.cos(folds * a) + 0.1 * Math.sin(3 * a + 1.3)
      if (r < edge) {
        const ring = Math.floor(r * 4)
        const petal = Math.floor(((a + Math.PI) / (2 * Math.PI)) * folds)
        cells[y * bw + x] = ((ring + petal) % len) + 1
      }
    }
  }
  return cells
}

function sampleDoc(config: PresetConfig): Doc {
  return {
    gridType: config.gridType,
    cols: config.cols,
    rows: config.rows,
    sub: config.sub,
    radialEven: config.gridType === 'radial' && config.radialEven,
    cells: sampleCells(config),
    links: [],
    palette: [...config.palette],
    style: { ...config.style, corners: { ...config.style.corners } },
    renderMode: config.renderMode,
    connectivity: config.connectivity,
    metaball: { ...config.metaball },
    texture: { ...config.texture },
    styleScope: 'global',
    elements: [],
    cellObj: null,
    layers: null,
    nextNodeId: 1,
    fuseObjects: true,
    bg: config.bg,
    connectorWidth: config.connectorWidth,
  }
}

/** PNG data-url preview of the preset look (memoized per preset version). */
export function presetPreviewDataURL(preset: EditorPreset, maxSide = 128): string {
  if (typeof document === 'undefined') return ''
  const stamp = (preset as { updatedAt?: number }).updatedAt ?? 0
  const key = `${preset.id}|${stamp}|${maxSide}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const url = renderThumbnailDataURL(sampleDoc(preset.config), maxSide)
  cache.set(key, url)
  return url
}
