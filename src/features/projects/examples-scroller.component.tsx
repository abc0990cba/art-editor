import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'

import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { IconButton } from '../../shared/ui/index.tsx'

/**
 * One-line horizontal band for the home screen's example cards: snap scrolling with the native
 * scrollbar hidden (same trick as the mobile tool strip), chevron buttons in the header for
 * step/page navigation and a thin draggable track under the row that mirrors — and drives — the
 * scroll position. The track disappears when everything already fits.
 */
export function ExamplesScroller({
  label,
  children,
}: {
  label: string
  children: ReactNode
}): ReactElement {
  const { t } = useI18n()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [scrollable, setScrollable] = useState(false)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  // scroll position 0..1 plus the visible fraction, for the track's thumb geometry
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(1)

  const syncScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setScrollable(max > 1)
    setAtStart(el.scrollLeft <= 1)
    setAtEnd(el.scrollLeft >= max - 1)
    setProgress(max > 0 ? el.scrollLeft / max : 0)
    setVisible(max > 0 ? el.clientWidth / el.scrollWidth : 1)
  }, [])

  useEffect(() => {
    syncScroll()
    window.addEventListener('resize', syncScroll)
    return () => window.removeEventListener('resize', syncScroll)
  }, [syncScroll])

  // Page by ~a viewport, but land exactly on a card start: a smooth scrollBy that ends between
  // snap points is re-snapped (often back to the start) by scroll-snap mandatory containers.
  const nudge = (dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    const base = el.getBoundingClientRect().left
    const starts = [...el.children].map(
      (c) => c.getBoundingClientRect().left - base + el.scrollLeft,
    )
    const target = el.scrollLeft + dir * el.clientWidth * 0.8
    const left =
      dir === 1
        ? (starts.find((s) => s >= target - 1) ?? starts[starts.length - 1] ?? 0)
        : ([...starts].reverse().find((s) => s <= target + 1) ?? 0)
    el.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }

  const seek = (clientX: number) => {
    const el = scrollerRef.current
    const track = trackRef.current
    if (!el || !track) return
    const r = track.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    el.scrollTo({ left: f * (el.scrollWidth - el.clientWidth) })
  }

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted text-overline font-semibold tracking-widest uppercase">{label}</p>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            plate
            title={t('home.examples.prev')}
            disabled={!scrollable || atStart}
            onClick={() => nudge(-1)}
            className="max-lg:h-11 max-lg:w-11"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M10 3L5 8l5 5" />
            </svg>
          </IconButton>
          <IconButton
            plate
            title={t('home.examples.next')}
            disabled={!scrollable || atEnd}
            onClick={() => nudge(1)}
            className="max-lg:h-11 max-lg:w-11"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 3l5 5-5 5" />
            </svg>
          </IconButton>
        </div>
      </div>
      <div
        ref={scrollerRef}
        onScroll={syncScroll}
        className="flex snap-x snap-mandatory [scrollbar-width:none] gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {scrollable && (
        <div
          ref={trackRef}
          role="presentation"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            draggingRef.current = true
            seek(e.clientX)
          }}
          onPointerMove={(e) => {
            if (draggingRef.current) seek(e.clientX)
          }}
          onPointerUp={() => {
            draggingRef.current = false
          }}
          onPointerCancel={() => {
            draggingRef.current = false
          }}
          className="relative h-4 cursor-pointer touch-none"
        >
          <div className="bg-chip absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full" />
          <div
            className="border-accent-line bg-accent-soft absolute top-1/2 h-1 -translate-y-1/2 rounded-full transition-none"
            style={{
              width: `${Math.max(6, visible * 100)}%`,
              left: `${progress * (100 - Math.max(6, visible * 100))}%`,
            }}
          />
        </div>
      )}
    </section>
  )
}
