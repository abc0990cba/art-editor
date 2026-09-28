import { useEffect, useRef } from 'react'

import { useStore } from '../../state/editor.store.ts'
import type { GradientResponse } from './gradient.worker.ts'

/**
 * Orchestrates gradient fitting for the gradient workspace: whenever the source bitmap or the
 * parameters change, a debounced request goes to the worker; responses from superseded requests are
 * dropped. Lives in the feature (not the store) because state must not know about workers — the
 * store just receives results through plain setters.
 */
export function useGradientTrace(): void {
  const source = useStore((s) => s.gradientSource)
  const params = useStore((s) => s.gradientParams)
  const workerRef = useRef<Worker | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const worker = new Worker(new URL('./gradient.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (e: MessageEvent<GradientResponse>) => {
      const { id, svg, stats, demap, error } = e.data
      if (id !== requestRef.current) return
      if (error !== undefined || svg === undefined) {
        useStore.getState().setGradientStatus('error', error ?? 'gradient fit failed')
        return
      }
      useStore.getState().setGradientResult({ svg, stats: stats as never, demap: demap ?? null })
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
      store.setGradientResult(null)
      return
    }
    const id = ++requestRef.current
    const timer = setTimeout(() => {
      store.setGradientStatus('tracing')
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
    }, 200)
    return () => clearTimeout(timer)
  }, [source, params])
}
