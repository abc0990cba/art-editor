import type { Doc, ElementStyle, Link } from './doc'
import { elementFromDoc } from './doc-style.ts'
import type { SceneLayer, SceneObj } from './scene'

export function sceneFromLegacy(doc: Doc): Pick<Doc, 'layers' | 'nextNodeId'> {
  const length = doc.cells.length
  const byEl = new Map<number, Map<number, number>>()
  for (let i = 0; i < length; i++) {
    const v = doc.cells[i]
    if (v === 0) continue
    const owner = doc.cellObj ? doc.cellObj[i] : 0
    let bucket = byEl.get(owner)
    if (!bucket) byEl.set(owner, (bucket = new Map()))
    bucket.set(i, v)
  }
  let next = doc.nextNodeId
  const mkObj = (style: ElementStyle, cells: Map<number, number>, links: Link[]): SceneObj => ({
    kind: 'obj',
    id: next++,
    name: '',
    visible: true,
    locked: false,
    style,
    cells,
    links,
  })
  const objs: SceneObj[] = []
  const unattributed = byEl.get(0)
  if (unattributed)
    objs.push(
      mkObj(
        elementFromDoc(doc),
        unattributed,
        doc.links.filter((l) => !l.obj),
      ),
    )
  const objLinks = doc.links.filter((l) => l.obj)
  for (let id = 1; id <= doc.elements.length; id++) {
    const cells = byEl.get(id)
    if (!cells && !objLinks.some((l) => l.obj === id)) continue
    const style = doc.elements[id - 1] ?? elementFromDoc(doc)
    objs.push(
      mkObj(
        style,
        cells ?? new Map(),
        objLinks.filter((l) => l.obj === id),
      ),
    )
  }
  // links referencing unknown elements (corrupt data) survive on the last object
  const stray = objLinks.filter((l) => l.obj === undefined || l.obj > doc.elements.length)
  if (stray.length > 0 && objs.length > 0) objs[objs.length - 1].links.push(...stray)
  const layer: SceneLayer = {
    kind: 'layer',
    id: next++,
    name: '',
    visible: true,
    locked: false,
    children: objs,
  }
  return { layers: [layer], nextNodeId: next }
}

/* ------------------------ buffer transforms over the tree ------------------------ */

/** Clone the tree, moving every object's sparse cells through a 1:1 old→new index map. */
