/** Shared opener for the glyph-editor database: one connection, all object stores, schema v4. */

const DB_NAME = 'glyph-editor'
const DB_VERSION = 5

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
      req.onupgradeneeded = () => {
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
