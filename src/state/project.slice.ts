import type { Doc } from '../engine/doc.ts'
import { renderThumbnailDataURL } from '../engine/png.ts'
import { serialize, type ProjectJSON } from '../engine/project.ts'
import { loadProject, newProjectId, normalizeName, saveProject } from '../storage/projects.ts'
import type { State } from './editor.store.ts'

const PROJECT_NAME_KEY = 'glyph.projectName'
const PROJECT_ID_KEY = 'glyph.projectId'

function initialProjectName(): string {
  try {
    const raw = localStorage.getItem(PROJECT_NAME_KEY)
    if (typeof raw === 'string') return raw
  } catch {
    /* ignore */
  }
  return ''
}

function initialProjectId(): string | null {
  try {
    const raw = localStorage.getItem(PROJECT_ID_KEY)
    return raw ?? null
  } catch {
    /* ignore */
  }
  return null
}

// Renaming via the top-bar input lands in the projects library as a debounced
// background write, so typing never floods IndexedDB. updatedAt is left alone:
// a rename is metadata, not a content save, and must not reorder the library.
let renameTimer: ReturnType<typeof setTimeout> | undefined
function scheduleProjectRename(id: string, name: string): void {
  clearTimeout(renameTimer)
  renameTimer = setTimeout(() => {
    void loadProject(id)
      .then((entry) => {
        const trimmed = name.trim()
        // empty mid-edit text keeps the last good name; Save applies the fallback
        if (!entry || !trimmed || entry.name === trimmed) return
        return saveProject({ ...entry, name: trimmed })
      })
      .catch(() => {
        /* storage unavailable — the name still lives in the top bar */
      })
  }, 400)
}

/** The project slice: library binding, display name and the Photoshop-style dirty flag. */
export interface ProjectSlice {
  /** Display name of the current project, shown in the top bar */
  projectName: string
  /** Id of the saved project currently open; null = unsaved work (Untitled) */
  projectId: string | null
  /**
   * True while the document holds changes not written to the projects library (or no project is
   * bound at all): the top-bar Save button is enabled exactly when this is true, Photoshop-style.
   */
  projectDirty: boolean
  /** The doc as it was last written to / loaded from the projects library */
  savedDoc: Doc | null
  /**
   * Rename the current project (shown in the top bar, used in export file names); renames the open
   * saved project in the library too
   */
  setProjectName: (name: string) => void
  /** Bind the editor to a saved project (open/save); null detaches back to unsaved */
  setCurrentProject: (id: string | null, name: string) => void
  /** Photoshop-style Save: overwrite the bound project or create + bind a new one */
  saveToLibrary: () => Promise<void>
  /** Mark the current doc as matching the library entry (after open/save) */
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
    projectName: initialProjectName(),
    projectId: initialProjectId(),
    projectDirty: true,
    savedDoc: null,

    setProjectName: (name) => {
      try {
        localStorage.setItem(PROJECT_NAME_KEY, name)
      } catch {
        /* ignore */
      }
      const id = get().projectId
      // Figma-style live rename: an open saved project follows the top-bar name
      if (id) scheduleProjectRename(id, name)
      set({ projectName: name })
    },
    setCurrentProject: (id, name) => {
      try {
        if (id === null) localStorage.removeItem(PROJECT_ID_KEY)
        else localStorage.setItem(PROJECT_ID_KEY, id)
        localStorage.setItem(PROJECT_NAME_KEY, name)
      } catch {
        /* ignore */
      }
      clearTimeout(renameTimer)
      // detaching (new project, JSON import, deleting the open project) leaves the
      // work without a library entry — unsaved by definition
      set((s) => ({
        projectId: id,
        projectName: name,
        projectDirty: id === null ? true : s.projectDirty,
      }))
    },
    saveToLibrary: async () => {
      const s = get()
      const savedName = normalizeName(s.projectName)
      const payload = serialize(s.doc) as ProjectJSON
      let id = s.projectId
      if (id) {
        // Photoshop-style Save: with a project bound, overwrite that entry in place
        const existing = await loadProject(id)
        if (existing) {
          await saveProject({
            ...existing,
            name: savedName,
            thumbnail: renderThumbnailDataURL(s.doc),
            doc: payload,
            updatedAt: Date.now(),
          })
        } else {
          id = null // the stored entry was deleted meanwhile — fall back to a fresh one
        }
      }
      if (!id) {
        id = newProjectId()
        await saveProject({
          id,
          name: savedName,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          thumbnail: renderThumbnailDataURL(s.doc),
          doc: payload,
        })
      }
      try {
        localStorage.setItem(PROJECT_ID_KEY, id)
      } catch {
        /* ignore */
      }
      set({ projectId: id, projectName: savedName, savedDoc: get().doc, projectDirty: false })
    },
    markProjectSaved: () => set((s) => ({ savedDoc: s.doc, projectDirty: false })),
  }
}
