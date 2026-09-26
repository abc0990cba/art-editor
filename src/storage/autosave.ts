import { openDb, reqToPromise } from './db.ts'

/**
 * Autosave persistence in IndexedDB: no ~5 MB quota wall, so large canvases survive reloads (the
 * old localStorage autosave silently dropped everything past the quota). One record holding the
 * serialized project JSON under a fixed key.
 */

const AUTOSAVE_KEY = 'current'

interface AutosaveRecord {
  id: string
  json: string
  savedAt: number
}

/** Persist the autosave JSON; false when storage is unavailable (in-memory fallback). */
export async function saveAutosave(json: string): Promise<boolean> {
  const db = await openDb()
  if (!db) return false
  try {
    const tx = db.transaction('autosave', 'readwrite')
    tx.objectStore('autosave').put({
      id: AUTOSAVE_KEY,
      json,
      savedAt: Date.now(),
    } satisfies AutosaveRecord)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return true
  } catch {
    return false
  }
}

/** The stored autosave JSON, or null when absent/unavailable. */
export async function loadAutosave(): Promise<string | null> {
  const db = await openDb()
  if (!db) return null
  try {
    const rec = await reqToPromise<AutosaveRecord | undefined>(
      db.transaction('autosave').objectStore('autosave').get(AUTOSAVE_KEY),
    )
    return rec?.json ?? null
  } catch {
    return null
  }
}
