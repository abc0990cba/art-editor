import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const MARGIN = 8

/**
 * Fixed-position floating panel that always stays fully inside the viewport: the
 * requested (x, y) anchor is clamped after every layout change — mount, anchor move,
 * content growth (e.g. more sliders appearing) and window resizes — so even a tall
 * popover opened next to a bottom rail row never runs past the screen edge. Rendered
 * through a body portal: a sticky/transformed ancestor would otherwise become the
 * containing block for position:fixed and silently shift the panel (this is spec
 * behavior for sticky, see css-position-3).
 */
export function FloatingPanel({
  x,
  y,
  width,
  className,
  style,
  children,
}: {
  /** requested top-left corner in viewport coordinates (clamped into the viewport) */
  x: number
  y: number
  /** CSS width; the clamping measures the real rendered box */
  width?: number | string
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const requested = useRef({ x, y })
  requested.current = { x, y }

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const clamp = () => {
      const r = el.getBoundingClientRect()
      const maxX = Math.max(MARGIN, window.innerWidth - r.width - MARGIN)
      const maxY = Math.max(MARGIN, window.innerHeight - r.height - MARGIN)
      const base = requested.current
      const next = {
        x: Math.max(MARGIN, Math.min(base.x, maxX)),
        y: Math.max(MARGIN, Math.min(base.y, maxY)),
      }
      setPos((p) => (p.x === next.x && p.y === next.y ? p : next))
    }
    // render at the requested anchor first, then pull it into the viewport pre-paint
    setPos(requested.current)
    clamp()
    const ro = new ResizeObserver(clamp)
    ro.observe(el)
    window.addEventListener('resize', clamp)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', clamp)
    }
  }, [x, y])

  const panel = (
    <div
      ref={ref}
      className={className}
      style={{ ...style, left: pos.x, top: pos.y, width }}
    >
      {children}
    </div>
  )
  return typeof document === 'undefined' ? panel : createPortal(panel, document.body)
}
