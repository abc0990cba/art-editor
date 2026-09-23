import type { Brush } from '../engine/brush'
import { normalizeBrush } from '../engine/brush'
import { newId, openDb, reqToPromise } from './db'

/** A saved brush: metadata + validated tip (size + pattern). */
export interface BrushPresetEntry {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  brush: Brush
}

const STORE = 'brushes'

const memory = new Map<string, BrushPresetEntry>()

export function newBrushId(): string {
  return newId()
}

export function sortBrushes(entries: BrushPresetEntry[]): BrushPresetEntry[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt)
}

function withValidBrush(entry: BrushPresetEntry): BrushPresetEntry {
  return { ...entry, brush: normalizeBrush(entry.brush) }
}

export async function listBrushes(): Promise<BrushPresetEntry[]> {
  const db = await openDb()
  if (!db) return sortBrushes([...memory.values()].map(withValidBrush))
  const store = db.transaction(STORE, 'readonly').objectStore(STORE)
  const entries = await reqToPromise<BrushPresetEntry[]>(store.getAll())
  return sortBrushes(entries.map(withValidBrush))
}

export async function saveBrush(entry: BrushPresetEntry): Promise<void> {
  const clean = withValidBrush(entry)
  const db = await openDb()
  if (!db) {
    memory.set(clean.id, clean)
    return
  }
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
  await reqToPromise(store.put(clean))
}

export async function deleteBrush(id: string): Promise<void> {
  const db = await openDb()
  if (!db) {
    memory.delete(id)
    return
  }
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
  await reqToPromise(store.delete(id))
}

/** Test-only: wipe the in-memory fallback store. */
export function clearBrushesForTests(): void {
  memory.clear()
}
