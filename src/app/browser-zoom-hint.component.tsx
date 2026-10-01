import { useEffect, useState, type ReactElement } from 'react'

import { useI18n } from '../shared/i18n/i18n.provider.tsx'
import { useStore } from '../state/editor.store.ts'
import {
  readBrowserZoom,
  shouldShowZoomChip,
  shouldShowZoomHint,
  type ZoomReading,
} from './browser-zoom.util.ts'

const DISMISS_KEY = 'ditherlab.zoomHintDismissed'

/** The reset keystroke of the user's platform — the browser owns it, we can only point at it. */
function zoomResetKey(): string {
  return navigator.userAgent.includes('Mac') ? '⌘0' : 'Ctrl+0'
}

/** Live page-zoom reading; page zoom resizes the CSS viewport, which fires `resize`. */
function useBrowserZoom(): ZoomReading {
  const [reading, setReading] = useState(() =>
    readBrowserZoom(window.innerWidth, window.screen.width),
  )
  useEffect(() => {
    const update = () => setReading(readBrowserZoom(window.innerWidth, window.screen.width))
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return reading
}

/**
 * Situational explainer for the "only canvas on screen" state: a desktop screen zoomed past the
 * compact-layout breakpoint. Names the cause, offers the in-app recovery (fit) and the platform
 * keystroke that restores the normal app scale. Dismissal is remembered.
 */
export function BrowserZoomBanner(): ReactElement | null {
  const { t } = useI18n()
  const reading = useBrowserZoom()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')
  if (!shouldShowZoomHint(reading, dismissed)) return null
  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }
  return (
    <div
      role="status"
      className="border-line bg-panel text-body fixed top-16 left-1/2 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-lg"
    >
      <span>
        {t('view.browserZoom.hint')
          .replace('{p}', String(Math.round(reading.zoom * 100)))
          .replace('{k}', zoomResetKey())}
      </span>
      <button
        type="button"
        onClick={() => useStore.getState().requestFit()}
        className="border-accent-line bg-accent-soft text-accent-text hover:border-accent-text shrink-0 rounded border px-1.5 py-0.5 transition"
      >
        {t('top.fit')}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('preview.close')}
        className="text-muted hover:text-body shrink-0 transition"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  )
}

/**
 * Persistent zoom% chip for the top bars — a quiet reminder that the browser, not the app, owns the
 * current scale (tooltip names the reset keystroke).
 */
export function BrowserZoomChip(): ReactElement | null {
  const { t } = useI18n()
  const reading = useBrowserZoom()
  if (!shouldShowZoomChip(reading)) return null
  return (
    <span
      className="border-line bg-chip text-muted flex h-7 shrink-0 items-center rounded-md border px-2 text-xs"
      title={t('view.browserZoom.chip')
        .replace('{p}', String(Math.round(reading.zoom * 100)))
        .replace('{k}', zoomResetKey())}
    >
      {Math.round(reading.zoom * 100)}%
    </span>
  )
}
