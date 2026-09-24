import { emptyGlyphSet, normalizeGlyphTileSet, type GlyphTileSet } from '../engine/glyph-tiles.ts'
import {
  deleteGlyphSet as deleteGlyphSetRow,
  listGlyphSets,
  newGlyphSetId,
  saveGlyphSet,
  sortGlyphSets,
  type GlyphTileSetEntry,
} from '../storage/glyph-tiles.ts'
import { normalizeName } from '../storage/projects.ts'
import type { State } from './editor.store.ts'

/** The glyph slice: initial state + actions. */
export interface GlyphSlice {
  glyphSets: GlyphTileSetEntry[]
  glyphSetsReady: boolean
  glyphDraft: GlyphTileSet
  glyphDraftId: string | null
  loadGlyphSets: () => Promise<void>
  patchGlyphDraft: (patch: Partial<GlyphTileSet>) => void
  setGlyphDraftId: (id: string | null) => void
  saveGlyphDraft: (name: string) => Promise<void>
  overwriteGlyphDraft: (id: string) => Promise<void>
  renameGlyphSet: (id: string, name: string) => Promise<void>
  deleteGlyphSet: (id: string) => Promise<void>
  applyGlyphSet: (id: string | null, tileSet: GlyphTileSet) => void
}

/** Initial glyph state, spread into the store literal. */
export function createGlyphInit() {
  return {
    glyphSets: [] as GlyphTileSetEntry[],
    glyphSetsReady: false,
    glyphDraft: emptyGlyphSet(4, 4, 9, 'Новый набор'),
    glyphDraftId: null as string | null,
  }
}

/** Minimal set/get surface the glyph slice needs from the zustand store. */
type SliceApi = {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

/**
 * Glyph tile set library + editor actions, composed into the main store. Kept apart so
 * editor.store.ts stays under the file-size ratchet.
 */
export function createGlyphSlice({ set, get }: SliceApi): GlyphSlice {
  return {
    ...createGlyphInit(),
    loadGlyphSets: async () => {
      try {
        set({ glyphSets: await listGlyphSets(), glyphSetsReady: true })
      } catch {
        set({ glyphSetsReady: true })
      }
    },
    patchGlyphDraft: (patch) =>
      set((s) => {
        const next = normalizeGlyphTileSet({ ...s.glyphDraft, ...patch })
        // a manual edit on a library draft forks it into a custom unsaved draft
        return { glyphDraft: next, glyphDraftId: null }
      }),
    setGlyphDraftId: (id) =>
      set((s) => {
        const entry = id ? s.glyphSets.find((e) => e.id === id) : null
        return {
          glyphDraftId: id,
          glyphDraft: entry ? normalizeGlyphTileSet(entry.set) : s.glyphDraft,
        }
      }),
    saveGlyphDraft: async (name) => {
      const s = get()
      const entry: GlyphTileSetEntry = {
        id: newGlyphSetId(),
        name: normalizeName(name),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        set: normalizeGlyphTileSet(s.glyphDraft),
      }
      await saveGlyphSet(entry)
      set({ glyphSets: sortGlyphSets([entry, ...s.glyphSets]), glyphDraftId: entry.id })
    },
    overwriteGlyphDraft: async (id) => {
      const existing = get().glyphSets.find((e) => e.id === id)
      if (!existing) return
      const s = get()
      const updated: GlyphTileSetEntry = {
        ...existing,
        set: normalizeGlyphTileSet(s.glyphDraft),
        updatedAt: Date.now(),
      }
      await saveGlyphSet(updated)
      set({
        glyphSets: sortGlyphSets(get().glyphSets.map((e) => (e.id === id ? updated : e))),
        glyphDraftId: id,
      })
    },
    renameGlyphSet: async (id, name) => {
      const existing = get().glyphSets.find((e) => e.id === id)
      if (!existing) return
      const updated: GlyphTileSetEntry = {
        ...existing,
        name: normalizeName(name),
        updatedAt: Date.now(),
      }
      await saveGlyphSet(updated)
      set({
        glyphSets: sortGlyphSets(get().glyphSets.map((e) => (e.id === id ? updated : e))),
      })
    },
    deleteGlyphSet: async (id) => {
      await deleteGlyphSetRow(id)
      set((s) => ({
        glyphSets: s.glyphSets.filter((e) => e.id !== id),
        glyphDraftId: s.glyphDraftId === id ? null : s.glyphDraftId,
      }))
    },
    applyGlyphSet: (id, tileSet) =>
      set({ glyphDraft: normalizeGlyphTileSet(tileSet), glyphDraftId: id }),
  }
}
