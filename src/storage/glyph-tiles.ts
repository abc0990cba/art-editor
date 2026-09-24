import type { GlyphTileSet } from '../engine/glyph-tiles.ts'
import { normalizeGlyphTileSet } from '../engine/glyph-tiles.ts'
import { newId, openDb, reqToPromise } from './db.ts'

/** A saved glyph tile set: metadata + validated ramp of tiles. */
export interface GlyphTileSetEntry {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  set: GlyphTileSet
}

const STORE = 'glyphTiles'

const memory = new Map<string, GlyphTileSetEntry>()

export function newGlyphSetId(): string {
  return newId()
}

export function sortGlyphSets(entries: GlyphTileSetEntry[]): GlyphTileSetEntry[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt)
}

function withValidSet(entry: GlyphTileSetEntry): GlyphTileSetEntry {
  return { ...entry, set: normalizeGlyphTileSet(entry.set) }
}

export async function listGlyphSets(): Promise<GlyphTileSetEntry[]> {
  const db = await openDb()
  if (!db) return sortGlyphSets([...memory.values()].map(withValidSet))
  const store = db.transaction(STORE, 'readonly').objectStore(STORE)
  const entries = await reqToPromise<GlyphTileSetEntry[]>(store.getAll())
  return sortGlyphSets(entries.map(withValidSet))
}

export async function saveGlyphSet(entry: GlyphTileSetEntry): Promise<void> {
  const clean = withValidSet(entry)
  const db = await openDb()
  if (!db) {
    memory.set(clean.id, clean)
    return
  }
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
  await reqToPromise(store.put(clean))
}

export async function deleteGlyphSet(id: string): Promise<void> {
  const db = await openDb()
  if (!db) {
    memory.delete(id)
    return
  }
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
  await reqToPromise(store.delete(id))
}
