import type { Doc } from '../../engine/doc.ts'
import { groupAncestorOf, objIdsWithin } from '../../engine/scene.ts'

/**
 * Ids a select-tool click on `objId` resolves to: the whole outermost group when the shape lives
 * inside one (Illustrator practice — the group is the click unit), the bare object otherwise.
 */
export function clickSelectionIds(doc: Doc, objId: number): number[] {
  if (!doc.layers) return [objId]
  const group = groupAncestorOf(doc.layers, objId)
  return group ? objIdsWithin(group) : [objId]
}
