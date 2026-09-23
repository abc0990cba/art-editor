import type { PresetConfig } from '../engine/presets'
import { normalizePresetConfig } from '../engine/presets'
import { newId, openDb, reqToPromise } from './db'

/** A saved editor-config preset: metadata + validated configuration (no painted content). */
export interface PresetEntry {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  config: PresetConfig
}

const STORE = 'presets'

const memory = new Map<string, PresetEntry>()

export function newPresetId(): string {
  return newId()
}

export function sortPresets(entries: PresetEntry[]): PresetEntry[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt)
}

function withValidConfig(entry: PresetEntry): PresetEntry {
  return { ...entry, config: normalizePresetConfig(entry.config) }
}

export async function listPresets(): Promise<PresetEntry[]> {
  const db = await openDb()
  if (!db) return sortPresets([...memory.values()].map(withValidConfig))
  const store = db.transaction(STORE, 'readonly').objectStore(STORE)
  const entries = await reqToPromise<PresetEntry[]>(store.getAll())
  return sortPresets(entries.map(withValidConfig))
}

export async function savePreset(entry: PresetEntry): Promise<void> {
  const clean = withValidConfig(entry)
  const db = await openDb()
  if (!db) {
    memory.set(clean.id, clean)
    return
  }
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
  await reqToPromise(store.put(clean))
}

export async function loadPreset(id: string): Promise<PresetEntry | undefined> {
  const db = await openDb()
  if (!db) return memory.get(id)
  const store = db.transaction(STORE, 'readonly').objectStore(STORE)
  const entry = await reqToPromise<PresetEntry | undefined>(store.get(id))
  return entry ? withValidConfig(entry) : undefined
}

export async function deletePreset(id: string): Promise<void> {
  const db = await openDb()
  if (!db) {
    memory.delete(id)
    return
  }
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
  await reqToPromise(store.delete(id))
}

/** Test-only: wipe the in-memory fallback store. */
export function clearPresetsForTests(): void {
  memory.clear()
}
