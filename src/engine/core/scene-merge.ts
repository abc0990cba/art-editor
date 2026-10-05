/**
 * Merge same-color objects: within each layer, every mergeable object holding one and the same
 * palette value unites into a single object per color — the cleanup for dithered and region-split
 * imports, where each dot lands as its own object. Mergeable means: no live node graph, no
 * connectors, unlocked, visible through the whole ancestor chain, and every cell carries one and
 * the same value; groups (style × value) never span layers, and anything failing a condition —
 * multi-color drawings, hidden or locked content, graph recipes — stays untouched. Because all
 * members of a group render identically (same style, same value, order-independent composite), the
 * merged tree paints byte-identical cells.
 *
 * The input tree is never mutated: containers along changed paths are rebuilt immutably, matching
 * the other scene-tree operations.
 */

import { elementStyleKey } from '../geometry/elements.ts'
import type { SceneItem, SceneLayer, SceneObj } from './scene.ts'

/** The palette value of a cells map, or null when the ink is empty or multi-colored. */
function singleValue(cells: ReadonlyMap<number, number>): number | null {
  if (cells.size === 0) return null
  let v: number | undefined
  for (const value of cells.values()) {
    if (v === undefined) v = value
    else if (value !== v) return null
  }
  return v ?? null
}

interface MergeGroup {
  /** Bottom-most member: keeps its id and tree slot for the merged object. */
  first: { obj: SceneObj; container: SceneItem[]; idx: number }
  members: SceneObj[]
}

export interface MergeObjsResult {
  layers: SceneLayer[]
  /** Ids of objects united away → the id of the merged object they joined. */
  idMap: Map<number, number>
}

/**
 * Unite same-color same-style objects per layer. `scope` restricts the candidates to the given
 * object ids (a selection); without it the whole tree merges. Returns null when nothing merged —
 * the layers are then reused as-is, so callers can no-op cheaply.
 */
export function mergeObjsByColor(
  layers: SceneLayer[],
  scope?: ReadonlySet<number>,
): MergeObjsResult | null {
  const idMap = new Map<number, number>()
  const groups = new Map<string, MergeGroup>()
  // per container array: index → merged clone (first member's slot) or null (united away)
  const plan = new Map<SceneItem[], Map<number, SceneObj | null>>()

  const visit = (items: SceneItem[], layerId: number, vis: boolean, lock: boolean): void => {
    items.forEach((item, idx) => {
      if (item.kind === 'group') {
        visit(item.children, layerId, vis && item.visible, lock || item.locked)
        return
      }
      const obj = item
      if (obj.graph || obj.links.length > 0 || obj.locked || lock) return
      if (!vis || !obj.visible || (scope !== undefined && !scope.has(obj.id))) return
      const v = singleValue(obj.cells)
      if (v === null) return
      const key = `${layerId}\u0000${elementStyleKey(obj.style)}\u0000${v}`
      const group = groups.get(key)
      if (!group) {
        groups.set(key, { first: { obj, container: items, idx }, members: [obj] })
        return
      }
      group.members.push(obj)
      idMap.set(obj.id, group.first.obj.id)
      let slot = plan.get(items)
      if (!slot) plan.set(items, (slot = new Map()))
      slot.set(idx, null)
    })
  }
  for (const layer of layers) visit(layer.children, layer.id, layer.visible, layer.locked)

  for (const group of groups.values()) {
    if (group.members.length < 2) continue
    const { obj: first, container, idx } = group.first
    const cells = new Map<number, number>()
    for (const m of group.members) for (const [i, v] of m.cells) cells.set(i, v)
    let slot = plan.get(container)
    if (!slot) plan.set(container, (slot = new Map()))
    slot.set(idx, { ...first, cells })
  }

  if (idMap.size === 0) return null

  const rewrite = (items: SceneItem[]): SceneItem[] => {
    const slot = plan.get(items)
    let out: SceneItem[] | null = null
    for (let i = 0; i < items.length; i++) {
      let cur = items[i]
      let drop = false
      if (cur.kind === 'group') {
        const kids = rewrite(cur.children)
        if (kids !== cur.children) {
          // the merge emptied this group — the husk has no function left
          if (kids.length === 0 && cur.children.length > 0) drop = true
          else cur = { ...cur, children: kids }
        }
      }
      if (!drop) {
        const rep = slot?.get(i)
        if (rep === null) drop = true
        else if (rep !== undefined) cur = rep
      }
      if (drop) {
        if (out === null) out = items.slice(0, i)
        continue
      }
      if (out) out.push(cur)
      else if (cur !== items[i]) out = [...items.slice(0, i), cur]
    }
    return out ?? items
  }

  const nextLayers = layers.map((layer) => {
    const children = rewrite(layer.children)
    return children === layer.children ? layer : { ...layer, children }
  })
  return { layers: nextLayers, idMap }
}
