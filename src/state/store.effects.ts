import type { ZundoOptions } from 'zundo'

import type { Doc } from '../engine/doc.ts'
import { serialize } from '../engine/project.ts'
import { allObjs } from '../engine/scene.ts'
import { loadProject } from '../storage/projects.ts'
import { DOC_KEY } from './doc.slice.ts'
import type { State, useStore } from './editor.store.ts'
import { resolvedTheme } from './ui.slice.ts'

type TemporalOptions = ZundoOptions<State, { doc: Doc }>

// Undo history stores whole cell buffers; cap the number of steps so huge
// canvases stay within a ~32 MB history budget (never fewer than 8 steps).
// zundo reads `limit` from this options object on every history push, so
// mutating it here changes the effective cap.
function syncHistoryLimit(doc: Doc, temporalOptions: TemporalOptions): void {
  let ink = 0
  if (doc.layers) {
    for (const o of allObjs(doc.layers)) ink += o.cells.size + o.links.length * 4
  }
  const bytes = Math.max(1, doc.cells.length * (2 + (doc.cellObj ? 4 : 0)) + ink * 24)
  temporalOptions.limit = Math.max(8, Math.min(100, Math.floor(32_000_000 / bytes)))
}

// Theme: mirror the resolved theme onto <html data-theme> and follow the system in auto mode.
function applyTheme(store: typeof useStore): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset['theme'] = store.getState().resolvedTheme
}

/** Every object id the document still references (scene tree, or flat cells/connectors). */
function collectUsedObjIds(doc: Doc, used: Set<number>): void {
  if (doc.layers) {
    for (const o of allObjs(doc.layers)) used.add(o.id)
  } else {
    if (doc.cellObj) {
      for (let i = 0; i < doc.cellObj.length; i++) {
        const o = doc.cellObj[i]
        if (o > 0) used.add(o)
      }
    }
    for (const l of doc.links) if (l.obj) used.add(l.obj)
  }
}

// undo/redo/load can resurrect a document where selected elements or the active
// layer no longer exist
function repairDocRefs(s: State, store: typeof useStore): void {
  if (s.selection.length > 0) {
    const used = new Set<number>()
    collectUsedObjIds(s.doc, used)
    const valid = s.selection.filter((id) => used.has(id))
    if (valid.length !== s.selection.length) store.setState({ selection: valid })
  }
  if (
    s.activeLayerId != null &&
    s.doc.layers &&
    !s.doc.layers.some((l) => l.id === s.activeLayerId)
  ) {
    store.setState({
      activeLayerId: s.doc.layers.at(-1)?.id ?? null,
    })
  }
}

/**
 * Module-level side effects of the store, wired once right after creation. Kept apart so
 * editor.store.ts stays under the file-size ratchet. The registration order mirrors the original
 * monolith: history budget → theme mirror → autosave → dirty flag → boot-time clean check.
 */
export function setupStoreEffects(store: typeof useStore, temporalOptions: TemporalOptions): void {
  syncHistoryLimit(store.getState().doc, temporalOptions)
  store.subscribe((s, prev) => {
    if (s.doc !== prev.doc) {
      syncHistoryLimit(s.doc, temporalOptions)
      repairDocRefs(s, store)
    }
  })

  applyTheme(store)
  store.subscribe((s, prev) => {
    if (s.themePref !== prev.themePref || s.resolvedTheme !== prev.resolvedTheme) {
      applyTheme(store)
    }
  })
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const s = store.getState()
      if (s.themePref === 'auto') store.setState({ resolvedTheme: resolvedTheme('auto') })
    })
  } catch {
    /* matchMedia unavailable */
  }

  // Autosave (debounced) on every committed document change.
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  store.subscribe((s, prev) => {
    if (s.doc === prev.doc) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(DOC_KEY, JSON.stringify(serialize(s.doc)))
      } catch {
        /* storage full or unavailable */
      }
    }, 800)
  })

  // The Save button tracks unsaved changes: any doc that differs from the last library
  // snapshot makes the project dirty again. Only ever flips to dirty — getting back to
  // clean happens through an explicit save or opening a project, Photoshop-style.
  store.subscribe((s, prev) => {
    if (s.doc === prev.doc || s.doc === s.savedDoc || s.projectDirty) return
    store.setState({ projectDirty: true })
  })

  // A bound project boots clean only when the autosaved doc still matches its library
  // entry — the autosave can be ahead when the tab closed right after a change.
  void (async () => {
    const s = store.getState()
    if (!s.projectId) return
    try {
      const entry = await loadProject(s.projectId)
      if (!entry) return
      if (JSON.stringify(serialize(s.doc)) === JSON.stringify(entry.doc)) {
        store.getState().markProjectSaved()
      }
    } catch {
      /* library unavailable — keep the conservative dirty state */
    }
  })()
}
