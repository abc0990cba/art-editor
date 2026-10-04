import { useI18n } from '../../shared/i18n/i18n.provider.tsx'

/**
 * The canvas-wide-styles explainer shown when a select click/marquee hit painted artwork that owns
 * no elements: offers the one-click switch to element scope (see the scopeHint state in the
 * stage).
 */
export function ScopeHint({ onApply, onClose }: { onApply: () => void; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <div className="border-line bg-panel text-body absolute top-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs shadow-lg">
      <span>{t('select.scopeHint')}</span>
      <button
        type="button"
        onClick={onApply}
        className="border-accent-line bg-accent-soft text-accent-text hover:border-accent-text rounded border px-1.5 py-0.5 transition"
      >
        {t('select.scopeHint.action')}
      </button>
      <button
        type="button"
        onClick={onClose}
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
  )
}
