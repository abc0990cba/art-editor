import type { Doc, ElementStyle, Link } from '../engine/core/doc.ts'
import { elementFromDoc, sameElementStyle } from '../engine/core/doc.ts'
import {
  appendToLayer,
  newObj,
  nodeProtected,
  pruneEmptyObjs,
  stealCells,
  syncDoc,
  type SceneLayer,
} from '../engine/core/scene.ts'
import type { GraphNode } from '../engine/nodes/index.ts'

/** Fresh id for a graph node (unique within its graph). */
export const genNodeId = () => `n${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`

/** The position node auto-attached to every drawn object: dx/dy editable in the node editor. */
export function offsetGraphNodes(): GraphNode[] {
  return [{ id: genNodeId(), op: 'mod.offset', params: { dx: 0, dy: 0 } }]
}

/** The layer new ink goes to; repairs a stale id (after undo or layer deletion). */
export function activeLayerOf(doc: Doc, activeLayerId: number | null): SceneLayer | null {
  if (!doc.layers || doc.layers.length === 0) return null
  if (activeLayerId != null) {
    const found = doc.layers.find((l) => l.id === activeLayerId)
    if (found) return found
  }
  // no explicit choice (fresh boot, stale id): the topmost VISIBLE unlocked layer,
  // matching CanvasStage's activeLayerState — never a hidden layer
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    if (doc.layers[i].visible && !doc.layers[i].locked) return doc.layers[i]
  }
  return doc.layers.at(-1) ?? null
}

/** Order-independent key of a connector (endpoints may come in either way). */
export function linkKey(l: Link): string {
  const a = `${l.ax},${l.ay}`
  const b = `${l.bx},${l.by}`
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** Resolve (or lazily append) the element id matching a snapshot of the drawing style. */
export function resolveElement(doc: Doc, snapshot: ElementStyle): { doc: Doc; id: number } {
  const existing = doc.elements.findIndex((el) => sameElementStyle(el, snapshot))
  if (existing !== -1) return { doc, id: existing + 1 }
  return { doc: { ...doc, elements: [...doc.elements, snapshot] }, id: doc.elements.length + 1 }
}

/**
 * Scene-path paint commit shared by paintCells / paintCellsValues / fills: paint entries join a
 * fresh object appended on top (one stroke = one object — interrupted lines stay separately
 * selectable). Painting over never destroys the covered objects — they keep their ink and the
 * composite (tree order) hides it, so moving the covering figure away reveals them intact. The
 * erase set stays destructive: the eraser punches every object of the layer under the stroke,
 * matching its live preview.
 */
export function commitStroke(
  doc: Doc,
  activeLayerId: number | null,
  erase: ReadonlySet<number>,
  paint: ReadonlyMap<number, number>,
  extraLinks: readonly Link[],
): Doc | null {
  const layer = activeLayerOf(doc, activeLayerId)
  // a hidden or locked layer is not a paint target
  if (!layer || !layer.visible || nodeProtected(doc.layers!, layer.id)) return null
  let layers = doc.layers!
  if (erase.size > 0) layers = stealCells(layers, layer.id, erase)
  const er = newObj(doc, elementFromDoc(doc))
  for (const [i, v] of paint) er.obj.cells.set(i, v)
  // every drawn object gets a live graph: the position node makes dx/dy editable
  // in the node editor right away
  er.obj.graph = { graphVersion: 1, nodes: offsetGraphNodes() }
  if (paint.size > 0 || extraLinks.length > 0) {
    er.obj.links.push(...extraLinks)
    layers = appendToLayer(layers, layer.id, er.obj)
  }
  layers = pruneEmptyObjs(layers, new Set([er.obj.id])).layers
  return syncDoc({ ...er.doc, layers })
}

/**
 * Shape-tool commit as a parametric source graph: the node regenerates the ink from its parameters,
 * so geometry edits in the node editor move the shape on the canvas. Like plain strokes, the shape
 * is appended on top without stealing — overlap hides, it does not destroy.
 */
export function commitStrokeParametric(
  doc: Doc,
  activeLayerId: number | null,
  paint: ReadonlyMap<number, number>,
  parametric: { op: string; params: Record<string, number | string | boolean> },
): Doc | null {
  const layer = activeLayerOf(doc, activeLayerId)
  if (!layer || !layer.visible || nodeProtected(doc.layers!, layer.id)) return null
  let layers = doc.layers!
  const er = newObj(doc, elementFromDoc(doc))
  for (const [i, v] of paint) er.obj.cells.set(i, v)
  er.obj.graph = {
    graphVersion: 1,
    nodes: [{ id: genNodeId(), op: parametric.op, params: { ...parametric.params } }],
  }
  layers = appendToLayer(layers, layer.id, er.obj)
  return syncDoc({ ...er.doc, layers })
}
