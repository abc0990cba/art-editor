import { useEffect, useMemo, useRef, useState } from 'react'

import type { ImportBitmap } from '../../engine/import-image.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Chip } from '../../shared/ui/index.tsx'

/**
 * Zoom/pan preview of the vector workspace: shows the traced SVG or the original raster, with a
 * wheel-zoom / drag-pan viewport and a fit button. The SVG lands in an <img> via a blob URL so
 * browser scaling stays smooth and the markup can't leak styles into the app.
 */

const MIN_SCALE = 0.05

interface View {
  scale: number
  tx: number
  ty: number
}

export function VectorPreview({
  source,
  svg,
  showOriginal,
}: {
  source: ImportBitmap
  svg: string | null
  showOriginal: boolean
}) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 })
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const objectUrl = useMemo(
    () => (svg ? URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) : null),
    [svg],
  )
  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    },
    [objectUrl],
  )

  const fit = (): void => {
    const box = containerRef.current?.getBoundingClientRect()
    if (!box) return
    const scale = Math.min((box.width - 32) / source.width, (box.height - 32) / source.height)
    setView({
      scale,
      tx: (box.width - source.width * scale) / 2,
      ty: (box.height - source.height * scale) / 2,
    })
  }
  useEffect(() => {
    fit()
    // refit when the image dimensions or the viewport change (rotate, panel open/close)
    const observer = new ResizeObserver(() => fit())
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [source.width, source.height])

  return (
    <div
      ref={containerRef}
      className="relative min-h-0 flex-1 touch-none overflow-hidden"
      onWheel={(e) => {
        e.preventDefault()
        const box = containerRef.current?.getBoundingClientRect()
        if (!box) return
        const factor = Math.exp(-e.deltaY * 0.0015)
        setView((v) => {
          const scale = Math.max(MIN_SCALE, Math.min(64, v.scale * factor))
          const px = e.clientX - box.left
          const py = e.clientY - box.top
          return {
            scale,
            tx: px - ((px - v.tx) * scale) / v.scale,
            ty: py - ((py - v.ty) * scale) / v.scale,
          }
        })
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
      }}
      onPointerMove={(e) => {
        const d = dragRef.current
        if (!d) return
        setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.x), ty: d.ty + (e.clientY - d.y) }))
      }}
      onPointerUp={() => {
        dragRef.current = null
      }}
    >
      {/* checkerboard under the artwork (alpha visibility) — same recipe as the import dialog */}
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          background:
            'conic-gradient(rgba(128,128,128,0.25) 25%, rgba(128,128,128,0.08) 0 50%, rgba(128,128,128,0.25) 0 75%, rgba(128,128,128,0.08) 0)',
          backgroundSize: '16px 16px',
        }}
      />
      <div
        className="absolute origin-top-left"
        style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}
      >
        {showOriginal || !objectUrl ? (
          <SourceCanvas source={source} />
        ) : (
          <img
            src={objectUrl}
            width={source.width}
            height={source.height}
            alt={t('vector.result')}
            draggable={false}
            className="block select-none"
          />
        )}
      </div>
      <div className="absolute bottom-2 left-2 flex items-center gap-1">
        <Chip onClick={fit} title={t('vector.fit')}>
          {Math.round(view.scale * 100)}%
        </Chip>
      </div>
    </div>
  )
}

function SourceCanvas({ source }: { source: ImportBitmap }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(source.data), source.width, source.height),
      0,
      0,
    )
  }, [source])
  return <canvas ref={ref} className="block select-none" style={{ imageRendering: 'pixelated' }} />
}

/** Original/result switch shown above the preview. */
export function ViewToggle({
  value,
  onChange,
}: {
  value: 'result' | 'original'
  onChange: (v: 'result' | 'original') => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex gap-1">
      <Chip active={value === 'result'} onClick={() => onChange('result')}>
        {t('vector.result')}
      </Chip>
      <Chip active={value === 'original'} onClick={() => onChange('original')}>
        {t('vector.original')}
      </Chip>
    </div>
  )
}
