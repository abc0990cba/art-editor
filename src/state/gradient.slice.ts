import type { GradientParams } from '../engine/gradient/params.ts'
import { normalizeGradientParams } from '../engine/gradient/params.ts'
import type { ErrorMap, GradientStats } from '../engine/gradient/pipeline.ts'
import type { ImportBitmap } from '../engine/import/index.ts'
import { saveProject, type GradientProjectEntry } from '../storage/projects.ts'
import type { State } from './editor.store.ts'

export type GradientStatus = 'idle' | 'tracing' | 'error'

export interface GradientResult {
  svg: string
  stats: GradientStats
  /** Runtime-only ΔE heatmap; null after a restore from storage (recomputed on next trace) */
  demap: ErrorMap | null
}

/** The gradient workspace slice: runtime host of the open gradient project (outside undo history). */
export interface GradientSlice {
  /** Source raster; null = empty workspace (awaits an import) */
  gradientSource: ImportBitmap | null
  gradientSourceName: string
  gradientParams: GradientParams
  gradientResult: GradientResult | null
  gradientStatus: GradientStatus
  gradientError: string | null
  setGradientSource: (bitmap: ImportBitmap | null, name?: string) => void
  patchGradientParams: (patch: Partial<GradientParams>) => void
  applyGradientParams: (params: GradientParams) => void
  setGradientResult: (result: GradientResult | null) => void
  setGradientStatus: (status: GradientStatus, error?: string | null) => void
  /** Restore the workspace from the opened project's gradient session */
  loadGradientEntry: (entry: GradientProjectEntry) => void
}

/** Minimal set/get surface the slice needs from the zustand store. */
interface SliceApi {
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void
  get: () => State
}

const TRACING_THROTTLE_MS = 1500

/**
 * Gradient-workspace state and actions, composed into the main store — the vector slice pattern.
 * Every change is written back into the bound `GradientProjectEntry` (throttled — each save
 * serializes a multi-MB bitmap).
 */
export function createGradientSlice({ set, get }: SliceApi): GradientSlice {
  let lastSave = 0
  const saveSoon = (): void => {
    const now = Date.now()
    if (now - lastSave < TRACING_THROTTLE_MS) return
    lastSave = now
    void saveCurrent(get())
  }
  return {
    gradientSource: null,
    gradientSourceName: '',
    gradientParams: normalizeGradientParams(null),
    gradientResult: null,
    gradientStatus: 'idle',
    gradientError: null,

    setGradientSource: (bitmap, name = '') => {
      set({
        gradientSource: bitmap,
        gradientSourceName: name,
        gradientResult: null,
        gradientStatus: 'idle',
        gradientError: null,
      })
      saveSoon()
    },
    patchGradientParams: (patch) => {
      set((s) => ({ gradientParams: normalizeGradientParams({ ...s.gradientParams, ...patch }) }))
      saveSoon()
    },
    applyGradientParams: (params) => {
      set({ gradientParams: normalizeGradientParams(params) })
      saveSoon()
    },
    setGradientResult: (result) => {
      set({ gradientResult: result, gradientStatus: 'idle' })
      saveSoon()
    },
    setGradientStatus: (status, error = null) => {
      set({ gradientStatus: status, gradientError: status === 'error' ? (error ?? 'error') : null })
    },
    loadGradientEntry: (entry) => {
      const src = entry.source
      set({
        gradientSource: src
          ? { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) }
          : null,
        gradientSourceName: entry.sourceName,
        gradientParams: normalizeGradientParams(entry.params),
        gradientResult: entry.svg
          ? { svg: entry.svg, stats: entry.stats as GradientStats, demap: null }
          : null,
      })
      lastSave = 0
      saveSoon()
    },
  }
}

/** Write the whole gradient session into the bound gradient project (also persists clearing it). */
async function saveCurrent(s: State): Promise<void> {
  const entry = s.boundEntry
  if (!entry || entry.kind !== 'gradient') return
  const src = s.gradientSource
  await saveProject({
    ...entry,
    source: src
      ? { width: src.width, height: src.height, data: src.data.slice().buffer as ArrayBuffer }
      : null,
    sourceName: s.gradientSourceName,
    params: s.gradientParams,
    svg: s.gradientResult?.svg ?? null,
    stats: s.gradientResult?.stats ?? null,
    updatedAt: Date.now(),
  })
}
