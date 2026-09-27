import { useEffect, type ReactElement, type ReactNode } from 'react'

import { useI18n } from '../i18n/i18n.provider.tsx'

/**
 * Full-screen mobile settings sheet (below `lg`): dimmed backdrop, a panel with a title row and a
 * big close button, and a body slot for the caller's scrolling content. The shared shell of the
 * pixel panel drawer and the vector params drawer — one header style so every settings sheet feels
 * the same. Escape and the backdrop close it, like every dialog in the app.
 */
export function MobileSheet({
  title,
  onClose,
  children,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
}): ReactElement {
  const { t } = useI18n()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 lg:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <aside
        className="border-line bg-panel absolute inset-0 flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-line flex shrink-0 items-center justify-between border-b px-4 py-3">
          <span className="text-body text-base font-semibold tracking-wide">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('preview.close')}
            className="text-muted hover:bg-chip-active hover:text-body flex h-11 w-11 items-center justify-center rounded-lg transition"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </aside>
    </div>
  )
}
