/** Shared opener for the glyph-editor database: one connection, all object stores, schema v7. */

const DB_NAME = 'glyph-editor'
const DB_VERSION = 7

let memoryOnly = false
let dbPromise: Promise<IDBDatabase | null> | null = null

export function openDb(): Promise<IDBDatabase | null> {
  if (memoryOnly) return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        memoryOnly = true
        resolve(null)
        return
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = (event) => {
        const db = req.result
        if (!db.objectStoreNames.contains('projects')) {
          const projects = db.createObjectStore('projects', { keyPath: 'id' })
          projects.createIndex('by_updated', 'updatedAt')
        }
        if (!db.objectStoreNames.contains('presets')) {
          const presets = db.createObjectStore('presets', { keyPath: 'id' })
          presets.createIndex('by_updated', 'updatedAt')
        }
        if (!db.objectStoreNames.contains('brushes')) {
          const brushes = db.createObjectStore('brushes', { keyPath: 'id' })
          brushes.createIndex('by_updated', 'updatedAt')
        }
        if (!db.objectStoreNames.contains('glyphTiles')) {
          const tiles = db.createObjectStore('glyphTiles', { keyPath: 'id' })
          tiles.createIndex('by_updated', 'updatedAt')
        }
        if (!db.objectStoreNames.contains('autosave')) {
          db.createObjectStore('autosave', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('vectorJobs')) {
          db.createObjectStore('vectorJobs', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('vectorPresets')) {
          const presets = db.createObjectStore('vectorPresets', { keyPath: 'id' })
          presets.createIndex('by_updated', 'updatedAt')
        }
        // v7: project entries became typed (`kind: 'pixel' | 'vector'`). Legacy flat records are
        // pixel documents; the single legacy vector autosave slot is promoted into a library entry.
        if (event.oldVersion > 0 && event.oldVersion < 7) {
          migrateKindedProjects(req.transaction)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        memoryOnly = true
        resolve(null)
      }
    } catch {
      memoryOnly = true
      resolve(null)
    }
  })
  return dbPromise
}

/**
 * V6→v7: tag legacy flat project records as pixel documents and promote the single vector autosave
 * slot (`vectorJobs['current']`) into a real vector library entry, then drop the slot. Runs inside
 * the versionchange transaction, so every write lands atomically with the version bump.
 */
function migrateKindedProjects(tx: IDBTransaction | null): void {
  if (!tx) return
  const projects = tx.objectStore('projects')
  const getAll = projects.getAll()
  getAll.onsuccess = () => {
    for (const raw of getAll.result as Record<string, unknown>[]) {
      if (raw && (raw['kind'] === 'pixel' || raw['kind'] === 'vector')) continue
      projects.put({ ...raw, kind: 'pixel' })
    }
  }
  let jobs: IDBObjectStore
  try {
    jobs = tx.objectStore('vectorJobs')
  } catch {
    return // pre-v5 database without the legacy slot — nothing to promote
  }
  const getJob = jobs.get('current')
  getJob.onsuccess = () => {
    const job = getJob.result as Record<string, unknown> | undefined
    if (!job) return
    const savedAt =
      typeof job['savedAt'] === 'number' && job['savedAt'] > 0 ? job['savedAt'] : Date.now()
    const sourceName = typeof job['sourceName'] === 'string' ? job['sourceName'].trim() : ''
    projects.put({
      id: newId(),
      name: sourceName ? sourceName.slice(0, 40) : 'Traced image',
      kind: 'vector',
      createdAt: savedAt,
      updatedAt: savedAt,
      thumbnail: '',
      source: job['source'] ?? null,
      sourceName,
      params: job['params'] ?? null,
      svg: typeof job['svg'] === 'string' ? job['svg'] : null,
      stats: job['stats'] ?? null,
    })
    jobs.delete('current')
  }
}

export function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Random row id (crypto UUID when available). */
export function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    /* fall through */
  }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
