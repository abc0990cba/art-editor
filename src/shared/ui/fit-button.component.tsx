import type { ReactElement } from 'react'

/**
 * «Fit» plate pinned to the bottom-left corner of a canvas viewport — the twin of the zoom plate in
 * `zoom-controls.component.tsx` (pixel canvas and vector preview). Purely presentational: the
 * caller owns the fit math.
 */
export function FitCanvasButton({
  label,
  title,
  onFit,
}: {
  label: string
  /** Tooltip text; defaults to the label (callers add hotkey hints here) */
  title?: string
  onFit: () => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onFit}
      title={title ?? label}
      className="border-line bg-panel text-body hover:border-chip-line absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs shadow-sm backdrop-blur transition max-lg:min-h-11 max-lg:px-3"
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        <path d="M2 5.5v-2A1.5 1.5 0 013.5 2h2" />
        <path d="M10.5 2h2A1.5 1.5 0 0114 3.5v2" />
        <path d="M14 10.5v2a1.5 1.5 0 01-1.5 1.5h-2" />
        <path d="M5.5 14h-2A1.5 1.5 0 012 12.5v-2" />
        <path d="M6.25 6.25h3.5v3.5h-3.5z" />
      </svg>
      {label}
    </button>
  )
}
