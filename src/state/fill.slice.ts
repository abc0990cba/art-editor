import type { Doc, Link } from '../engine/core/doc.ts'
import { elementFromDoc, resolveColor } from '../engine/core/doc.ts'
import {
  allObjs,
  appendToLayer,
  newObj,
  nodeProtected,
  pruneEmptyObjs,
  syncDoc,
  updateNode,
  visibleObjs,
} from '../engine/core/scene.ts'
import { floodFillDoc, floodRegion } from '../engine/paint/floodfill.ts'
import { applyFillStyle, fillSelectionCells, patternCoord } from '../engine/texture/fill.ts'
import type { State } from './editor.store.ts'
import { activeLayerOf, commitStroke, linkKey, resolveElement } from './store-internals.util.ts'

/** In element scope, attribute every cell a fill changed to the current frozen-style element. */
function attributeFill(
  base: Doc,
  doc: Doc,
  prev: Uint16Array,
  cells: Uint16Array,
): { doc: Doc; cellObj: Uint32Array | null } {
  if (doc.styleScope !== 'element') return { doc, cellObj: doc.cellObj }
  const er = resolveElement(doc, elementFromDoc(base))
  const cellObj = (doc.cellObj ?? new Uint32Array(cells.length)).slice()
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== prev[i]) cellObj[i] = cells[i] === 0 ? 0 : er.id
  }
  return { doc: er.doc, cellObj }
}

/**
 * Scene path of fillAt: flood over the ACTIVE LAYER's own ink only — the fill must not leak through
 * pixels that belong to other layers; the result joins a fresh object.
 */
function fillAtScene(
  s: State,
  doc: Doc,
  seeds: readonly number[],
  rA: { v: number },
  rB: { v: number },
): Doc | null {
  const style = s.fillStyle
  const layer = activeLayerOf(doc, s.activeLayerId)
  if (!layer || !layer.visible || nodeProtected(doc.layers!, layer.id) || seeds.length === 0) {
    return null
  }
  const layerCells = new Uint16Array(doc.cells.length)
  for (const o of visibleObjs(layer)) {
    for (const [i, v] of o.cells) layerCells[i] = v
  }
  const layerDoc = { ...doc, cells: layerCells }
  const paint = new Map<number, number>()
  if (style.mode === 'pattern') {
    const coordOf = patternCoord(doc)
    for (const idx of seeds) {
      const region = floodRegion(layerDoc, idx)
      if (region.length === 0) continue
      for (const [i, pick] of applyFillStyle(style, region, idx, coordOf)) {
        paint.set(i, pick === 1 ? rB.v : rA.v)
      }
    }
  } else {
    for (const idx of seeds) {
      const filled = floodFillDoc(layerDoc, idx, rA.v)
      for (let i = 0; i < filled.length; i++) {
        if (filled[i] !== layerCells[i]) paint.set(i, filled[i])
      }
    }
  }
  if (paint.size === 0) return null
  const erase = new Set<number>()
  for (const [i, v] of paint)
    if (v === 0) {
      erase.add(i)
      paint.delete(i)
    }
  return commitStroke(doc, s.activeLayerId, erase, paint, [])
}

/** Scene path of paintFillRegion: the whole seed set joins a fresh object on the active layer. */
function paintFillRegionScene(
  s: State,
  doc: Doc,
  seeds: readonly number[],
  rA: { v: number },
  rB: { v: number },
): Doc | null {
  const layer = activeLayerOf(doc, s.activeLayerId)
  if (!layer || !layer.visible || nodeProtected(doc.layers!, layer.id)) return null
  const style = s.fillStyle
  const paint = new Map<number, number>()
  if (style.mode === 'pattern') {
    // the whole seed set is one region, so the transition spans it as a whole
    for (const [i, pick] of applyFillStyle(style, seeds, seeds[0], patternCoord(doc))) {
      paint.set(i, pick === 1 ? rB.v : rA.v)
    }
  } else {
    for (const i of seeds) paint.set(i, rA.v)
  }
  const erase = new Set<number>()
  for (const [i, v] of paint)
    if (v === 0) {
      erase.add(i)
      paint.delete(i)
    }
  return commitStroke(doc, s.activeLayerId, erase, paint, [])
}

/**
 * Scene path of addLinks: the whole connector set (a click + its symmetry copies) joins one fresh
 * object on the active layer.
 */
function addLinksScene(s: State, doc: Doc, links: readonly Link[], v: number): Doc | null {
  const layer = activeLayerOf(doc, s.activeLayerId)
  if (!layer || !layer.visible || nodeProtected(doc.layers!, layer.id)) return null
  const existing = new Set(allObjs(doc.layers!).flatMap((o) => o.links.map(linkKey)))
  const fresh: Link[] = []
  for (const link of links) {
    if (!existing.has(linkKey(link))) {
      existing.add(linkKey(link))
      fresh.push({ ...link, v })
    }
  }
  if (fresh.length === 0) return null
  const er = newObj(doc, elementFromDoc(s.doc))
  er.obj.links.push(...fresh)
  return syncDoc({ ...er.doc, layers: appendToLayer(er.doc.layers!, layer.id, er.obj) })
}

/** The fill slice: flood/region fills and connector edits (undoable doc actions). */
export interface FillSlice {
  /** Flood-fill from every seed (symmetry copies of the clicked cell) */
  fillAt: (seeds: readonly number[], color: string) => void
  /** Paint a pre-computed region set (radial sector/ring scope) with the current fill style */
  paintFillRegion: (seeds: readonly number[], color: string) => void
  /** Re-fill every painted cell of the selected elements with the current fill style (undoable) */
  fillSelection: () => void
  addLink: (link: Link, color: string) => void
  /** Add several links at once (symmetry copies), as a single undoable change */
  addLinks: (links: readonly Link[], color: string) => void
  removeLinksNear: (px: number, py: number, radius: number) => void
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

/**
 * Fill/connector actions, composed into the main store. Kept apart so editor.store.ts stays under
 * the file-size ratchet.
 */
export function createFillSlice({ set, get }: SliceApi): FillSlice {
  return {
    fillAt: (seeds, color) =>
      set((s) => {
        if (color) get().pushRecent(color)
        const style = s.fillStyle
        const rA = resolveColor(s.doc, color)
        // pattern fills need the second color in the palette too
        const rB = style.mode === 'pattern' ? resolveColor(rA.doc, style.color2) : rA
        const doc = rB.doc
        if (doc.layers) {
          const next = fillAtScene(s, doc, seeds, rA, rB)
          return next ? { doc: next } : s
        }
        let cells = s.doc.cells
        if (style.mode === 'pattern') {
          const coordOf = patternCoord(doc)
          for (const idx of seeds) {
            const region = floodRegion({ ...doc, cells }, idx)
            if (region.length === 0) continue
            const next = cells.slice()
            let changed = false
            for (const [i, pick] of applyFillStyle(style, region, idx, coordOf)) {
              const v = pick === 1 ? rB.v : rA.v
              if (next[i] !== v) {
                next[i] = v
                changed = true
              }
            }
            if (changed) cells = next
          }
        } else {
          for (const idx of seeds) cells = floodFillDoc({ ...doc, cells }, idx, rA.v)
        }
        if (cells === s.doc.cells) return s
        const attr = attributeFill(s.doc, doc, s.doc.cells, cells)
        return { doc: { ...attr.doc, cells, cellObj: attr.cellObj } }
      }),
    paintFillRegion: (seeds, color) =>
      set((s) => {
        if (color) get().pushRecent(color)
        if (seeds.length === 0) return s
        const style = s.fillStyle
        const rA = resolveColor(s.doc, color)
        const rB = style.mode === 'pattern' ? resolveColor(rA.doc, style.color2) : rA
        const doc = rB.doc
        // scene path: the whole seed set joins a fresh object on the active layer
        if (doc.layers) {
          const next = paintFillRegionScene(s, doc, seeds, rA, rB)
          return next ? { doc: next } : s
        }
        const cells = s.doc.cells.slice()
        if (style.mode === 'pattern') {
          // the whole seed set is one region, so the transition spans it as a whole
          for (const [i, pick] of applyFillStyle(style, seeds, seeds[0], patternCoord(doc))) {
            cells[i] = pick === 1 ? rB.v : rA.v
          }
        } else {
          for (const i of seeds) cells[i] = rA.v
        }
        const attr = attributeFill(s.doc, doc, s.doc.cells, cells)
        return { doc: { ...attr.doc, cells, cellObj: attr.cellObj } }
      }),
    fillSelection: () =>
      set((s) => {
        if (s.selection.length === 0) return s
        const res = fillSelectionCells(s.doc, s.selection, s.fillStyle, s.color)
        if (!res) return s
        get().pushRecent(s.color)
        // scene path: propagate the value changes to each cell's owning object
        if (s.doc.layers) {
          let layers = s.doc.layers
          for (let i = 0; i < res.cells.length; i++) {
            if (res.cells[i] === s.doc.cells[i]) continue
            const owner = s.doc.cellObj?.[i] ?? 0
            if (owner === 0) continue
            const v = res.cells[i]
            layers =
              updateNode(layers, owner, (n) => {
                if (n.kind !== 'obj') return n
                const cells = new Map(n.cells)
                if (v > 0) cells.set(i, v)
                else cells.delete(i)
                return { ...n, cells }
              }) ?? layers
          }
          return { doc: syncDoc({ ...s.doc, layers, palette: res.palette }) }
        }
        return { doc: { ...s.doc, cells: res.cells, palette: res.palette } }
      }),
    addLink: (link, color) => get().addLinks([link], color),
    addLinks: (links, color) =>
      set((s) => {
        if (color) get().pushRecent(color)
        const r = resolveColor(s.doc, color)
        let doc = r.doc
        // scene path: the whole connector set (a click + its symmetry copies) joins
        // one fresh object on the active layer
        if (doc.layers) {
          const next = addLinksScene(s, doc, links, r.v)
          return next ? { doc: next } : s
        }
        let obj: number | undefined
        if (doc.styleScope === 'element') {
          const er = resolveElement(doc, elementFromDoc(s.doc))
          doc = er.doc
          obj = er.id
        }
        const next = [...doc.links]
        let changed = false
        for (const link of links) {
          const exists = next.some(
            (l) =>
              (l.ax === link.ax && l.ay === link.ay && l.bx === link.bx && l.by === link.by) ||
              (l.ax === link.bx && l.ay === link.by && l.bx === link.ax && l.by === link.ay),
          )
          if (!exists) {
            next.push(obj ? { ...link, v: r.v, obj } : { ...link, v: r.v })
            changed = true
          }
        }
        return changed ? { doc: { ...doc, links: next } } : { doc }
      }),
    removeLinksNear: (px, py, radius) =>
      set((s) => {
        const r2 = radius * radius
        const keep = (l: Link): boolean => {
          const cx = (l.ax + l.bx + 1) / 2
          const cy = (l.ay + l.by + 1) / 2
          const dx = cx - (px + 0.5)
          const dy = cy - (py + 0.5)
          return dx * dx + dy * dy > r2
        }
        // scene path: prune each object's own connectors
        if (s.doc.layers) {
          let layers = s.doc.layers
          for (const o of allObjs(layers)) {
            if (!o.links.some((l) => !keep(l))) continue
            layers =
              updateNode(layers, o.id, (n) =>
                n.kind === 'obj' ? { ...n, links: n.links.filter(keep) } : n,
              ) ?? layers
          }
          const pruned = pruneEmptyObjs(layers)
          return { doc: syncDoc({ ...s.doc, layers: pruned.layers }) }
        }
        const links = s.doc.links.filter(keep)
        if (links.length === s.doc.links.length) return s
        return { doc: { ...s.doc, links } }
      }),
  }
}
