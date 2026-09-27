import type { ProjectJSON } from '../engine/project'
import { openDb, reqToPromise } from './db'
import { loadProject, newProjectId, rememberOpenedProject, saveProject } from './projects'

// localStorage keys of the legacy session state; kept local because storage must not
// import from the state layer (doc.slice.ts owns the live DOC_KEY constant)
const DOC_KEY = 'glyph.doc'
const PROJECT_ID_KEY = 'glyph.projectId'
// one-time marker: the localStorage mirror outlives the migration, so without it every
// reload would claim the same legacy draft again as another fresh "Untitled" project
const MIGRATED_KEY = 'glyph.migratedV7'

/**
 * One-time adoption of pre-home sessions, run once per boot before the router renders:
 *
 * 1. `glyph.mode` is dead — the workspace now follows the opened project's kind.
 * 2. A legacy autosave draft is claimed into the library so URL routing can always reach it (see
 *    `claimLegacyDraft`), which then becomes the Continue candidate.
 */
export async function migrateLegacySession(): Promise<void> {
  try {
    if (localStorage.getItem(MIGRATED_KEY) === '1') return
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem('glyph.mode')
  } catch {
    /* ignore */
  }
  try {
    await claimLegacyDraft()
  } catch {
    /* storage unavailable — the legacy draft stays only in localStorage */
  } finally {
    try {
      localStorage.setItem(MIGRATED_KEY, '1')
    } catch {
      /* ignore */
    }
  }
}

/** Write a legacy autosave draft into its bound pixel entry, or adopt it as a new project. */
async function claimLegacyDraft(): Promise<void> {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(DOC_KEY)
  } catch {
    /* ignore */
  }
  if (!raw) raw = await legacyAutosaveJson()
  if (!raw) return
  let doc: ProjectJSON
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return
    doc = parsed as ProjectJSON
  } catch {
    return // corrupted autosave — nothing to claim
  }
  const projectId = localStorage.getItem(PROJECT_ID_KEY)
  if (projectId) {
    const entry = await loadProject(projectId)
    if (entry && entry.kind === 'pixel') {
      await saveProject({ ...entry, doc, updatedAt: Date.now() })
      rememberOpenedProject(projectId)
      return
    }
  }
  const now = Date.now()
  const id = newProjectId()
  await saveProject({
    id,
    name: 'Untitled',
    kind: 'pixel',
    createdAt: now,
    updatedAt: now,
    thumbnail: '',
    doc,
  })
  rememberOpenedProject(id)
}

/** The legacy IndexedDB autosave slot (used when localStorage was quota-evicted). */
async function legacyAutosaveJson(): Promise<string | null> {
  try {
    const db = await openDb()
    if (!db) return null
    const rec = await reqToPromise<Record<string, unknown> | undefined>(
      db.transaction('autosave').objectStore('autosave').get('current'),
    )
    return typeof rec?.['json'] === 'string' ? rec['json'] : null
  } catch {
    return null
  }
}
