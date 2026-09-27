import type { Doc } from '../engine/doc.ts'
import { renderThumbnailDataURL } from '../engine/png.ts'
import { serialize, type ProjectJSON } from '../engine/project.ts'
import {
  loadProject,
  newProjectId,
  normalizeName,
  rememberOpenedProject,
  saveProject,
  type PixelProjectEntry,
  type ProjectEntry,
} from '../storage/projects.ts'
import type { State } from './editor.store.ts'

// Renaming via the top-bar input lands in the projects library as a debounced
// background write, so typing never floods IndexedDB. updatedAt is left alone:
// a rename is metadata, not a content save, and must not reorder the library.
let renameTimer: ReturnType<typeof setTimeout> | undefined
function scheduleProjectRename(id: string, name: string): void {
  clearTimeout(renameTimer)
  renameTimer = setTimeout(() => {
    void loadProject(id)
      .then((entry) => {
        // empty mid-edit text keeps the last good name; Save applies the fallback
        if (!entry || !name || entry.name === name) return
        return saveProject({ ...entry, name })
      })
      .catch(() => {
        /* storage unavailable — the name still lives in the top bar */
      })
  }, 400)
}

// Rendering a thumbnail walks the whole scene: ambient autosave reuses the stored one and
// re-renders at most every 30 s (explicit Ctrl+S always re-renders).
const THUMBNAIL_MIN_INTERVAL_MS = 30_000
let lastThumbAt = 0

/**
 * The project slice: library binding (entries of both kinds), display name and the dirty flag
 * ("changes not yet flushed to the library"). Saving is ambient — the autosave effect calls
 * saveToLibrary on a debounce; Ctrl+S forces an immediate write.
 */
export interface ProjectSlice {
  /** Display name of the open project, shown in the top bar */
  projectName: string
  /** Id of the open project; null = nothing open (home screen) */
  projectId: string | null
  /** True while the document holds changes not yet written to the library entry */
  projectDirty: boolean
  /** The doc as it was last written to / loaded from the projects library */
  savedDoc: Doc | null
  /** The full library entry currently open (pixel or vector); null on the home screen */
  boundEntry: ProjectEntry | null
  /** Rename the current project (top bar, export file names); renames the bound entry too */
  setProjectName: (name: string) => void
  /** Bind the editor to a library entry and remember it as the Continue candidate */
  openProject: (entry: ProjectEntry) => void
  /** Detach from any project (deleting the open one); the work becomes unbound */
  detachProject: () => void
  /** Create a pixel entry from an imported document, bind it, return its id (JSON project import) */
  adoptPixelDoc: (doc: ProjectJSON, name?: string) => Promise<string>
  /** Write the current pixel doc into its bound entry (or a fresh one when unbound) */
  saveToLibrary: (opts?: { freshThumb?: boolean }) => Promise<void>
  /** Mark the current doc as matching the library entry (after open/save/flush) */
  markProjectSaved: () => void
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

/**
 * Project-library state and actions, composed into the main store. Kept apart so editor.store.ts
 * stays under the file-size ratchet.
 */
export function createProjectSlice({ set, get }: SliceApi): ProjectSlice {
  return {
    projectName: '',
    projectId: null,
    projectDirty: true,
    savedDoc: null,
    boundEntry: null,

    setProjectName: (name) => {
      const entry = get().boundEntry
      const trimmed = name.trim()
      // Figma-style live rename: an open project follows the top-bar name
      if (entry && trimmed && entry.name !== trimmed) scheduleProjectRename(entry.id, trimmed)
      set({ projectName: name })
    },
    openProject: (entry) => {
      clearTimeout(renameTimer)
      rememberOpenedProject(entry.id)
      set({ boundEntry: entry, projectId: entry.id, projectName: entry.name })
    },
    detachProject: () => {
      clearTimeout(renameTimer)
      set({ boundEntry: null, projectId: null, projectDirty: true })
    },
    adoptPixelDoc: async (doc, name) => {
      const now = Date.now()
      const entry: PixelProjectEntry = {
        id: newProjectId(),
        name: normalizeName(name ?? ''),
        kind: 'pixel',
        createdAt: now,
        updatedAt: now,
        thumbnail: '',
        doc,
      }
      await saveProject(entry)
      rememberOpenedProject(entry.id)
      clearTimeout(renameTimer)
      set({ boundEntry: entry, projectId: entry.id, projectName: entry.name })
      return entry.id
    },
    saveToLibrary: async (opts) => {
      const s = get()
      const savedName = normalizeName(s.projectName)
      const existing = s.boundEntry
      const wantThumb =
        opts?.freshThumb === true || Date.now() - lastThumbAt > THUMBNAIL_MIN_INTERVAL_MS
      let thumbnail = existing?.thumbnail ?? ''
      if (wantThumb) {
        try {
          thumbnail = renderThumbnailDataURL(s.doc)
          lastThumbAt = Date.now()
        } catch {
          /* rendering failed — keep the stored thumbnail */
        }
      }
      const payload = serialize(s.doc) as ProjectJSON
      const now = Date.now()
      if (existing && existing.kind === 'pixel') {
        const updated: PixelProjectEntry = {
          ...existing,
          name: savedName,
          thumbnail,
          doc: payload,
          updatedAt: now,
        }
        await saveProject(updated)
        set({
          boundEntry: updated,
          projectName: savedName,
          savedDoc: get().doc,
          projectDirty: false,
        })
      } else {
        // unbound work (JSON import before adoption, detached edits): save into a fresh entry
        const created: PixelProjectEntry = {
          id: newProjectId(),
          name: savedName,
          kind: 'pixel',
          createdAt: now,
          updatedAt: now,
          thumbnail,
          doc: payload,
        }
        await saveProject(created)
        rememberOpenedProject(created.id)
        set({
          boundEntry: created,
          projectId: created.id,
          projectName: savedName,
          savedDoc: get().doc,
          projectDirty: false,
        })
      }
    },
    markProjectSaved: () => set((s) => ({ savedDoc: s.doc, projectDirty: false })),
  }
}
