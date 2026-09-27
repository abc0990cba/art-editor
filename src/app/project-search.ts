/**
 * Typed search params of the project route: view-level editor state that should survive a reload
 * (and tolerate a bookmarked URL) without polluting browser history — every write is a replace. All
 * params are optional; anything invalid is dropped by the validator.
 */
export interface ProjectSearch {
  /** 1 = right settings panel collapsed to the section strip */
  panel?: 1
  /** 1 = node editor visible over/beside the canvas */
  nodeOpen?: 1
  /** How the node editor shares space with the canvas */
  node?: 'split' | 'overlay'
  /** Editor width as a fraction of the canvas row (split mode, 0.25..0.8) */
  nodeSplit?: number
}

export function validateProjectSearch(search: Record<string, unknown>): ProjectSearch {
  const out: ProjectSearch = {}
  const one = (raw: unknown): 1 | undefined => (raw === 1 || raw === '1' ? 1 : undefined)
  out.panel = one(search['panel'])
  out.nodeOpen = one(search['nodeOpen'])
  if (search['node'] === 'split' || search['node'] === 'overlay') out.node = search['node']
  const split = Number(search['nodeSplit'])
  if (Number.isFinite(split) && split >= 0.25 && split <= 0.8) out.nodeSplit = split
  return out
}
