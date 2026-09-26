import type { Doc, ElementStyle, Link, SubDetail } from './doc'
import type { Graph } from './nodes'
import type { SceneItem, SceneLayer } from './scene'
import { encodeObjCells } from './scene'

interface SceneObjJSON {
  kind: 'obj'
  id: number
  name: string
  visible: boolean
  locked: boolean
  style: ElementStyle
  /** Sparse ink as [index, value, …] pairs */
  cells: number[]
  links: Link[]
  /** Live node graph (JSON-safe by construction) */
  graph?: Graph
}

interface SceneGroupJSON {
  kind: 'group'
  id: number
  name: string
  visible: boolean
  locked: boolean
  children: SceneItemJSON[]
}

interface SceneLayerJSON {
  kind: 'layer'
  id: number
  name: string
  visible: boolean
  locked: boolean
  children: SceneItemJSON[]
}

type SceneItemJSON = SceneObjJSON | SceneGroupJSON

export interface ProjectJSON {
  v: 3
  cols: number
  rows: number
  sub: SubDetail
  radialEven: boolean
  /** Legacy flat ink; absent on scene docs (the tree is the source of truth) */
  cells?: number[]
  links: Link[]
  palette: string[]
  style: Doc['style']
  gridType: Doc['gridType']
  renderMode: Doc['renderMode']
  connectivity: Doc['connectivity']
  metaball: Omit<Doc['metaball'], 'enabled'> & { enabled?: boolean }
  texture: Doc['texture']
  styleScope?: Doc['styleScope']
  /** Legacy flat element table; absent on scene docs */
  elements?: ElementStyle[]
  /** Run-length-encoded per-cell element ids: [id, runLength, ...] */
  cellObj?: number[]
  /** Scene tree (v3); null/absent = legacy flat document */
  layers?: SceneLayerJSON[] | null
  /** Monotonic scene-node id counter (v3) */
  nextNodeId?: number
  /** Same-style objects on one layer merge into shared fields/silhouettes (v3) */
  fuseObjects?: boolean
  bg: string
  connectorWidth: number
}

function serializeItem(item: SceneItem): SceneItemJSON {
  if (item.kind === 'obj') {
    return {
      kind: 'obj',
      id: item.id,
      name: item.name,
      visible: item.visible,
      locked: item.locked,
      style: item.style,
      cells: encodeObjCells(item.cells),
      links: item.links,
      ...(item.graph ? { graph: item.graph } : {}),
    }
  }
  return {
    kind: 'group',
    id: item.id,
    name: item.name,
    visible: item.visible,
    locked: item.locked,
    children: item.children.map(serializeItem),
  }
}

function serializeLayer(layer: SceneLayer): SceneLayerJSON {
  return {
    kind: 'layer',
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    locked: layer.locked,
    children: layer.children.map(serializeItem),
  }
}

export function serialize(doc: Doc): ProjectJSON {
  const head = {
    v: 3 as const,
    cols: doc.cols,
    rows: doc.rows,
    sub: doc.sub,
    radialEven: doc.radialEven,
    palette: doc.palette,
    style: doc.style,
    gridType: doc.gridType,
    renderMode: doc.renderMode,
    connectivity: doc.connectivity,
    metaball: doc.metaball,
    texture: doc.texture,
    styleScope: doc.styleScope,
    bg: doc.bg,
    connectorWidth: doc.connectorWidth,
  }
  if (doc.layers) {
    // scene docs serialize the tree only — cells/links/elements are derived
    return {
      ...head,
      links: [],
      layers: doc.layers.map(serializeLayer),
      nextNodeId: doc.nextNodeId,
      fuseObjects: doc.fuseObjects,
    }
  }
  return {
    ...head,
    cells: [...doc.cells],
    links: doc.links,
    elements: doc.elements,
    cellObj: encodeCellObj(doc.cellObj),
    layers: null,
  }
}

/** Run-length encode the element buffer: [id, runLength, ...]; null/blank → []. */
export function encodeCellObj(cellObj: Uint32Array | null): number[] {
  if (!cellObj) return []
  const out: number[] = []
  let cur = cellObj[0] ?? 0
  let run = 0
  for (let i = 0; i < cellObj.length; i++) {
    const v = cellObj[i]
    if (v === cur) {
      run++
    } else {
      out.push(cur, run)
      cur = v
      run = 1
    }
  }
  if (run > 0) out.push(cur, run)
  return out
}
