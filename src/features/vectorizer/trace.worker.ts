/// <reference lib="webworker" />
import { normalizeTraceParams, type TraceParams } from '../../engine/trace/params.ts'
import { traceImage } from '../../engine/trace/trace.ts'

/**
 * Trace worker: runs the whole raster→SVG pipeline off the main thread (the clustering and fitting
 * passes on a 2048² source take hundreds of milliseconds). One request = one trace; responses carry
 * the request id so stale results from superseded parameter sets are dropped by the client. The
 * rgba buffer is transferred and consumed here.
 */

interface TraceRequest {
  id: number
  width: number
  height: number
  rgba: ArrayBuffer
  params: TraceParams
}

export interface TraceResponse {
  id: number
  svg?: string
  stats?: unknown
  error?: string
}

self.onmessage = (e: MessageEvent<TraceRequest>): void => {
  const { id, width, height, rgba, params } = e.data
  try {
    const result = traceImage(
      { kind: 'raster', bitmap: { width, height, data: new Uint8ClampedArray(rgba) } },
      normalizeTraceParams(params),
    )
    const response: TraceResponse = { id, svg: result.svg, stats: result.stats }
    ;(self as unknown as Worker).postMessage(response)
  } catch (error) {
    const response: TraceResponse = {
      id,
      error: error instanceof Error ? error.message : String(error),
    }
    ;(self as unknown as Worker).postMessage(response)
  }
}
