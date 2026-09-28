import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/** Chevron glyph of the rail's collapse/expand toggles. */
export function RailChevron({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

/**
 * Scrollable rail list without a visible scrollbar (a fat bar next to the icon strip looks clumsy).
 * Instead, subtle gradient fades appear at the clipped edges hinting that the list continues — they
 * show only while there is content beyond the edge.
 */
export function RailList({ className, children }: { className: string; children: ReactNode }) {
  const listRef = useRef<HTMLDivElement>(null)
  const [fadeTop, setFadeTop] = useState(false)
  const [fadeBottom, setFadeBottom] = useState(false)

  const update = useCallback(() => {
    const el = listRef.current
    if (!el) return
    setFadeTop(el.scrollTop > 4)
    setFadeBottom(el.scrollTop < el.scrollHeight - el.clientHeight - 4)
  }, [])

  useEffect(() => {
    update()
    const el = listRef.current
    if (!el) return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [update])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={listRef}
        onScroll={update}
        className={`rail-list flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto ${className}`}
      >
        {children}
      </div>
      {fadeTop && (
        <div className="from-app pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b to-transparent" />
      )}
      {fadeBottom && (
        <div className="from-app pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t to-transparent" />
      )}
    </div>
  )
}
