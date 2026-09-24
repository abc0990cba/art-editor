import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

const SHOW_DELAY_MS = 350
const GAP = 6
const VIEWPORT_MARGIN = 8

interface TipPos {
  x: number
  y: number
  below: boolean
}

type TriggerProps = {
  onMouseEnter?: (e: React.MouseEvent) => void
  onMouseLeave?: (e: React.MouseEvent) => void
  onPointerDown?: (e: React.PointerEvent) => void
  onFocus?: (e: React.FocusEvent) => void
  onBlur?: (e: React.FocusEvent) => void
  'aria-label'?: string
  ref?: unknown
}

/**
 * Custom hover/focus tooltip (the app does not use native `title` attributes). Wraps a single
 * trigger element — the bubble renders in a body portal so panel overflow never clips it, floats
 * above or below by available space, and is clamped to the viewport. Passing no label renders the
 * trigger untouched.
 */
export function Tooltip({ label, children }: { label?: ReactNode; children: ReactElement }) {
  const [pos, setPos] = useState<TipPos | null>(null)
  const [shift, setShift] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const targetRef = useRef<HTMLElement | null>(null)
  const bubbleRef = useRef<HTMLDivElement | null>(null)

  const hide = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = undefined
    setPos(null)
  }, [])

  const schedule = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const el = targetRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return
      const below = r.bottom + GAP + 64 <= window.innerHeight || r.top < 64
      setPos({
        x: r.left + r.width / 2,
        y: below ? r.bottom + GAP : r.top - GAP,
        below,
      })
    }, SHOW_DELAY_MS)
  }, [])

  // keep the trigger element's own handlers and ref; add ours on top
  let trigger = children
  let extra: TriggerProps = {}
  if (isValidElement(children)) {
    const child = children as ReactElement<TriggerProps>
    const prev = child.props
    const prevRef = prev.ref as React.Ref<HTMLElement> | undefined
    extra = {
      onMouseEnter: (e) => {
        prev.onMouseEnter?.(e)
        schedule()
      },
      onMouseLeave: (e) => {
        prev.onMouseLeave?.(e)
        hide()
      },
      onPointerDown: (e) => {
        prev.onPointerDown?.(e)
        hide()
      },
      onFocus: (e) => {
        prev.onFocus?.(e)
        schedule()
      },
      onBlur: (e) => {
        prev.onBlur?.(e)
        hide()
      },
      ref: (el: HTMLElement | null) => {
        targetRef.current = el
        if (typeof prevRef === 'function') prevRef(el)
        else if (prevRef && 'current' in prevRef) prevRef.current = el
      },
    }
    if (!prev['aria-label'] && typeof label === 'string') {
      extra['aria-label'] = label
    }
    trigger = cloneElement(child, extra)
  }

  // nudge the bubble back inside the viewport once its size is known
  useLayoutEffect(() => {
    if (!pos) {
      setShift(0)
      return
    }
    const b = bubbleRef.current
    if (!b) return
    const r = b.getBoundingClientRect()
    let dx = 0
    if (r.left + shift < VIEWPORT_MARGIN) dx = VIEWPORT_MARGIN - r.left - shift
    else if (r.right + shift > window.innerWidth - VIEWPORT_MARGIN) {
      dx = window.innerWidth - VIEWPORT_MARGIN - r.right - shift
    }
    if (dx !== 0) setShift(shift + dx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos])

  // any scroll (including inner panels) or resize detaches a fixed bubble — hide
  useEffect(() => {
    if (!pos) return
    window.addEventListener('scroll', hide, { capture: true, passive: true })
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, { capture: true })
      window.removeEventListener('resize', hide)
    }
  }, [pos, hide])

  useEffect(() => () => clearTimeout(timer.current), [])

  if (!isValidElement(children)) return children

  return (
    <>
      {trigger}
      {pos &&
        createPortal(
          <div
            ref={bubbleRef}
            role="tooltip"
            className="pointer-events-none fixed z-50 max-w-56 rounded-md border border-neutral-700 bg-neutral-900/95 px-2 py-1 text-left text-[11px] leading-snug text-neutral-100 shadow-lg"
            style={{
              left: pos.x + shift,
              top: pos.y,
              transform: pos.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  )
}
