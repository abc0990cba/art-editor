import type { ProjectJSON } from '../engine/project'
import { newId, openDb, reqToPromise } from './db'

export type ProjectKind = 'pixel' | 'vector'

/** Shared metadata of every library entry. */
export interface ProjectBase {
  id: string
  name: string
  kind: ProjectKind
  createdAt: number
  updatedAt: number
  /** PNG data-url; vector entries render their stored SVG instead */
  thumbnail: string
}

/** A pixel-document project: metadata + the serialized document. */
export interface PixelProjectEntry extends ProjectBase {
  kind: 'pixel'
  doc: ProjectJSON
}

/** A vector-trace project: the whole trace session (source raster, params, result). */
export interface VectorProjectEntry extends ProjectBase {
  kind: 'vector'
  /** Raw RGBA source raster; null = the project awaits an import */
  source: { width: number; height: number; data: ArrayBuffer } | null
  sourceName: string
  params: unknown
  svg: string | null
  stats: unknown
}

export type ProjectEntry = PixelProjectEntry | VectorProjectEntry

const STORE = 'projects'

const memory = new Map<string, ProjectEntry>()

export function newProjectId(): string {
  return newId()
}

/** Round a stored number down to a sane timestamp (defaults on missing/corrupt values). */
function storedTime(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0
}

function storedString(raw: unknown, fallback = ''): string {
  return typeof raw === 'string' ? raw : fallback
}

/** Shape-check a stored vector source before trusting it (schema drift, truncated buffers). */
function storedSource(raw: unknown): VectorProjectEntry['source'] {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const width = r['width']
  const height = r['height']
  const data = r['data']
  if (typeof width !== 'number' || typeof height !== 'number') return null
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null
  if (width * height > 4096 * 4096) return null
  if (!(data instanceof ArrayBuffer) || data.byteLength !== width * height * 4) return null
  return { width, height, data }
}

/**
 * Upgrade a raw IndexedDB/in-memory record into a typed entry: records without a `kind` predate
 * typed projects and are pixel documents; vector entries carry the trace session. Returns null for
 * records too broken to open.
 */
export function normalizeProject(raw: unknown): ProjectEntry | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const id = storedString(r['id'])
  if (!id) return null
  const base = {
    id,
    name: storedString(r['name'], 'Untitled'),
    createdAt: storedTime(r['createdAt']),
    updatedAt: storedTime(r['updatedAt']),
    thumbnail: storedString(r['thumbnail']),
  }
  if (r['kind'] === 'vector') {
    return {
      ...base,
      kind: 'vector',
      source: storedSource(r['source']),
      sourceName: storedString(r['sourceName']),
      params: r['params'] ?? null,
      svg: typeof r['svg'] === 'string' ? r['svg'] : null,
      stats: r['stats'] ?? null,
    }
  }
  if (typeof r['doc'] !== 'object' || r['doc'] === null) return null
  return { ...base, kind: 'pixel', doc: r['doc'] as ProjectJSON }
}

/** Fresh vector-trace project (the creation dialog and the pixel→vector bridge). */
export function newVectorEntry(init: {
  name: string
  source: VectorProjectEntry['source']
  sourceName: string
  params: unknown
  svg: string | null
  stats: unknown
}): VectorProjectEntry {
  const now = Date.now()
  return {
    id: newProjectId(),
    kind: 'vector',
    createdAt: now,
    updatedAt: now,
    thumbnail: '',
    ...init,
  }
}

export function sortEntries(entries: ProjectEntry[]): ProjectEntry[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Trim, collapse whitespace, cap length; empty input becomes "Untitled". */
export function normalizeName(raw: string, maxLength = 40): string {
  const cleaned = raw.replaceAll(/\s+/g, ' ').trim()
  if (!cleaned) return 'Untitled'
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trimEnd()}…` : cleaned
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
  const rows = await reqToPromise<unknown[]>(store.getAll())
  return sortEntries(rows.map(normalizeProject).filter((e): e is ProjectEntry => e !== null))
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
  const raw = await reqToPromise<unknown>(store.get(id))
  return normalizeProject(raw) ?? undefined
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

const LAST_PROJECT_KEY = 'glyph.lastProjectId'

/** Remember the project the user opened last (the home screen's Continue card). */
export function rememberOpenedProject(id: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, id)
  } catch {
    /* ignore */
  }
}

/** The project to offer as Continue on the home screen; null when none was opened yet. */
export function lastOpenedProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY)
  } catch {
    /* ignore */
  }
  return null
}

/** Test-only: wipe the in-memory fallback store. */
export function clearProjectsForTests(): void {
  memory.clear()
}
