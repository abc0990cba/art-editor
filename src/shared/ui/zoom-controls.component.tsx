import { useRef, type ReactNode } from 'react'

import { useI18n } from '../i18n/i18n.provider.tsx'
import { Tooltip } from './tooltip.component.tsx'

/** Default zoom bounds; the multiplicative button step — matches the wheel/pinch limits. */
const ZOOM_MIN = 0.5
const ZOOM_MAX = 80
const ZOOM_STEP = 1.25
/** Hold-to-repeat timing: initial delay, then a step every REPEAT_MS. */
const REPEAT_DELAY_MS = 320
const REPEAT_MS = 140

interface View {
  zoom: number
  x: number
  y: number
}

/**
 * Bottom-right status plate: the cursor readout plus the zoom cluster — shared by the pixel canvas
 * and the vector preview. «−»/«+» step the zoom multiplicatively (×1.25) around the viewport
 * center; holding a button repeats the step, so sweeping big ranges is fast while single clicks
 * tune finely. Clicking the percentage resets to 100%. The readout only renders while the pointer
 * is over the canvas — an idle placeholder read as a dead «−» button.
 */
export function ZoomControls({
  hoverText = null,
  zoom,
  setView,
  wrap,
  min = ZOOM_MIN,
  max = ZOOM_MAX,
}: {
  /** Cursor coordinates, or null to hide the readout (viewports without a cursor) */
  hoverText?: string | null
  zoom: number
  setView: (updater: (v: View) => View) => void
  /** The canvas viewport element — zoom stays anchored to its center */
  wrap: HTMLDivElement | null
  /** Zoom bounds of the host viewport when they differ from the pixel canvas defaults */
  min?: number
  max?: number
}) {
  const { t } = useI18n()
  const delayTimer = useRef<number | null>(null)
  const repeatTimer = useRef<number | null>(null)

  const stopRepeat = () => {
    if (delayTimer.current !== null) window.clearTimeout(delayTimer.current)
    if (repeatTimer.current !== null) window.clearInterval(repeatTimer.current)
    delayTimer.current = null
    repeatTimer.current = null
  }

  const anchoredZoom = (factor: number) =>
    setView((v) => {
      const z = Math.min(max, Math.max(min, v.zoom * factor))
      const s = z / v.zoom
      const r = wrap?.getBoundingClientRect()
      const mx = (r?.width ?? 0) / 2
      const my = (r?.height ?? 0) / 2
      return { zoom: z, x: mx - (mx - v.x) * s, y: my - (my - v.y) * s }
    })

  // one step on press, then repeat while held (release anywhere stops it)
  const startRepeat = (factor: number) => {
    anchoredZoom(factor)
    stopRepeat()
    const stop = () => {
      stopRepeat()
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    delayTimer.current = window.setTimeout(() => {
      repeatTimer.current = window.setInterval(() => anchoredZoom(factor), REPEAT_MS)
    }, REPEAT_DELAY_MS)
  }

  const stepButton = (factor: number, label: string, glyph: ReactNode) => (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          startRepeat(factor)
        }}
        className="text-muted hover:bg-chip-active hover:text-body flex h-6 w-6 items-center justify-center rounded-md transition max-lg:h-11 max-lg:w-11"
      >
        {glyph}
      </button>
    </Tooltip>
  )

  return (
    <div className="border-line bg-panel text-body absolute right-3 bottom-3 flex items-center gap-1 rounded-lg border px-2 py-1 text-xs shadow-sm backdrop-blur max-lg:gap-1.5">
      {hoverText !== null && (
        <>
          <Tooltip label={t('view.cursor.desc')}>
            <span className="text-muted font-mono">{hoverText}</span>
          </Tooltip>
          <span className="bg-line mx-1 h-4 w-px shrink-0" />
        </>
      )}
      {stepButton(
        1 / ZOOM_STEP,
        t('view.zoomOut'),
        <svg
          viewBox="0 0 16 16"
          className="h-3 w-3 max-lg:h-4 max-lg:w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M4 8h8" />
        </svg>,
      )}
      <Tooltip label={t('view.zoomReset')}>
        <button
          type="button"
          aria-label={t('view.zoomReset')}
          onClick={() => anchoredZoom(1 / zoom)}
          className="text-muted hover:bg-chip-active hover:text-body min-w-11 rounded-md px-1 py-0.5 text-center font-mono tabular-nums transition max-lg:min-h-11 max-lg:text-sm"
        >
          {Math.round(zoom * 100)}%
        </button>
      </Tooltip>
      {stepButton(
        ZOOM_STEP,
        t('view.zoomIn'),
        <svg
          viewBox="0 0 16 16"
          className="h-3 w-3 max-lg:h-4 max-lg:w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M8 4v8M4 8h8" />
        </svg>,
      )}
    </div>
  )
}
