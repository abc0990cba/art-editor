import { useState, type ReactElement } from 'react'

import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'
import { SelectionFxMenu } from './selection-fx-menu.component.tsx'
import type { TransformStaging } from './use-selection-transform.hook.ts'

/**
 * Contextual action bar of the selection transform box (Illustrator/Figma pattern): duplicate,
 * flips, exact 90° rotations and delete as one-tap plates — the transform itself is drag-only, so
 * nothing here depends on hotkeys. Positioned above the box by the stage, clamped on-screen; the
 * ••• plate opens the effects menu (warps + stylize) anchored to the bar.
 */

function DuplicateIcon() {
  return (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
      <path d="M10.5 2.5h-6a1 1 0 00-1 1v6" />
    </>
  )
}

function FlipHIcon() {
  return (
    <>
      <path d="M6.5 3L2.5 8l4 5z" />
      <path d="M9.5 3l4 5-4 5z" />
      <path d="M8 1.5v13" strokeDasharray="1.5 1.5" />
    </>
  )
}

function FlipVIcon() {
  return (
    <>
      <path d="M3 6.5l5-4 5 4z" />
      <path d="M3 9.5l5 4 5-4z" />
      <path d="M1.5 8h13" strokeDasharray="1.5 1.5" />
    </>
  )
}

function RotCcwIcon() {
  return (
    <>
      <path d="M3.5 6.5A5 5 0 1 1 3 9.5" />
      <path d="M3 3.5v3h3" />
    </>
  )
}

function RotCwIcon() {
  return (
    <>
      <path d="M12.5 6.5A5 5 0 1 0 13 9.5" />
      <path d="M13 3.5v3h-3" />
    </>
  )
}

function TrashIcon() {
  return (
    <>
      <path d="M3 4.5h10" />
      <path d="M5.5 4.5v-1a1 1 0 011-1h3a1 1 0 011 1v1" />
      <path d="M4.5 4.5l.7 8a1 1 0 001 .9h3.6a1 1 0 001-.9l.7-8" />
    </>
  )
}

function MoreIcon() {
  return (
    <>
      <circle cx="3.5" cy="8" r="0.9" />
      <circle cx="8" cy="8" r="0.9" />
      <circle cx="12.5" cy="8" r="0.9" />
    </>
  )
}

function BarButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactElement
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="text-muted hover:bg-chip-active hover:text-body flex h-11 w-11 items-center justify-center rounded-lg transition lg:h-7 lg:w-7"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {children}
        </svg>
      </button>
    </Tooltip>
  )
}

export function SelectionActions({
  x,
  y,
  staging,
}: {
  x: number
  y: number
  staging: TransformStaging
}) {
  const { t } = useI18n()
  const gridSquare = useStore((st) => st.doc.gridType) === 'square'
  const [menuOpen, setMenuOpen] = useState(false)
  if (!gridSquare) return null
  const half = Math.PI / 2
  const act = (fn: (s: ReturnType<typeof useStore.getState>) => void) => () =>
    fn(useStore.getState())

  return (
    <div
      className="border-line bg-panel/95 absolute z-10 flex items-center gap-0.5 rounded-xl border p-0.5 shadow-lg backdrop-blur"
      style={{ left: x, top: y }}
    >
      <BarButton
        label={`${t('sel.duplicate')} (⌘D)`}
        onClick={act((st) => st.duplicateSelection())}
      >
        <DuplicateIcon />
      </BarButton>
      <BarButton
        label={t('sel.flipH')}
        onClick={act((st) => st.transformSelection({ kind: 'flip', axis: 'x' }))}
      >
        <FlipHIcon />
      </BarButton>
      <BarButton
        label={t('sel.flipV')}
        onClick={act((st) => st.transformSelection({ kind: 'flip', axis: 'y' }))}
      >
        <FlipVIcon />
      </BarButton>
      <BarButton
        label={t('sel.rotCcw')}
        onClick={act((st) => st.transformSelection({ kind: 'rotate', angle: -half }))}
      >
        <RotCcwIcon />
      </BarButton>
      <BarButton
        label={t('sel.rotCw')}
        onClick={act((st) => st.transformSelection({ kind: 'rotate', angle: half }))}
      >
        <RotCwIcon />
      </BarButton>
      <BarButton label={t('sel.delete')} onClick={act((st) => st.deleteSelection())}>
        <TrashIcon />
      </BarButton>
      <BarButton label={t('sel.more')} onClick={() => setMenuOpen((v) => !v)}>
        <MoreIcon />
      </BarButton>
      {menuOpen && <SelectionFxMenu staging={staging} onClose={() => setMenuOpen(false)} />}
    </div>
  )
}
