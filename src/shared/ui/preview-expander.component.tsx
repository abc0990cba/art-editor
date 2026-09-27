import { useEffect, useRef, useState, type ReactNode } from 'react'

import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { FloatingPanel } from '../../shared/ui/floating-panel.component.tsx'

/**
 * Overlay button that opens a floating panel with a large live copy of the wrapped preview. The
 * panel is deliberately non-modal: it sits beside the settings popover or section whose sliders
 * drive the preview, so the enlarged sample can be watched while tweaking — e.g. tuning every ring
 * of a concentric-circles tool. FloatingPanel keeps it inside the viewport even when the panel is
 * taller than the space below the button.
 */
export function ExpandablePreview({
  title,
  panelWidth,
  large,
  children,
}: {
  /** Panel caption, usually the name of what is being configured */
  title: string
  /** CSS width of the floating panel */
  panelWidth: number
  /** Large preview rendered inside the panel; subscribes to the store on its own */
  large: ReactNode
  /** Small preview the button overlays */
  children: ReactNode
}) {
  const { t } = useI18n()
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!pos) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPos(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pos])

  const toggle = () => {
    if (pos) {
      setPos(null)
      return
    }
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    // anchor to the whole source panel (settings aside or floating popover), not just
    // the button: a wide panel opened leftward from the button would otherwise cover
    // the very sliders it mirrors
    const source = btn.current?.closest('aside, div.fixed')
    const base = source?.getBoundingClientRect() ?? r
    // open away from the nearer screen half; FloatingPanel does the precise clamping
    const gap = 10
    const onLeftHalf = base.left > window.innerWidth / 2
    const x = onLeftHalf ? base.left - panelWidth - gap : base.right + gap
    setPos({ x, y: r.top })
  }

  return (
    <div className="relative">
      {children}
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        title={t('preview.expand')}
        aria-label={t('preview.expand')}
        aria-pressed={Boolean(pos)}
        className="border-line bg-panel/85 text-muted hover:text-body absolute top-1.5 right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded border transition max-lg:h-9 max-lg:w-9"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {pos ? (
            <path d="M4 4l8 8M12 4l-8 8" />
          ) : (
            <path d="M2.5 6V2.5H6M13.5 10v3.5H10M2.5 2.5L6.5 6.5M13.5 13.5L9.5 9.5" />
          )}
        </svg>
      </button>
      {pos && (
        <FloatingPanel
          x={pos.x}
          y={pos.y}
          width={panelWidth}
          className="border-line bg-panel fixed z-50 rounded-xl border p-3 shadow-xl"
        >
          <div className="text-body mb-2 flex items-center justify-between gap-3 text-xs font-medium">
            <span>{title}</span>
            <button
              type="button"
              onClick={() => setPos(null)}
              aria-label={t('preview.close')}
              className="text-muted hover:text-body transition"
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
          {large}
        </FloatingPanel>
      )}
    </div>
  )
}
