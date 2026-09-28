/// <reference lib="webworker" />
import { normalizeGradientParams, type GradientParams } from '../../engine/gradient/params.ts'
import { traceGradientImage } from '../../engine/gradient/pipeline.ts'

/**
 * Gradient worker: fits region gradients off the main thread (clustering plus per-region fitting on
 * a 2048² source can take seconds). Same protocol as the trace worker: one request = one run,
 * responses carry the request id so stale results are dropped by the client; the rgba buffer and
 * the ΔE heatmap buffer are transferred and consumed here.
 */

interface GradientRequest {
  id: number
  width: number
  height: number
  rgba: ArrayBuffer
  params: GradientParams
}

export interface GradientResponse {
  id: number
  svg?: string
  stats?: unknown
  demap?: { width: number; height: number; data: Uint8Array }
  error?: string
}

self.onmessage = (e: MessageEvent<GradientRequest>): void => {
  const { id, width, height, rgba, params } = e.data
  try {
    const result = traceGradientImage(
      { width, height, data: new Uint8ClampedArray(rgba) },
      normalizeGradientParams(params),
    )
    const response: GradientResponse = {
      id,
      svg: result.svg,
      stats: result.stats,
      demap: result.demap,
    }
    ;(self as unknown as Worker).postMessage(response, [result.demap.data.buffer])
  } catch (error) {
    const response: GradientResponse = {
      id,
      error: error instanceof Error ? error.message : String(error),
    }
    ;(self as unknown as Worker).postMessage(response)
  }
}
