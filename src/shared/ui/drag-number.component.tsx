import { useEffect, useRef, useState } from 'react'

import { Tooltip } from './tooltip.component.tsx'

/**
 * Blender-style numeric field: drag horizontally to scrub, plain click to type an exact value,
 * Shift halves the step, ↑/↓ and the wheel (while focused) step. Typing accepts anything up to the
 * hard `min`/`max`; dragging stops at the softer `softMin`/`softMax` (canvas-derived) bounds so
 * quick scrubs stay in a useful range.
 */
export function DragNumber({
  value,
  min,
  max,
  softMin,
  softMax,
  step = 1,
  int = false,
  title,
  ariaLabel,
  className = 'w-14',
  onChange,
}: {
  value: number
  /** Hard bounds — typing may reach these */
  min: number
  max: number
  /** Drag/arrow bounds — softer, canvas-derived; default to min/max */
  softMin?: number
  softMax?: number
  step?: number
  int?: boolean
  title?: string
  ariaLabel?: string
  className?: string
  onChange: (v: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  // non-null while the user is typing a raw expression (may be partial, e.g. "-")
  const [draft, setDraft] = useState<string | null>(null)
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null)

  const decimals = step >= 1 ? 0 : Math.min(2, Math.max(0, Math.ceil(-Math.log10(step))))
  const format = (v: number) => (int ? String(Math.round(v)) : v.toFixed(decimals))
  const clampSoft = (v: number) => Math.max(softMin ?? min, Math.min(softMax ?? max, v))
  const clampHard = (v: number) => Math.max(min, Math.min(max, int ? Math.round(v) : v))

  const stepBy = (d: number, fine: boolean) => {
    const s = step * (fine ? 0.1 : 1)
    onChange(clampSoft(clampHard(value) + d * s))
  }

  // wheel steps while the field is focused — hover-wheel would hijack panel scrolling
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement !== el) return
      e.preventDefault()
      stepBy(e.deltaY < 0 ? 1 : -1, e.shiftKey)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  const commitDraft = () => {
    if (draft === null) return
    const n = Number(draft.replace(',', '.'))
    setDraft(null)
    if (draft.trim() !== '' && Number.isFinite(n)) onChange(clampHard(n))
  }

  return (
    <Tooltip label={title}>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={draft ?? format(value)}
        title={undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitDraft()
            inputRef.current?.blur()
          } else if (e.key === 'Escape') {
            setDraft(null)
            inputRef.current?.blur()
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setDraft(null)
            stepBy(1, e.shiftKey)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setDraft(null)
            stepBy(-1, e.shiftKey)
          }
        }}
        onBlur={commitDraft}
        onPointerDown={(e) => {
          if (draft !== null) return
          e.currentTarget.focus()
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, v: value, moved: false }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || !e.buttons) return
          const dx = e.clientX - d.x
          if (!d.moved && Math.abs(dx) < 3) return
          d.moved = true
          e.preventDefault()
          const s = step * (e.shiftKey ? 0.1 : 1)
          const v = d.v + Math.round(dx / 3) * s
          setDraft(null)
          onChange(clampSoft(int ? Math.round(v) : Math.round(v * 100) / 100))
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          e.currentTarget.releasePointerCapture?.(e.pointerId)
          // a click without a drag is an edit request: select the text for typing —
          // deferred so the browser's caret placement from the click doesn't win
          if (d && !d.moved) setTimeout(() => inputRef.current?.select(), 0)
        }}
        className={`border-line bg-chip text-body focus:border-accent-line text-overline cursor-ew-resize rounded border px-1 py-0.5 text-right outline-none select-none ${className}`}
      />
    </Tooltip>
  )
}
