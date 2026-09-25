import { useEffect } from 'react'

/**
 * Confirmation modal for destructive actions (Photoshop/Figma pattern): dimmed backdrop,
 * title + explanation, muted cancel and a red confirm. Escape cancels; the confirm
 * action runs only from the explicit button.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
}: {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="border-line bg-app w-full max-w-sm rounded-xl border p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-body mb-1.5 text-sm font-semibold tracking-wide">{title}</h2>
        <p className="text-muted mb-4 text-xs leading-relaxed">{message}</p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="border-line bg-chip text-body hover:border-chip-line rounded-md border px-3 py-1.5 text-xs transition"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-400"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
