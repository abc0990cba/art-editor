import type { ProjectJSON } from '../engine/project'
import { newId, openDb, reqToPromise } from './db'

/** A saved project entry: metadata + thumbnail + serialized document. */
export interface ProjectEntry {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  thumbnail: string
  doc: ProjectJSON
}

const STORE = 'projects'

const memory = new Map<string, ProjectEntry>()

export function newProjectId(): string {
  return newId()
}

export function sortEntries(entries: ProjectEntry[]): ProjectEntry[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Trim, collapse whitespace, cap length; empty input becomes "Untitled". */
export function normalizeName(raw: string, maxLength = 40): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Untitled'
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength - 1).trimEnd() + '…' : cleaned
}

/** Name for a duplicate of `name` that is unique within `existing` names. */
export function duplicateName(name: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()))
  const base = normalizeName(name)
  if (!taken.has(base.toLowerCase())) return base
  const copy = normalizeName(`${base} copy`)
  if (!taken.has(copy.toLowerCase())) return copy
  for (let i = 2; ; i++) {
    const candidate = normalizeName(`${base} copy ${i}`)
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

export async function listProjects(): Promise<ProjectEntry[]> {
  const db = await openDb()
  if (!db) return sortEntries([...memory.values()])
  const store = db.transaction(STORE, 'readonly').objectStore(STORE)
  const entries = await reqToPromise<
    {
      id: string
      name: string
      createdAt: number
      updatedAt: number
      thumbnail: string
      doc: ProjectJSON
    }[]
  >(store.getAll())
  return sortEntries(entries)
}

export async function saveProject(entry: ProjectEntry): Promise<void> {
  const db = await openDb()
  if (!db) {
    memory.set(entry.id, entry)
    return
  }
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
  await reqToPromise(store.put(entry))
}

export async function loadProject(id: string): Promise<ProjectEntry | undefined> {
  const db = await openDb()
  if (!db) return memory.get(id)
  const store = db.transaction(STORE, 'readonly').objectStore(STORE)
  return reqToPromise<ProjectEntry | undefined>(store.get(id))
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDb()
  if (!db) {
    memory.delete(id)
    return
  }
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
  await reqToPromise(store.delete(id))
}

/** Test-only: wipe the in-memory fallback store. */
export function clearProjectsForTests(): void {
  memory.clear()
}
