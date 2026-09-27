import { useCallback } from 'react'

import { autoPngSize, renderPng } from '../engine/png.ts'
import { decodeImageFile } from '../shared/lib/decode-image.util.ts'
import { useStore } from '../state/editor.store.ts'

/**
 * Pixel → vector bridge (scenario A, first link): renders the current canvas to a raster and hands
 * it to the vector workspace as its trace source, then switches the mode.
 */
export function useVectorizeBridge(): () => void {
  return useCallback(() => {
    const s = useStore.getState()
    const auto = autoPngSize(s.doc)
    void renderPng(s.doc, { width: auto.width, height: auto.height }, s.exportBg)
      .then(decodeImageFile)
      .then((bitmap) => {
        useStore.getState().setVectorHandoff(bitmap)
        useStore.getState().setMode('vector')
      })
      .catch(() => {
        /* empty canvas — nothing to trace */
      })
  }, [])
}
