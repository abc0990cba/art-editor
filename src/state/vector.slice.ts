import type { ImportBitmap } from '../engine/import-image.ts'
import { normalizeTraceParams, type TraceParams } from '../engine/trace/params.ts'
import type { TraceStats } from '../engine/trace/trace.ts'
import { loadVectorJob, saveVectorJob, type VectorJobRecord } from '../storage/vector-job.ts'
import type { State } from './editor.store.ts'

export type VectorStatus = 'idle' | 'tracing' | 'error'

export interface VectorResult {
  svg: string
  stats: TraceStats
}

/** The vector workspace slice: independent from the pixel document (outside undo history). */
export interface VectorSlice {
  /** Traced source raster; null = empty workspace */
  vectorSource: ImportBitmap | null
  vectorSourceName: string
  vectorParams: TraceParams
  vectorResult: VectorResult | null
  vectorStatus: VectorStatus
  vectorError: string | null
  /** Raster handed over from the pixel mode's export popover; consumed by the workspace */
  vectorHandoff: ImportBitmap | null
  setVectorSource: (bitmap: ImportBitmap | null, name?: string) => void
  patchVectorParams: (patch: Partial<TraceParams>) => void
  applyVectorParams: (params: TraceParams) => void
  setVectorResult: (result: VectorResult | null) => void
  setVectorStatus: (status: VectorStatus, error?: string | null) => void
  setVectorHandoff: (bitmap: ImportBitmap | null) => void
  /** Boot-time restore of the autosaved workspace (no-op when absent) */
  loadVectorJob: () => Promise<void>
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

const TRACING_THROTTLE_MS = 1500

/**
 * Vector-workspace state and actions, composed into the main store. The pixel `doc` is never
 * touched here, so the workspace stays fully independent of undo history and project state.
 */
export function createVectorSlice({ set, get }: SliceApi): VectorSlice {
  // throttled autosave: tracing param drags fire many changes per second, and each save
  // serializes a multi-MB bitmap
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
    vectorHandoff: null,

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
    setVectorHandoff: (bitmap) => {
      set({ vectorHandoff: bitmap })
    },
    loadVectorJob: async () => {
      try {
        const rec = await loadVectorJob()
        if (!rec) return
        const source = validSource(rec)
        set({
          vectorSource: source,
          vectorSourceName: rec.sourceName ?? '',
          vectorParams: normalizeTraceParams(rec.params as TraceParams),
          vectorResult: rec.svg ? { svg: rec.svg, stats: (rec.stats ?? null) as TraceStats } : null,
        })
      } catch {
        /* corrupted autosave — keep the empty workspace */
      }
    },
  }
}

async function saveCurrent(s: State): Promise<void> {
  if (!s.vectorSource && !s.vectorResult) return
  const src = s.vectorSource
  await saveVectorJob({
    source: src
      ? { width: src.width, height: src.height, data: src.data.slice().buffer as ArrayBuffer }
      : null,
    sourceName: s.vectorSourceName,
    params: s.vectorParams,
    svg: s.vectorResult?.svg ?? null,
    stats: s.vectorResult?.stats ?? null,
  })
}

/** Validate an autosaved source before trusting it (schema drift, truncated buffers). */
function validSource(rec: VectorJobRecord): ImportBitmap | null {
  const src = rec.source
  if (!src || typeof rec.svg !== 'string') return null
  const { width, height, data } = src
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null
  if (width * height > 4096 * 4096) return null
  if (!(data instanceof ArrayBuffer) || data.byteLength !== width * height * 4) return null
  return { width, height, data: new Uint8ClampedArray(data) }
}
