import { normalizeTraceParams, type TraceParams } from '../engine/trace/params.ts'
import { newId, openDb, reqToPromise } from './db.ts'

/** A saved vector-trace preset: metadata + validated TraceParams. */
export interface VectorPresetEntry {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  params: TraceParams
}

const STORE = 'vectorPresets'

const memory = new Map<string, VectorPresetEntry>()

export function newVectorPresetId(): string {
  return newId()
}

export function sortVectorPresets(entries: VectorPresetEntry[]): VectorPresetEntry[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt)
}

function withValidParams(entry: VectorPresetEntry): VectorPresetEntry {
  return { ...entry, params: normalizeTraceParams(entry.params) }
}

export async function listVectorPresets(): Promise<VectorPresetEntry[]> {
  const db = await openDb()
  if (!db) return sortVectorPresets([...memory.values()].map(withValidParams))
  const store = db.transaction(STORE, 'readonly').objectStore(STORE)
  const entries = await reqToPromise<VectorPresetEntry[]>(store.getAll())
  return sortVectorPresets(entries.map(withValidParams))
}

export async function saveVectorPreset(entry: VectorPresetEntry): Promise<void> {
  const clean = withValidParams(entry)
  const db = await openDb()
  if (!db) {
    memory.set(clean.id, clean)
    return
  }
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
  await reqToPromise(store.put(clean))
}

export async function deleteVectorPreset(id: string): Promise<void> {
  const db = await openDb()
  if (!db) {
    memory.delete(id)
    return
  }
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
  await reqToPromise(store.delete(id))
}

/** Test-only: wipe the in-memory fallback store. */
export function clearVectorPresetsForTests(): void {
  memory.clear()
}
