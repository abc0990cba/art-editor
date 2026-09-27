import { useI18n } from '../shared/i18n/i18n.provider.tsx'
import { useStore } from '../state/editor.store.ts'

/**
 * Workspace switcher (Пиксели | Вектор): the two modes are independent workspaces, the switch swaps
 * the whole editor row. Segmented control styled like the top-bar chip plates; on mobile the shell
 * grows to the 44px touch target (the compact vector header renders it directly).
 */
export function ModeSwitch() {
  const { t } = useI18n()
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const item = (value: 'pixel' | 'vector'): string =>
    `flex h-6 items-center rounded-md px-2 text-xs transition max-lg:h-9 max-lg:px-3 ${
      mode === value
        ? 'border-accent-line bg-accent-soft text-accent-text border'
        : 'text-muted hover:text-body border border-transparent'
    }`
  return (
    <div
      className="border-line bg-chip flex h-7 items-center gap-1 rounded-md border p-0.5 max-lg:h-11 max-lg:p-1"
      role="tablist"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'pixel'}
        className={item('pixel')}
        onClick={() => setMode('pixel')}
      >
        {t('mode.pixel')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'vector'}
        title={t('mode.vector.desc')}
        className={item('vector')}
        onClick={() => setMode('vector')}
      >
        {t('mode.vector')}
      </button>
    </div>
  )
}
