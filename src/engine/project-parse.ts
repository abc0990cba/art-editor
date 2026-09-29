import { isCellShapeId, normalizeShapeParams } from './cell-shapes.ts'
import type { Doc, ElementStyle, Link, PixelStyle, SubDetail } from './doc'
import { defaultDoc, makeCells, MAX_SIZE, MIN_SIZE } from './doc'
import { validateGraph } from './nodes'
import type { SceneGroup, SceneItem, SceneLayer, SceneObj } from './scene'
import { decodeObjCells, sceneFromLegacy, syncDoc } from './scene'

/** Inverse of encodeCellObj; returns null for an empty/blank encoding. */
export function decodeCellObj(rle: unknown, length: number): Uint32Array | null {
  if (!Array.isArray(rle) || rle.length < 2) return null
  const out = new Uint32Array(length)
  let i = 0
  for (let k = 0; k + 1 < rle.length; k += 2) {
    const id = Number(rle[k])
    const run = Math.floor(Number(rle[k + 1]))
    if (!Number.isFinite(id) || !Number.isFinite(run) || run <= 0) continue
    for (let j = 0; j < run && i < length; j++) out[i++] = Math.max(0, Math.floor(id))
  }
  return out
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const hex = (s: unknown): string =>
  typeof s === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s) ? s.toLowerCase() : ''

const TEXTURE_EFFECTS = ['none', 'grain', 'grunge', 'halftone'] as const
const TEXTURE_DISTS = ['scatter', 'clumps', 'streaks', 'perlin', 'voronoi'] as const
const TEXTURE_SHAPES = ['square', 'dot', 'chip'] as const

function deserializeTexture(raw: unknown, base: Doc['texture']): Doc['texture'] {
  const t = (raw ?? {}) as Partial<Doc['texture']> & { size?: unknown }
  const legacy = Number(t.size)
  const sizeMin =
    t.sizeMin === undefined ? (legacy > 0 ? legacy * 0.18 : base.sizeMin) : Number(t.sizeMin)
  const sizeMax =
    t.sizeMax === undefined ? (legacy > 0 ? legacy * 0.35 : base.sizeMax) : Number(t.sizeMax)
  return {
    effect: TEXTURE_EFFECTS.includes(t.effect as Doc['texture']['effect'])
      ? (t.effect as Doc['texture']['effect'])
      : base.effect,
    amount: clamp(Number(t.amount ?? base.amount), 0, 100),
    scale: clamp(Number(t.scale) || base.scale, 0.1, 8),
    sizeMin: clamp(Number.isFinite(sizeMin) && sizeMin > 0 ? sizeMin : base.sizeMin, 0.05, 0.6),
    sizeMax: clamp(Number.isFinite(sizeMax) && sizeMax > 0 ? sizeMax : base.sizeMax, 0.05, 0.6),
    shape: TEXTURE_SHAPES.includes(t.shape as Doc['texture']['shape'])
      ? (t.shape as Doc['texture']['shape'])
      : base.shape,
    edge: clamp(Number(t.edge ?? base.edge), 0, 100),
    dist: TEXTURE_DISTS.includes(t.dist as Doc['texture']['dist'])
      ? (t.dist as Doc['texture']['dist'])
      : base.dist,
    gap: clamp(Number(t.gap ?? base.gap), 0, 0.45),
    angle: clamp(Number(t.angle ?? base.angle), 0, 180),
    seed: Math.max(0, Math.round(Number(t.seed) || base.seed)),
    jitter: clamp(Number(t.jitter ?? base.jitter), 0, 100),
    variation: clamp(Number(t.variation ?? base.variation), 0, 100),
    wobble: clamp(Number(t.wobble ?? base.wobble), 0, 100),
    merge: clamp(Number(t.merge ?? base.merge), 0, 100),
    dropout: clamp(Number(t.dropout ?? base.dropout), 0, 100),
    spray: clamp(Number(t.spray ?? base.spray), 0, 100),
    ramp: clamp(Number(t.ramp ?? base.ramp), 0, 100),
  }
}

const RENDER_MODES = ['pixels', 'outline', 'metaball'] as const
const CONNECTIVITIES = ['edge', 'corner', 'corner-bridge'] as const
const corner = (v: unknown) => (typeof v === 'number' ? clamp(v, 0, 0.5) : null)

function normalizeStyle(raw: unknown, base: PixelStyle): PixelStyle {
  const st = (raw ?? {}) as Partial<PixelStyle>
  const co = (st.corners ?? {}) as Partial<PixelStyle['corners']>
  return {
    radius: clamp(Number(st.radius ?? base.radius), 0, 0.5),
    corners: {
      tl: corner(co.tl),
      tr: corner(co.tr),
      br: corner(co.br),
      bl: corner(co.bl),
    },
    sizeX: clamp(Number(st.sizeX ?? base.sizeX), 0.05, 1),
    sizeY: clamp(Number(st.sizeY ?? base.sizeY), 0.05, 1),
    convexRadius: clamp(Number(st.convexRadius ?? base.convexRadius), 0, 0.5),
    concaveRadius: clamp(Number(st.concaveRadius ?? base.concaveRadius), 0, 0.5),
    cornerStyle: st.cornerStyle === 'chamfer' ? 'chamfer' : 'arc',
    squareEdges: st.squareEdges === true,
    shape: isCellShapeId(st.shape) ? st.shape : 'square',
    shapeParams: normalizeShapeParams(st.shapeParams),
  }
}

function normalizeMetaball(raw: unknown, base: Doc['metaball']): Doc['metaball'] {
  const mb = (raw ?? {}) as Partial<Doc['metaball']> & { enabled?: unknown }
  return {
    strength: clamp(Number(mb.strength ?? base.strength), 0, 100),
    perColor: Boolean(mb.perColor ?? base.perColor),
    quality: clamp(Number(mb.quality ?? base.quality), 2, 8),
    squareEdges: mb.squareEdges === true,
  }
}

/** Defensive validation for one frozen element style (stored/raw data). */
function normalizeElementStyle(raw: unknown, base: ElementStyle): ElementStyle {
  if (typeof raw !== 'object' || raw === null)
    return { ...base, style: { ...base.style, corners: { ...base.style.corners } } }
  const d = raw as Partial<ElementStyle>
  return {
    style: normalizeStyle(d.style, base.style),
    renderMode: RENDER_MODES.includes(d.renderMode as Doc['renderMode'])
      ? (d.renderMode as Doc['renderMode'])
      : base.renderMode,
    connectivity: CONNECTIVITIES.includes(d.connectivity as Doc['connectivity'])
      ? (d.connectivity as Doc['connectivity'])
      : base.connectivity,
    metaball: normalizeMetaball(d.metaball, base.metaball),
    texture: deserializeTexture(d.texture, base.texture),
  }
}

/* --------------------------------- scene parsing --------------------------------- */

function parseLinks(raw: unknown, cols: number, rows: number): Link[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (l): l is Record<string, number> =>
        typeof l === 'object' &&
        l !== null &&
        ['ax', 'ay', 'bx', 'by', 'v'].every(
          (k) => typeof (l as Record<string, unknown>)[k] === 'number',
        ),
    )
    .filter((l) => l['ax'] >= 0 && l['ay'] >= 0 && l['bx'] < cols && l['by'] < rows && l['v'] >= 0)
    .map((l) => ({
      ax: l['ax'],
      ay: l['ay'],
      bx: l['bx'],
      by: l['by'],
      v: Math.floor(l['v']),
      ...(typeof l['obj'] === 'number' && Number.isFinite(l['obj']) && l['obj'] >= 0
        ? { obj: Math.floor(l['obj']) }
        : {}),
    }))
}

const nodeId = (v: unknown): number => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n >= 1 ? n : 0
}

function parseItem(
  raw: unknown,
  base: Doc,
  length: number,
  ids: Set<number>,
  maxId: { n: number },
): SceneItem | null {
  if (typeof raw !== 'object' || raw === null) return null
  const d = raw as Record<string, unknown>
  const id = nodeId(d['id'])
  if (id === 0 || ids.has(id)) return null
  const name = typeof d['name'] === 'string' ? d['name'] : ''
  const visible = d['visible'] !== false
  const locked = d['locked'] === true
  if (d['kind'] === 'group') {
    ids.add(id)
    maxId.n = Math.max(maxId.n, id)
    const children: SceneItem[] = []
    if (Array.isArray(d['children'])) {
      for (const c of d['children']) {
        const item = parseItem(c, base, length, ids, maxId)
        if (item) children.push(item)
      }
    }
    const group: SceneGroup = { kind: 'group', id, name, visible, locked, children }
    return group
  }
  if (d['kind'] !== 'obj') return null
  ids.add(id)
  maxId.n = Math.max(maxId.n, id)
  // graph JSON is normalized through the node validator: unknown ops stay flagged,
  // parameters are clamped to the registry schema
  const validated = 'graph' in d ? validateGraph(d['graph']) : null
  const obj: SceneObj = {
    kind: 'obj',
    id,
    name,
    visible,
    locked,
    style: normalizeElementStyle(d['style'], {
      style: base.style,
      renderMode: base.renderMode,
      connectivity: base.connectivity,
      metaball: base.metaball,
      texture: base.texture,
    }),
    cells: decodeObjCells(d['cells'], length),
    links: parseLinks(d['links'], base.cols, base.rows),
    ...(validated?.ok ? { graph: validated.graph } : {}),
  }
  return obj
}

/** Defensive parse of a stored scene tree; null = absent/invalid → legacy document. */
function parseScene(
  raw: unknown,
  nextRaw: unknown,
  base: Doc,
  length: number,
): { layers: SceneLayer[]; nextNodeId: number } | null {
  if (!Array.isArray(raw)) return null
  const ids = new Set<number>()
  const maxId = { n: 0 }
  const layers: SceneLayer[] = []
  for (const l of raw) {
    if (typeof l !== 'object' || l === null) continue
    const d = l as Record<string, unknown>
    if (d['kind'] !== 'layer') continue
    const id = nodeId(d['id'])
    if (id === 0 || ids.has(id)) continue
    ids.add(id)
    maxId.n = Math.max(maxId.n, id)
    const children: SceneItem[] = []
    if (Array.isArray(d['children'])) {
      for (const c of d['children']) {
        const item = parseItem(c, base, length, ids, maxId)
        if (item) children.push(item)
      }
    }
    layers.push({
      kind: 'layer',
      id,
      name: typeof d['name'] === 'string' ? d['name'] : '',
      visible: d['visible'] !== false,
      locked: d['locked'] === true,
      children,
    })
  }
  if (layers.length === 0) return null
  const next = Math.max(maxId.n + 1, Math.floor(Number(nextRaw)) || 1)
  return { layers, nextNodeId: next }
}

export function deserializeInternal(data: unknown): Doc {
  const base = defaultDoc()
  if (typeof data !== 'object' || data === null) return base
  const d = data as Record<string, unknown>
  const cols = clamp(Number(d['cols']) || base.cols, MIN_SIZE, MAX_SIZE)
  const rows = clamp(Number(d['rows']) || base.rows, MIN_SIZE, MAX_SIZE)
  const sub = ([1, 2, 3] as SubDetail[]).includes(d['sub'] as SubDetail)
    ? (d['sub'] as SubDetail)
    : 1
  const length = cols * sub * rows * sub
  const cells = makeCells(cols, rows, sub)
  if (Array.isArray(d['cells'])) {
    for (let i = 0; i < Math.min(cells.length, d['cells'].length); i++) {
      const v = Number(d['cells'][i])
      cells[i] = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
    }
  }
  const links = parseLinks(d['links'], cols, rows)
  const palette = Array.isArray(d['palette']) ? d['palette'].map(hex).filter(Boolean) : base.palette
  const st = (d['style'] ?? {}) as Partial<Doc['style']>
  const mb = (d['metaball'] ?? {}) as Partial<Doc['metaball']> & { enabled?: unknown }
  const renderMode = RENDER_MODES.includes(d['renderMode'] as Doc['renderMode'])
    ? (d['renderMode'] as Doc['renderMode'])
    : mb.enabled === true
      ? 'metaball'
      : 'pixels'
  const connectivity = CONNECTIVITIES.includes(d['connectivity'] as Doc['connectivity'])
    ? (d['connectivity'] as Doc['connectivity'])
    : 'edge'
  const gridTypes = ['square', 'hex', 'triangle', 'radial'] as const
  const gridType = gridTypes.includes(d['gridType'] as Doc['gridType'])
    ? (d['gridType'] as Doc['gridType'])
    : 'square'
  // v1 projects (and any payload without element data) load in global scope; element
  // elements are clamped against the base style table
  const styleScope =
    d['styleScope'] === 'element' && Array.isArray(d['elements']) ? 'element' : 'global'
  const elements =
    styleScope === 'element'
      ? (d['elements'] as unknown[]).map((el) =>
          normalizeElementStyle(
            el,
            base.elements[0] ?? {
              style: base.style,
              renderMode,
              connectivity,
              metaball: base.metaball,
              texture: base.texture,
            },
          ),
        )
      : []
  const doc: Doc = {
    gridType,
    cols,
    rows,
    sub,
    radialEven: gridType === 'radial' && d['radialEven'] === true,
    cells,
    links,
    palette: palette.length > 0 ? palette : base.palette,
    style: normalizeStyle(st, base.style),
    renderMode,
    connectivity,
    metaball: normalizeMetaball(mb, base.metaball),
    texture: deserializeTexture(d['texture'], base.texture),
    styleScope,
    elements,
    cellObj: decodeCellObj(d['cellObj'], cells.length),
    layers: null,
    nextNodeId: 1,
    fuseObjects: d['fuseObjects'] !== false,
    bg: hex(d['bg']),
    connectorWidth: clamp(Number(d['connectorWidth'] ?? base.connectorWidth), 0.05, 1),
  }
  // v3 scene tree when present…
  const scene = parseScene(d['layers'], d['nextNodeId'], doc, length)
  if (scene) return syncDoc({ ...doc, ...scene })
  // …otherwise migrate element-scope legacy docs (v2) into the scene model; global-scope
  // documents stay flat and keep their legacy rendering path
  if (styleScope === 'element' && doc.cellObj) {
    return syncDoc({ ...doc, ...sceneFromLegacy(doc) })
  }
  return doc
}
