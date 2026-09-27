import { useEffect, useRef } from 'react'

import { useStore } from '../../state/editor.store.ts'
import type { TraceResponse } from './trace.worker.ts'

/**
 * Orchestrates tracing for the vector workspace: whenever the source bitmap or the parameters
 * change, a debounced trace request goes to the worker; responses from superseded requests are
 * dropped. Lives in the feature (not the store) because state must not know about workers — the
 * store just receives results through plain setters.
 */
export function useVectorTrace(): void {
  const source = useStore((s) => s.vectorSource)
  const params = useStore((s) => s.vectorParams)
  const workerRef = useRef<Worker | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const worker = new Worker(new URL('./trace.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (e: MessageEvent<TraceResponse>) => {
      const { id, svg, stats, error } = e.data
      if (id !== requestRef.current) return
      if (error !== undefined || svg === undefined) {
        useStore.getState().setVectorStatus('error', error ?? 'trace failed')
        return
      }
      useStore.getState().setVectorResult({ svg, stats: stats as never })
    }
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    const worker = workerRef.current
    if (!worker) return
    const store = useStore.getState()
    if (!source) {
      requestRef.current++
      store.setVectorResult(null)
      return
    }
    const id = ++requestRef.current
    const timer = setTimeout(() => {
      store.setVectorStatus('tracing')
      // copy: the source buffer must stay alive in the store (autosave reads it)
      const copy = source.data.slice()
      worker.postMessage(
        {
          id,
          width: source.width,
          height: source.height,
          rgba: copy.buffer,
          params,
        },
        [copy.buffer],
      )
    }, 160)
    return () => clearTimeout(timer)
  }, [source, params])
}
