import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect } from 'react'

import type { State } from '../state/editor.store.ts'
import { useStore } from '../state/editor.store.ts'
import type { ProjectSearch } from './project-search.ts'

const round = (v: number): number => Math.round(v * 1000) / 1000
const DEFAULT_SPLIT = 0.45

/** View-state values as they appear in the URL (undefined = param omitted). Defaults stay out. */
function urlViewOf(s: State): ProjectSearch {
  return {
    panel: s.panelCollapsed ? 1 : undefined,
    nodeOpen: s.nodeEditorOpen ? 1 : undefined,
    node: s.nodeEditorMode === 'overlay' ? 'overlay' : undefined,
    nodeSplit: round(s.nodeEditorSplit) === DEFAULT_SPLIT ? undefined : round(s.nodeEditorSplit),
  }
}

function sameView(a: ProjectSearch, b: ProjectSearch): boolean {
  return (
    a.panel === b.panel &&
    a.nodeOpen === b.nodeOpen &&
    a.node === b.node &&
    a.nodeSplit === b.nodeSplit
  )
}

/**
 * Two-way sync between the project route's search params and the store's view state. The URL wins
 * on boot/reload (present params seed the store); toggles write back with history-replacement so
 * Back/Forward stays clean.
 */
export function useViewSearchSync(): void {
  const search = useSearch({ from: '/p/$projectId' })
  const navigate = useNavigate({ from: '/p/$projectId' })

  // URL → store: only params actually present are applied (absent = keep current)
  useEffect(() => {
    const patch: Partial<State> = {}
    if (search.panel !== undefined) patch.panelCollapsed = search.panel === 1
    if (search.nodeOpen !== undefined) patch.nodeEditorOpen = search.nodeOpen === 1
    if (search.node !== undefined) patch.nodeEditorMode = search.node
    if (search.nodeSplit !== undefined) patch.nodeEditorSplit = search.nodeSplit
    if (Object.keys(patch).length > 0) useStore.setState(patch)
  }, [search.panel, search.nodeOpen, search.node, search.nodeSplit])

  // store → URL: replace, never push (toggles are not navigation)
  useEffect(() => {
    let last: ProjectSearch = urlViewOf(useStore.getState())
    return useStore.subscribe((s) => {
      const next = urlViewOf(s)
      if (sameView(next, last)) return
      last = next
      void navigate({ search: next, replace: true })
    })
  }, [navigate])
}
