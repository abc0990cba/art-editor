import type { ZundoOptions } from 'zundo'

import type { Doc } from '../engine/core/doc.ts'
import { serialize } from '../engine/core/project.ts'
import { allObjs } from '../engine/core/scene.ts'
import type { SvgScene } from '../engine/svgart/index.ts'
import { DOC_KEY } from './doc.slice.ts'
import type { State, useStore } from './editor.store.ts'
import { resolvedTheme } from './ui.slice.ts'

type TemporalOptions = ZundoOptions<State, { doc: Doc; svgartScene: SvgScene }>

// Undo history stores whole cell buffers; cap the number of steps so huge canvases stay within a
// ~256 MB history budget (never fewer than 2 steps). zundo reads `limit` from this options object
// on every history push, so mutating it here changes the effective cap.
function syncHistoryLimit(doc: Doc, temporalOptions: TemporalOptions): void {
  let ink = 0
  if (doc.layers) {
    for (const o of allObjs(doc.layers)) ink += o.cells.size + o.links.length * 4
  }
  const bytes = Math.max(1, doc.cells.length * (2 + (doc.cellObj ? 4 : 0)) + ink * 24)
  temporalOptions.limit = Math.max(2, Math.min(100, Math.floor(256_000_000 / bytes)))
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

  // Ambient autosave: every committed document change lands in the bound library entry about two
  // seconds after the last edit (unbound work falls back to a fresh entry on the first flush).
  // Small docs also keep the synchronous localStorage mirror (instant boot path).
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  const flushSave = (): void => {
    const s = store.getState()
    if (s.doc === s.savedDoc) return
    try {
      const json = JSON.stringify(serialize(s.doc))
      if (json.length <= 2_000_000) localStorage.setItem(DOC_KEY, json)
    } catch {
      /* storage full — the library entry still gets the document */
    }
    void s.saveToLibrary()
  }
  store.subscribe((s, prev) => {
    if (s.doc === prev.doc || s.doc === s.savedDoc) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(flushSave, 2000)
  })
  // hiding or closing the tab flushes immediately instead of losing the debounce window
  // (browser only — the node test environment has no window/document)
  const flushNow = (): void => {
    clearTimeout(saveTimer)
    flushSave()
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('pagehide', flushNow)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushNow()
    })
  }

  // The dirty flag tracks unflushed changes: any doc that differs from the last library
  // snapshot makes the project dirty again; the debounced flush marks it clean.
  store.subscribe((s, prev) => {
    if (s.doc === prev.doc || s.doc === s.savedDoc || s.projectDirty) return
    store.setState({ projectDirty: true })
  })
}
