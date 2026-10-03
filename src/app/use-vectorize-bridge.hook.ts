import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

import { autoPngSize, renderPng } from '../engine/output/png.ts'
import { decodeImageFile } from '../shared/lib/decode-image.util.ts'
import { useStore } from '../state/editor.store.ts'
import { newVectorEntry, saveProject } from '../storage/projects.ts'

/**
 * Pixel → vector bridge ("Vectorize" in the export popover): renders the current canvas to a
 * raster, creates a new vector project seeded with it and opens that project — the pixel project
 * stays untouched in the library.
 */
export function useVectorizeBridge(): () => void {
  const navigate = useNavigate()
  return useCallback(() => {
    const s = useStore.getState()
    const auto = autoPngSize(s.doc)
    void renderPng(s.doc, { width: auto.width, height: auto.height }, s.exportBg)
      .then(decodeImageFile)
      .then(async (bitmap) => {
        const base = s.projectName.trim()
        const entry = newVectorEntry({
          name: base ? `${base} trace` : 'Traced canvas',
          source: {
            width: bitmap.width,
            height: bitmap.height,
            data: bitmap.data.slice().buffer as ArrayBuffer,
          },
          sourceName: 'canvas',
          params: s.vectorParams,
          svg: null,
          stats: null,
        })
        await saveProject(entry)
        void navigate({ to: '/p/$projectId', params: { projectId: entry.id } })
      })
      .catch(() => {
        /* empty canvas — nothing to trace */
      })
  }, [navigate])
}
