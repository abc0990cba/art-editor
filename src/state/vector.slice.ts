import type { ImportBitmap } from '../engine/import-image.ts'
import { normalizeTraceParams, type TraceParams } from '../engine/trace/params.ts'
import type { TraceStats } from '../engine/trace/trace.ts'
import { saveProject, type VectorProjectEntry } from '../storage/projects.ts'
import type { State } from './editor.store.ts'

export type VectorStatus = 'idle' | 'tracing' | 'error'

export interface VectorResult {
  svg: string
  stats: TraceStats
}

/** The vector workspace slice: runtime host of the open vector project (outside undo history). */
export interface VectorSlice {
  /** Traced source raster; null = empty workspace (awaits an import) */
  vectorSource: ImportBitmap | null
  vectorSourceName: string
  vectorParams: TraceParams
  vectorResult: VectorResult | null
  vectorStatus: VectorStatus
  vectorError: string | null
  setVectorSource: (bitmap: ImportBitmap | null, name?: string) => void
  patchVectorParams: (patch: Partial<TraceParams>) => void
  applyVectorParams: (params: TraceParams) => void
  setVectorResult: (result: VectorResult | null) => void
  setVectorStatus: (status: VectorStatus, error?: string | null) => void
  /** Restore the workspace from the opened project's trace session */
  loadVectorEntry: (entry: VectorProjectEntry) => void
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

const TRACING_THROTTLE_MS = 1500

/**
 * Vector-workspace state and actions, composed into the main store. The pixel `doc` is never
 * touched here, so the workspace stays fully independent of undo history. Every change is written
 * back into the bound `VectorProjectEntry` (throttled — each save serializes a multi-MB bitmap).
 */
export function createVectorSlice({ set, get }: SliceApi): VectorSlice {
  let lastSave = 0
  const saveSoon = (): void => {
    const now = Date.now()
    if (now - lastSave < TRACING_THROTTLE_MS) return
    lastSave = now
    void saveCurrent(get())
  }
  return {
    vectorSource: null,
    vectorSourceName: '',
    vectorParams: normalizeTraceParams(null),
    vectorResult: null,
    vectorStatus: 'idle',
    vectorError: null,

    setVectorSource: (bitmap, name = '') => {
      set({
        vectorSource: bitmap,
        vectorSourceName: name,
        vectorResult: null,
        vectorStatus: 'idle',
        vectorError: null,
      })
      saveSoon()
    },
    patchVectorParams: (patch) => {
      set((s) => ({ vectorParams: normalizeTraceParams({ ...s.vectorParams, ...patch }) }))
      saveSoon()
    },
    applyVectorParams: (params) => {
      set({ vectorParams: normalizeTraceParams(params) })
      saveSoon()
    },
    setVectorResult: (result) => {
      set({ vectorResult: result, vectorStatus: 'idle' })
      saveSoon()
    },
    setVectorStatus: (status, error = null) => {
      set({ vectorStatus: status, vectorError: status === 'error' ? (error ?? 'error') : null })
    },
    loadVectorEntry: (entry) => {
      const src = entry.source
      set({
        vectorSource: src
          ? { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) }
          : null,
        vectorSourceName: entry.sourceName,
        vectorParams: normalizeTraceParams((entry.params ?? null) as TraceParams | null),
        vectorResult: entry.svg ? { svg: entry.svg, stats: entry.stats as TraceStats } : null,
      })
      lastSave = 0
      saveSoon()
    },
  }
}

/** Write the whole trace session into the bound vector project (also persists clearing it). */
async function saveCurrent(s: State): Promise<void> {
  const entry = s.boundEntry
  if (!entry || entry.kind !== 'vector') return
  const src = s.vectorSource
  await saveProject({
    ...entry,
    source: src
      ? { width: src.width, height: src.height, data: src.data.slice().buffer as ArrayBuffer }
      : null,
    sourceName: s.vectorSourceName,
    params: s.vectorParams,
    svg: s.vectorResult?.svg ?? null,
    stats: s.vectorResult?.stats ?? null,
    updatedAt: Date.now(),
  })
}
