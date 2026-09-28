import { useCallback, useState } from 'react'

import type { ImportBitmap } from '../../engine/import-image.ts'
import { decodeImageFile } from './decode-image.util.ts'

async function fetchDemo(imageUrl: string): Promise<ImportBitmap> {
  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return decodeImageFile(await res.blob())
}

/**
 * One-tap preset demos: download the preset's free stock photo, decode it and hand it to the
 * workspace as the new source. Tracks which preset card is loading so the picker can show a
 * per-card spinner; failures surface through the workspace's own error line.
 */
export function useDemoImage({
  onLoad,
  onError,
  errorMessage,
}: {
  onLoad: (bitmap: ImportBitmap, name: string) => void
  onError: (message: string) => void
  /** Localized message surfaced through the workspace error line when the download fails */
  errorMessage: string
}): { loadingId: string | null; loadDemo: (id: string, imageUrl: string) => void } {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const loadDemo = useCallback(
    (id: string, imageUrl: string): void => {
      setLoadingId(id)
      fetchDemo(imageUrl)
        .then((bitmap) => onLoad(bitmap, `${id}-demo.jpg`))
        .catch(() => onError(errorMessage))
        .finally(() => setLoadingId(null))
    },
    [onLoad, onError, errorMessage],
  )
  return { loadingId, loadDemo }
}
