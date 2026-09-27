import { openDb, reqToPromise } from './db.ts'

/**
 * Autosave of the vector workspace in IndexedDB: one record under a fixed key holding the traced
 * source bitmap (raw RGBA), the trace parameters and the last SVG result, so the second mode
 * survives reloads like the pixel editor does. Bitmap bytes live as an ArrayBuffer — for a 2048²
 * source that is ~16 MB, well within IndexedDB's budget.
 */

const JOB_KEY = 'current'

export interface VectorJobRecord {
  id: string
  source: { width: number; height: number; data: ArrayBuffer } | null
  sourceName: string
  params: unknown
  svg: string | null
  stats: unknown
  savedAt: number
}

/** Persist the vector workspace; false when storage is unavailable (in-memory fallback). */
export async function saveVectorJob(
  record: Omit<VectorJobRecord, 'id' | 'savedAt'>,
): Promise<boolean> {
  const db = await openDb()
  if (!db) return false
  try {
    const tx = db.transaction('vectorJobs', 'readwrite')
    tx.objectStore('vectorJobs').put({ ...record, id: JOB_KEY, savedAt: Date.now() })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return true
  } catch {
    return false
  }
}

/** The stored vector workspace, or null when absent/unavailable/corrupted. */
export async function loadVectorJob(): Promise<VectorJobRecord | null> {
  const db = await openDb()
  if (!db) return null
  try {
    const rec = await reqToPromise<VectorJobRecord | undefined>(
      db.transaction('vectorJobs').objectStore('vectorJobs').get(JOB_KEY),
    )
    return rec ?? null
  } catch {
    return null
  }
}

/** Drop the stored vector workspace (new empty state on next boot). */
export async function clearVectorJob(): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    const tx = db.transaction('vectorJobs', 'readwrite')
    tx.objectStore('vectorJobs').delete(JOB_KEY)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* storage unavailable — nothing to clear */
  }
}
